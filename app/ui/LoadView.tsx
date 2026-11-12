import { useEffect, useMemo, useRef, useState } from 'react';
import type { Object3D } from 'three';
import type { Crate, Load, Plan, Settings, Vehicle } from '../model/types';
import { targetX } from '../pack/load';
import type { Job } from '../state/store';
import type { ViewName } from '../three/stage';
import { CRATE_COLORS } from '../three/models';
import { dims, kg, m1, n0, pct, plural, t1 } from './format';
import { Icon, type IconName } from './icons';
import { LoadStage } from './Stage3D';

interface Props {
  job: Job;
  plan: Plan;
  settings: Settings;
  vehicle: Vehicle;
  crates: Map<string, Crate>;
  colorOf: (line: string) => string;
  contents: (c: Crate) => { line: string; sl: string; code: string; n: number }[];
  dark: boolean;
  truck: Object3D | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpenCrate: (id: string) => void;
  onVehicle: (id: string) => void;
  busy: boolean;
}

/** Where a crate's centre of gravity sits: how far off its middle along and across, and how high. */
export function cogText(c: Crate): string {
  const off = Math.hypot(c.cog.x, c.cog.y);
  return off < 15 ? `centred · ${n0(c.cog.z)} mm up` : `${n0(off)} mm off centre · ${n0(c.cog.z)} mm up`;
}

/** The handling marks the crate carries. */
export function marks(c: Crate): string {
  return [c.stack ? '' : 'Do not stack', c.rotate ? '' : 'This way round'].filter(Boolean).join(' · ');
}

const VIEWS: { id: ViewName; icon: IconName; label: string }[] = [
  { id: '3d', icon: 'cube', label: '3D view' },
  { id: 'side', icon: 'side', label: 'Side view' },
  { id: 'top', icon: 'top', label: 'Top view' },
  { id: 'rear', icon: 'rear', label: 'Rear view' },
];

/** One colour per crate layout, so crates of a kind look alike. */
export function classColors(plan: Plan): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of plan.crates) if (!m.has(c.name)) m.set(c.name, CRATE_COLORS[m.size % CRATE_COLORS.length]);
  return m;
}

