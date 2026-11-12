import { DEFAULT_FLEET, DEFAULT_SETTINGS, STOCK_CARD_SIZES, blankBox, blankJob, blankLine, defaultCargo, defaultSetup, newId, worksBands } from '../model/defaults';
import type {
  BoxSize,
  CargoSpec,
  Family,
  GasketLine,
  Job,
  JobInfo,
  JobStatus,
  JobSummary,
  MasterItem,
  PlanInput,
  PlanSettings,
  RuleId,
  Vehicle,
  WorksSetup,
} from '../model/types';

// Every record read from storage or from a file passes through here, so a
// damaged or older file can never put the planner in a bad state.

const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const FAMS: Family[] = ['SPW', 'SC', 'KAM', 'DJ', 'RTJ', 'ISK', 'OTHER'];
const RULE_IDS: RuleId[] = ['export', 'domestic', 'knpc', 'consolidated', 'given'];
const STATUSES: JobStatus[] = ['draft', 'packed', 'dispatched'];

export const APP_FILE = 'waveforce';
/** Files saved before the app was renamed still open. */
const OLD_APP_FILE = 'space-split';

function uniqueIds(prefix: string) {
  const seen = new Set<string>();
  return (id: unknown) => {
    const v = typeof id === 'string' && id && !seen.has(id) ? id : newId(prefix);
    seen.add(v);
    return v;
  };
}

export function normalizeLines(raw: unknown): GasketLine[] {
  const uid = uniqueIds('l');
  return (Array.isArray(raw) ? raw : []).map((x) => {
    const g = obj(x);
    const b = blankLine();
    return {
      id: uid(g.id),
      sl: str(g.sl),
      poSl: str(g.poSl),
      itemCode: str(g.itemCode),
      description: str(g.description),
      family: FAMS.includes(g.family as Family) ? (g.family as Family) : 'OTHER',
      size: n(g.size, 0),
      rating: n(g.rating, 0),
      ringNo: str(g.ringNo),
      material: str(g.material),
      od: n(g.od, 0),
      innerD: n(g.innerD, 0),
      thickness: n(g.thickness, b.thickness),
      quantity: n(g.quantity, 0),
      uom: str(g.uom, 'NOS'),
      unitWeight: n(g.unitWeight, 0),
      weightEstimated: g.weightEstimated === true,
      boxNo: str(g.boxNo),
    };
  });
}

export function normalizeBoxes(raw: unknown): BoxSize[] {
  const uid = uniqueIds('b');
  return (Array.isArray(raw) ? raw : []).map((x) => {
    const y = obj(x);
    const b = blankBox();
    return {
      id: uid(y.id),
      name: str(y.name),
      outerL: n(y.outerL, b.outerL),
      outerW: n(y.outerW, b.outerW),
      maxDepth: n(y.maxDepth, 0),
      wall: n(y.wall, b.wall),
      base: n(y.base, b.base),
      lid: n(y.lid, b.lid),
      skid: n(y.skid, 0),
      available: n(y.available, 0),
      enabled: y.enabled !== false,
    };
  });
}

export function normalizeSettings(raw: unknown): PlanSettings {
  const out: PlanSettings = { ...DEFAULT_SETTINGS, bands: worksBands(), cardSizes: [...STOCK_CARD_SIZES] };
  const r = obj(raw);
  for (const k of Object.keys(out) as (keyof PlanSettings)[]) {
    const v = r[k];
    if (v === undefined || v === null) continue;
    const want = out[k];
    const ok = Array.isArray(want) ? Array.isArray(v) : typeof v === typeof want && (typeof v !== 'number' || Number.isFinite(v));
    if (ok) (out as unknown as Record<string, unknown>)[k] = v;
  }
  if (!RULE_IDS.includes(out.rule)) out.rule = 'export';
  out.bands = { ...worksBands(), ...obj(out.bands) } as PlanSettings['bands'];
  return out;
}

export function normalizeFleet(raw: unknown): Vehicle[] {
  const list = Array.isArray(raw) ? raw : [];
  const uid = uniqueIds('v');
  const out = list
    .map((x) => {
      const v = obj(x);
      return {
        id: uid(v.id),
        name: str(v.name, 'Vehicle'),
        length: n(v.length, 0),
        width: n(v.width, 0),
        height: n(v.height, 0),
        maxPayload: n(v.maxPayload, 0),
      };
    })
    .filter((v) => v.length > 0 && v.width > 0);
  return out.length ? out : DEFAULT_FLEET.map((v) => ({ ...v }));
}

export function normalizeCargo(raw: unknown, fleet: Vehicle[]): CargoSpec {
  const c = obj(raw);
  const d = defaultCargo(fleet);
  if (!Object.keys(c).length) return d;
  return {
    presetId: str(c.presetId, 'custom'),
    name: str(c.name, 'Custom vehicle'),
    length: n(c.length, d.length),
    width: n(c.width, d.width),
    height: n(c.height, d.height),
    maxPayload: n(c.maxPayload, 0),
  };
}

export function normalizeSetup(raw: unknown): WorksSetup {
  const r = obj(raw);
  const def = defaultSetup();
  const boxes = normalizeBoxes(r.boxSizes);
  return {
    boxSizes: Array.isArray(r.boxSizes) ? boxes : def.boxSizes,
    settings: normalizeSettings(r.settings),
    fleet: normalizeFleet(r.fleet),
    updatedAt: str(r.updatedAt),
  };
}

