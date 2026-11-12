import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RULES, cargoFromVehicle, defaultSetup, newId, newJob } from './model/defaults';
import type { Job, JobStatus, JobSummary, MasterItem, PlanInput, PlanSettings, WorksSetup } from './model/types';
import { CHECK_LIST_FILES, isCheckListFile, jobFromCheckList } from './state/checkListFile';
import { fileOf, planInput, safeName, summaryOf } from './state/project';
import { openStore, type Store } from './state/store';
import { usePlanner } from './state/usePlanner';
import { BoxesView } from './ui/BoxesView';
import { buildColorMap, type ColorBy } from './ui/colors';
import { DataView, downloadBackup } from './ui/DataView';
import { Dialog } from './ui/Dialog';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { pickFile, saveFile } from './ui/files';
import { fmt, kg } from './ui/format';
import { GasketsView } from './ui/GasketsView';
import { HelpDialog, openHelp, type HelpTopic } from './ui/Help';
import { JobsView, importJobFile } from './ui/JobsView';
import { MenuBar, type Menu } from './ui/MenuBar';
import { PlanView } from './ui/PlanView';
import { RulesView } from './ui/RulesView';
import { SlipsView } from './ui/SlipsView';
import { Toasts, notify } from './ui/toast';
import { VehicleView } from './ui/VehicleView';
import { WeightsView } from './ui/WeightsView';

type View = 'jobs' | 'lines' | 'plan' | 'paper' | 'boxes' | 'rules' | 'vehicles' | 'weights' | 'data';
const VIEWS: { id: View; label: string; help: HelpTopic }[] = [
  { id: 'jobs', label: 'All jobs', help: 'jobs' },
  { id: 'lines', label: 'PRN lines', help: 'lines' },
  { id: 'plan', label: 'Package plan', help: 'plan' },
  { id: 'paper', label: 'Paperwork', help: 'paper' },
  { id: 'boxes', label: 'Box sizes', help: 'boxes' },
  { id: 'rules', label: 'Packing rules', help: 'rules' },
  { id: 'vehicles', label: 'Vehicles', help: 'vehicles' },
  { id: 'weights', label: 'Weight master', help: 'weights' },
  { id: 'data', label: 'Data & backup', help: 'data' },
];
const SETUP_VIEWS: View[] = ['boxes', 'rules', 'vehicles'];
const PAGE_VIEWS: View[] = ['jobs', 'lines', 'boxes', 'rules', 'vehicles', 'weights', 'data'];
// storage keys keep the app's first name, so work saved before the rename is still found
const THEME_KEY = 'space-split/theme';
const OPEN_KEY = 'space-split/v2/open';
const AUTOSAVE_KEY = 'waveforce/autosave';
const RECOVERY_KEY = 'waveforce/recovery';
const AUTOSAVE_DELAY = 1500;

const remember = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // a per-browser convenience; nothing is lost without it
  }
};
const recall = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

function readHash(): View | null {
  const h = typeof location !== 'undefined' ? location.hash.slice(1) : '';
  return VIEWS.some((v) => v.id === h) ? (h as View) : null;
}

const isBlank = (j: Job) => j.lines.length === 0 && !j.info.prn.trim() && !j.info.po.trim() && !j.info.customer.trim();
const editable = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes((el as HTMLInputElement).type);
};
const clock = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' });
const jobName = (j: Job) => (j.info.prn.trim() ? `PRN ${j.info.prn.trim()}` : 'the new job');

export default function App() {
  const [boot, setBoot] = useState<{ store: Store; migrated: Job | null } | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (recall(THEME_KEY) === 'light' ? 'light' : 'dark'));

  useEffect(() => {
    let live = true;
    openStore().then((b) => live && setBoot(b));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    remember(THEME_KEY, theme);
  }, [theme]);

  if (!boot)
    return (
      <div className="splash" role="status">
        <span className="brand-mark" aria-hidden="true" />
        <p>Opening WaveForce…</p>
      </div>
    );
  return <Workspace store={boot.store} migrated={boot.migrated} theme={theme} onTheme={setTheme} />;
}

interface Snap {
  job: Job;
  setup: WorksSetup;
}
interface Recovery {
  at: string;
  jobId: string;
  job: Job | null;
  setup: WorksSetup | null;
}

