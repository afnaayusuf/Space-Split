import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Object3D } from 'three';
import type { Crate, Line, Settings } from './model/types';
import { readPrn } from './parse/readPrn';
import { readSheets } from './parse/sheet';
import { loadFile, saveFile as storeFile } from './state/modelStore';
import { loadJob, loadSettings, saveJob, saveSettings, type Job } from './state/store';
import { usePlan } from './state/usePlan';
import { parseModel } from './three/custom';
import { CratesView } from './ui/CratesView';
import { pickFile } from './ui/files';
import { lineColor, n0, plural } from './ui/format';
import { HelpDialog } from './ui/Help';
import { Icon, type IconName } from './ui/icons';
import { LinesView } from './ui/LinesView';
import { LoadView } from './ui/LoadView';
import { ReportView } from './ui/ReportView';
import { SettingsSheet } from './ui/SettingsSheet';
import { LoadStage } from './ui/Stage3D';
import { notify, Toasts } from './ui/toast';

type Tab = 'load' | 'crates' | 'lines' | 'report';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'load', label: 'Load', icon: 'truck' },
  { id: 'crates', label: 'Crates', icon: 'crate' },
  { id: 'lines', label: 'Lines', icon: 'list' },
  { id: 'report', label: 'Report', icon: 'doc' },
];
const FILES = '.xlsx,.xlsm,.csv,.tsv,.txt';
const THEME_KEY = 'waveforce/theme';

