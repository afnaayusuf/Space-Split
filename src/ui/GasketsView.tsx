import { useState } from 'react';
import { CLASSES, inch, rtjDims, spwDims } from '../model/catalog';
import { FAMILIES, blankLine, newId } from '../model/defaults';
import { applyMaster, findMaster, masterFromLine, specKey } from '../model/master';
import type { Family, GasketLine, MasterItem, PackagePlan, PlanInput } from '../model/types';
import { parseCheckList } from '../parse/checklist';
import { lineFromText } from '../parse/describe';
import { packLine } from '../planner/units';
import { estimateWeight } from '../planner/weight';
import { FALLBACK_COLOR, type TypeColor } from './colors';
import { Dialog } from './Dialog';
import { Check, Field, NumInput } from './fields';
import { fmt } from './format';
import { JobFields } from './InputsView';
import { RingSwatch } from './Legend';
import { Panel } from './live';
import { notify } from './toast';

interface Props {
  input: PlanInput;
  onChange: (next: PlanInput) => void;
  colors: Map<string, TypeColor>;
  plan: PackagePlan | null;
  onShowPlan: () => void;
  master: Map<string, MasterItem>;
  onRemember: (items: MasterItem[]) => Promise<boolean>;
}

/** The PRN: its header and its gasket lines, typed, pasted from the check list or edited one at a time. */
export function GasketsView({ input, onChange, colors, plan, onShowPlan, master, onRemember }: Props) {
  const [editing, setEditing] = useState<GasketLine | null>(null);
  const [quick, setQuick] = useState('');
  const [quickNote, setQuickNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const lines = input.lines;
  const setLines = (next: GasketLine[]) => onChange({ ...input, lines: next });
  const put = (id: string, patch: Partial<GasketLine>) => setLines(lines.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const pcs = lines.reduce((a, g) => a + Math.max(0, g.quantity), 0);
  const isNew = editing !== null && !lines.some((g) => g.id === editing.id);
  const noteOf = new Map(plan?.packing.map((p) => [p.typeId, p.note]) ?? []);
  const given = input.settings.rule === 'given';
  const fromMaster = lines.filter((g) => (g.weightEstimated || !(g.unitWeight > 0)) && (findMaster(master, g)?.unitWeight ?? 0) > 0);
  // typed chart weights the master does not have yet
  const learnable = lines
    .filter((g) => !g.weightEstimated && g.unitWeight > 0 && !findMaster(master, g))
    .map((g) => masterFromLine(g))
    .filter((m): m is MasterItem => m !== null);

  const addQuick = () => {
    const text = quick.trim();
    if (!text) return;
    const { line, notes } = lineFromText(text);
    const g = applyMaster({ ...blankLine(), ...line, id: newId('l'), sl: String(lines.length + 1) } as GasketLine, master);
    if (!g.quantity) g.quantity = 1;
    setLines([...lines, g]);
    setQuick('');
    setQuickNote(notes[0] ?? (g.od > 0 ? `Added ${g.family} ${g.size ? inch(g.size) : g.ringNo} · ${g.quantity} pcs${g.weightEstimated ? '' : ' · chart weight'}.` : 'Added. Enter its OD, ID and thickness.'));
    setTimeout(() => setQuickNote(null), 4000);
  };
  const removeLine = (g: GasketLine) => {
    const at = lines.indexOf(g);
    setLines(lines.filter((x) => x.id !== g.id));
    notify(`Removed ${g.itemCode || g.description || 'the line'}.`, {
      action: { label: 'Undo', run: () => onChange({ ...input, lines: [...input.lines.slice(0, at), g, ...input.lines.slice(at)] }) },
    });
  };

  return (
    <div className="page">
      <Panel title="PRN / PO" help="lines">
        <JobFields job={input.job} onChange={(job) => onChange({ ...input, job })} />
      </Panel>

      <Panel
        title={`PRN lines · ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} · ${fmt(pcs)} pcs`}
        help="lines"
        actions={
          <>
            <PasteCheckList onAdd={(rows, replace) => setLines(replace ? rows.map((r) => applyMaster(r, master)) : [...lines, ...rows.map((r) => applyMaster(r, master))])} />
            <button type="button" className="btn" onClick={() => setEditing({ ...blankLine(), sl: String(lines.length + 1) })}>
              Add line…
            </button>
            {confirm ? (
              <span className="confirm">
                Remove every line?
                <button type="button" className="btn danger" onClick={() => (setLines([]), setConfirm(false))}>
                  Remove
                </button>
                <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="btn ghost" onClick={() => setConfirm(true)} disabled={!lines.length}>
                Clear
              </button>
            )}
            <button type="button" className="btn primary" onClick={onShowPlan} disabled={!lines.length}>
              Plan ▸
            </button>
          </>
        }
      >
        {fromMaster.length > 0 && (
          <div className="banner is-info inline">
            Chart weights on file for {fromMaster.length} {fromMaster.length === 1 ? 'line' : 'lines'}.
            <button type="button" className="btn small-btn" onClick={() => setLines(lines.map((g) => applyMaster(g, master)))}>
              Apply
            </button>
          </div>
        )}
        {learnable.length > 0 && (
          <div className="banner is-info inline">
            {learnable.length} typed {learnable.length === 1 ? 'weight' : 'weights'} not in the weight master.
            <button
              type="button"
              className="btn small-btn"
              onClick={async () => {
                if (await onRemember(learnable)) notify(`${learnable.length} ${learnable.length === 1 ? 'weight' : 'weights'} saved to the weight master.`, { tone: 'good' });
              }}
            >
              Save to the master
            </button>
          </div>
        )}
        <form
          className="quick"
          onSubmit={(e) => {
            e.preventDefault();
            addQuick();
          }}
        >
          <label htmlFor="quick-line">Quick entry</label>
          <input
            id="quick-line"
            className="txt boxed"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder='SPW 6" 150# 316L/Graphite x 200'
            autoComplete="off"
          />
          <button type="submit" className="btn" disabled={!quick.trim()}>
            Add
          </button>
          {quickNote && (
            <span className="flash" role="status">
              {quickNote}
            </span>
          )}
        </form>

        <div className="table-wrap">
          <table className="grid-table lines-table">
            <thead>
              <tr>
                <th aria-label="Colour" />
                <th>SL</th>
                <th>Item code</th>
                <th>Description of goods</th>
                <th>Type</th>
                <th className="n">Size</th>
                <th className="n">Class</th>
                <th className="n">OD</th>
                <th className="n">ID</th>
                <th className="n">T</th>
                <th className="n">Qty</th>
                <th className="n">kg / pc</th>
                <th className={given ? '' : 'dim'}>Box No</th>
                <th>Packed as</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {lines.map((g, i) => {
                const unplaced = plan?.unplacedGaskets.find((u) => u.typeId === g.id);
                const bad = g.od <= 0 || g.thickness <= 0 || g.innerD >= g.od;
                return (
                  <tr key={g.id} className={unplaced || bad ? 'has-warn' : ''} title={unplaced?.reason}>
                    <td>
                      <RingSwatch type={g.od > 0 ? g : { ...g, od: 1, innerD: 0.6 }} color={colors.get(g.id) ?? FALLBACK_COLOR} size={18} />
                    </td>
                    <td className="dim">{g.sl || i + 1}</td>
                    <td>
                      <button type="button" className="link-btn" onClick={() => setEditing(g)}>
                        {g.itemCode || '—'}
                      </button>
                    </td>
                    <td className="desc" title={g.description}>
                      {g.description || <span className="dim">—</span>}
                      {bad && <span className="row-note warn">enter OD, ID and thickness</span>}
                      {unplaced && <span className="row-note warn">{fmt(unplaced.quantity)} pcs not packed</span>}
                    </td>
                    <td>
                      <span className={`fam fam-${g.family}`}>{g.family}</span>
                    </td>
                    <td className="n">{g.family === 'RTJ' ? g.ringNo || inch(g.size) : inch(g.size)}</td>
                    <td className="n">{g.rating || '–'}</td>
                    <td className="n">{fmt(g.od, 1)}</td>
                    <td className="n">{fmt(g.innerD, 1)}</td>
                    <td className="n">{fmt(g.thickness, 1)}</td>
                    <td className="qty">
                      <NumInput id={`l-q-${g.id}`} label={`Quantity, ${g.itemCode || g.description}`} value={g.quantity} onChange={(v) => put(g.id, { quantity: Math.round(v) })} />
                    </td>
                    <td className="qty" title={g.weightEstimated ? 'Estimated from the outline; enter the chart weight' : undefined}>
                      <NumInput
                        id={`l-w-${g.id}`}
                        label={`Weight per piece, ${g.itemCode || g.description}${g.weightEstimated ? ' (estimated)' : ''}`}
                        value={g.unitWeight}
                        onChange={(v) => put(g.id, { unitWeight: v, weightEstimated: false })}
                        className={g.weightEstimated ? 'is-est' : ''}
                      />
                    </td>
                    <td className="boxno-cell">
                      <input
                        className="txt"
                        value={g.boxNo}
                        aria-label={`Box No, ${g.itemCode || g.description}`}
                        placeholder={given ? '1' : ''}
                        onChange={(e) => put(g.id, { boxNo: e.target.value })}
                      />
                    </td>
                    <td className="packed">{noteOf.get(g.id) ?? ''}</td>
                    <td className="row-actions">
                      <button type="button" className="btn small-btn" onClick={() => setEditing(g)}>
                        Edit
                      </button>
                      <button type="button" className="icon-btn" aria-label={`Remove ${g.itemCode || `line ${i + 1}`}`} onClick={() => removeLine(g)}>
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {lines.length === 0 && <p className="empty-row">No lines yet.</p>}
      </Panel>

      {editing && (
        <LineEditor
          key={editing.id}
          initial={editing}
          isNew={isNew}
          input={input}
          master={master}
          color={colors.get(editing.id) ?? FALLBACK_COLOR}
          onCancel={() => setEditing(null)}
          onSave={async (g, rememberIt) => {
            setLines(isNew ? [...lines, g] : lines.map((x) => (x.id === g.id ? g : x)));
            setEditing(null);
            const m = rememberIt ? masterFromLine(g) : null;
            if (m && (await onRemember([m]))) notify(`${m.key}: ${fmt(m.unitWeight, 3)} kg saved to the weight master.`, { tone: 'good' });
          }}
        />
      )}
    </div>
  );
}

const DIM_LABELS: Partial<Record<Family, [string, string, string]>> = {
  SPW: ['Outer ring OD', 'Inner ring ID', 'Winding thickness'],
  KAM: ['Outer ring OD', 'Core ID', 'Core thickness'],
  RTJ: ['Ring OD', 'Ring ID', 'Ring height'],
  DJ: ['Jacket OD', 'Jacket ID', 'Thickness'],
  ISK: ['Gasket OD', 'Gasket ID', 'Set height'],
};

function LineEditor({
  initial,
  isNew,
  input,
  master,
  color,
  onCancel,
  onSave,
}: {
  initial: GasketLine;
  isNew: boolean;
  input: PlanInput;
  master: Map<string, MasterItem>;
  color: TypeColor;
  onCancel: () => void;
  onSave: (g: GasketLine, remember: boolean) => void;
}) {
  const [g, setG] = useState(initial);
  const [note, setNote] = useState<string | null>(null);
  const [rememberIt, setRememberIt] = useState(true);
  const set = (patch: Partial<GasketLine>) => setG({ ...g, ...patch });
  const filed = findMaster(master, g);
  const key = specKey(g);
  const canRemember = !g.weightEstimated && g.unitWeight > 0 && !!key && Math.abs((filed?.unitWeight ?? 0) - g.unitWeight) > 1e-6;
  const [odL, idL, tL] = DIM_LABELS[g.family] ?? ['Outer diameter', 'Inner diameter', 'Thickness'];
  const errors: string[] = [];
  if (g.od <= 0) errors.push(`${odL} must be above 0.`);
  if (g.thickness <= 0) errors.push(`${tL} must be above 0.`);
  if (g.od > 0 && g.innerD >= g.od) errors.push(`${idL} must be smaller than ${odL.toLowerCase()}.`);
  const std = g.family === 'SPW' ? spwDims(g.size, g.rating) : g.family === 'RTJ' && g.ringNo ? rtjDims(g.ringNo, /OVAL/i.test(g.description) ? 'oval' : 'oct') : null;
  const packNote = g.od > 0 && g.thickness > 0 ? packLine(g, input.settings.rule, input.settings, () => undefined).note : null;

  return (
    <Dialog
      title={isNew ? 'Add PRN line' : `Edit ${initial.itemCode || initial.description || 'line'}`}
      onClose={onCancel}
      wide
      footer={
        <>
          {errors.length > 0 && <span className="dialog-error">{errors[0]}</span>}
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={errors.length > 0} onClick={() => onSave({ ...g, id: g.id || newId('l') }, canRemember && rememberIt)}>
            {isNew ? 'Add line' : 'Save'}
          </button>
        </>
      }
    >
      <div className="editor">
        <div className="editor-form">
          <div className="fields four">
            <Field id="le-sl" label="SL">
              <input id="le-sl" className="txt boxed" value={g.sl} onChange={(e) => set({ sl: e.target.value })} />
            </Field>
            <Field id="le-po" label="PO SL">
              <input id="le-po" className="txt boxed" value={g.poSl} onChange={(e) => set({ poSl: e.target.value })} />
            </Field>
            <Field id="le-code" label="Cust item code">
              <input id="le-code" className="txt boxed" value={g.itemCode} onChange={(e) => set({ itemCode: e.target.value })} />
            </Field>
            <Field id="le-uom" label="UOM">
              <input id="le-uom" className="txt boxed" value={g.uom} onChange={(e) => set({ uom: e.target.value })} />
            </Field>
          </div>
          <Field id="le-desc" label="Description of goods">
            <input id="le-desc" className="txt boxed" value={g.description} onChange={(e) => set({ description: e.target.value })} />
            <button
              type="button"
              className="btn"
              disabled={!g.description.trim()}
              onClick={() => {
                const { line, notes } = lineFromText(g.description, { quantity: g.quantity, unitWeight: g.weightEstimated ? 0 : g.unitWeight });
                setG(applyMaster({ ...g, ...line, quantity: g.quantity || line.quantity || 0 } as GasketLine, master));
                setNote(notes[0] ?? 'Read from the description.');
              }}
            >
              Read
            </button>
          </Field>
          {note && <p className="field-help">{note}</p>}
          <div className="fields four">
            <Field id="le-fam" label="Type">
              <select id="le-fam" value={g.family} onChange={(e) => set({ family: e.target.value as Family })}>
                {FAMILIES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.short} · {f.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="le-size" label="Size" unit="in">
              <NumInput id="le-size" value={g.size} onChange={(v) => set({ size: v })} />
            </Field>
            <Field id="le-cls" label="Class">
              <select id="le-cls" value={g.rating} onChange={(e) => set({ rating: Number(e.target.value) })}>
                <option value={0}>–</option>
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}#
                  </option>
                ))}
                {!CLASSES.includes(g.rating as (typeof CLASSES)[number]) && g.rating > 0 && <option value={g.rating}>{g.rating}#</option>}
              </select>
            </Field>
            {g.family === 'RTJ' ? (
              <Field id="le-ring" label="Ring no">
                <input id="le-ring" className="txt boxed" value={g.ringNo} placeholder="R24" onChange={(e) => set({ ringNo: e.target.value.toUpperCase() })} />
              </Field>
            ) : (
              <Field id="le-mat" label="Material">
                <input id="le-mat" className="txt boxed" value={g.material} onChange={(e) => set({ material: e.target.value })} />
              </Field>
            )}
          </div>
          <div className="fields three">
            <Field id="le-od" label={odL} unit="mm">
              <NumInput id="le-od" value={g.od} onChange={(v) => set({ od: v })} invalid={g.od <= 0} />
            </Field>
            <Field id="le-id" label={idL} unit="mm">
              <NumInput id="le-id" value={g.innerD} onChange={(v) => set({ innerD: v })} invalid={g.od > 0 && g.innerD >= g.od} />
            </Field>
            <Field id="le-t" label={tL} unit="mm">
              <NumInput id="le-t" value={g.thickness} onChange={(v) => set({ thickness: v })} invalid={g.thickness <= 0} />
            </Field>
          </div>
          {std && (std.od !== g.od || std.innerD !== g.innerD) && (
            <p className="field-help">
              Standard size: {fmt(std.od, 1)} × {fmt(std.innerD, 1)} × {fmt(std.thickness, 1)} mm.{' '}
              <button type="button" className="link-btn" onClick={() => set({ od: std.od, innerD: std.innerD, thickness: std.thickness })}>
                Use it
              </button>
            </p>
          )}
          <div className="fields three">
            <Field id="le-q" label="Quantity" unit={g.uom || 'pcs'}>
              <NumInput id="le-q" value={g.quantity} onChange={(v) => set({ quantity: Math.round(v) })} />
            </Field>
            <Field id="le-w" label={g.weightEstimated ? 'Weight per piece (estimated)' : 'Weight per piece'} unit="kg">
              <NumInput id="le-w" value={g.unitWeight} onChange={(v) => set({ unitWeight: v, weightEstimated: false })} className={g.weightEstimated ? 'is-est' : ''} />
              <button type="button" className="btn" disabled={g.od <= 0} onClick={() => set({ unitWeight: estimateWeight(g), weightEstimated: true })}>
                Estimate
              </button>
            </Field>
            <Field id="le-box" label="Box No">
              <input id="le-box" className="txt boxed" value={g.boxNo} onChange={(e) => set({ boxNo: e.target.value })} />
            </Field>
          </div>
          {canRemember && (
            <Check
              id="le-remember"
              label={filed ? `Update the weight master for ${key} (now ${fmt(filed.unitWeight, 3)} kg)` : `Save to the weight master for ${key}`}
              checked={rememberIt}
              onChange={setRememberIt}
            />
          )}
        </div>
        <aside className="editor-side">
          <RingPreview g={g} color={color} />
          {packNote && (
            <p className="pack-note">
              <b>Packed as</b> {packNote}
            </p>
          )}
        </aside>
      </div>
    </Dialog>
  );
}

/** The gasket to scale, with its diameters marked. */
function RingPreview({ g, color }: { g: GasketLine; color: TypeColor }) {
  if (g.od <= 0) return <div className="preview-empty">Enter the outer diameter to see the gasket.</div>;
  const R = g.od / 2;
  const r = Math.max(0, Math.min(g.innerD, g.od * 0.995) / 2);
  const fs = R * 0.13;
  const pad = R * 0.38;
  const k = r / R;
  return (
    <figure className="preview">
      <svg viewBox={`${-R - pad * 0.4} ${-R - pad} ${2 * R + pad * 0.8} ${2 * R + pad * 1.9}`} role="img" aria-label={`Gasket outline, ${fmt(g.od, 1)} by ${fmt(g.innerD, 1)} mm`}>
        <defs>
          <radialGradient id="le-grad" cx="50%" cy="50%" r="50%">
            <stop offset={k} stopColor={color.light} />
            <stop offset={(k + 1) / 2} stopColor={color.base} />
            <stop offset={1} stopColor={color.dark} />
          </radialGradient>
        </defs>
        <path
          d={`M${-R},0a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 ${-2 * R},0Z${r > 0 ? `M${-r},0a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z` : ''}`}
          fill="url(#le-grad)"
          fillRule="evenodd"
          stroke={color.dark}
          strokeWidth={R * 0.012}
        />
        <g className="dim-line" strokeWidth={R * 0.012}>
          <line x1={-R} y1={-R - pad * 0.45} x2={R} y2={-R - pad * 0.45} />
          <line x1={-R} y1={-R - pad * 0.62} x2={-R} y2={-R - pad * 0.28} />
          <line x1={R} y1={-R - pad * 0.62} x2={R} y2={-R - pad * 0.28} />
          {r > 0 && <line x1={-r} y1={0} x2={r} y2={0} />}
        </g>
        <text className="dim-text" x={0} y={-R - pad * 0.6} fontSize={fs}>
          OD {fmt(g.od, 1)}
        </text>
        {r > 0 && (
          <text className="dim-text" x={0} y={-fs * 0.35} fontSize={fs * (r > R * 0.45 ? 1 : 0.8)}>
            ID {fmt(g.innerD, 1)}
          </text>
        )}
        <text className="dim-text muted" x={0} y={R + pad * 0.75} fontSize={fs * 0.85}>
          ring {fmt((g.od - g.innerD) / 2, 1)} wide · {fmt(g.thickness, 1)} thick
        </text>
      </svg>
    </figure>
  );
}

function PasteCheckList({ onAdd }: { onAdd: (rows: GasketLine[], replace: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const read = text.trim() ? parseCheckList(text) : { lines: [], notes: [] };
  if (!open)
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Paste check list…
      </button>
    );
  return (
    <Dialog
      title="Paste a packing check list"
      onClose={() => setOpen(false)}
      wide
      footer={
        <>
          <span className="muted small dialog-note">
            {read.lines.length} lines read{read.notes.length ? ` · ${read.notes.length} need sizes` : ''}
          </span>
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={!read.lines.length} onClick={() => (onAdd(read.lines, true), setText(''), setOpen(false))}>
            Replace lines
          </button>
          <button type="button" className="btn primary" disabled={!read.lines.length} onClick={() => (onAdd(read.lines, false), setText(''), setOpen(false))}>
            Add lines
          </button>
        </>
      }
    >
      <div className="paste">
        <label htmlFor="paste-rows" className="cols-hint">
          SL · PO SL · Type · Cust Item Code · Description Of Goods · Total Qty · Actual Qty · UOM · Box No
        </label>
        <textarea
          id="paste-rows"
          rows={9}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'1\t10\tSPW\tA-1\tSPW 6"X150# SS316/GR CS-OR SS316-IR\t24\t24\tNOS\t1\nRTJ R24 SI OCT x 12'}
        />
        {read.lines.length > 0 && (
          <table className="grid-table preview-table">
            <tbody>
              {read.lines.slice(0, 8).map((l) => (
                <tr key={l.id}>
                  <td>{l.family}</td>
                  <td>{l.family === 'RTJ' ? l.ringNo : inch(l.size)}</td>
                  <td>{l.rating || '–'}</td>
                  <td className="n">{l.od ? `${fmt(l.od, 1)} × ${fmt(l.innerD, 1)}` : 'size?'}</td>
                  <td className="n">{l.quantity}</td>
                  <td>{l.boxNo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {read.notes.slice(0, 4).map((n) => (
          <p key={n} className="field-help warn-text">
            {n}
          </p>
        ))}
      </div>
    </Dialog>
  );
}

