import { useEffect, useState } from 'react';
import { INCH, RULES, worksBands } from '../model/defaults';
import type { Band, BandSheets, PackagePlan, PlanInput, PlanSettings, RuleId } from '../model/types';
import { planPackaging } from '../planner';
import { Check, Field, NumInput } from './fields';
import { fmt, kg } from './format';
import { Panel, Seg } from './live';

interface Props {
  input: PlanInput;
  onChange: (next: PlanInput) => void;
  plan: PackagePlan | null;
  defaultRule: RuleId;
  onDefaultRule: (r: RuleId) => void;
}

/** The works' packing rule, its bundle sheets and the figures each rule works to. */
export function RulesView({ input, onChange, plan, defaultRule, onDefaultRule }: Props) {
  const s = input.settings;
  const setS = (patch: Partial<PlanSettings>) => onChange({ ...input, settings: { ...s, ...patch } });
  const setBands = (k: keyof BandSheets, list: Band[]) => setS({ bands: { ...s.bands, [k]: list } });

  return (
    <div className="page">
      <Panel
        title="Packing type for this job"
        help="rules"
        actions={
          <label className="inline-select">
            New jobs start on
            <select value={defaultRule} onChange={(e) => onDefaultRule(e.target.value as RuleId)}>
              {RULES.map((r) => (
                <option key={r.id} value={r.id}>
                  T{r.type} {r.name}
                </option>
              ))}
            </select>
          </label>
        }
      >
        <div className="rule-list" role="radiogroup" aria-label="Packing type">
          {RULES.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={s.rule === r.id} className={`rule${s.rule === r.id ? ' is-active' : ''}`} onClick={() => setS({ rule: r.id })}>
              <span className="rule-type">Type {r.type}</span>
              <span className="rule-name">{r.name}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Adviser input={input} onUse={(rule) => setS({ rule })} current={plan} />

      <Panel
        title="Bundle counts by size"
        help="rules"
        actions={
          <button type="button" className="btn ghost" onClick={() => setS({ bands: worksBands() })}>
            Reset to the works figures
          </button>
        }
      >
        <div className="band-sheets">
          <BandSheet title="Export · spiral wound" bands={s.bands.exportSPW} onChange={(l) => setBands('exportSPW', l)} active={s.rule === 'export'} />
          <BandSheet title="Domestic · spiral wound" bands={s.bands.domesticSPW} onChange={(l) => setBands('domesticSPW', l)} active={s.rule === 'domestic'} carded />
          <BandSheet title="Soft cut · either rule" bands={s.bands.softCut} onChange={(l) => setBands('softCut', l)} active />
        </div>
        <div className="inline-field">
          <span>Consolidated and Boxes as given use the</span>
          <Seg<'export' | 'domestic'>
            label="Bundle sheet"
            value={s.generalBands}
            onChange={(v) => setS({ generalBands: v })}
            options={[
              { id: 'domestic', label: 'Domestic sheet' },
              { id: 'export', label: 'Export sheet' },
            ]}
          />
        </div>
      </Panel>

      <div className="cols">
        <Panel title="Nesting" help="rules" power={s.allowNesting} onPower={(v) => setS({ allowNesting: v })}>
          <div className="fields">
            <Field id="r-slack" label="Bore minus OD, at least" unit="mm">
              <NumInput id="r-slack" value={s.nestSlack} onChange={(v) => setS({ nestSlack: v })} />
            </Field>
            <Field id="r-cap" label="Domestic: nothing nests inside rings above" unit="in">
              <NumInput id="r-cap" value={s.domesticNestCap} onChange={(v) => setS({ domesticNestCap: v })} />
            </Field>
            <Field id="r-fill" label="Domestic fillers, up to" unit="in">
              <NumInput id="r-fill" value={s.fillerMax} onChange={(v) => setS({ fillerMax: v })} />
            </Field>
          </div>
          <div className="checks">
            <Check id="r-any" label="Nest across pressure classes" checked={s.nestAnyRating} onChange={(v) => setS({ nestAnyRating: v })} />
          </div>
        </Panel>

        <Panel title="Sharing a box" help="rules">
          <div className="checks">
            <Check id="r-mix" label="Small sizes share one box" checked={s.mixSmall} onChange={(v) => setS({ mixSmall: v })} />
          </div>
          <div className="fields">
            <Field id="r-small" label="Small means up to" unit="in">
              <NumInput id="r-small" value={s.smallMax} onChange={(v) => setS({ smallMax: v })} />
            </Field>
            <Field id="r-cluster" label="Above that, share with sizes at least" unit="% of the largest">
              <NumInput id="r-cluster" value={Math.round(s.sizeCluster * 100)} onChange={(v) => setS({ sizeCluster: Math.min(1, v / 100) })} />
            </Field>
          </div>
        </Panel>
      </div>

      <Panel title="In the box" help="rules">
        <div className="fields four">
          <Field id="r-cb" label="Bundle to the box wall" unit="mm">
            <NumInput id="r-cb" value={s.clearBundle} onChange={(v) => setS({ clearBundle: v })} />
          </Field>
          <Field id="r-cc" label="Square or carton to the wall" unit="mm">
            <NumInput id="r-cc" value={s.clearCarded} onChange={(v) => setS({ clearCarded: v })} />
          </Field>
          <Field id="r-pg" label="Between piles" unit="mm">
            <NumInput id="r-pg" value={s.pileGap} onChange={(v) => setS({ pileGap: v })} />
          </Field>
          <Field id="r-hr" label="Clear above the tallest pile" unit="in">
            <NumInput id="r-hr" value={+(s.headroom / INCH).toFixed(2)} onChange={(v) => setS({ headroom: v * INCH })} />
          </Field>
          <Field id="r-bow" label="Spiral wound bow" unit="% of OD">
            <NumInput id="r-bow" value={s.bowPct} onChange={(v) => setS({ bowPct: v })} />
          </Field>
        </div>
        <div className="checks">
          <Check id="r-center" label="Centre the piles in the box" checked={s.centerContents} onChange={(v) => setS({ centerContents: v })} />
        </div>
      </Panel>
    </div>
  );
}

function BandSheet({ title, bands, onChange, active, carded }: { title: string; bands: Band[]; onChange: (b: Band[]) => void; active: boolean; carded?: boolean }) {
  const put = (i: number, patch: Partial<Band>) => onChange(bands.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  return (
    <div className={`band-sheet${active ? ' is-active' : ''}`}>
      <h3>{title}</h3>
      <table className="grid-table band-table">
        <thead>
          <tr>
            <th className="n">From ″</th>
            <th className="n">To ″</th>
            <th className="n">Per bundle</th>
            {carded && <th>On squares</th>}
            <th aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {bands.map((b, i) => (
            <tr key={i}>
              <td>
                <NumInput id={`${title}-min-${i}`} label="From size" value={b.min} onChange={(v) => put(i, { min: v })} />
              </td>
              <td>
                <NumInput id={`${title}-max-${i}`} label="To size, empty = and up" value={b.max} blankZero placeholder="and up" onChange={(v) => put(i, { max: v })} />
              </td>
              <td>
                <NumInput id={`${title}-n-${i}`} label="Pieces per bundle" value={b.count} min={1} onChange={(v) => put(i, { count: Math.max(1, Math.round(v)) })} />
              </td>
              {carded && (
                <td>
                  <input type="checkbox" checked={b.carded} aria-label="Laid singly on corrugated squares" onChange={(e) => put(i, { carded: e.target.checked })} />
                </td>
              )}
              <td>
                <button type="button" className="icon-btn" aria-label="Remove band" onClick={() => onChange(bands.filter((_, k) => k !== i))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn small-btn" onClick={() => onChange([...bands, { min: 0.5, max: 0, count: 1, carded: false }])}>
        Add band
      </button>
    </div>
  );
}

interface Row {
  rule: RuleId;
  boxes: number;
  pieces: number;
  gross: number;
  cbm: number;
  biggest: string;
  ok: boolean;
}

/** "Study the whole product list — suggest the best box layout": the list packed both ways, side by side. */
function Adviser({ input, onUse, current }: { input: PlanInput; onUse: (r: RuleId) => void; current: PackagePlan | null }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const has = input.lines.some((l) => l.quantity > 0);
  // re-compared a moment after the PRN, the boxes or the rules change
  useEffect(() => {
    if (!has) {
      setRows(null);
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      try {
        const out: Row[] = (['export', 'domestic'] as RuleId[]).map((rule) => {
          const p = planPackaging(input, { floor: false, rule });
          const big = p.boxes.reduce((a, b) => (b.cbm > a.cbm ? b : a), p.boxes[0]);
          return {
            rule,
            boxes: p.boxes.length,
            pieces: p.totals.pieces,
            gross: p.totals.gross,
            cbm: p.totals.cbm,
            biggest: big ? `${Math.round(big.ext.l / INCH)} × ${Math.round(big.ext.w / INCH)} × ${Math.round(big.ext.h / INCH)}″` : '–',
            ok: p.issues.length === 0 && p.unplacedGaskets.length === 0,
          };
        });
        setRows(out);
      } finally {
        setBusy(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [input, has]);
  return (
    <Panel title={`Suggested box layout${busy ? ' · working…' : ''}`} help="rules">
      {!has ? (
        <p className="empty-row">No PRN lines.</p>
      ) : rows ? (
        <table className="grid-table advise">
          <thead>
            <tr>
              <th>Rule</th>
              <th className="n">Boxes</th>
              <th className="n">Pieces</th>
              <th className="n">Gross kg</th>
              <th className="n">CBM</th>
              <th className="n">Largest box</th>
              <th aria-label="Use" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const best = rows.every((o) => r.cbm <= o.cbm + 1e-9);
              return (
                <tr key={r.rule} className={best ? 'is-best' : ''}>
                  <td>{RULES.find((x) => x.id === r.rule)!.name}</td>
                  <td className="n">{r.boxes}</td>
                  <td className="n">{fmt(r.pieces)}</td>
                  <td className="n">{kg(r.gross)}</td>
                  <td className="n">{fmt(r.cbm, 2)}</td>
                  <td className="n">{r.biggest}</td>
                  <td className="row-actions">
                    {current?.settings.rule === r.rule ? (
                      <span className="tag">in use</span>
                    ) : (
                      <button type="button" className="btn small-btn" onClick={() => onUse(r.rule)}>
                        Pack this way
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="empty-row">Working…</p>
      )}
    </Panel>
  );
}
