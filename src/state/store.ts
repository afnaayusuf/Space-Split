import { newId } from '../model/defaults';
import type { Job, JobSummary, MasterItem, WorksSetup } from '../model/types';
import { normalizeJob, normalizeMasterItem, normalizeSetup, normalizeSummary, readFile } from './project';

/**
 * Where jobs, the works setup and the weight master live.
 *
 * - shared:  the hosted page's database — every member who opens the link
 *            sees the same jobs, live; only editors change the works setup
 * - browser: this browser's storage — the double-clicked file and any copy
 *            served outside claude.ai
 * - session: storage is blocked; nothing outlives the tab
 */
export type StoreKind = 'shared' | 'browser' | 'session';

export interface Store {
  kind: StoreKind;
  /** Box ladder, rules and fleet. */
  canEditSetup: boolean;
  /** Jobs and weights. */
  canWrite: boolean;
  /** This window, so a job saved elsewhere can be told apart from our own save. */
  session: string;
  loadSetup(): Promise<WorksSetup | null>;
  saveSetup(s: WorksSetup): Promise<void>;
  watchSetup(cb: (s: WorksSetup | null) => void): () => void;
  watchMaster(cb: (items: MasterItem[]) => void): () => void;
  putMaster(items: MasterItem[]): Promise<void>;
  removeMaster(keys: string[]): Promise<void>;
  watchJobs(cb: (list: JobSummary[]) => void): () => void;
  loadJob(id: string, setup: WorksSetup): Promise<Job | null>;
  saveJob(job: Job, summary: JobSummary): Promise<void>;
  deleteJob(id: string): Promise<void>;
}

const byUpdated = (a: JobSummary, b: JobSummary) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0);

// ------------------------------------------------------------------ browser

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const P = 'space-split/v2/';
const OLD_PROJECT = 'space-split/project/v3';
const OLD_DEMO_PRN = 'DEMO/2026/0001';

function storageError(e: unknown): Error {
  const full = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
  return new Error(full ? 'Browser storage is full. Download a backup, then delete old jobs.' : 'This browser refused to save. Download a backup to keep your work.');
}