function Workspace({ store, migrated, theme, onTheme }: { store: Store; migrated: Job | null; theme: 'dark' | 'light'; onTheme: (t: 'dark' | 'light') => void }) {
  const [view, setView] = useState<View>(() => readHash() ?? 'lines');
  const [colorBy, setColorBy] = useState<ColorBy>('item');
  const [setup, setSetupState] = useState<WorksSetup>(defaultSetup);
  const [setupStored, setSetupStored] = useState(false);
  const [master, setMaster] = useState<MasterItem[]>([]);
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [job, setJobState] = useState<Job | null>(null);
  // the last saved versions; anything on screen that differs from them is unsaved
  const [saved, setSavedState] = useState<{ job: Job | null; setup: WorksSetup }>(() => ({ job: null, setup }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [autoSave, setAutoSave] = useState(() => recall(AUTOSAVE_KEY) === '1');
  const [stale, setStale] = useState<JobSummary | null>(null);
  const [leave, setLeave] = useState<{ then: () => void } | null>(null);
  const [saveAs, setSaveAs] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // unsaved work left behind by a closed tab, read once at start
  const [recovered, setRecovered] = useState<Recovery | null>(() => {
    try {
      const r = JSON.parse(recall(RECOVERY_KEY) ?? 'null') as Recovery | null;
      return r && (r.job || r.setup) ? r : null;
    } catch {
      return null;
    }
  });

  const jobRef = useRef<Job | null>(null);
  const setupRef = useRef(setup);
  const savedRef = useRef(saved);
  const savedAt = useRef(new Map<string, string>()); // job id -> updatedAt we last wrote or loaded
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const opened = useRef(false);
  const planRef = useRef<{ boxes: number; gross: number } | null>(null);
  const hist = useRef<{ past: Snap[]; future: Snap[]; at: number; kind: string }>({ past: [], future: [], at: 0, kind: '' });
  jobRef.current = job;
  setupRef.current = setup;
  savedRef.current = saved;

  const setSaved = (s: { job: Job | null; setup: WorksSetup }) => {
    savedRef.current = s;
    setSavedState(s);
  };

  const jobDirty = !!job && job !== saved.job && !(saved.job === null && isBlank(job));
  const setupDirty = setup !== saved.setup && store.canEditSetup;
  const dirty = jobDirty || setupDirty;

  // ------------------------------------------------------------ data feeds
  useEffect(() => {
    const offSetup = store.watchSetup((s) => {
      setSetupStored(s !== null);
      if (setupRef.current !== savedRef.current.setup) return; // unsaved edits here: keep them
      const next = s ?? defaultSetup();
      setupRef.current = next;
      setSetupState(next);
      setSaved({ job: savedRef.current.job, setup: next });
    });
    const offMaster = store.watchMaster(setMaster);
    const offJobs = store.watchJobs(setJobs);
    return () => {
      offSetup();
      offMaster();
      offJobs();
    };
  }, [store]);

  // ------------------------------------------------------------ saving
  /** Saves whatever differs from the last save: the open job, the works setup, or both. */
  const saveAll = useCallback(
    async (quiet = false): Promise<boolean> => {
      const j = jobRef.current;
      const s = setupRef.current;
      const sv = savedRef.current;
      const doSetup = s !== sv.setup && store.canEditSetup;
      const doJob = !!j && j !== sv.job && !(sv.job === null && isBlank(j));
      if (!doSetup && !doJob) {
        if (!quiet) notify(j && isBlank(j) && sv.job === null ? 'Nothing to save yet: add a PRN number or a line.' : 'Everything is saved.');
        return true;
      }
      if (doJob && !store.canWrite) {
        notify('You can view jobs here but not change them. Ask the owner for Contributor access.', { tone: 'bad' });
        return false;
      }
      setSaving(true);
      const task = chain.current.then(async () => {
        const now = new Date().toISOString();
        if (doSetup) await store.saveSetup({ ...s, updatedAt: now });
        if (doJob && j) {
          const stamped = { ...j, updatedAt: now };
          savedAt.current.set(j.id, now);
          await store.saveJob(stamped, summaryOf(stamped, store.session, planRef.current));
        }
      });
      chain.current = task.catch(() => undefined);
      try {
        await task;
        setSaved({ job: doJob ? j : savedRef.current.job, setup: doSetup ? s : savedRef.current.setup });
        if (doSetup) setSetupStored(true);
        if (doJob && j) remember(OPEN_KEY, j.id);
        setLastSaved(new Date());
        setSaveError(null);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Saving failed.';
        setSaveError(msg);
        notify(msg, { tone: 'bad' });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [store],
  );

  // AutoSave: a moment after the last change
  useEffect(() => {
    if (!autoSave || !dirty || saving) return;
    const t = setTimeout(() => void saveAll(true), AUTOSAVE_DELAY);
    return () => clearTimeout(t);
  }, [autoSave, dirty, saving, job, setup, saveAll]);

  // unsaved work is also kept in this browser, so a closed tab can be recovered
  useEffect(() => {
    if (!job) return;
    if (!dirty) {
      if (!recovered) remember(RECOVERY_KEY, null);
      return;
    }
    const t = setTimeout(() => {
      const r: Recovery = { at: new Date().toISOString(), jobId: job.id, job: jobDirty ? job : null, setup: setupDirty ? setup : null };
      try {
        remember(RECOVERY_KEY, JSON.stringify(r));
      } catch {
        // too big for browser storage: the save prompt still guards it
      }
    }, 800);
    return () => clearTimeout(t);
  }, [job, setup, dirty, jobDirty, setupDirty, recovered]);

  // ------------------------------------------------------------ history
  const record = (kind: string) => {
    const h = hist.current;
    const now = Date.now();
    const j = jobRef.current;
    // typing into one field within a second is one step
    if (j && !(now - h.at < 1000 && h.kind === kind)) {
      h.past.push({ job: j, setup: setupRef.current });
      if (h.past.length > 100) h.past.shift();
    }
    h.at = now;
    h.kind = kind;
    h.future = [];
  };
  const apply = (s: Snap) => {
    jobRef.current = s.job;
    setupRef.current = s.setup;
    setJobState(s.job);
    setSetupState(s.setup);
  };
  const undo = () => {
    const h = hist.current;
    const s = h.past.pop();
    if (!s || !jobRef.current) return;
    h.future.push({ job: jobRef.current, setup: setupRef.current });
    h.kind = '';
    apply(s);
  };
  const redo = () => {
    const h = hist.current;
    const s = h.future.pop();
    if (!s || !jobRef.current) return;
    h.past.push({ job: jobRef.current, setup: setupRef.current });
    h.kind = '';
    apply(s);
  };

  // ------------------------------------------------------------ open a job
  const showJob = useCallback((j: Job, asSaved: boolean) => {
    hist.current = { past: [], future: [], at: 0, kind: '' };
    jobRef.current = j;
    setJobState(j);
    setSaved({ job: asSaved ? j : null, setup: savedRef.current.setup });
    setStale(null);
    if (asSaved) remember(OPEN_KEY, j.id);
  }, []);

  const loadJob = useCallback(
    async (id: string | null) => {
      if (id === null) {
        showJob(newJob(setupRef.current), false);
        return true;
      }
      try {
        const j = await store.loadJob(id, setupRef.current);
        if (!j) {
          notify('That job is no longer there.', { tone: 'bad' });
          return false;
        }
        savedAt.current.set(j.id, j.updatedAt);
        showJob(j, true);
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : 'The job could not be opened.', { tone: 'bad' });
        return false;
      }
    },
    [showJob, store],
  );

  /** Runs `then` once unsaved changes to the open job are saved or let go. */
  const guard = (then: () => void) => {
    const j = jobRef.current;
    const sv = savedRef.current;
    if (j && j !== sv.job && !(sv.job === null && isBlank(j))) setLeave({ then });
    else then();
  };

  // first open: unsaved work to recover, a job from version 1, the job this browser had open, the newest, or a fresh one
  useEffect(() => {
    if (opened.current || jobs === null) return;
    opened.current = true;
    if (migrated) {
      showJob(migrated, false);
      notify(`PRN ${migrated.info.prn || '(no number)'} was brought across from the previous version. Save it to keep it.`, { tone: 'good' });
      return;
    }
    const rec = recovered;
    const want = rec?.jobId && jobs.some((j) => j.id === rec.jobId) ? rec.jobId : (recall(OPEN_KEY) ?? '');
    const pick = jobs.find((j) => j.id === want) ?? jobs[0];
    void loadJob(pick ? pick.id : null);
  }, [jobs, migrated, loadJob, showJob, recovered]);

  // someone else saved the job we have open
  useEffect(() => {
    if (!job || !jobs) return;
    const s = jobs.find((x) => x.id === job.id);
    const mine = savedAt.current.get(job.id);
    if (s && s.session !== store.session && mine && s.updatedAt > mine) setStale(s);
  }, [jobs, job, store.session]);

  // ------------------------------------------------------------ edits
  const updateJob = useCallback(
    (patch: Partial<Job>) => {
      const j = jobRef.current;
      if (!j) return;
      if (!store.canWrite) {
        notify('You can view jobs here but not change them. Ask the owner for Contributor access.', { tone: 'bad' });
        return;
      }
      record(`job:${Object.keys(patch).join(',')}`);
      const next = { ...j, ...patch };
      jobRef.current = next;
      setJobState(next);
    },
    [store.canWrite],
  );

  const updateSetup = useCallback(
    (patch: Partial<WorksSetup>) => {
      if (!store.canEditSetup) {
        notify('Only editors can change the works setup.', { tone: 'bad' });
        return;
      }
      record(`setup:${Object.keys(patch).join(',')}`);
      const next = { ...setupRef.current, ...patch };
      setupRef.current = next;
      setSetupState(next);
    },
    [store.canEditSetup],
  );

  /** Replaces the whole works setup and saves it at once (restore, reset). */
  const replaceSetup = async (s: WorksSetup) => {
    if (!store.canEditSetup) return notify('Only editors can change the works setup.', { tone: 'bad' });
    record('setup:replace');
    setupRef.current = s;
    setSetupState(s);
    try {
      await store.saveSetup({ ...s, updatedAt: new Date().toISOString() });
      setSaved({ job: savedRef.current.job, setup: s });
      setSetupStored(true);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'The works setup could not be saved.', { tone: 'bad' });
    }
  };

  const input = useMemo<PlanInput>(() => (job ? planInput(setup, job) : planInput(setup, newJob(setup))), [setup, job]);

  /** Views edit a PlanInput; each change goes to the job or to the works setup it belongs to. */
  const route = useCallback(
    (next: PlanInput) => {
      const jobPatch: Partial<Job> = {};
      if (next.lines !== input.lines) jobPatch.lines = next.lines;
      if (next.job !== input.job) jobPatch.info = next.job;
      if (next.cargo !== input.cargo) jobPatch.cargo = next.cargo;
      if (next.settings.rule !== input.settings.rule) jobPatch.rule = next.settings.rule;
      const setupPatch: Partial<WorksSetup> = {};
      if (next.boxSizes !== input.boxSizes) setupPatch.boxSizes = next.boxSizes;
      if (next.fleet && next.fleet !== input.fleet) setupPatch.fleet = next.fleet;
      if (next.settings !== input.settings) {
        const changed = (Object.keys(next.settings) as (keyof PlanSettings)[]).some((k) => k !== 'rule' && next.settings[k] !== input.settings[k]);
        if (changed) setupPatch.settings = { ...next.settings, rule: setupRef.current.settings.rule };
      }
      if (Object.keys(jobPatch).length) updateJob(jobPatch);
      if (Object.keys(setupPatch).length) updateSetup(setupPatch);
    },
    [input, updateJob, updateSetup],
  );

  const { plan, busy, error, current } = usePlanner(input);
  const planOk = current && job ? plan : null;
  if (planOk) planRef.current = { boxes: planOk.totals.boxes, gross: planOk.totals.gross };

  // keep the job list's box count and weight in step with the plan, for a saved job with no unsaved changes
  useEffect(() => {
    if (!planOk || !job || jobDirty || saved.job !== job || !jobs || !store.canWrite) return;
    const s = jobs.find((x) => x.id === job.id);
    if (s && (s.boxes !== planOk.totals.boxes || Math.abs((s.gross ?? 0) - planOk.totals.gross) > 0.5)) {
      const same = { ...job, updatedAt: savedAt.current.get(job.id) ?? job.updatedAt };
      chain.current = chain.current.then(() => store.saveJob(same, summaryOf(same, store.session, planRef.current))).catch(() => undefined);
    }
  }, [planOk, job, jobDirty, saved.job, jobs, store]);

  // ------------------------------------------------------------ actions
  const printPaper = () => {
    if (__ARTIFACT__) return notify('Printing is not available inside claude.ai. Use the website or the file, or download the Excel workbook.', { tone: 'bad' });
    setView('paper');
    setTimeout(() => window.print(), 400);
  };
  const doRevert = () => {
    const sv = savedRef.current;
    const j = jobRef.current;
    if (!j) return;
    record('revert');
    apply({ job: sv.job ?? { ...newJob(setupRef.current), id: j.id }, setup: sv.setup });
    remember(RECOVERY_KEY, null);
    notify('Changes since the last save were discarded.', { action: { label: 'Undo', run: undo } });
  };
  const putJob = async (j: Job, open: boolean, force = false) => {
    try {
      chain.current = chain.current.then(() => store.saveJob(j, summaryOf(j, store.session, null)));
      await chain.current;
      savedAt.current.set(j.id, j.updatedAt);
      if (open) {
        const show = () => {
          showJob(j, true);
          setView('lines');
        };
        if (force) show();
        else guard(show);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'The job could not be saved.', { tone: 'bad' });
    }
  };
  const deleteJob = async (id: string) => {
    try {
      await store.deleteJob(id);
      savedAt.current.delete(id);
      if (jobRef.current?.id === id) {
        const rest = (jobs ?? []).filter((j) => j.id !== id);
        await loadJob(rest[0]?.id ?? null);
      }
      notify('Job deleted.', { tone: 'good' });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'The job could not be deleted.', { tone: 'bad' });
    }
  };
  const setStatus = (id: string, status: JobStatus) => {
    const j = jobRef.current;
    if (j && id === j.id) {
      // the status is saved at once; other unsaved changes stay unsaved
      const sv = savedRef.current.job;
      const wasClean = sv === j;
      const nextSaved = sv ? { ...sv, status, updatedAt: new Date().toISOString() } : null;
      const next = wasClean && nextSaved ? nextSaved : { ...j, status };
      jobRef.current = next;
      setJobState(next);
      if (nextSaved) {
        setSaved({ job: wasClean ? next : nextSaved, setup: savedRef.current.setup });
        savedAt.current.set(id, nextSaved.updatedAt);
        void store.saveJob(nextSaved, summaryOf(nextSaved, store.session, planRef.current)).catch(() => notify('The status could not be saved.', { tone: 'bad' }));
      }
      return;
    }
    void store
      .loadJob(id, setup)
      .then((x) => x && putJob({ ...x, status, updatedAt: new Date().toISOString() }, false))
      .catch(() => notify('The status could not be changed.', { tone: 'bad' }));
  };
  const putMaster = async (items: MasterItem[]) => {
    if (!store.canWrite) {
      notify('You can view the weight master but not change it.', { tone: 'bad' });
      return false;
    }
    try {
      await store.putMaster(items);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : 'The weights could not be saved.', { tone: 'bad' });
      return false;
    }
  };
  const removeMaster = async (keys: string[]) => {
    try {
      await store.removeMaster(keys);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'The weights could not be removed.', { tone: 'bad' });
    }
  };
  const backup = () => downloadBackup(store, setupRef.current, master, jobs ?? [], jobRef.current);
  const exportJob = async () => {
    const j = jobRef.current;
    if (!j) return;
    const r = await saveFile(`${safeName(j.info.prn, 'job')}.json`, JSON.stringify(fileOf.job(j), null, 2), 'application/json');
    if (r === 'unavailable') notify('Saving files is not available here.', { tone: 'bad' });
  };

  // ------------------------------------------------------------ keyboard and leaving
  const keys = useRef({ saveAll, undo, redo, printPaper, view });
  keys.current = { saveAll, undo, redo, printPaper, view };
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty || saving) e.preventDefault();
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty, saving]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = keys.current;
      const mod = e.ctrlKey || e.metaKey;
      const ch = e.key.toLowerCase();
      if (e.key === 'F1') {
        e.preventDefault();
        openHelp(VIEWS.find((v) => v.id === k.view)?.help ?? 'start');
      } else if (mod && ch === 's') {
        e.preventDefault();
        void k.saveAll();
      } else if (mod && ch === 'o') {
        e.preventDefault();
        setView('jobs');
      } else if (mod && ch === 'p') {
        e.preventDefault();
        k.printPaper();
      } else if (mod && !editable(e.target) && ((ch === 'z' && e.shiftKey) || ch === 'y')) {
        e.preventDefault();
        k.redo();
      } else if (mod && !editable(e.target) && ch === 'z') {
        e.preventDefault();
        k.undo();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  useEffect(() => {
    try {
      history.replaceState(null, '', `#${view}`);
    } catch {
      // some embedded viewers refuse history changes; the view still switches
    }
  }, [view]);

  useEffect(() => {
    if (job) document.title = `${dirty ? '• ' : ''}${job.info.prn.trim() || 'New job'} — WaveForce`;
  }, [job, dirty]);

  const colors = useMemo(() => {
    const lines = (job?.lines ?? []).filter((g) => g.quantity > 0);
    const ids = new Set(lines.map((g) => g.id));
    return buildColorMap([...lines, ...(plan?.types ?? []).filter((t) => !ids.has(t.id))], colorBy);
  }, [plan, job?.lines, colorBy]);

  const masterMap = useMemo(() => new Map(master.map((m) => [m.key, m])), [master]);

  // ------------------------------------------------------------ open a file: check list (Excel, CSV) or job file
  const openFile = async (file: File, more = 0) => {
    if (!store.canWrite) return notify('Opening files needs edit access.', { tone: 'bad' });
    if (more) notify(`Opening ${file.name} only: one file at a time.`);
    if (/\.json$/i.test(file.name)) return importJobFile(setupRef.current, jobs ?? [], putJob, file);
    if (!isCheckListFile(file.name)) return notify(`${file.name} is not a check list. Open an Excel (.xlsx) or CSV file.`, { tone: 'bad' });
    try {
      const { job: j, notes } = await jobFromCheckList(file.name, new Uint8Array(await file.arrayBuffer()), setupRef.current, masterMap);
      guard(() => {
        showJob(j, false);
        setView('plan');
        const prn = j.info.prn;
        const twice = !!prn && (jobs ?? []).some((s) => s.prn === prn);
        notify(
          [
            `${j.lines.length} ${j.lines.length === 1 ? 'line' : 'lines'} read from ${file.name}.`,
            notes.length ? `${notes.length} need sizes.` : '',
            !prn ? 'No PRN number in the file.' : twice ? `PRN ${prn} is already in All jobs.` : '',
          ]
            .filter(Boolean)
            .join(' '),
          { tone: notes.length || !prn || twice ? 'info' : 'good', ms: 6000 },
        );
      });
    } catch (e) {
      notify(e instanceof Error ? e.message : `${file.name} could not be read.`, { tone: 'bad' });
    }
  };
  const pickAndOpen = async () => {
    const f = await pickFile(`${CHECK_LIST_FILES},.json`);
    if (f) await openFile(f);
  };
  const dropRef = useRef(openFile);
  dropRef.current = openFile;
  useEffect(() => {
    let depth = 0;
    const files = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => {
      if (!files(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!files(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!files(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!files(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const list = [...(e.dataTransfer?.files ?? [])];
      if (list.length) void dropRef.current(list[0], list.length - 1);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  if (!job)
    return (
      <div className="splash" role="status">
        <span className="brand-mark" aria-hidden="true" />
        <p>{jobs === null ? 'Loading jobs…' : 'Opening the job…'}</p>
      </div>
    );

  // ------------------------------------------------------------ chrome
  const isPage = PAGE_VIEWS.includes(view);
  const pcs = job.lines.reduce((a, g) => a + Math.max(0, g.quantity), 0);
  const notes = plan ? plan.warnings.length + plan.unplacedGaskets.length + plan.issues.length : 0;
  const fleetHas = setup.fleet.some((v) => v.id === job.cargo.presetId);
  const where = store.kind === 'shared' ? 'Shared with your team' : store.kind === 'browser' ? 'In this browser' : 'Not saved: storage blocked';
  const neverSaved = saved.job === null;
  const saveText = saving
    ? 'Saving…'
    : saveError && dirty
      ? 'Not saved'
      : dirty
        ? 'Unsaved changes'
        : neverSaved
          ? 'New job'
          : lastSaved
            ? `Saved ${clock.format(lastSaved)}`
            : 'Saved';
  const locked = SETUP_VIEWS.includes(view) && !store.canEditSetup;
  const h = hist.current;

  const go = (v: View) => () => setView(v);
  const menus: Menu[] = [
    {
      label: 'File',
      items: [
        { label: 'New job', onSelect: () => guard(() => (showJob(newJob(setupRef.current), false), setView('lines'))), disabled: !store.canWrite },
        { label: 'Open job…', shortcut: 'Ctrl+O', onSelect: go('jobs') },
        { label: 'Open file…', onSelect: () => void pickAndOpen(), disabled: !store.canWrite },
        { sep: true },
        { label: 'Save', shortcut: 'Ctrl+S', onSelect: () => void saveAll(), disabled: !dirty || saving },
        { label: 'Save as…', onSelect: () => setSaveAs(job.info.prn ? `${job.info.prn}-1` : ''), disabled: !store.canWrite || (neverSaved && isBlank(job)) },
        { label: 'Revert to saved', onSelect: doRevert, disabled: !dirty },
        { sep: true },
        {
          label: 'AutoSave',
          checked: autoSave,
          onSelect: () => {
            setAutoSave(!autoSave);
            remember(AUTOSAVE_KEY, autoSave ? '0' : '1');
          },
        },
        { sep: true },
        { label: 'Export this job…', onSelect: () => void exportJob() },
        { label: 'Download backup', onSelect: () => void backup() },
        ...(__ARTIFACT__ ? [] : [{ sep: true } as const, { label: 'Print paperwork…', shortcut: 'Ctrl+P', onSelect: printPaper, disabled: !plan?.boxes.length }]),
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: undo, disabled: !h.past.length },
        { label: 'Redo', shortcut: 'Ctrl+Y', onSelect: redo, disabled: !h.future.length },
      ],
    },
    {
      label: 'View',
      items: [
        ...VIEWS.slice(0, 4).map((v) => ({ label: v.label, onSelect: go(v.id), checked: view === v.id })),
        { sep: true },
        ...VIEWS.slice(4).map((v) => ({ label: v.label, onSelect: go(v.id), checked: view === v.id })),
        { sep: true },
        { label: 'Dark theme', checked: theme === 'dark', onSelect: () => onTheme(theme === 'dark' ? 'light' : 'dark') },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'WaveForce Help', shortcut: 'F1', onSelect: () => openHelp(VIEWS.find((v) => v.id === view)?.help ?? 'start') },
        { label: 'Getting started', onSelect: () => openHelp('start') },
        { label: 'Keyboard shortcuts', onSelect: () => openHelp('keys') },
        { sep: true },
        { label: 'About WaveForce', onSelect: () => openHelp('about') },
      ],
    },
  ];

  const nav: { group: string; items: { id: View; label: string; meta: string }[] }[] = [
    { group: '', items: [{ id: 'jobs', label: 'All jobs', meta: jobs ? String(jobs.length) : '…' }] },
    {
      group: job.info.prn ? `PRN ${job.info.prn}` : 'This job',
      items: [
        { id: 'lines', label: 'PRN lines', meta: String(job.lines.length) },
        { id: 'plan', label: 'Package plan', meta: plan ? String(plan.totals.boxes) : '…' },
        { id: 'paper', label: 'Paperwork', meta: '' },
      ],
    },
    {
      group: 'Works setup',
      items: [
        { id: 'boxes', label: 'Box sizes', meta: String(setup.boxSizes.filter((b) => b.enabled).length) },
        { id: 'rules', label: 'Packing rules', meta: '' },
        { id: 'vehicles', label: 'Vehicles', meta: String(setup.fleet.length) },
        { id: 'weights', label: 'Weight master', meta: String(master.length) },
        { id: 'data', label: 'Data & backup', meta: '' },
      ],
    },
  ];

  return (
    <div className={`app view-${isPage ? 'inputs' : view}`}>
      <header className="titlebar">
        <div className="brand" aria-label="WaveForce">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">WaveForce</span>
        </div>
        <MenuBar menus={menus} />
        <div className="doc-title" title={where}>
          <span className="doc-name">{job.info.prn.trim() || 'New job'}</span>
          {jobDirty && <span className="doc-dot" aria-label="unsaved" />}
          {job.info.customer.trim() && <span className="doc-sub">{job.info.customer}</span>}
        </div>
        <div className="title-right">
          <button
            type="button"
            role="switch"
            aria-checked={autoSave}
            className={`autosave${autoSave ? ' is-on' : ''}`}
            onClick={() => {
              setAutoSave(!autoSave);
              remember(AUTOSAVE_KEY, autoSave ? '0' : '1');
            }}
          >
            <span className="switch" aria-hidden="true" />
            AutoSave
          </button>
          <span className={`save-state${dirty ? ' is-pending' : ''}${saveError && dirty ? ' is-error' : ''}`} title={saveError ?? where}>
            {saveText}
          </span>
          <button type="button" className="btn primary save-btn" onClick={() => void saveAll()} disabled={!dirty || saving}>
            Save
          </button>
          <button type="button" className="tgl" aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button type="button" className="tgl" aria-label="Help" onClick={() => openHelp(VIEWS.find((v) => v.id === view)?.help ?? 'start')}>
            ?
          </button>
        </div>
      </header>

      <div className="ctrl">
        <label className="lcd prn">
          <span>PRN</span>
          <input value={job.info.prn} placeholder="—" onChange={(e) => updateJob({ info: { ...job.info, prn: e.target.value } })} />
        </label>
        <label className="lcd wide">
          <span>Customer</span>
          <input value={job.info.customer} placeholder="—" onChange={(e) => updateJob({ info: { ...job.info, customer: e.target.value } })} />
        </label>
        <label className="lcd sel">
          <span>Packing</span>
          <select value={job.rule} onChange={(e) => updateJob({ rule: e.target.value as Job['rule'] })}>
            {RULES.map((r) => (
              <option key={r.id} value={r.id}>
                T{r.type} {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lcd sel">
          <span>Vehicle</span>
          <select
            value={fleetHas ? job.cargo.presetId : 'custom'}
            onChange={(e) => {
              const v = setup.fleet.find((x) => x.id === e.target.value);
              if (v) updateJob({ cargo: cargoFromVehicle(v) });
            }}
          >
            {setup.fleet.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
            {!fleetHas && <option value="custom">{job.cargo.name}</option>}
          </select>
        </label>
        <div className={`meter${error ? ' is-bad' : busy ? ' is-busy' : ''}`} role="status" aria-live="polite">
          {error ? (
            `Planning stopped: ${error}`
          ) : !plan ? (
            'Planning…'
          ) : (
            <>
              <span>
                <b>{plan.totals.boxes}</b> {plan.totals.boxes === 1 ? 'box' : 'boxes'}
              </span>
              <span>
                <b>{plan.units.length}</b> {plan.units.length === 1 ? 'truck' : 'trucks'}
              </span>
              <span>
                <b>{fmt(plan.totals.pieces)}</b> / {fmt(pcs)} pcs
              </span>
              <span>
                <b>{kg(plan.totals.gross)}</b> kg
              </span>
              <span>
                <b>{fmt(plan.totals.cbm, 2)}</b> m³
              </span>
            </>
          )}
        </div>
        <span className={`led${plan?.issues.length ? ' is-bad' : notes ? ' is-warn' : plan ? ' is-ok' : ''}`} title={notes ? `${notes} notes on the plan` : 'Every rule holds'} />
      </div>

      <div className="work">
        <nav className="browser" aria-label="Views">
          {nav.map((g, gi) => (
            <div key={gi} className="br-sec">
              {g.group && <h2 title={g.group}>{g.group}</h2>}
              {g.items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`br-item${view === it.id ? ' is-active' : ''}`}
                  aria-current={view === it.id ? 'page' : undefined}
                  onClick={() => setView(it.id)}
                >
                  <span>{it.label}</span>
                  <span className="br-meta">{it.meta}</span>
                </button>
              ))}
            </div>
          ))}
          <div className="br-foot">
            <p className={`store-kind is-${store.kind}`}>{where}</p>
            <p className="muted">WaveForce {__APP_VERSION__}</p>
          </div>
        </nav>

        <main className="main">
          {store.kind === 'session' && (
            <div className="banner is-bad" role="alert">
              This browser does not allow saving. Download a backup before you close the tab.
            </div>
          )}
          {recovered && (
            <div className="banner is-warn" role="alert">
              Unsaved changes from {clock.format(new Date(recovered.at))} were found.
              <button
                type="button"
                className="btn small-btn"
                onClick={() => {
                  // work on a job never saved comes back as a new job; otherwise over the saved copy
                  if (recovered.job && recovered.job.id !== job.id) showJob(recovered.job, false);
                  else if (recovered.job) {
                    record('recover');
                    jobRef.current = recovered.job;
                    setJobState(recovered.job);
                  }
                  if (recovered.setup && store.canEditSetup) {
                    setupRef.current = recovered.setup;
                    setSetupState(recovered.setup);
                  }
                  setRecovered(null);
                }}
              >
                Restore
              </button>
              <button
                type="button"
                className="btn ghost small-btn"
                onClick={() => {
                  remember(RECOVERY_KEY, null);
                  setRecovered(null);
                }}
              >
                Discard
              </button>
            </div>
          )}
          {stale && (
            <div className="banner is-warn" role="alert">
              {stale.prn ? `PRN ${stale.prn}` : 'This job'} was changed by someone else.
              <button type="button" className="btn small-btn" onClick={() => guard(() => void loadJob(stale.id))}>
                Load theirs
              </button>
              <button
                type="button"
                className="btn ghost small-btn"
                onClick={() => {
                  savedAt.current.set(stale.id, stale.updatedAt);
                  setStale(null);
                }}
              >
                Keep mine
              </button>
            </div>
          )}
          {locked && <div className="banner is-info">Read only: only editors can change the works setup.</div>}
          <ErrorBoundary resetKey={`${view}:${job.id}`} onBackup={backup}>
            <fieldset className="lock" disabled={locked}>
              {view === 'jobs' && (
                <JobsView
                  jobs={jobs ?? []}
                  current={job}
                  currentSaved={!neverSaved}
                  setup={setup}
                  canWrite={store.canWrite}
                  onOpen={(id) => (id === job.id ? setView('lines') : guard(() => void loadJob(id).then((ok) => ok && setView('lines'))))}
                  onNew={() => guard(() => (showJob(newJob(setupRef.current), false), setView('lines')))}
                  onOpenFile={() => void pickAndOpen()}
                  onPut={putJob}
                  onDelete={deleteJob}
                  onStatus={setStatus}
                  load={(id) => store.loadJob(id, setup)}
                />
              )}
              {view === 'lines' && (
                <GasketsView input={input} onChange={route} colors={colors} plan={plan} onShowPlan={() => setView('plan')} master={masterMap} onRemember={putMaster} />
              )}
              {view === 'boxes' && <BoxesView input={input} onChange={route} plan={plan} />}
              {view === 'rules' && (
                <RulesView
                  input={input}
                  onChange={route}
                  plan={plan}
                  defaultRule={setup.settings.rule}
                  onDefaultRule={(rule) => updateSetup({ settings: { ...setupRef.current.settings, rule } })}
                />
              )}
              {view === 'vehicles' && <VehicleView input={input} onChange={route} plan={plan} />}
              {view === 'weights' && <WeightsView master={master} onPut={putMaster} onRemove={removeMaster} canWrite={store.canWrite} lines={job.lines} />}
              {view === 'data' && (
                <DataView
                  store={store}
                  setup={setup}
                  setupStored={setupStored}
                  master={master}
                  jobs={jobs ?? []}
                  job={job}
                  onSetup={replaceSetup}
                  onPutJob={(j, open) => putJob(j, open, true)}
                  onPutMaster={putMaster}
                />
              )}
            </fieldset>
            {view !== 'jobs' && !isPage && !plan && <div className="loading">Working out the plan…</div>}
            {view === 'plan' && plan && <PlanView plan={plan} colors={colors} colorBy={colorBy} onColorBy={setColorBy} busy={busy} onEditInputs={() => setView('lines')} />}
            {view === 'paper' && plan && <SlipsView plan={plan} colors={colors} colorBy={colorBy} />}
          </ErrorBoundary>
        </main>
      </div>

      {leave && (
        <Dialog
          title="Save changes?"
          onClose={() => setLeave(null)}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={() => setLeave(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const then = leave.then;
                  setLeave(null);
                  remember(RECOVERY_KEY, null);
                  then();
                }}
              >
                Don't save
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  const then = leave.then;
                  setLeave(null);
                  if (await saveAll()) then();
                }}
              >
                Save
              </button>
            </>
          }
        >
          <p>Save the changes to {jobName(job)} before going on?</p>
        </Dialog>
      )}
      {saveAs !== null && (
        <Dialog
          title="Save as"
          onClose={() => setSaveAs(null)}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={() => setSaveAs(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!saveAs.trim()}
                onClick={async () => {
                  const now = new Date().toISOString();
                  const copy: Job = { ...job, id: newId('j'), info: { ...job.info, prn: saveAs.trim() }, status: 'draft', createdAt: now, updatedAt: now };
                  setSaveAs(null);
                  try {
                    chain.current = chain.current.then(() => store.saveJob(copy, summaryOf(copy, store.session, planRef.current)));
                    await chain.current;
                    savedAt.current.set(copy.id, now);
                    showJob(copy, true);
                    setLastSaved(new Date());
                    notify(`Saved as PRN ${copy.info.prn}.`, { tone: 'good' });
                  } catch (e) {
                    notify(e instanceof Error ? e.message : 'The job could not be saved.', { tone: 'bad' });
                  }
                }}
              >
                Save
              </button>
            </>
          }
        >
          <label className="field" htmlFor="save-as-prn">
            <span className="field-label">PRN number for the new job</span>
            <input
              id="save-as-prn"
              className="txt"
              autoFocus
              value={saveAs}
              onChange={(e) => setSaveAs(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveAs.trim() && (e.currentTarget.closest('dialog')?.querySelector<HTMLButtonElement>('.btn.primary')?.click())}
            />
          </label>
        </Dialog>
      )}
      {dragging && (
        <div className="drop-veil" aria-hidden="true">
          <div className="drop-card">
            <b>Drop to plan</b>
            <span>Check list (.xlsx, .csv) or job file</span>
          </div>
        </div>
      )}
      <HelpDialog about={{ version: __APP_VERSION__, built: __BUILD_DATE__, storage: where }} />
      <Toasts />
    </div>
  );
}
