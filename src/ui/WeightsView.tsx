import { useMemo, useState } from 'react';
import { inch } from '../model/catalog';
import { FAMILIES } from '../model/defaults';
import { masterFromLine, parseMasterRows, specKey } from '../model/master';
import type { Family, GasketLine, MasterItem } from '../model/types';
import { Dialog } from './Dialog';
import { Field, NumInput } from './fields';
import { saveFile } from './files';
import { fmt } from './format';
import { stamp } from './JobsView';
import { Panel, Seg } from './live';
import { notify } from './toast';
import { xlsx } from './xlsx';

interface Props {
  master: MasterItem[];
  onPut: (items: MasterItem[]) => Promise<boolean>;
  onRemove: (keys: string[]) => Promise<void>;
  canWrite: boolean;
  lines: GasketLine[];
}

const sizeText = (m: MasterItem) => (m.family === 'RTJ' ? m.ringNo : m.size ? inch(m.size) : '–');

/**
 * The weight master: chart weights the works has on file. A PRN line picks
 * its weight from here by item code or by type, size and class, so weights
 * stop being estimates once the charts are in.
 */
export function WeightsView({ master, onPut, onRemove, canWrite, lines }: Props) {
  const [fam, setFam] = useState<Family | 'all'>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<MasterItem | null>(null);
  const [paste, setPaste] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of master) c[m.family] = (c[m.family] ?? 0) + 1;
    return c;
  }, [master]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return master
      .filter((m) => (fam === 'all' || m.family === fam) && (!t || `${m.key} ${m.itemCode} ${m.description}`.toLowerCase().includes(t)))
      .sort((a, b) => a.family.localeCompare(b.family) || a.size - b.size || a.rating - b.rating || a.ringNo.localeCompare(b.ringNo, undefined, { numeric: true }));
  }, [master, fam, q]);

  // typed weights on the open job that the master does not have yet
  const known = useMemo(() => new Map(master.map((m) => [m.key, m])), [master]);
  const learnable = useMemo(
    () =>
      lines
        .filter((g) => !g.weightEstimated && g.unitWeight > 0)
        .map((g) => masterFromLine(g))
        .filter((m): m is MasterItem => m !== null && Math.abs((known.get(m.key)?.unitWeight ?? 0) - m.unitWeight) > 1e-6),
    [lines, known],
  );

  const remove = async (m: MasterItem) => {
    await onRemove([m.key]);
    notify(`Removed ${m.key}.`, { action: { label: 'Undo', run: () => void onPut([m]) } });
  };
  const download = async () => {
    const rows = [
      ['TYPE', 'SIZE / RING', 'CLASS', 'KG / PC', 'OD mm', 'ID mm', 'T mm', 'ITEM CODE'],
      ...shown.map((m) => [m.family, m.family === 'RTJ' ? m.ringNo : m.size, m.rating || '', m.unitWeight, m.od || '', m.innerD || '', m.thickness || '', m.itemCode]),
    ];
    const r = await saveFile('weight-master.xlsx', xlsx([{ name: 'Weight master', rows, widths: [7, 12, 8, 9, 9, 9, 7, 20] }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (r === 'unavailable') notify('Saving files is not available here.', { tone: 'bad' });
  };

  return (
    <div className="page">
      <Panel
        title={`Weight master · ${master.length} ${master.length === 1 ? 'weight' : 'weights'}`}
        help="weights"
        actions={
          <>
            <button type="button" className="btn primary" onClick={() => setPaste(true)} disabled={!canWrite}>
              Paste weight chart…
            </button>
            <button
              type="button"
              className="btn"
              disabled={!canWrite}
              onClick={() =>
                setEditing({ key: '', family: 'SPW', size: 0, rating: 150, ringNo: '', itemCode: '', description: '', od: 0, innerD: 0, thickness: 0, unitWeight: 0, updatedAt: '' })
              }
            >
              Add weight…
            </button>
            <button type="button" className="btn" onClick={() => void download()} disabled={!master.length}>
              Excel
            </button>
          </>
        }
      >
        {learnable.length > 0 && (
          <div className="banner is-info inline">
            {learnable.length} typed {learnable.length === 1 ? 'weight' : 'weights'} on the open job not in the master.
            <button
              type="button"
              className="btn small-btn"
              disabled={!canWrite}
              onClick={async () => {
                if (await onPut(learnable)) notify(`${learnable.length} ${learnable.length === 1 ? 'weight' : 'weights'} added to the master.`, { tone: 'good' });
              }}
            >
              Add {learnable.length === 1 ? 'it' : 'them'}
            </button>
          </div>
        )}
        <div className="list-tools">
          <input className="txt boxed search" type="search" value={q} placeholder="Find a size, ring or item code" aria-label="Find a weight" onChange={(e) => setQ(e.target.value)} />
          <Seg<Family | 'all'>
            label="Type"
            value={fam}
            onChange={setFam}
            options={[{ id: 'all', label: `All ${master.length}` }, ...FAMILIES.filter((f) => counts[f.id]).map((f) => ({ id: f.id, label: `${f.short} ${counts[f.id]}` }))]}
          />
        </div>
        {master.length === 0 ? (
          <p className="empty-row">No chart weights yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="n">Size / ring</th>
                  <th className="n">Class</th>
                  <th>Item code</th>
                  <th className="n">kg / pc</th>
                  <th className="n">OD</th>
                  <th className="n">ID</th>
                  <th className="n">T</th>
                  <th>Updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.key}>
                    <td>
                      <span className="fam">{m.family}</span>
                    </td>
                    <td className="n">{sizeText(m)}</td>
                    <td className="n">{m.rating || '–'}</td>
                    <td className="clip">{m.itemCode || <span className="dim">–</span>}</td>
                    <td className="n strong">{fmt(m.unitWeight, 3)}</td>
                    <td className="n">{m.od ? fmt(m.od, 1) : '–'}</td>
                    <td className="n">{m.innerD ? fmt(m.innerD, 1) : '–'}</td>
                    <td className="n">{m.thickness ? fmt(m.thickness, 1) : '–'}</td>
                    <td className="dim">{stamp(m.updatedAt)}</td>
                    <td className="row-actions">
                      <button type="button" className="btn small-btn" onClick={() => setEditing(m)} disabled={!canWrite}>
                        Edit
                      </button>
                      <button type="button" className="icon-btn" aria-label={`Remove ${m.key}`} onClick={() => void remove(m)} disabled={!canWrite}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing && (
        <WeightEditor
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={async (m) => {
            const old = editing.key && editing.key !== m.key ? editing.key : null;
            if (await onPut([m])) {
              if (old) await onRemove([old]);
              setEditing(null);
              notify('Weight saved.', { tone: 'good' });
            }
          }}
        />
      )}
      {paste && (
        <PasteChart
          onCancel={() => setPaste(false)}
          onAdd={async (items) => {
            if (await onPut(items)) {
              setPaste(false);
              notify(`${items.length} ${items.length === 1 ? 'weight' : 'weights'} added to the master.`, { tone: 'good' });
            }
          }}
        />
      )}
    </div>
  );
}

function WeightEditor({ initial, onCancel, onSave }: { initial: MasterItem; onCancel: () => void; onSave: (m: MasterItem) => void }) {
  const [m, setM] = useState(initial);
  const set = (p: Partial<MasterItem>) => setM({ ...m, ...p });
  const key = m.itemCode.trim() ? `CODE ${m.itemCode.trim().toUpperCase()}` : specKey(m);
  const err = !key ? (m.family === 'RTJ' ? 'Enter the ring number.' : 'Enter the size.') : !(m.unitWeight > 0) ? 'Enter the weight per piece.' : null;
  return (
    <Dialog
      title={initial.key ? `Edit ${initial.key}` : 'Add a weight'}
      onClose={onCancel}
      footer={
        <>
          {err && <span className="dialog-error">{err}</span>}
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!!err} onClick={() => onSave({ ...m, key: key!, updatedAt: new Date().toISOString() })}>
            Save
          </button>
        </>
      }
    >
      <div className="fields two">
        <Field id="wm-fam" label="Type">
          <select id="wm-fam" value={m.family} onChange={(e) => set({ family: e.target.value as Family })}>
            {FAMILIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.short} · {f.name}
              </option>
            ))}
          </select>
        </Field>
        {m.family === 'RTJ' ? (
          <Field id="wm-ring" label="Ring number">
            <input id="wm-ring" className="txt" value={m.ringNo} placeholder="R24" onChange={(e) => set({ ringNo: e.target.value.toUpperCase().replace(/\s+/g, '') })} />
          </Field>
        ) : (
          <Field id="wm-size" label="Size" unit="in">
            <NumInput id="wm-size" value={m.size} onChange={(v) => set({ size: v })} />
          </Field>
        )}
        <Field id="wm-cls" label="Class" unit="#">
          <NumInput id="wm-cls" value={m.rating} onChange={(v) => set({ rating: Math.round(v) })} />
        </Field>
        <Field id="wm-kg" label="Weight per piece" unit="kg">
          <NumInput id="wm-kg" value={m.unitWeight} onChange={(v) => set({ unitWeight: v })} invalid={!(m.unitWeight > 0)} />
        </Field>
        <Field id="wm-code" label="Customer item code (optional)">
          <input id="wm-code" className="txt" value={m.itemCode} onChange={(e) => set({ itemCode: e.target.value })} />
        </Field>
      </div>
      <h3 className="dialog-sub">Outline (optional)</h3>
      <div className="fields three">
        <Field id="wm-od" label="OD" unit="mm">
          <NumInput id="wm-od" value={m.od} onChange={(v) => set({ od: v })} />
        </Field>
        <Field id="wm-id" label="ID" unit="mm">
          <NumInput id="wm-id" value={m.innerD} onChange={(v) => set({ innerD: v })} />
        </Field>
        <Field id="wm-t" label="Thickness" unit="mm">
          <NumInput id="wm-t" value={m.thickness} onChange={(v) => set({ thickness: v })} />
        </Field>
      </div>
      <p className="field-help">Filed as: {key ?? '–'}</p>
    </Dialog>
  );
}

