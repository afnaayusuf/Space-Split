import { useState } from 'react';
import { DEFAULT_FLEET, cargoFromVehicle, newId } from '../model/defaults';
import type { PackagePlan, PlanInput, PlanSettings, TierMode, Vehicle } from '../model/types';
import { Dialog } from './Dialog';
import { Check, Field, NumInput } from './fields';
import { fmt } from './format';
import { Panel, Seg } from './live';
import { notify } from './toast';

interface Props {
  input: PlanInput;
  onChange: (next: PlanInput) => void;
  plan: PackagePlan | null;
}

/** The works' vehicles, which one this job goes on, and how boxes stand on the deck. */
export function VehicleView({ input, onChange, plan }: Props) {
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [confirm, setConfirm] = useState(false);
  const s = input.settings;
  const setS = (patch: Partial<PlanSettings>) => onChange({ ...input, settings: { ...s, ...patch } });
  const fleet = input.fleet ?? DEFAULT_FLEET;
  const setFleet = (next: Vehicle[]) => onChange({ ...input, fleet: next });
  const c = input.cargo;
  const isNew = editing !== null && !fleet.some((v) => v.id === editing.id);
  const remove = (v: Vehicle) => {
    if (fleet.length <= 1) return notify('Keep at least one vehicle.', { tone: 'bad' });
    const at = fleet.indexOf(v);
    setFleet(fleet.filter((x) => x.id !== v.id));
    notify(`Removed ${v.name}.`, { action: { label: 'Undo', run: () => setFleet([...fleet.slice(0, at), v, ...fleet.slice(at)]) } });
  };

  return (
    <div className="page">
      <Panel
        title={`Vehicles · ${fleet.length}`}
        help="vehicles"
        actions={
          <>
            <button type="button" className="btn" onClick={() => setEditing({ id: newId('v'), name: '', length: 6100, width: 2400, height: 2400, maxPayload: 9000 })}>
              Add vehicle…
            </button>
            {confirm ? (
              <span className="confirm">
                Put back the standard fleet list?
                <button type="button" className="btn danger" onClick={() => (setFleet(DEFAULT_FLEET.map((v) => ({ ...v }))), setConfirm(false))}>
                  Yes
                </button>
                <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>
                  No
                </button>
              </span>
            ) : (
              <button type="button" className="btn ghost" onClick={() => setConfirm(true)}>
                Standard list
              </button>
            )}
          </>
        }
      >
        <div className="table-wrap">
          <table className="grid-table fleet-table">
            <thead>
              <tr>
                <th>This job</th>
                <th>Vehicle</th>
                <th className="n">Deck length mm</th>
                <th className="n">Deck width mm</th>
                <th className="n">Height mm</th>
                <th className="n">Payload kg</th>
                <th aria-label="Notes" />
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {fleet.map((v) => {
                const on = c.presetId === v.id;
                return (
                  <tr key={v.id} className={on ? 'is-current' : ''}>
                    <td>
                      <input type="radio" name="job-vehicle" checked={on} aria-label={`Load this job on ${v.name}`} onChange={() => onChange({ ...input, cargo: cargoFromVehicle(v) })} />
                    </td>
                    <td>
                      <button type="button" className="link-btn" onClick={() => setEditing(v)}>
                        {v.name}
                      </button>
                    </td>
                    <td className="n">{fmt(v.length)}</td>
                    <td className="n">{fmt(v.width)}</td>
                    <td className="n">{v.height > 0 ? fmt(v.height) : 'open'}</td>
                    <td className="n">{fmt(v.maxPayload)}</td>
                    <td>{plan?.recommendedVehicle === v.name && <span className="tag good">smallest that takes this job</span>}</td>
                    <td className="row-actions">
                      <button type="button" className="btn small-btn" onClick={() => setEditing(v)}>
                        Edit
                      </button>
                      <button type="button" className="icon-btn" aria-label={`Remove ${v.name}`} onClick={() => remove(v)}>
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!fleet.some((v) => v.id === c.presetId) && (
                <tr className="is-current">
                  <td>
                    <input type="radio" checked readOnly aria-label="This job's own vehicle" />
                  </td>
                  <td>{c.name}</td>
                  <td className="n">{fmt(c.length)}</td>
                  <td className="n">{fmt(c.width)}</td>
                  <td className="n">{c.height > 0 ? fmt(c.height) : 'open'}</td>
                  <td className="n">{fmt(c.maxPayload)}</td>
                  <td>
                    <span className="tag">this job only</span>
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Boxes on the deck" help="vehicles">
        <div className="fields four">
          <Field id="v-margin" label="Safety margin round every box" unit="mm">
            <NumInput id="v-margin" value={s.boxGap} onChange={(v) => setS({ boxGap: v, edgeGap: v })} />
          </Field>
          <Field id="v-tiers" label="Most layers" unit="layers">
            <NumInput id="v-tiers" value={s.maxTiers} min={1} onChange={(v) => setS({ maxTiers: Math.max(1, Math.round(v)) })} />
          </Field>
          <Field id="v-top" label="Load allowed on a box" unit="kg">
            <NumInput id="v-top" value={s.maxTopLoad} onChange={(v) => setS({ maxTopLoad: v })} />
          </Field>
          <Field id="v-mode" label="Stack boxes">
            <Seg<TierMode>
              label="Stacking"
              value={s.tierMode}
              onChange={(v) => setS({ tierMode: v })}
              options={[
                { id: 'fewest', label: 'When the deck is full' },
                { id: 'compact', label: 'To save deck length' },
              ]}
            />
          </Field>
        </div>
        <div className="checks">
          <Check id="v-rot" label="Boxes may be turned 90°" checked={s.allowBoxRotation} onChange={(v) => setS({ allowBoxRotation: v })} />
        </div>
      </Panel>

      {editing && (
        <VehicleEditor
          key={editing.id}
          initial={editing}
          isNew={isNew}
          onCancel={() => setEditing(null)}
          onSave={(v) => {
            const next = isNew ? [...fleet, v] : fleet.map((x) => (x.id === v.id ? v : x));
            // a job on the edited vehicle follows the new figures
            onChange({ ...input, fleet: next, cargo: c.presetId === v.id ? cargoFromVehicle(v) : c });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function VehicleEditor({ initial, isNew, onCancel, onSave }: { initial: Vehicle; isNew: boolean; onCancel: () => void; onSave: (v: Vehicle) => void }) {
  const [v, setV] = useState(initial);
  const set = (p: Partial<Vehicle>) => setV({ ...v, ...p });
  const err = !v.name.trim() ? 'Give the vehicle a name.' : v.length <= 0 || v.width <= 0 ? 'Deck length and width must be above 0.' : null;
  return (
    <Dialog
      title={isNew ? 'Add vehicle' : `Edit ${initial.name}`}
      onClose={onCancel}
      footer={
        <>
          {err && <span className="dialog-error">{err}</span>}
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!!err} onClick={() => onSave({ ...v, name: v.name.trim() })}>
            {isNew ? 'Add vehicle' : 'Save'}
          </button>
        </>
      }
    >
      <div className="fields two">
        <Field id="ve-name" label="Name">
          <input id="ve-name" className="txt" value={v.name} placeholder="TN 01 AB 1234 · 20 ft" onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field id="ve-pay" label="Payload" unit="kg">
          <NumInput id="ve-pay" value={v.maxPayload} onChange={(x) => set({ maxPayload: x })} />
        </Field>
        <Field id="ve-l" label="Deck length (front wall to door)" unit="mm">
          <NumInput id="ve-l" value={v.length} onChange={(x) => set({ length: x })} invalid={v.length <= 0} />
        </Field>
        <Field id="ve-w" label="Deck width" unit="mm">
          <NumInput id="ve-w" value={v.width} onChange={(x) => set({ width: x })} invalid={v.width <= 0} />
        </Field>
        <Field id="ve-h" label="Height (0 = open body)" unit="mm">
          <NumInput id="ve-h" value={v.height} onChange={(x) => set({ height: x })} />
        </Field>
      </div>
    </Dialog>
  );
}
