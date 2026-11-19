import { useEffect, useState } from 'react';
import { CRATE_SIZES, DEFAULTS } from '../model/presets';
import type { Settings, Vehicle } from '../model/types';
import { pickFile } from './files';
import { Icon } from './icons';

/** A number box that commits on Enter or when it loses focus, so the plan is not redone at every keystroke. */
function Num({ value, onChange, label, unit, min = 0, step }: { value: number; onChange: (v: number) => void; label: string; unit?: string; min?: number; step?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v) && v >= min && v !== value) onChange(v);
    else setText(String(value));
  };
  return (
    <label className="num-field">
      <span>{label}</span>
      <span className="num-box">
        <input inputMode="decimal" value={text} step={step} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} aria-label={label} />
        {unit && <i>{unit}</i>}
      </span>
    </label>
  );
}

type Size = { L: number; W: number; H: number };
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));
const sizesText = (list: Size[]) => list.map((b) => `${fmt(b.L)} x ${fmt(b.W)} x ${fmt(b.H)}`).join('\n');

/** Reads one size a line ("16 x 16 x 3", "16×16×3", "16 16 3"), long side first; lines it cannot read are reported. */
export function readSizes(text: string): { sizes: Size[]; bad: string[] } {
  const sizes: Size[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) continue;
    const n = t.split(/\s*[x×*,]\s*|\s+/i).map(Number);
    if (n.length === 3 && n.every((v) => Number.isFinite(v) && v > 0)) {
      const [L, W] = [n[0], n[1]].sort((a, b) => b - a);
      sizes.push({ L, W, H: n[2] });
    } else bad.push(t);
  }
  sizes.sort((a, b) => a.L * a.W * a.H - b.L * b.W * b.H);
  return { sizes, bad };
}