export function browserStore(kv: KV, kind: 'browser' | 'session' = 'browser'): Store {
  const session = newId('s');
  const read = <T,>(k: string, fallback: T): T => {
    try {
      const raw = kv.getItem(P + k);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (k: string, v: unknown) => {
    try {
      kv.setItem(P + k, JSON.stringify(v));
    } catch (e) {
      throw storageError(e);
    }
  };
  const subs = { setup: new Set<(s: WorksSetup | null) => void>(), master: new Set<(m: MasterItem[]) => void>(), jobs: new Set<(j: JobSummary[]) => void>() };
  const setupNow = () => {
    const raw = read<unknown>('setup', null);
    return raw ? normalizeSetup(raw) : null;
  };
  const masterNow = () => read<unknown[]>('master', []).map(normalizeMasterItem).filter((m): m is MasterItem => m !== null);
  const jobsNow = () =>
    read<unknown[]>('jobs', [])
      .map(normalizeSummary)
      .filter((s): s is JobSummary => s !== null)
      .sort(byUpdated);
  const emit = (what: 'setup' | 'master' | 'jobs') => {
    if (what === 'setup') subs.setup.forEach((f) => f(setupNow()));
    if (what === 'master') subs.master.forEach((f) => f(masterNow()));
    if (what === 'jobs') subs.jobs.forEach((f) => f(jobsNow()));
  };
  // another tab of the same file saved: show it here too
  if (typeof window !== 'undefined' && kind === 'browser')
    window.addEventListener('storage', (e) => {
      if (!e.key?.startsWith(P)) return;
      const k = e.key.slice(P.length);
      if (k === 'setup' || k === 'master' || k === 'jobs') emit(k);
    });
  const watch = <T,>(set: Set<(v: T) => void>, now: () => T) => (cb: (v: T) => void) => {
    set.add(cb);
    cb(now());
    return () => void set.delete(cb);
  };

  return {
    kind,
    canEditSetup: true,
    canWrite: true,
    session,
    loadSetup: async () => setupNow(),
    saveSetup: async (s) => {
      write('setup', s);
      emit('setup');
    },
    watchSetup: watch(subs.setup, setupNow),
    watchMaster: watch(subs.master, masterNow),
    putMaster: async (items) => {
      const m = new Map(masterNow().map((x) => [x.key, x]));
      for (const it of items) m.set(it.key, it);
      write('master', [...m.values()]);
      emit('master');
    },
    removeMaster: async (keys) => {
      const drop = new Set(keys);
      write(
        'master',
        masterNow().filter((x) => !drop.has(x.key)),
      );
      emit('master');
    },
    watchJobs: watch(subs.jobs, jobsNow),
    loadJob: async (id, setup) => {
      const raw = read<unknown>(`job/${id}`, null);
      return raw ? normalizeJob(raw, setup) : null;
    },
    saveJob: async (job, summary) => {
      write(`job/${job.id}`, job);
      write('jobs', [summary, ...jobsNow().filter((s) => s.id !== job.id)]);
      emit('jobs');
    },
    deleteJob: async (id) => {
      kv.removeItem(P + `job/${id}`);
      write(
        'jobs',
        jobsNow().filter((s) => s.id !== id),
      );
      emit('jobs');
    },
  };
}

/** Brings a project saved by version 1 across once: its setup always, its PRN unless it was the demo. */
export async function migrateOld(kv: KV, store: Store): Promise<Job | null> {
  let raw: string | null = null;
  try {
    raw = kv.getItem(OLD_PROJECT);
  } catch {
    return null;
  }
  if (!raw || kv.getItem(P + 'migrated')) return null;
  try {
    const setup = (await store.loadSetup()) ?? normalizeSetup({});
    const b = readFile(JSON.parse(raw), setup);
    if (b.setup) await store.saveSetup({ ...b.setup, updatedAt: new Date().toISOString() });
    const job = b.jobs[0];
    kv.setItem(P + 'migrated', '1');
    if (job && job.info.prn !== OLD_DEMO_PRN && job.lines.length > 0) return job;
  } catch {
    // unreadable: leave it alone
  }
  return null;
}

// ------------------------------------------------------------------ shared (artifact database)

interface Snap {
  exists: boolean;
  id: string;
  data(): Record<string, unknown> | undefined;
}
interface DocRef {
  get(): Promise<Snap>;
  set(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (s: Snap) => void, err?: (e: { code: string; message: string }) => void): () => void;
}
interface Query {
  orderBy(f: string, dir?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  get(): Promise<{ docs: Snap[] }>;
  onSnapshot(next: (s: { docs: Snap[] }) => void, err?: (e: { code: string; message: string }) => void): () => void;
}
interface Collection extends Query {
  doc(id: string): DocRef;
}
export interface DB {
  doc(path: string): DocRef;
  collection(path: string): Collection;
}

const CHUNK = 500; // master entries per document, well under the 256 KiB document cap

function dbError(e: unknown): Error {
  const code = (e as { code?: string })?.code;
  if (code === 'invalid_argument') return new Error('You can view this data but not change it. Ask the owner for Contributor access.');
  if (code === 'quota_exceeded') return new Error('The shared database is full. Delete old jobs or download a backup.');
  if (code === 'revoked') return new Error('Access to the shared data was withdrawn. Reload the page.');
  return new Error('The shared database did not answer. Your change is kept in this window; it will be saved with the next change.');
}

async function retry<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if ((e as { code?: string })?.code !== 'unavailable') throw dbError(e);
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
    try {
      return await f();
    } catch (e2) {
      throw dbError(e2);
    }
  }
}

export function sharedStore(db: DB, canEditSetup: boolean, canWrite: boolean): Store {
  const session = newId('s');
  const setupDoc = db.doc('setup/works');
  const master = db.collection('master');
  let masterDocs = new Map<string, MasterItem[]>(); // doc id -> entries, as last seen
  const jobs = db.collection('jobs');
  const lines = db.collection('joblines');

  const masterAll = () => [...masterDocs.values()].flat();
  const writeFamily = async (family: string, entries: MasterItem[]) => {
    const old = [...masterDocs.keys()].filter((k) => k.startsWith(`${family}-`));
    const chunks: MasterItem[][] = [];
    for (let i = 0; i < entries.length; i += CHUNK) chunks.push(entries.slice(i, i + CHUNK));
    for (let i = 0; i < chunks.length; i++) await retry(() => master.doc(`${family}-${i}`).set({ family, items: chunks[i] }));
    for (const k of old) if (Number(k.slice(family.length + 1)) >= chunks.length) await retry(() => master.doc(k).delete());
  };

  return {
    kind: 'shared',
    canEditSetup,
    canWrite,
    session,
    loadSetup: async () => {
      const s = await retry(() => setupDoc.get());
      return s.exists ? normalizeSetup(s.data()) : null;
    },
    saveSetup: (s) => retry(() => setupDoc.set(JSON.parse(JSON.stringify(s)))),
    watchSetup: (cb) => setupDoc.onSnapshot((s) => cb(s.exists ? normalizeSetup(s.data()) : null), () => undefined),
    watchMaster: (cb) =>
      master.onSnapshot(
        (snap) => {
          masterDocs = new Map(
            snap.docs.map((d) => [d.id, ((d.data()?.items as unknown[]) ?? []).map(normalizeMasterItem).filter((m): m is MasterItem => m !== null)]),
          );
          cb(masterAll());
        },
        () => undefined,
      ),
    putMaster: async (items) => {
      const byFam = new Map<string, MasterItem[]>();
      for (const it of items) byFam.set(it.family, [...(byFam.get(it.family) ?? []), it]);
      for (const [fam, add] of byFam) {
        const keys = new Set(add.map((x) => x.key));
        const kept = masterAll().filter((x) => x.family === fam && !keys.has(x.key));
        await writeFamily(fam, [...kept, ...add]);
      }
    },
    removeMaster: async (keys) => {
      const drop = new Set(keys);
      const fams = new Set(masterAll().filter((x) => drop.has(x.key)).map((x) => x.family));
      for (const fam of fams) await writeFamily(fam, masterAll().filter((x) => x.family === fam && !drop.has(x.key)));
    },
    watchJobs: (cb) =>
      jobs
        .orderBy('updatedAt', 'desc')
        .limit(1000)
        .onSnapshot(
          (snap) => cb(snap.docs.map((d) => normalizeSummary(d.data())).filter((s): s is JobSummary => s !== null)),
          () => undefined,
        ),
    loadJob: async (id, setup) => {
      const [head, body] = await Promise.all([retry(() => jobs.doc(id).get()), retry(() => lines.doc(id).get())]);
      if (!head.exists) return null;
      const h = head.data() ?? {};
      return normalizeJob({ ...h, id }, setup, body.exists ? body.data()?.lines : []);
    },
    saveJob: async (job, summary) => {
      await retry(() => lines.doc(job.id).set({ lines: JSON.parse(JSON.stringify(job.lines)) }));
      const { lines: lineCount, ...rest } = summary;
      await retry(() =>
        jobs.doc(job.id).set(JSON.parse(JSON.stringify({ ...rest, lineCount, info: job.info, cargo: job.cargo, rule: job.rule, status: job.status }))),
      );
    },
    deleteJob: async (id) => {
      await retry(() => jobs.doc(id).delete());
      await retry(() => lines.doc(id).delete());
    },
  };
}

// ------------------------------------------------------------------ open

interface UserNs {
  canEdit(): Promise<boolean>;
  can(name: string): Promise<boolean | null>;
}

/** The shared database inside claude.ai when this viewer has it, otherwise this browser's storage. */
export async function openStore(): Promise<{ store: Store; migrated: Job | null }> {
  if (__ARTIFACT__ && typeof window !== 'undefined' && window.claude) {
    try {
      const db = (await window.claude.use('db')) as DB | null;
      if (db) {
        const user = (await window.claude.use('user')) as UserNs | null;
        const canEdit = user ? await user.canEdit() : true;
        const canWrite = user ? (await user.can('data.write')) !== false : true;
        return { store: sharedStore(db, canEdit, canWrite), migrated: null };
      }
    } catch {
      // fall through to browser storage
    }
  }
  try {
    const probe = `${P}probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    const store = browserStore(localStorage);
    return { store, migrated: await migrateOld(localStorage, store) };
  } catch {
    return { store: browserStore(memoryKV(), 'session'), migrated: null };
  }
}