export function normalizeInfo(raw: unknown): JobInfo {
  const r = obj(raw);
  const b = blankJob();
  return {
    prn: str(r.prn),
    po: str(r.po),
    poDate: str(r.poDate),
    customer: str(r.customer),
    dispatch: str(r.dispatch, b.dispatch),
    date: str(r.date, b.date),
  };
}

export function normalizeJob(raw: unknown, setup: WorksSetup, lines?: unknown): Job {
  const r = obj(raw);
  const now = new Date().toISOString();
  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId('j'),
    info: normalizeInfo(r.info),
    lines: normalizeLines(lines ?? r.lines),
    rule: RULE_IDS.includes(r.rule as RuleId) ? (r.rule as RuleId) : setup.settings.rule,
    cargo: normalizeCargo(r.cargo, setup.fleet),
    status: STATUSES.includes(r.status as JobStatus) ? (r.status as JobStatus) : 'draft',
    createdAt: str(r.createdAt, now),
    updatedAt: str(r.updatedAt, now),
  };
}

export function normalizeSummary(raw: unknown): JobSummary | null {
  const r = obj(raw);
  if (typeof r.id !== 'string' || !r.id) return null;
  const info = obj(r.info);
  return {
    id: r.id,
    prn: str(r.prn ?? info.prn),
    po: str(r.po ?? info.po),
    customer: str(r.customer ?? info.customer),
    rule: RULE_IDS.includes(r.rule as RuleId) ? (r.rule as RuleId) : 'export',
    status: STATUSES.includes(r.status as JobStatus) ? (r.status as JobStatus) : 'draft',
    lines: n(r.lineCount ?? r.lines, 0),
    pieces: n(r.pieces, 0),
    boxes: typeof r.boxes === 'number' ? r.boxes : null,
    gross: typeof r.gross === 'number' ? r.gross : null,
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
    session: str(r.session),
  };
}

export function normalizeMasterItem(raw: unknown): MasterItem | null {
  const r = obj(raw);
  const key = str(r.key);
  const w = n(r.unitWeight, 0);
  if (!key || !(w > 0)) return null;
  return {
    key,
    family: FAMS.includes(r.family as Family) ? (r.family as Family) : 'OTHER',
    size: n(r.size, 0),
    rating: n(r.rating, 0),
    ringNo: str(r.ringNo),
    itemCode: str(r.itemCode),
    description: str(r.description),
    od: n(r.od, 0),
    innerD: n(r.innerD, 0),
    thickness: n(r.thickness, 0),
    unitWeight: w,
    updatedAt: str(r.updatedAt),
  };
}

export function summaryOf(job: Job, session: string, plan?: { boxes: number; gross: number } | null): JobSummary {
  return {
    id: job.id,
    prn: job.info.prn,
    po: job.info.po,
    customer: job.info.customer,
    rule: job.rule,
    status: job.status,
    lines: job.lines.length,
    pieces: job.lines.reduce((a, g) => a + Math.max(0, g.quantity), 0),
    boxes: plan ? plan.boxes : null,
    gross: plan ? Math.round(plan.gross * 10) / 10 : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    session,
  };
}

/** The planner's input for one job under the works setup. */
export function planInput(setup: WorksSetup, job: Job): PlanInput {
  return {
    job: job.info,
    lines: job.lines,
    boxSizes: setup.boxSizes,
    cargo: job.cargo,
    settings: { ...setup.settings, rule: job.rule },
    fleet: setup.fleet,
  };
}

// ------------------------------------------------------------------ files

export interface Backup {
  setup: WorksSetup | null;
  master: MasterItem[];
  jobs: Job[];
}

/** What a file holds, whatever version wrote it: a full backup, one job, or a project from version 1. */
export function readFile(raw: unknown, setup: WorksSetup): Backup {
  const r = obj(raw);
  const ours = r.app === APP_FILE || r.app === OLD_APP_FILE;
  if (ours && r.kind === 'backup') {
    const s = r.setup ? normalizeSetup(r.setup) : null;
    const base = s ?? setup;
    return {
      setup: s,
      master: (Array.isArray(r.master) ? r.master : []).map(normalizeMasterItem).filter((m): m is MasterItem => m !== null),
      jobs: (Array.isArray(r.jobs) ? r.jobs : []).map((j) => normalizeJob(j, base)),
    };
  }
  if (ours && r.kind === 'job') return { setup: null, master: [], jobs: [normalizeJob(r.job, setup)] };
  if (ours && r.kind === 'setup') return { setup: normalizeSetup(r.setup), master: [], jobs: [] };
  // version 1 project: one PRN with the setup folded in
  if (Array.isArray(r.lines)) {
    const s: WorksSetup = { ...normalizeSetup({ boxSizes: r.boxSizes, settings: r.settings }), updatedAt: '' };
    const job = normalizeJob({ info: r.job, lines: r.lines, rule: obj(r.settings).rule, cargo: r.cargo }, s);
    return { setup: Array.isArray(r.boxSizes) ? s : null, master: [], jobs: [job] };
  }
  throw new Error('This file is not a WaveForce job, setup or backup.');
}

export const fileOf = {
  job: (job: Job) => ({ app: APP_FILE, kind: 'job', version: __APP_VERSION__, savedAt: new Date().toISOString(), job }),
  setup: (setup: WorksSetup) => ({ app: APP_FILE, kind: 'setup', version: __APP_VERSION__, savedAt: new Date().toISOString(), setup }),
  backup: (b: Backup) => ({ app: APP_FILE, kind: 'backup', version: __APP_VERSION__, savedAt: new Date().toISOString(), ...b }),
};

export const safeName = (s: string, fallback: string) => (s.trim() || fallback).replace(/[^\w.-]+/g, '_').slice(0, 80);