function PasteChart({ onCancel, onAdd }: { onCancel: () => void; onAdd: (items: MasterItem[]) => void }) {
  const [text, setText] = useState('');
  const read = text.trim() ? parseMasterRows(text) : { items: [], skipped: 0 };
  return (
    <Dialog
      title="Paste a weight chart"
      onClose={onCancel}
      wide
      footer={
        <>
          <span className="muted small dialog-note">
            {read.items.length} weights read{read.skipped ? ` · ${read.skipped} rows skipped` : ''}
          </span>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!read.items.length} onClick={() => onAdd(read.items)}>
            Add {read.items.length || ''} {read.items.length === 1 ? 'weight' : 'weights'}
          </button>
        </>
      }
    >
      <div className="paste">
        <label htmlFor="paste-chart" className="cols-hint">
          Type · Size or ring · Class · kg/pc · OD · ID · T · Item code
        </label>
        <textarea id="paste-chart" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'SPW\t6\t150\t0.48\nSPW\t6\t300\t0.69\nRTJ\tR24\t\t0.35'} />
        {read.items.length > 0 && (
          <table className="grid-table preview-table">
            <tbody>
              {read.items.slice(0, 8).map((m) => (
                <tr key={m.key}>
                  <td>{m.family}</td>
                  <td className="n">{sizeText(m)}</td>
                  <td className="n">{m.rating || '–'}</td>
                  <td className="n">{fmt(m.unitWeight, 3)} kg</td>
                  <td className="n">{m.od ? `${fmt(m.od, 1)} × ${fmt(m.innerD, 1)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  );
}
