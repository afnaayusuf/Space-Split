import { useState } from 'react';
import { INCH, STOCK_CARD_SIZES, blankBox, ladderBoxes, newId } from '../model/defaults';
import type { BoxSize, BoxSizing, PackagePlan, PlanInput, PlanSettings } from '../model/types';
import { Dialog } from './Dialog';
import { Check, Field, NumInput } from './fields';
import { fmt, inches } from './format';
import { Panel, Seg } from './live';
import { notify } from './toast';

interface Props {
  input: PlanInput;
  onChange: (next: PlanInput) => void;
  plan: PackagePlan | null;
}

/** Inch field backed by millimetres. */
function InchInput({ id, mm, onChange, label }: { id: string; mm: number; onChange: (mm: number) => void; label?: string }) {
  return <NumInput id={id} label={label} value={+(mm / INCH).toFixed(2)} onChange={(v) => onChange(v * INCH)} />;
}

/** The works' stock box ladder, how boxes are made to measure, and the corrugated stock. */
export function BoxesView({ input, onChange, plan }: Props) {
  const [editing, setEditing] = useState<BoxSize | null>(null);
  const [confirm, setConfirm] = useState(false);
  const boxes = input.boxSizes;
  const s = input.settings;
  const setBoxes = (next: BoxSize[]) => onChange({ ...input, boxSizes: next });
  const put = (id: string, patch: Partial<BoxSize>) => setBoxes(boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const setS = (patch: Partial<PlanSettings>) => onChange({ ...input, settings: { ...s, ...patch } });
  const isNew = editing !== null && !boxes.some((b) => b.id === editing.id);
  const usedOf = (id: string) => plan?.boxes.filter((b) => b.sizeId === id).length ?? 0;
  const remove = (b: BoxSize) => {
    const at = boxes.indexOf(b);
    setBoxes(boxes.filter((x) => x.id !== b.id));
    notify(`Removed ${b.name || 'the box size'}.`, { action: { label: 'Undo', run: () => setBoxes([...boxes.slice(0, at), b, ...boxes.slice(at)]) } });
  };
  const custom = plan?.boxes.filter((b) => !b.sizeId).length ?? 0;

  return (
    <div className="page">
      <Panel
        title={`Stock box ladder · ${boxes.filter((b) => b.enabled).length} of ${boxes.length} in use${custom > 0 ? ` · ${custom} made to measure in this plan` : ''}`}
        help="boxes"
        actions={
          <>
            <button type="button" className="btn" onClick={() => setEditing({ ...blankBox(), id: newId('b') })}>
              Add size…
            </button>
            {confirm ? (
              <span className="confirm">
                Restore the works ladder?
                <button type="button" className="btn danger" onClick={() => (setBoxes(ladderBoxes()), setConfirm(false))}>
                  Yes
                </button>
                <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>
                  No
                </button>
              </span>
            ) : (
              <button type="button" className="btn ghost" onClick={() => setConfirm(true)}>
                Works ladder
              </button>
            )}
          </>
        }
      >
        <div className="table-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Use</th>
                <th>Size</th>
                <th className="n">Outside L × W in</th>
                <th className="n">Deepest in</th>
                <th className="n">Boards side / base / lid mm</th>
                <th className="n">Skids mm</th>
                <th className="n">Stock</th>
                <th className="n">In plan</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {boxes.map((b) => (
                <tr key={b.id} className={b.enabled ? '' : 'is-off'}>
                  <td>
                    <input type="checkbox" checked={b.enabled} aria-label={`Use ${b.name}`} onChange={(e) => put(b.id, { enabled: e.target.checked })} />
                  </td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => setEditing(b)}>
                      {b.name || `${inches(b.outerL)}″`}
                    </button>
                  </td>
                  <td className="n">
                    {inches(b.outerL)} × {inches(b.outerW)}
                  </td>
                  <td className="n">{b.maxDepth > 0 ? inches(b.maxDepth) : <span className="dim">{inches(s.maxBoxDepth)}</span>}</td>
                  <td className="n">
                    {fmt(b.wall)} / {fmt(b.base)} / {fmt(b.lid)}
                  </td>
                  <td className="n">{b.skid > 0 ? fmt(b.skid) : '–'}</td>
                  <td className="n">{b.available > 0 ? b.available : 'any'}</td>
                  <td className="n">{usedOf(b.id) || ''}</td>
                  <td className="row-actions">
                    <button type="button" className="btn small-btn" onClick={() => setEditing(b)}>
                      Edit
                    </button>
                    <button type="button" className="icon-btn" aria-label={`Remove ${b.name}`} onClick={() => remove(b)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="cols">
        <Panel title="Box sizing" help="boxes">
          <Field id="bs-mode" label="Box sizes">
            <Seg<BoxSizing>
              label="Box sizes"
              value={s.boxSizing}
              onChange={(v) => setS({ boxSizing: v })}
              options={[
                { id: 'ladder', label: 'Ladder only' },
                { id: 'ladder-custom', label: 'Ladder, then to measure' },
                { id: 'custom', label: 'Made to measure' },
              ]}
            />
          </Field>
          <div className="fields three">
            <Field id="bs-depth" label="Deepest box" unit="in">
              <InchInput id="bs-depth" mm={s.maxBoxDepth} onChange={(v) => setS({ maxBoxDepth: v })} />
            </Field>
            <Field id="bs-kg" label="Box weight cap (gross)" unit="kg">
              <NumInput id="bs-kg" value={s.maxBoxWeight} onChange={(v) => setS({ maxBoxWeight: v })} />
            </Field>
            <Field id="bs-side" label="Largest made-to-measure side" unit="in">
              <InchInput id="bs-side" mm={s.maxCustomSide} onChange={(v) => setS({ maxCustomSide: v })} />
            </Field>
          </div>
          <h3>Made-to-measure boards</h3>
          <div className="fields four">
            <Field id="bs-wall" label="Sides" unit="mm">
              <NumInput id="bs-wall" value={s.wall} onChange={(v) => setS({ wall: v })} />
            </Field>
            <Field id="bs-base" label="Base" unit="mm">
              <NumInput id="bs-base" value={s.base} onChange={(v) => setS({ base: v })} />
            </Field>
            <Field id="bs-lid" label="Lid" unit="mm">
              <NumInput id="bs-lid" value={s.lid} onChange={(v) => setS({ lid: v })} />
            </Field>
            <Field id="bs-skid" label="Skids" unit="mm">
              <NumInput id="bs-skid" value={s.skid} onChange={(v) => setS({ skid: v })} />
            </Field>
          </div>
          <div className="fields">
            <Field id="bs-tare" label="Empty box weight" unit="kg / m²">
              <NumInput id="bs-tare" value={s.boxKgPerM2} onChange={(v) => setS({ boxKgPerM2: v })} />
            </Field>
          </div>
        </Panel>

        <Panel title="Corrugated squares and RTJ cartons" help="boxes">
          <Field id="cs-list" label="Square sheet stock" unit="mm">
            <CardSizes sizes={s.cardSizes} onChange={(cardSizes) => setS({ cardSizes })} />
          </Field>
          <div className="fields four">
            <Field id="cs-margin" label="Margin round a ring" unit="mm">
              <NumInput id="cs-margin" value={s.cardMargin} onChange={(v) => setS({ cardMargin: v })} />
            </Field>
            <Field id="cs-t" label="Square thickness" unit="mm">
              <NumInput id="cs-t" value={s.cardThickness} onChange={(v) => setS({ cardThickness: v })} />
            </Field>
            <Field id="cs-per" label="Carded rings per square" unit="pcs">
              <NumInput id="cs-per" value={s.ringsPerCard} min={1} onChange={(v) => setS({ ringsPerCard: Math.max(1, Math.round(v)) })} />
            </Field>
            <Field id="cs-kg" label="Board weight" unit="kg / m²">
              <NumInput id="cs-kg" value={s.boardKgPerM2} onChange={(v) => setS({ boardKgPerM2: v })} />
            </Field>
          </div>
          <div className="fields">
            <Field id="cs-side" label="RTJ carton, over the ring OD" unit="mm">
              <NumInput id="cs-side" value={s.cartonSide} onChange={(v) => setS({ cartonSide: v })} />
            </Field>
            <Field id="cs-depth" label="RTJ carton, over the ring height" unit="mm">
              <NumInput id="cs-depth" value={s.cartonDepth} onChange={(v) => setS({ cartonDepth: v })} />
            </Field>
          </div>
        </Panel>
      </div>

      {editing && (
        <BoxEditor
          key={editing.id}
          initial={editing}
          isNew={isNew}
          s={s}
          onCancel={() => setEditing(null)}
          onSave={(b) => {
            setBoxes(isNew ? [...boxes, b] : boxes.map((x) => (x.id === b.id ? b : x)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CardSizes({ sizes, onChange }: { sizes: number[]; onChange: (s: number[]) => void }) {
  const [text, setText] = useState(sizes.map((v) => fmt(v, 1).replace(/,/g, '')).join(', '));
  const commit = () => {
    const vals = text
      .split(/[\s,;]+/)
      .map((x) => parseFloat(x))
      .filter((x) => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    onChange(vals.length ? vals : STOCK_CARD_SIZES);
  };
  return (
    <div className="card-sizes">
      <input id="cs-list" className="txt boxed" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      <div className="chips">
        {sizes.map((v) => (
          <span key={v} className="chip">
            {fmt(v / INCH, 1)}″
          </span>
        ))}
      </div>
    </div>
  );
}

function BoxEditor({ initial, isNew, s, onCancel, onSave }: { initial: BoxSize; isNew: boolean; s: PlanSettings; onCancel: () => void; onSave: (b: BoxSize) => void }) {
  const [b, setB] = useState(initial);
  const set = (patch: Partial<BoxSize>) => setB({ ...b, ...patch });
  const errors: string[] = [];
  if (b.outerL <= 2 * b.wall || b.outerW <= 2 * b.wall) errors.push('The outside size must be larger than two side boards.');
  const depth = b.maxDepth > 0 ? b.maxDepth : s.maxBoxDepth;
  return (
    <Dialog
      title={isNew ? 'Add box size' : `Edit ${initial.name || 'box size'}`}
      onClose={onCancel}
      wide
      footer={
        <>
          {errors.length > 0 && <span className="dialog-error">{errors[0]}</span>}
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={errors.length > 0} onClick={() => onSave({ ...b, name: b.name.trim() || `${inches(b.outerL)}″ box` })}>
            {isNew ? 'Add size' : 'Save'}
          </button>
        </>
      }
    >
      <div className="editor">
        <div className="editor-form">
          <Field id="be-name" label="Name">
            <input id="be-name" className="txt boxed" value={b.name} onChange={(e) => set({ name: e.target.value })} placeholder="34″ square" />
          </Field>
          <h3>Outside size</h3>
          <div className="fields three">
            <Field id="be-l" label="Length" unit="in">
              <InchInput id="be-l" mm={b.outerL} onChange={(v) => set({ outerL: v })} />
            </Field>
            <Field id="be-w" label="Width" unit="in">
              <InchInput id="be-w" mm={b.outerW} onChange={(v) => set({ outerW: v })} />
            </Field>
            <Field id="be-d" label="Deepest" unit="in">
              <InchInput id="be-d" mm={b.maxDepth} onChange={(v) => set({ maxDepth: v })} />
            </Field>
          </div>
          <h3>Boards</h3>
          <div className="fields four">
            <Field id="be-wall" label="Sides" unit="mm">
              <NumInput id="be-wall" value={b.wall} onChange={(v) => set({ wall: v })} />
            </Field>
            <Field id="be-base" label="Base" unit="mm">
              <NumInput id="be-base" value={b.base} onChange={(v) => set({ base: v })} />
            </Field>
            <Field id="be-lid" label="Lid" unit="mm">
              <NumInput id="be-lid" value={b.lid} onChange={(v) => set({ lid: v })} />
            </Field>
            <Field id="be-skid" label="Skids" unit="mm">
              <NumInput id="be-skid" value={b.skid} onChange={(v) => set({ skid: v })} />
            </Field>
          </div>
          <div className="fields">
            <Field id="be-stock" label="In stock" unit="boxes">
              <NumInput id="be-stock" value={b.available} onChange={(v) => set({ available: Math.round(v) })} />
            </Field>
          </div>
          <Check id="be-on" label="Let the planner use this size" checked={b.enabled} onChange={(v) => set({ enabled: v })} />
        </div>
        <aside className="editor-side">
          <BoxPreview l={b.outerL} w={b.outerW} d={depth} wall={b.wall} base={b.base} lid={b.lid} skid={b.skid} />
          <dl className="facts">
            <div>
              <dt>Inside</dt>
              <dd>
                {fmt(b.outerL - 2 * b.wall)} × {fmt(b.outerW - 2 * b.wall)} mm
              </dd>
            </div>
            <div>
              <dt>Piles up to</dt>
              <dd>{fmt(depth - b.base - b.lid - b.skid - s.headroom)} mm high, after the 1″ headroom</dd>
            </div>
          </dl>
        </aside>
      </div>
    </Dialog>
  );
}

/** Top view and cross-section to scale, boards shaded. */
function BoxPreview({ l, w, d, wall, base, lid, skid }: { l: number; w: number; d: number; wall: number; base: number; lid: number; skid: number }) {
  if (l <= 0 || w <= 0) return <div className="preview-empty">Enter the outside size to see the box.</div>;
  const gap = Math.max(l, w) * 0.14;
  const fs = Math.max(l, w) * 0.06;
  const H = Math.max(d, base + lid + skid + 1);
  const sy = w + gap + fs * 1.4;
  const innerH = Math.max(0, H - base - lid - skid);
  return (
    <figure className="preview">
      <svg viewBox={`${-fs * 0.6} ${-fs * 1.6} ${l + fs * 1.2} ${w + gap + H + fs * 3.8}`} role="img" aria-label="Box seen from above and in section">
        <text className="dim-text start" x={0} y={-fs * 0.5} fontSize={fs}>
          Top view
        </text>
        <rect className="board" x={0} y={0} width={l} height={w} rx={fs * 0.2} />
        <rect className="inside" x={wall} y={wall} width={l - 2 * wall} height={w - 2 * wall} />
        <text className="dim-text" x={l / 2} y={w / 2 + fs * 0.35} fontSize={fs}>
          {inches(l)} × {inches(w)}″
        </text>
        <text className="dim-text start" x={0} y={sy - fs * 0.5} fontSize={fs}>
          Section, at the deepest
        </text>
        <g transform={`translate(0 ${sy})`}>
          <rect className="board" x={0} y={0} width={l} height={lid} />
          <rect className="board" x={0} y={lid} width={wall} height={innerH} />
          <rect className="board" x={l - wall} y={lid} width={wall} height={innerH} />
          <rect className="board" x={0} y={lid + innerH} width={l} height={base} />
          <rect className="inside" x={wall} y={lid} width={l - 2 * wall} height={innerH} />
          {skid > 0 && [0.06, 0.47, 0.88].map((f) => <rect key={f} className="board" x={l * f - l * 0.03} y={lid + innerH + base} width={l * 0.06} height={skid} />)}
          <text className="dim-text" x={l / 2} y={lid + innerH / 2 + fs * 0.35} fontSize={fs * 0.9}>
            {inches(H)}″ deep
          </text>
        </g>
      </svg>
    </figure>
  );
}