/** The standard sizes as text, one a line; read when the box loses focus. */
function SizeList({ value, onChange }: { value: Size[]; onChange: (v: Size[]) => void }) {
  const [text, setText] = useState(sizesText(value));
  const [bad, setBad] = useState<string[]>([]);
  useEffect(() => setText(sizesText(value)), [value]);
  const commit = () => {
    const r = readSizes(text);
    setBad(r.bad);
    if (r.sizes.length && sizesText(r.sizes) !== sizesText(value)) onChange(r.sizes);
  };
  return (
    <label className="sizes-field">
      <span>
        Sizes, outside, inches · one a line: length x width x height · {value.length} sizes
      </span>
      <textarea value={text} rows={8} spellCheck={false} onChange={(e) => setText(e.target.value)} onBlur={commit} aria-label="Standard crate sizes" />
      {bad.length > 0 && <em className="sizes-bad">Not read: {bad.join(' · ')}</em>}
    </label>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`toggle${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
      <span className="toggle-track">
        <span className="toggle-knob" />
      </span>
      {label}
    </button>
  );
}

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  /** The uploaded truck model's file name, or null for the built-in truck. */
  truckName: string | null;
  onTruckFile: (file: File | null) => void;
}

export function SettingsSheet({ settings, onChange, onClose, truckName, onTruckFile }: Props) {
  const s = settings;
  const set = (patch: Partial<Settings>) => onChange({ ...s, ...patch });
  // the type whose figures are shown: the chosen one, or any on Auto
  const [editId, setEditId] = useState(s.vehicleId === 'auto' ? s.vehicles[s.vehicles.length - 1].id : s.vehicleId);
  const v = s.vehicles.find((x) => x.id === editId) ?? s.vehicles[0];
  const setVehicle = (patch: Partial<Vehicle>) => set({ vehicles: s.vehicles.map((x) => (x.id === v.id ? { ...x, ...patch } : x)) });

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  return (
    <div className="sheet-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="side-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="side-head">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        <div className="side-body">
          <section>
            <h3>Gaskets in the crate</h3>
            <div className="grid2">
              <Num label="Round a nested stack" unit="mm" value={s.ring} onChange={(ring) => set({ ring })} />
              <Num label="Between stacks" unit="mm" value={s.pile} onChange={(pile) => set({ pile })} />
              <Num label="To the crate wall" unit="mm" value={s.wall} onChange={(wall) => set({ wall })} />
              <Num label="Under the lid" unit="mm" value={s.top} onChange={(top) => set({ top })} />
              <Num label="Cardboard between gaskets" unit="mm" value={s.sheet} onChange={(sheet) => set({ sheet })} />
              <Num label="Tallest stack" unit="mm" min={10} value={s.maxPile} onChange={(maxPile) => set({ maxPile })} />
              <Num label="Gaskets to a cardboard" min={1} value={s.sheetEvery} onChange={(sheetEvery) => set({ sheetEvery: Math.max(1, Math.round(sheetEvery)) })} />
              <Num label="Corrugated under KAM / DJ" unit="mm" step={0.5} value={s.card} onChange={(card) => set({ card })} />
              <Num label="Wall room, at least" unit="% of OD" value={Math.round(s.wallPct * 100)} onChange={(v) => set({ wallPct: v / 100 })} />
              <Num label="Spiral wound bow" unit="% of OD" step={0.25} value={+(s.bow * 100).toFixed(3)} onChange={(v) => set({ bow: v / 100 })} />
              <Num label="Nest in bores up to" unit="mm OD" value={s.nestMax} onChange={(nestMax) => set({ nestMax })} />
            </div>
            <Toggle label="Nest small stacks inside bigger ones" on={s.nest} onChange={(nest) => set({ nest })} />
          </section>

          <section>
            <h3>Crates · standard sizes</h3>
            <Toggle label="Pick crates from the standard sizes" on={!!s.useSizes} onChange={(useSizes) => set({ useSizes })} />
            {s.useSizes && (
              <>
                <p className="muted small">
                  Each crate is the smallest size on the list that takes its gaskets. A crate no size takes is made to measure, with the settings below, and marked <b>Custom</b>.
                </p>
                <div className="grid2">
                  <Num label="Box side" unit="mm" step={1} value={s.sizeWall ?? 3} onChange={(sizeWall) => set({ sizeWall })} />
                  <Num label="Floor and lid" unit="mm" step={1} value={s.sizeBase ?? 10} onChange={(sizeBase) => set({ sizeBase })} />
                  <Num label="Between stacks and to the side" unit="mm" step={1} value={s.sizeGap ?? 3} onChange={(sizeGap) => set({ sizeGap })} />
                  <Num label="Under the lid" unit="mm" step={1} value={s.sizeTop ?? 15} onChange={(sizeTop) => set({ sizeTop })} />
                </div>
                <SizeList value={s.crateSizes ?? CRATE_SIZES} onChange={(crateSizes) => set({ crateSizes })} />
                <button type="button" className="btn ghost" onClick={() => set({ crateSizes: CRATE_SIZES })}>
                  Back to the works' sizes
                </button>
              </>
            )}
          </section>

          <section>
            <h3>Crates · made to measure</h3>
            <div className="grid3">
              <Num label="Longest side" unit="mm" min={100} value={s.crateMaxSide} onChange={(crateMaxSide) => set({ crateMaxSide })} />
              <Num label="Tallest inside" unit="mm" min={50} value={s.crateMaxH} onChange={(crateMaxH) => set({ crateMaxH })} />
              <Num label="Most per crate" unit="kg" min={1} value={s.crateMaxKg} onChange={(crateMaxKg) => set({ crateMaxKg })} />
              <Num label="Plank" unit="mm" value={s.board} onChange={(board) => set({ board })} />
              <Num label="Skids" unit="mm" value={s.skid} onChange={(skid) => set({ skid })} />
              <Num label="Skids from" unit="kg" value={s.skidKg} onChange={(skidKg) => set({ skidKg })} />
              <Num label="Light box up to" unit="kg" value={s.lightKg} onChange={(lightKg) => set({ lightKg })} />
              <Num label="Light box sides" unit="mm" value={s.lightBoard} onChange={(lightBoard) => set({ lightBoard })} />
              <Num label="Height to side" unit="×" step={0.5} value={s.aspect} onChange={(aspect) => set({ aspect })} />
              <Num label="Room for smaller" unit="%" step={10} value={Math.round(s.fill * 100)} onChange={(v) => set({ fill: v / 100 })} />
              <Num label="Smaller on bigger from" unit="% of side" step={10} value={Math.round(s.onTop * 100)} onChange={(v) => set({ onTop: v / 100 })} />
            </div>
            <Toggle label="Square crates" on={s.square} onChange={(square) => set({ square })} />
            <Toggle label="Stack same-size squares before widening" on={s.stackSame} onChange={(stackSame) => set({ stackSame })} />
            <Toggle label="Share a size evenly over its crates" on={s.evenSplit} onChange={(evenSplit) => set({ evenSplit })} />
            <Toggle label="Whole inches outside" on={s.inch} onChange={(inch) => set({ inch })} />
          </section>

          <section>
            <h3>Vehicle</h3>
            <div className="pills wrap">
              <button type="button" className={`pill${s.vehicleId === 'auto' ? ' is-on' : ''}`} onClick={() => set({ vehicleId: 'auto' })}>
                Auto
              </button>
              {s.vehicles.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={`pill${x.id === s.vehicleId ? ' is-on' : ''}`}
                  onClick={() => {
                    set({ vehicleId: x.id });
                    setEditId(x.id);
                  }}
                >
                  {x.name}
                </button>
              ))}
            </div>
            <label className="num-field">
              <span>Figures for</span>
              <select className="vehicle-select" value={v.id} onChange={(e) => setEditId(e.target.value)}>
                {s.vehicles.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid3">
              <Num label="Length" unit="mm" min={500} value={v.L} onChange={(L) => setVehicle({ L })} />
              <Num label="Width" unit="mm" min={500} value={v.W} onChange={(W) => setVehicle({ W })} />
              <Num label="Height" unit="mm" min={500} value={v.H} onChange={(H) => setVehicle({ H })} />
              <Num label="Payload" unit="kg" min={1} value={v.payload} onChange={(payload) => setVehicle({ payload })} />
              <Num label={v.kind === 'semi' ? 'Kingpin at' : 'Front axle at'} unit="mm" min={-10000} value={v.front.x} onChange={(x) => setVehicle({ front: { ...v.front, x } })} />
              {/* (figures are from the front wall of the load space; a front axle under the cab is negative) */}
              <Num label="… carries up to" unit="kg" min={1} value={v.front.max} onChange={(max) => setVehicle({ front: { ...v.front, max } })} />
              <Num label="Rear axles at" unit="mm" value={v.rear.x} onChange={(x) => setVehicle({ rear: { ...v.rear, x } })} />
              <Num label="… carry up to" unit="kg" min={1} value={v.rear.max} onChange={(max) => setVehicle({ rear: { ...v.rear, max } })} />
            </div>
          </section>

          <section>
            <h3>On the vehicle</h3>
            <div className="grid2">
              <Num label="To the walls" unit="mm" value={s.deckWall} onChange={(deckWall) => set({ deckWall })} />
              <Num label="Between crates" unit="mm" value={s.deckGap} onChange={(deckGap) => set({ deckGap })} />
              <Num label="Under the roof" unit="mm" value={s.deckTop} onChange={(deckTop) => set({ deckTop })} />
              <Num label="Most crates high" min={1} step={1} value={s.tiers} onChange={(tiers) => set({ tiers: Math.max(1, Math.round(tiers)) })} />
            </div>
            <div className="seg" role="radiogroup" aria-label="Stacking">
              {(
                [
                  ['auto', 'Stack when it saves a vehicle'],
                  ['always', 'Always stack'],
                  ['never', 'Never stack'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={s.stacking === k} className={s.stacking === k ? 'is-on' : ''} onClick={() => set({ stacking: k })}>
                  {label}
                </button>
              ))}
            </div>
            <Toggle label="One crate across four" on={s.bridge} onChange={(bridge) => set({ bridge })} />
          </section>

          <section>
            <h3>Truck model</h3>
            <div className="model-row">
              <span className="grow">
                <b>{truckName ?? 'Built-in truck'}</b>
                <span className="muted small">{truckName ? 'Shown in the theme colours · kept in this browser' : 'Drop a .glb tractor model on the page, or upload one'}</span>
              </span>
              {truckName && (
                <button type="button" className="btn" onClick={() => set({ truckTurn: (s.truckTurn + 1) % 4 })}>
                  Turn 90°
                </button>
              )}
              <button type="button" className="btn" onClick={() => void pickFile('.glb,.gltf').then((f) => f && onTruckFile(f))}>
                <Icon name="upload" size={17} /> Upload
              </button>
              {truckName && (
                <button type="button" className="icon-btn" aria-label="Remove the truck model" onClick={() => onTruckFile(null)}>
                  <Icon name="trash" size={17} />
                </button>
              )}
            </div>
          </section>

          <button type="button" className="btn ghost danger" onClick={() => onChange(DEFAULTS)}>
            Reset all settings
          </button>
        </div>
      </aside>
    </div>
  );
}