function initialTheme(): 'light' | 'dark' {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch {
    // storage blocked: follow the system
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [job, setJobState] = useState<Job | null>(loadJob);
  const [tab, setTab] = useState<Tab>('load');
  const [selected, setSelected] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [theme, setTheme] = useState(initialTheme);
  const [truck, setTruck] = useState<{ name: string; model: Object3D } | null>(null);
  const dark = theme === 'dark';

  const { plan, busy, error } = usePlan(job?.lines ?? null, settings);

  // an uploaded truck model, kept in this browser
  useEffect(() => {
    let live = true;
    void loadFile('truck').then(async (f) => {
      if (!f || !live) return;
      try {
        const model = await parseModel(f.data);
        if (live) setTruck({ name: f.name, model });
      } catch {
        // a model this version cannot read: fall back to the built-in truck
      }
    });
    return () => {
      live = false;
    };
  }, []);
  const setTruckFile = useCallback(async (file: File | null) => {
    if (!file) {
      setTruck(null);
      await storeFile('truck', null);
      notify('Back to the built-in truck.');
      return;
    }
    try {
      const data = await file.arrayBuffer();
      const model = await parseModel(data);
      setTruck({ name: file.name, model });
      if (!(await storeFile('truck', { name: file.name, data }))) notify('The model is shown but could not be kept; upload it again next time.');
      else notify(`${file.name} is now the truck. Settings → Turn 90° if it faces the wrong way.`, { tone: 'good', ms: 6000 });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'That model could not be read.', { tone: 'bad' });
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // not kept: fine
    }
  }, [theme]);

  const setSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  };
  const setJob = (j: Job | null) => {
    setJobState(j);
    setSelected(null);
    if (!saveJob(j) && j) notify('This PRN is too big to keep in the browser; it will need opening again next time.');
  };

  // ------------------------------------------------------------ reading a PRN (or a truck model)
  const openFile = useCallback(async (file: File) => {
    if (/\.(glb|gltf)$/i.test(file.name)) return setTruckFile(file);
    if (!/\.(xlsx|xlsm|csv|tsv|txt|xls|pdf)$/i.test(file.name)) {
      notify(`${file.name} is not a PRN file. Open the Excel (.xlsx) or CSV.`, { tone: 'bad' });
      return;
    }
    setReading(true);
    try {
      const sheets = await readSheets(file.name, new Uint8Array(await file.arrayBuffer()));
      const reads = sheets.map((s) => readPrn(s.rows));
      const best = reads.reduce((a, b) => (b.lines.length > a.lines.length ? b : a), reads[0]);
      if (!best || !best.lines.length) throw new Error(`No gasket lines were found in ${file.name}.`);
      const j: Job = { file: file.name, prn: best.prn, customer: best.customer, lines: best.lines, skipped: best.skipped, opened: new Date().toISOString() };
      setJobState(j);
      setSelected(null);
      setTab('load');
      if (!saveJob(j)) notify('This PRN is too big to keep in the browser; it will need opening again next time.');
      notify(`${plural(best.lines.length, 'line')} read from ${file.name}${best.skipped.length ? ` · ${plural(best.skipped.length, 'row')} not planned` : ''}.`, { tone: 'good' });
    } catch (e) {
      notify(e instanceof Error ? e.message : `${file.name} could not be read.`, { tone: 'bad' });
    } finally {
      setReading(false);
    }
  }, [setTruckFile]);
  const upload = useCallback(async () => {
    const f = await pickFile(FILES);
    if (f) await openFile(f);
  }, [openFile]);

  // drop a file anywhere
  const openRef = useRef(openFile);
  openRef.current = openFile;
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
      const f = e.dataTransfer?.files?.[0];
      if (f) void openRef.current(f);
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

  // keys
  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (e.key === 'F1') {
        e.preventDefault();
        setShowHelp(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void uploadRef.current();
      } else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && /^[1-4]$/.test(e.key)) {
        setTab(TABS[Number(e.key) - 1].id);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  // ------------------------------------------------------------ derived
  const lines = useMemo(() => new Map<string, Line>((job?.lines ?? []).map((g) => [g.id, g])), [job]);
  const colorOf = useMemo(() => {
    const idx = new Map((job?.lines ?? []).map((g, i) => [g.id, i]));
    return (id: string) => lineColor(idx.get(id) ?? 0);
  }, [job]);
  const crates = useMemo(() => new Map<string, Crate>((plan?.crates ?? []).map((c) => [c.id, c])), [plan]);
  const contents = useCallback(
    (c: Crate) => {
      const m = new Map<string, number>();
      for (const pg of c.groups) for (const p of pg.group.piles) m.set(p.line, (m.get(p.line) ?? 0) + p.n);
      return [...m.entries()]
        .map(([line, n]) => ({ line, n, sl: lines.get(line)?.sl ?? '', code: lines.get(line)?.code ?? '' }))
        .sort((a, b) => (parseFloat(a.sl) || 0) - (parseFloat(b.sl) || 0));
    },
    [lines],
  );
  // on Auto, the empty screen shows the biggest on the list
  const vehicle = settings.vehicles.find((v) => v.id === settings.vehicleId) ?? [...settings.vehicles].sort((a, b) => b.L * b.W - a.L * a.W)[0];

  useEffect(() => {
    if (selected && plan && !crates.has(selected)) setSelected(null);
  }, [plan, crates, selected]);

  const openCrate = (id: string) => {
    setSelected(id);
    setTab('crates');
  };

  // ------------------------------------------------------------ screen
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">WaveForce</span>
        </div>

        {job && (
          <nav className="tabs" role="tablist" aria-label="Screens">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
                <Icon name={t.icon} size={18} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        )}

        <div className="top-right">
          {job && (
            <span className="file-chip" title={job.file}>
              <span className="file-name">{job.prn || job.file}</span>
              <span className="file-sub">{plural(job.lines.length, 'line')}</span>
              <button type="button" className="icon-btn" aria-label="Close this PRN" onClick={() => setJob(null)}>
                <Icon name="close" size={16} />
              </button>
            </span>
          )}
          <button type="button" className="btn primary" onClick={() => void upload()} disabled={reading}>
            <Icon name="upload" size={18} />
            <span className="hide-sm">{reading ? 'Reading…' : 'Upload PRN'}</span>
          </button>
          <button type="button" className="round" aria-label={dark ? 'Light theme' : 'Dark theme'} title={dark ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(dark ? 'light' : 'dark')}>
            <Icon name={dark ? 'sun' : 'moon'} />
          </button>
          <button type="button" className="round" aria-label="Settings" title="Settings" onClick={() => setShowSettings(true)}>
            <Icon name="gear" />
          </button>
          <button type="button" className="round" aria-label="Help" title="Help (F1)" onClick={() => setShowHelp(true)}>
            <Icon name="help" />
          </button>
        </div>
      </header>

      {!job ? (
        <main className="empty">
          <div className="stagebox empty-stage">
            <LoadStage
              load={null}
              vehicle={vehicle}
              crates={crates}
              settings={settings}
              colorOf={colorOf}
              step={null}
              xray={false}
              cog={false}
              view="3d"
              selected={null}
              dark={dark}
              truck={truck?.model ?? null}
              onPick={() => undefined}
            />
            <div className="drop-card">
              <p className="eyebrow">{settings.vehicleId === 'auto' ? 'Vehicle picked to fit the load' : vehicle.name}</p>
              <h1>Upload a PRN</h1>
              <p className="muted">Excel or CSV · or drop it here</p>
              <button type="button" className="btn primary big" onClick={() => void upload()} disabled={reading}>
                <Icon name="upload" /> {reading ? 'Reading…' : 'Choose file'}
              </button>
              <p className="muted small version">
                WaveForce {__APP_VERSION__} · built {__BUILD_DATE__}
              </p>
            </div>
          </div>
        </main>
      ) : !plan ? (
        <main className="empty">
          <div className="working">{error ? `Planning stopped: ${error}` : `Planning ${n0(job.lines.length)} lines…`}</div>
        </main>
      ) : tab === 'load' ? (
        <LoadView
          job={job}
          plan={plan}
          settings={settings}
          vehicle={vehicle}
          crates={crates}
          colorOf={colorOf}
          contents={contents}
          dark={dark}
          truck={truck?.model ?? null}
          selected={selected}
          onSelect={setSelected}
          onOpenCrate={openCrate}
          onVehicle={(vehicleId) => setSettings({ ...settings, vehicleId })}
          busy={busy}
        />
      ) : tab === 'crates' ? (
        <CratesView plan={plan} settings={settings} lines={lines} colorOf={colorOf} contents={contents} dark={dark} selected={selected} onSelect={setSelected} />
      ) : tab === 'lines' ? (
        <LinesView job={job} plan={plan} colorOf={colorOf} onCrate={openCrate} />
      ) : (
        <ReportView job={job} plan={plan} lines={lines} contents={contents} />
      )}

      {dragging && (
        <div className="drop-veil" aria-hidden="true">
          <div className="drop-target">
            <Icon name="upload" size={32} />
            <b>Drop the PRN</b>
            <span>Excel (.xlsx) or CSV · or a truck model (.glb)</span>
          </div>
        </div>
      )}
      {showSettings && <SettingsSheet settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} truckName={truck?.name ?? null} onTruckFile={(f) => void setTruckFile(f)} />}
      {showHelp && <HelpDialog version={`${__APP_VERSION__} · built ${__BUILD_DATE__}`} onClose={() => setShowHelp(false)} />}
      <Toasts />
    </div>
  );
}