export function LoadView(p: Props) {
  const { plan } = p;
  const [no, setNo] = useState(0);
  const load: Load | null = plan.loads[Math.min(no, plan.loads.length - 1)] ?? null;
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<ViewName>('3d');
  const [xray, setXray] = useState(false);
  const [cog, setCog] = useState(true);
  const total = load?.placed.length ?? 0;
  const colors = useMemo(() => classColors(plan), [plan]);

  // a new plan or another vehicle: show it all, stop playing
  useEffect(() => {
    setStep(null);
    setPlaying(false);
  }, [plan, no]);
  useEffect(() => {
    if (no >= plan.loads.length) setNo(0);
  }, [plan, no]);

  // playback: one crate every 0.6 s
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const s = stepRef.current;
      const next = s === null || s >= total ? 1 : s + 1;
      setStep(next);
      if (next >= total) setPlaying(false);
    }, 600);
    return () => clearInterval(t);
  }, [playing, total]);

  // the selected crate's vehicle comes to the front
  useEffect(() => {
    if (!p.selected) return;
    const i = plan.loads.findIndex((l) => l.placed.some((q) => q.crate === p.selected));
    if (i >= 0 && i !== no) setNo(i);
  }, [p.selected]);

  const shownStep = step ?? total;
  const order = useMemo(() => [...(load?.placed ?? [])].sort((a, b) => a.step - b.step), [load]);
  const sel = p.selected ? p.crates.get(p.selected) ?? null : null;
  const selPlace = load?.placed.find((q) => q.crate === p.selected) ?? null;
  const v = load?.vehicle ?? p.vehicle;

  return (
    <div className="loadview">
      {/* ------------------------------------------------ left: the load */}
      <aside className="rail rail-left">
        <section className="card">
          <p className="eyebrow">{p.job.customer || 'PRN'}</p>
          <h2 className="title-xl">{p.job.prn || p.job.file.replace(/\.[^.]+$/, '')}</h2>
          <dl className="leaders">
            <div>
              <dt>Lines</dt>
              <dd>{n0(plan.lines)}</dd>
            </div>
            <div>
              <dt>Pieces</dt>
              <dd>{n0(plan.pieces)}</dd>
            </div>
            <div>
              <dt>Crates</dt>
              <dd>{n0(plan.crates.length)}</dd>
            </div>
            <div>
              <dt>Total weight</dt>
              <dd>{t1(plan.gross)}</dd>
            </div>
            <div>
              <dt>Vehicles</dt>
              <dd>{plan.loads.length}</dd>
            </div>
          </dl>
        </section>

        {load && (
          <section className="card card-list">
            <header className="card-head">
              <h3>
                {plan.loads.length > 1 ? `Vehicle ${load.no}` : 'On the vehicle'} <span className="muted">· {plural(load.placed.length, 'crate')}</span>
              </h3>
            </header>
            <ol className="crate-list">
              {order.map((q) => {
                const c = p.crates.get(q.crate)!;
                return (
                  <li key={q.crate}>
                    <button type="button" className={`crate-row${p.selected === q.crate ? ' is-on' : ''}${q.step > shownStep ? ' is-later' : ''}`} onClick={() => p.onSelect(p.selected === q.crate ? null : q.crate)}>
                      <span className="chip" style={{ background: colors.get(c.name) }} />
                      <span className="crate-no">{c.no}</span>
                      <span className="crate-meta">
                        <b>{c.name}</b>
                        <span>{dims(c.outer.L, c.outer.W, c.outer.H)}</span>
                      </span>
                      <span className="crate-kg">{kg(c.gross)}</span>
                      {q.on !== 'floor' && <span className="tag">{q.on === 'same' ? 'stacked' : 'bridge'}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </aside>

      {/* ------------------------------------------------ middle: the 3D view */}
      <main className="stagebox">
        <LoadStage
          load={load}
          vehicle={v}
          crates={p.crates}
          settings={p.settings}
          colorOf={p.colorOf}
          step={step}
          xray={xray}
          cog={cog}
          view={view}
          selected={p.selected}
          dark={p.dark}
          truck={p.truck}
          onPick={(id) => p.onSelect(id)}
        >
          <div className="stage-top">
            {plan.loads.length > 1 && (
              <div className="pills" role="tablist" aria-label="Vehicles">
                {plan.loads.map((l, i) => (
                  <button key={l.no} type="button" role="tab" aria-selected={i === no} className={`pill${i === no ? ' is-on' : ''}`} onClick={() => setNo(i)}>
                    <Icon name="truck" size={16} /> {l.no}
                  </button>
                ))}
              </div>
            )}
            {p.busy && <span className="status-pill is-busy">Planning…</span>}
          </div>

          <div className="stage-tools" role="toolbar" aria-label="View">
            {VIEWS.map((x) => (
              <button key={x.id} type="button" className={`round${view === x.id ? ' is-on' : ''}`} aria-pressed={view === x.id} title={x.label} aria-label={x.label} onClick={() => setView(x.id)}>
                <Icon name={x.icon} />
              </button>
            ))}
            <span className="tool-gap" />
            <button type="button" className={`round${xray ? ' is-on' : ''}`} aria-pressed={xray} title="See inside the crates" aria-label="See inside the crates" onClick={() => setXray(!xray)}>
              <Icon name="xray" />
            </button>
            <button type="button" className={`round${cog ? ' is-on' : ''}`} aria-pressed={cog} title="Centre of gravity" aria-label="Centre of gravity" onClick={() => setCog(!cog)}>
              <Icon name="cog" />
            </button>
          </div>

          {total > 0 && (
            <div className="timeline">
              <button type="button" className="round small" aria-label="First crate" onClick={() => (setPlaying(false), setStep(1))}>
                <Icon name="first" size={18} />
              </button>
              <button type="button" className="round small" aria-label="Previous crate" onClick={() => (setPlaying(false), setStep((s) => Math.max(1, (s ?? total) - 1)))}>
                <Icon name="prev" size={18} />
              </button>
              <button type="button" className="round play" aria-label={playing ? 'Pause' : 'Play the loading'} onClick={() => setPlaying(!playing)}>
                <Icon name={playing ? 'pause' : 'play'} size={22} />
              </button>
              <button type="button" className="round small" aria-label="Next crate" onClick={() => (setPlaying(false), setStep((s) => (s === null || s + 1 >= total ? null : s + 1)))}>
                <Icon name="next" size={18} />
              </button>
              <button type="button" className="round small" aria-label="All crates" onClick={() => (setPlaying(false), setStep(null))}>
                <Icon name="last" size={18} />
              </button>
              <Ticks total={total} at={shownStep} onSeek={(n) => (setPlaying(false), setStep(n >= total ? null : n))} />
              <span className="counter">
                <b>{shownStep}</b> / {total}
              </span>
            </div>
          )}
        </LoadStage>
      </main>

      {/* ------------------------------------------------ right: the vehicle */}
      <aside className="rail rail-right">
        <section className="card">
          <header className="card-head">
            <p className="eyebrow">Vehicle type</p>
          </header>
          <select className="vehicle-select" value={plan.auto ? 'auto' : p.settings.vehicleId} onChange={(e) => p.onVehicle(e.target.value)} aria-label="Vehicle type">
            <option value="auto">Auto · best for this load</option>
            {p.settings.vehicles.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {dims(x.L, x.W)} mm · {t1(x.payload)}
              </option>
            ))}
          </select>
          {plan.auto && plan.fleet.length > 0 && (
            <ol className="fleet">
              {plan.fleet.slice(0, 6).map((f) => (
                <li key={f.id}>
                  <button type="button" className={`fleet-row${f.chosen ? ' is-on' : ''}`} title="Use this type" onClick={() => p.onVehicle(f.id)}>
                    <span className="grow">
                      <b>{f.name}</b>
                      <span className="muted small">
                        {pct(f.kgUse)} payload · {pct(f.lengthUse)} length{f.stranded ? ` · ${f.stranded} too big` : ''}
                      </span>
                    </span>
                    <b className="fleet-count">× {f.count}</b>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        {load && (
          <section className="card">
            <p className="eyebrow">{plan.loads.length > 1 ? `Vehicle ${load.no} of ${plan.loads.length}` : 'Vehicle'}</p>
            <h2 className="title-l">{v.name}</h2>
            <p className="muted small">{dims(v.L, v.W, v.H)} mm</p>
            <Meter label="Payload" value={load.kg} max={v.payload} text={`${kg(load.kg)} / ${t1(v.payload)}`} />
            <Meter label="Loading metres" value={load.length} max={v.L} text={`${m1(load.length)} / ${m1(v.L)}`} />
            <Balance load={load} v={v} />
            <Meter label={v.kind === 'semi' ? 'Kingpin' : v.kind === 'rigid' ? 'Front axle' : 'Front end'} value={load.front} max={v.front.max} text={`${kg(load.front)} / ${t1(v.front.max)}`} />
            <Meter label={v.kind === 'container' ? 'Rear end' : 'Rear axles'} value={load.rear} max={v.rear.max} text={`${kg(load.rear)} / ${t1(v.rear.max)}`} />
          </section>
        )}

        {sel && (
          <section className="card">
            <header className="card-head">
              <p className="eyebrow">Crate</p>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => p.onSelect(null)}>
                <Icon name="close" size={18} />
              </button>
            </header>
            <h2 className="title-xl">
              {sel.no} <span className="title-sub">{sel.name}</span>
            </h2>
            <dl className="leaders">
              <div>
                <dt>Inside</dt>
                <dd>{dims(sel.inner.L, sel.inner.W, sel.inner.H)}</dd>
              </div>
              <div>
                <dt>Outside</dt>
                <dd>{dims(sel.outer.L, sel.outer.W, sel.outer.H)}</dd>
              </div>
              <div>
                <dt>Gross</dt>
                <dd>{kg(sel.gross)}</dd>
              </div>
              <div>
                <dt>Gaskets</dt>
                <dd>{kg(sel.net)}</dd>
              </div>
              <div>
                <dt>Fill</dt>
                <dd>{pct(sel.fill)}</dd>
              </div>
              <div>
                <dt>Centre of gravity</dt>
                <dd>{cogText(sel)}</dd>
              </div>
              {marks(sel) && (
                <div>
                  <dt>Handling</dt>
                  <dd>{marks(sel)}</dd>
                </div>
              )}
              {selPlace && (
                <div>
                  <dt>Load step</dt>
                  <dd>{selPlace.step}</dd>
                </div>
              )}
            </dl>
            <ul className="contents">
              {p.contents(sel).slice(0, 8).map((x) => (
                <li key={x.line}>
                  <span className="dot" style={{ background: p.colorOf(x.line) }} />
                  <span className="grow">{x.code || `SL ${x.sl}`}</span>
                  <b>{n0(x.n)}</b>
                </li>
              ))}
            </ul>
            <button type="button" className="btn wide" onClick={() => p.onOpenCrate(sel.id)}>
              <Icon name="open" size={18} /> Open crate
            </button>
          </section>
        )}

        {(load?.notes.length || plan.stranded.length || plan.notes.length) > 0 && (
          <section className="card">
            <p className="eyebrow">Notes</p>
            <ul className="notes">
              {plan.stranded.length > 0 && (
                <li className="is-bad">
                  <Icon name="alert" size={16} />
                  <span>
                    {plural(plan.stranded.length, 'crate')} will not go on the {v.name}: {plan.stranded[0].why}
                    {plan.stranded.length > 1 ? ' …' : ''}
                  </span>
                </li>
              )}
              {load?.notes.map((n) => (
                <li key={n} className="is-warn">
                  <Icon name="alert" size={16} />
                  <span>{n}</span>
                </li>
              ))}
              {plan.notes.map((n) => (
                <li key={n}>
                  <Icon name="alert" size={16} />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function Meter({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const f = max > 0 ? value / max : 0;
  return (
    <div className="meter">
      <div className="meter-top">
        <span>{label}</span>
        <b>{text}</b>
      </div>
      <div className={`bar${f > 1 ? ' is-over' : f > 0.92 ? ' is-full' : ''}`}>
        <i style={{ width: `${Math.min(100, f * 100)}%` }} />
      </div>
    </div>
  );
}

/** The deck from the side: where the centre of gravity is against the ideal point between the bearing points. */
function Balance({ load, v }: { load: Load; v: Vehicle }) {
  const x0 = Math.min(0, v.front.x) - 400;
  const x1 = Math.max(v.L, v.rear.x) + 400;
  const at = (x: number) => `${((x - x0) / (x1 - x0)) * 100}%`;
  const target = targetX(v);
  const off = load.cog.x - target;
  return (
    <div className="balance">
      <div className="meter-top">
        <span>Centre of gravity</span>
        <b>{Math.abs(off) < 50 ? 'On target' : `${n0(Math.abs(off))} mm ${off < 0 ? 'forward' : 'back'}`}</b>
      </div>
      <div className="balance-track">
        <span className="deck" style={{ left: at(0), width: `${(v.L / (x1 - x0)) * 100}%` }} />
        <span className="support" style={{ left: at(v.front.x) }} title={v.kind === 'semi' ? 'Kingpin' : 'Front axle'} />
        <span className="support" style={{ left: at(v.rear.x) }} title="Rear axles" />
        <span className="target" style={{ left: at(target) }} />
        <span className="cog" style={{ left: at(load.cog.x) }} />
      </div>
    </div>
  );
}

/** The loading scale: a tick per crate, loaded ones in blue, a pointer at the current one. Click or drag to seek. */
export function Ticks({ total, at, onSeek }: { total: number; at: number; onSeek: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const seek = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onSeek(Math.max(1, Math.round(f * total)));
  };
  const count = Math.min(total, 90);
  return (
    <div
      className="ticks"
      ref={ref}
      role="slider"
      aria-label="Loading step"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={at}
      tabIndex={0}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        seek(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && seek(e.clientX)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onSeek(Math.min(total, at + 1));
        if (e.key === 'ArrowLeft') onSeek(Math.max(1, at - 1));
      }}
    >
      {Array.from({ length: count }, (_, i) => {
        const n = Math.round(((i + 1) / count) * total);
        return <i key={i} className={n <= at ? 'on' : ''} />;
      })}
      <span className="pointer" style={{ left: `${(at / total) * 100}%` }} />
    </div>
  );
}
