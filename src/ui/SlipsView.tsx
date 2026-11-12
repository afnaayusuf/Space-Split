import { useMemo, useState } from 'react';
import { inch } from '../model/catalog';
import { INCH, ruleName, RULES, familyName } from '../model/defaults';
import type { CargoUnit, Clearance, GasketLine, PackagePlan, PackedBox } from '../model/types';
import { bandFor } from '../planner/units';
import { FALLBACK_COLOR, type ColorBy, type TypeColor } from './colors';
import { BoxDetailDrawing, boxBounds } from './drawing/BoxDetailDrawing';
import { FloorDrawing, floorBounds } from './drawing/FloorDrawing';
import { RingGradients } from './drawing/shapes';
import type { ViewBox } from './drawing/ZoomPan';
import { boxSize, dims, fmt, inches, kg, lineName, lineSpec, packedAs, packedSummary } from './format';
import { Legend } from './Legend';
import { Seg } from './live';
import { PackingSteps, arrowCorner, heightNote, labelOf, nestNote, placeNote, sideTarget } from './SidePanel';
import { tsv, xlsx, type Cell, type Sheet } from './xlsx';
import { saveFile } from './files';
import { safeName } from '../state/project';

const vb = (b: ViewBox) => `${b.x} ${b.y} ${b.w} ${b.h}`;
const KEYS: (keyof Clearance)[] = ['xNeg', 'xPos', 'yNeg', 'yPos'];
type Tab = 'checklist' | 'annexure' | 'contents' | 'loading' | 'boxes';

/** "2" or "2,3,4 (50/50/10)", the way the check list writes a split line. */
export function boxNoCell(plan: PackagePlan, lineId: string): string {
  const hits = plan.boxes.map((b) => ({ label: b.label, n: b.contents.find((c) => c.typeId === lineId)?.pieces ?? 0 })).filter((x) => x.n > 0);
  if (hits.length === 0) return '';
  if (hits.length === 1) return hits[0].label;
  return `${hits.map((h) => h.label).join(',')} (${hits.map((h) => h.n).join('/')})`;
}

const packedOf = (plan: PackagePlan, id: string) => plan.boxes.reduce((a, b) => a + (b.contents.find((c) => c.typeId === id)?.pieces ?? 0), 0);

function checkListRows(plan: PackagePlan): Cell[][] {
  return [
    ['SL', 'PO SL', 'TYPE', 'CUST ITEM CODE', 'DESCRIPTION OF GOODS', 'TOTAL QTY', 'ACTUAL QTY', 'UOM', 'BOX NO', 'PRODUCTION', 'PACKING', 'QUALITY'],
    ...plan.types.map((g, i) => [g.sl || String(i + 1), g.poSl, g.family, g.itemCode, g.description, g.quantity, packedOf(plan, g.id), g.uom || 'NOS', boxNoCell(plan, g.id), '', '', '']),
  ];
}

function annexureRows(plan: PackagePlan): Cell[][] {
  return [
    ['BOX NO', 'L (in)', 'W (in)', 'H (in)', 'QTY (pcs)', 'NET (kg)', 'GROSS (kg)', 'CBM'],
    ...plan.boxes.map((b) => [b.label, inches(b.ext.l), inches(b.ext.w), inches(b.ext.h), b.pieces, +b.netWeight.toFixed(2), +b.grossWeight.toFixed(2), +b.cbm.toFixed(3)]),
    ['TOTAL', '', '', '', plan.totals.pieces, +plan.totals.net.toFixed(2), +plan.totals.gross.toFixed(2), +plan.totals.cbm.toFixed(3)],
  ];
}

function contentsRows(plan: PackagePlan): Cell[][] {
  const types = new Map(plan.types.map((t) => [t.id, t]));
  const rows: Cell[][] = [['BOX NO', 'OUTER (in)', 'CUST ITEM CODE', 'DESCRIPTION', 'TYPE', 'SIZE', 'CLASS', 'MATERIAL', 'PCS', 'KG', 'HOW PACKED', 'NESTED']];
  for (const b of plan.boxes)
    for (const c of b.contents) {
      const g = types.get(c.typeId)!;
      const piles = b.stacks.filter((s) => s.typeId === c.typeId);
      const how = packedSummary(piles);
      rows.push([
        b.label,
        boxSize(b.ext),
        g.itemCode,
        g.description,
        g.family,
        g.family === 'RTJ' ? g.ringNo : inch(g.size),
        g.rating || '',
        g.material,
        c.pieces,
        +c.weight.toFixed(2),
        how,
        piles.some((s) => s.host !== null) ? 'yes' : '',
      ]);
    }
  return rows;
}

function loadingRows(plan: PackagePlan): Cell[][] {
  const rows: Cell[][] = [['LOAD #', 'TRUCK', 'LAYER', 'BOX NO', 'OUTER (in)', 'GROSS (kg)', 'LEFT mm', 'RIGHT mm', 'UP mm', 'DOWN mm', 'ON BOX', 'TURNED']];
  const loaded = plan.boxes.filter((b) => b.location).sort((a, b) => a.location!.load - b.location!.load);
  for (const b of loaded) {
    const p = b.location!;
    rows.push([
      p.load,
      p.unit + 1,
      p.tier + 1,
      b.label,
      boxSize(b.ext),
      +b.grossWeight.toFixed(1),
      ...KEYS.map((k) => `${Math.round(p.around[k].gap)} to ${sideTarget('floor', k, p.around[k], plan)}`),
      p.on !== null ? labelOf(plan, p.on) : '',
      p.rotated ? 'yes' : '',
    ]);
  }
  return rows;
}

function workbook(plan: PackagePlan): Sheet[] {
  const j = plan.job;
  const summary: Cell[][] = [
    ['PACKING LIST', ''],
    ['PRN', j.prn],
    ['PO', j.po],
    ['PO date', j.poDate],
    ['Customer', j.customer],
    ['Dispatch', j.dispatch],
    ['Packing date', j.date],
    ['Packing type', ruleName(plan.settings.rule)],
    ['Lines', plan.types.length],
    ['Pieces', plan.totals.pieces],
    ['Boxes', plan.totals.boxes],
    ['Net kg', +plan.totals.net.toFixed(2)],
    ['Gross kg', +plan.totals.gross.toFixed(2)],
    ['CBM', +plan.totals.cbm.toFixed(3)],
    ['Vehicle', plan.cargo.name],
    ['Recommended vehicle', plan.recommendedVehicle ?? ''],
  ];
  const items: Cell[][] = [
    ['SL', 'CUST ITEM CODE', 'DESCRIPTION', 'TYPE', 'SIZE', 'CLASS', 'MATERIAL', 'OD mm', 'ID mm', 'T mm', 'QTY', 'KG / PC', 'WEIGHT', 'PACKED AS'],
    ...plan.types.map((g) => [
      g.sl,
      g.itemCode,
      g.description,
      g.family,
      g.family === 'RTJ' ? g.ringNo : inch(g.size),
      g.rating || '',
      g.material,
      g.od,
      g.innerD,
      g.thickness,
      g.quantity,
      g.unitWeight,
      g.weightEstimated ? 'estimated' : 'given',
      plan.packing.find((p) => p.typeId === g.id)?.note ?? '',
    ]),
  ];
  const vehicles: Cell[][] = [
    ['TRUCK', 'BOXES', 'GROSS kg', 'DECK USED mm', 'LOAD HEIGHT mm', 'OVER-TOP LASHES', 'X-LASHES', 'BOX STRAPS', 'CORNER BOARDS', 'WEBBING m', 'TARPAULIN m'],
    ...plan.units.map((u) => [
      u.index + 1,
      u.boxUids.length,
      Math.round(u.weight),
      Math.round(u.usedLength),
      Math.round(u.loadHeight),
      u.securing.overTop,
      u.securing.xLash,
      u.securing.boxStraps,
      u.securing.cornerBoards,
      u.securing.webbing,
      `${u.securing.tarpaulin.l} × ${u.securing.tarpaulin.w}`,
    ]),
  ];
  return [
    { name: 'Summary', rows: summary, widths: [22, 40], header: 1 },
    { name: 'Gasket Items', rows: items, widths: [6, 18, 46, 7, 7, 7, 20, 9, 9, 7, 7, 9, 11, 40] },
    { name: 'Box Manifest', rows: annexureRows(plan), widths: [9, 8, 8, 8, 10, 10, 11, 9] },
    { name: 'Box Contents', rows: contentsRows(plan), widths: [8, 14, 18, 46, 7, 7, 7, 20, 7, 8, 34, 8] },
    { name: 'Loading Sequence', rows: loadingRows(plan), widths: [8, 7, 7, 8, 14, 10, 22, 22, 22, 22, 8, 8] },
    { name: 'Vehicles & Securing', rows: vehicles, widths: [7, 7, 10, 13, 15, 16, 9, 11, 14, 11, 12] },
    { name: 'Packing Check List', rows: checkListRows(plan), widths: [5, 7, 7, 18, 46, 10, 11, 6, 14, 12, 10, 10] },
  ];
}

export function SlipsView({ plan, colors, colorBy }: { plan: PackagePlan; colors: Map<string, TypeColor>; colorBy: ColorBy }) {
  const types = useMemo(() => new Map<string, GasketLine>(plan.types.map((t) => [t.id, t])), [plan.types]);
  const [tab, setTab] = useState<Tab>('checklist');
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2600);
  };
  const sheetFor: Record<Tab, () => Cell[][]> = {
    checklist: () => checkListRows(plan),
    annexure: () => annexureRows(plan),
    contents: () => contentsRows(plan),
    loading: () => loadingRows(plan),
    boxes: () => contentsRows(plan),
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tsv(sheetFor[tab]()));
      flash('Copied. Paste it into Excel.');
    } catch {
      flash('Copy was blocked by the browser.');
    }
  };
  const download = async () => {
    const r = await saveFile(`${safeName(plan.job.prn, 'packing')}-packing-list.xlsx`, xlsx(workbook(plan)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (r === 'unavailable') flash('Saving files is not available here. Use Copy sheet instead.');
  };
  const missing = [!plan.job.prn.trim() && 'PRN', !plan.job.po.trim() && 'PO', !plan.job.customer.trim() && 'customer'].filter(Boolean);

  return (
    <div className="paper">
      <div className="paper-bar no-print">
        <Seg<Tab>
          label="Sheet"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'checklist', label: 'Packing check list' },
            { id: 'annexure', label: 'Annexure' },
            { id: 'contents', label: 'Box contents' },
            { id: 'loading', label: 'Loading plan' },
            { id: 'boxes', label: 'Box sheets' },
          ]}
        />
        <div className="paper-actions">
          {!__ARTIFACT__ && (
            <button type="button" className="btn primary" onClick={() => window.print()}>
              Print
            </button>
          )}
          <button type="button" className="btn" onClick={() => void download()} disabled={!plan.boxes.length}>
            Excel workbook
          </button>
          <button type="button" className="btn" onClick={copy}>
            Copy sheet
          </button>
          {msg && (
            <span className="flash" role="status">
              {msg}
            </span>
          )}
        </div>
      </div>

      {missing.length > 0 && (
        <div className="banner is-warn no-print">The forms have no {missing.join(', ')} yet. Fill them in under PRN lines before printing.</div>
      )}
      {plan.boxes.length === 0 && <div className="banner is-info no-print">Nothing is packed yet, so the forms are empty. Add PRN lines first.</div>}

      <div className="paper-body">
        {tab === 'checklist' && <CheckList plan={plan} />}
        {tab === 'annexure' && <Annexure plan={plan} />}
        {tab === 'contents' && <BoxContents plan={plan} types={types} colors={colors} />}
        {tab === 'loading' && plan.units.map((u) => <LoadingSheet key={u.index} plan={plan} unit={u} types={types} colors={colors} colorBy={colorBy} />)}
        {tab === 'boxes' && plan.boxes.map((b) => <BoxSheet key={b.uid} plan={plan} box={b} types={types} colors={colors} />)}
      </div>
    </div>
  );
}

function FormHead({ plan, title }: { plan: PackagePlan; title: string }) {
  const j = plan.job;
  return (
    <header className="form-head">
      <h2>{title}</h2>
      <dl>
        <div>
          <dt>PRN</dt>
          <dd>{j.prn || '—'}</dd>
        </div>
        <div>
          <dt>PO</dt>
          <dd>{j.po || '—'}</dd>
        </div>
        <div>
          <dt>PO date</dt>
          <dd>{j.poDate || '—'}</dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>{j.customer || '—'}</dd>
        </div>
        <div>
          <dt>Packing type</dt>
          <dd>
            Type {RULES.find((r) => r.id === plan.settings.rule)?.type} · {ruleName(plan.settings.rule)}
          </dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{j.date || '—'}</dd>
        </div>
      </dl>
    </header>
  );
}

function Signatures() {
  return (
    <div className="sign-row">
      {['Prepared by', 'Packed by', 'Checked by (Quality)'].map((s) => (
        <div key={s}>
          <span />
          <p>{s}</p>
        </div>
      ))}
    </div>
  );
}

function CheckList({ plan }: { plan: PackagePlan }) {
  const rows = checkListRows(plan).slice(1);
  return (
    <article className="sheet">
      <FormHead plan={plan} title="PACKING CHECK LIST" />
      <div className="table-wrap">
        <table className="form-table">
          <thead>
            <tr>
              {['SL', 'PO SL', 'TYPE', 'CUST ITEM CODE', 'DESCRIPTION OF GOODS', 'TOTAL QTY', 'ACTUAL QTY', 'UOM', 'BOX NO', 'PRODUCTION', 'PACKING', 'QUALITY'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r[5] !== r[6] ? 'is-short' : ''}>
                {r.map((c, k) => (
                  <td key={k} className={k === 5 || k === 6 ? 'n' : k >= 9 ? 'tick' : ''}>
                    {k >= 9 ? '☐' : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>TOTAL · {plan.totals.boxes} {plan.totals.boxes === 1 ? 'BOX' : 'BOXES'}</td>
              <td className="n">{fmt(plan.totals.requested)}</td>
              <td className="n">{fmt(plan.totals.pieces)}</td>
              <td colSpan={5} />
            </tr>
          </tfoot>
        </table>
      </div>
      <Signatures />
    </article>
  );
}

/** The instruction checklist for this job, from the rule and what the PRN holds. */
function instructions(plan: PackagePlan): string[] {
  const s = plan.settings;
  const fams = new Set(plan.types.map((t) => t.family));
  const out: string[] = [`Pack to Type ${RULES.find((r) => r.id === s.rule)?.type} · ${ruleName(s.rule)}.`];
  const sheet = s.rule === 'export' ? 'export' : s.rule === 'domestic' ? 'domestic' : s.generalBands;
  if (s.rule !== 'knpc') {
    const seen = new Set<string>();
    for (const g of plan.types) {
      if (g.family !== 'SPW' && g.family !== 'SC') continue;
      const bands = g.family === 'SC' ? s.bands.softCut : sheet === 'export' ? s.bands.exportSPW : s.bands.domesticSPW;
      const hit = bandFor(bands, g.size);
      if (!hit) continue;
      const b = hit.band;
      const key = `${g.family}:${b.min}:${b.max}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const range = b.max === 0 ? `${inch(b.min)} and up` : b.min === b.max ? inch(b.min) : `${inch(b.min)}–${inch(b.max)}`;
      out.push(`${familyName(g.family)} ${range}: ${b.carded ? `singly on corrugated squares, ${s.ringsPerCard} to a square` : `bundles of ${b.count}`}.`);
    }
  } else out.push('A corrugated square between every ring; one item code per box.');
  if (s.allowNesting && s.rule !== 'knpc') out.push(`Nest each bundle in the tightest bore that takes it, same type and class, at least ${fmt(s.nestSlack)} mm slack.`);
  if (fams.has('KAM') || fams.has('DJ')) out.push('Kammprofile and double jacketed: one piece per 3-ply corrugated square.');
  if (fams.has('RTJ')) out.push('Ring joints: each ring in its own carton, cartons then boxed.');
  if (fams.has('ISK')) out.push('Insulation kits: in their own box.');
  out.push(s.mixSmall ? `No two gasket types in a box, except sizes up to ${inch(s.smallMax)}.` : 'No two gasket types in a box.');
  out.push(`Leave ${fmt(s.headroom / INCH, 1)}″ clear above the stack in every box; ${fmt(s.clearBundle)} mm a side for bundles, ${fmt(s.clearCarded)} mm for squares and cartons.`);
  out.push(`No box over ${fmt(s.maxBoxWeight)} kg or deeper than ${fmt(s.maxBoxDepth / INCH)}″.`);
  out.push('Mark every box with its BOX NO and the PRN; strap every box; lash and cover the load.');
  return out;
}

function Annexure({ plan }: { plan: PackagePlan }) {
  const rows = annexureRows(plan).slice(1, -1);
  return (
    <article className="sheet">
      <FormHead plan={plan} title="ANNEXURE" />
      <section className="annex-grid">
        <div>
          <h3>Instructions</h3>
          <table className="form-table checklist">
            <tbody>
              {instructions(plan).map((t, i) => (
                <tr key={i}>
                  <td className="n">{i + 1}</td>
                  <td>{t}</td>
                  <td className="tick">☐</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="annex-side">
          <h3>Recommended truck size</h3>
          <p className="big-value">{plan.recommendedVehicle ?? plan.cargo.name}</p>
          <dl className="facts">
            <div>
              <dt>Planned on</dt>
              <dd>
                {plan.cargo.name} · {plan.units.length} {plan.units.length === 1 ? 'trip' : 'trips'}
              </dd>
            </div>
            <div>
              <dt>Boxes</dt>
              <dd>{plan.totals.boxes}</dd>
            </div>
            <div>
              <dt>Pieces</dt>
              <dd>{fmt(plan.totals.pieces)}</dd>
            </div>
            <div>
              <dt>Gross</dt>
              <dd>{kg(plan.totals.gross)} kg</dd>
            </div>
            <div>
              <dt>Volume</dt>
              <dd>{fmt(plan.totals.cbm, 2)} CBM</dd>
            </div>
          </dl>
        </div>
      </section>
      <h3>Maximum box size, outer (inches)</h3>
      <table className="form-table">
        <thead>
          <tr>
            <th>BOX NO</th>
            <th className="n">L × W × H in</th>
            <th className="n">QTY (pcs)</th>
            <th className="n">NET (kg)</th>
            <th className="n">GROSS (kg)</th>
            <th className="n">CBM</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r[0]}</td>
              <td className="n">
                {r[1]} × {r[2]} × {r[3]}
              </td>
              <td className="n">{fmt(Number(r[4]))}</td>
              <td className="n">{fmt(Number(r[5]), 2)}</td>
              <td className="n">{fmt(Number(r[6]), 2)}</td>
              <td className="n">{fmt(Number(r[7]), 3)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>TOTAL</td>
            <td className="n">{plan.totals.boxes === 1 ? '1 box' : `${plan.totals.boxes} boxes`}</td>
            <td className="n">{fmt(plan.totals.pieces)}</td>
            <td className="n">{fmt(plan.totals.net, 2)}</td>
            <td className="n">{fmt(plan.totals.gross, 2)}</td>
            <td className="n">{fmt(plan.totals.cbm, 3)}</td>
          </tr>
        </tfoot>
      </table>
      <Signatures />
    </article>
  );
}

function BoxContents({ plan, types, colors }: { plan: PackagePlan; types: Map<string, GasketLine>; colors: Map<string, TypeColor> }) {
  return (
    <article className="sheet">
      <FormHead plan={plan} title="WHAT IS IN EACH BOX" />
      <table className="form-table">
        <thead>
          <tr>
            <th>BOX NO</th>
            <th>OUTER</th>
            <th>ITEM CODE</th>
            <th>DESCRIPTION</th>
            <th className="n">PCS</th>
            <th className="n">KG</th>
            <th>HOW PACKED</th>
          </tr>
        </thead>
        {plan.boxes.map((b) => (
          <tbody key={b.uid} className="box-group">
            {b.contents.map((c, i) => {
              const g = types.get(c.typeId)!;
              const piles = b.stacks.filter((s) => s.typeId === c.typeId);
              return (
                <tr key={c.typeId}>
                  {i === 0 && (
                    <>
                      <td rowSpan={b.contents.length} className="box-cell">
                        <b>{b.label}</b>
                      </td>
                      <td rowSpan={b.contents.length} className="box-cell">
                        {boxSize(b.ext)}
                        <span className="cell-note">
                          {kg(b.netWeight)} net · {kg(b.grossWeight)} gross · {fmt(b.cbm, 3)} m³
                        </span>
                      </td>
                    </>
                  )}
                  <td>
                    <i className="dot" style={{ background: (colors.get(c.typeId) ?? FALLBACK_COLOR).base }} />
                    {g.itemCode}
                  </td>
                  <td>{g.description}</td>
                  <td className="n">{c.pieces}</td>
                  <td className="n">{fmt(c.weight, 1)}</td>
                  <td>
                    {packedSummary(piles)}
                    {piles.some((s) => s.host !== null) && <span className="cell-note">nested</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </article>
  );
}

function LoadingSheet({
  plan,
  unit,
  types,
  colors,
  colorBy,
}: {
  plan: PackagePlan;
  unit: CargoUnit;
  types: Map<string, GasketLine>;
  colors: Map<string, TypeColor>;
  colorBy: ColorBy;
}) {
  const boxes = plan.boxes.filter((b) => b.location?.unit === unit.index).sort((a, b) => a.location!.load - b.location!.load);
  const title = plan.units.length > 1 ? `Truck ${unit.index + 1} of ${plan.units.length}` : plan.cargo.name;
  const sec = unit.securing;
  return (
    <article className="sheet">
      <header className="sheet-head">
        <div>
          <p className="eyebrow">Loading plan · PRN {plan.job.prn || '—'}</p>
          <h2>{title}</h2>
        </div>
        <dl className="sheet-facts">
          <div>
            <dt>Deck</dt>
            <dd>{dims(plan.cargo.length, plan.cargo.width)} mm</dd>
          </div>
          <div>
            <dt>Boxes</dt>
            <dd>{boxes.length}</dd>
          </div>
          <div>
            <dt>Gross</dt>
            <dd>{kg(unit.weight)} kg</dd>
          </div>
          <div>
            <dt>Deck used</dt>
            <dd>{fmt(unit.usedLength)} mm</dd>
          </div>
        </dl>
      </header>
      {Array.from({ length: unit.tiers }, (_, t) => {
        const prefix = `ls${unit.index}-${t}`;
        return (
          <figure key={t} className="sheet-fig">
            <figcaption>Layer {t + 1}</figcaption>
            <svg className="sheet-svg floor-svg" viewBox={vb(floorBounds(plan))} role="img" aria-label={`Layer ${t + 1} floor plan`}>
              <defs>
                <RingGradients prefix={prefix} types={plan.types} colors={colors} />
              </defs>
              <FloorDrawing plan={plan} unit={unit.index} tier={t} types={types} colors={colors} gradPrefix={prefix} showCog={t === 0} />
            </svg>
          </figure>
        );
      })}
      <div className="sheet-legend">
        <Legend types={plan.types} colors={colors} colorBy={colorBy} present={new Set(boxes.flatMap((b) => b.contents.map((c) => c.typeId)))} />
      </div>
      <table className="form-table">
        <thead>
          <tr>
            <th className="n">LOAD</th>
            <th>BOX NO</th>
            <th>LAYER</th>
            <th>← mm</th>
            <th>→ mm</th>
            <th>↑ mm</th>
            <th>↓ mm</th>
            <th>ARROW</th>
            <th>OUTER</th>
            <th className="n">GROSS kg</th>
          </tr>
        </thead>
        <tbody>
          {boxes.map((b) => {
            const p = b.location!;
            return (
              <tr key={b.uid}>
                <td className="n">{p.load}</td>
                <td>
                  <b>{b.label}</b>
                </td>
                <td>
                  {p.tier + 1}
                  {p.on !== null && <span className="cell-note">on {labelOf(plan, p.on)}</span>}
                </td>
                {KEYS.map((k) => (
                  <td key={k} className="dist">
                    <b>{fmt(p.around[k].gap)}</b>
                    <span className="cell-note">{sideTarget('floor', k, p.around[k], plan)}</span>
                  </td>
                ))}
                <td>
                  {arrowCorner(b)}
                  {p.rotated && <span className="cell-note">turned 90°</span>}
                </td>
                <td>{boxSize(b.ext)}</td>
                <td className="n">{kg(b.grossWeight)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>Securing (estimate)</h3>
      <table className="form-table checklist">
        <tbody>
          <tr>
            <td>Over-top lashes, one per row of boxes</td>
            <td className="n">{sec.overTop}</td>
            <td className="tick">☐</td>
          </tr>
          <tr>
            <td>X-lashes over the door end</td>
            <td className="n">{sec.xLash}</td>
            <td className="tick">☐</td>
          </tr>
          <tr>
            <td>Box straps, two round every box</td>
            <td className="n">{sec.boxStraps}</td>
            <td className="tick">☐</td>
          </tr>
          <tr>
            <td>Corner boards under the lashes</td>
            <td className="n">{sec.cornerBoards}</td>
            <td className="tick">☐</td>
          </tr>
          <tr>
            <td>Webbing</td>
            <td className="n">{fmt(sec.webbing)} m</td>
            <td className="tick">☐</td>
          </tr>
          <tr>
            <td>Tarpaulin</td>
            <td className="n">
              {fmt(sec.tarpaulin.l, 1)} × {fmt(sec.tarpaulin.w, 1)} m
            </td>
            <td className="tick">☐</td>
          </tr>
        </tbody>
      </table>
      <p className="sheet-key">← → ↑ ↓ mm to the nearest box or wall · ← front wall · → door · load in LOAD order</p>
    </article>
  );
}

function BoxSheet({ plan, box, types, colors }: { plan: PackagePlan; box: PackedBox; types: Map<string, GasketLine>; colors: Map<string, TypeColor> }) {
  const prefix = `bs${box.uid}`;
  return (
    <article className="sheet box-sheet">
      <header className="sheet-head">
        <div>
          <p className="eyebrow">
            Box sheet · PRN {plan.job.prn || '—'} · {box.group}
          </p>
          <h2 className="boxno big">
            BOX NO: <b>{box.label}</b>
          </h2>
        </div>
        <dl className="sheet-facts">
          <div>
            <dt>Outer</dt>
            <dd>{boxSize(box.ext)}</dd>
          </div>
          <div>
            <dt>On the truck</dt>
            <dd>{placeNote(box, plan)}</dd>
          </div>
          <div>
            <dt>Weight</dt>
            <dd>
              {kg(box.netWeight)} net · {kg(box.grossWeight)} kg gross
            </dd>
          </div>
        </dl>
      </header>
      <div className="box-sheet-body">
        <div className="box-sheet-left">
          <svg className="sheet-svg box-svg" viewBox={vb(boxBounds(box))} role="img" aria-label={`Box ${box.label} from above`}>
            <defs>
              <RingGradients prefix={prefix} types={plan.types} colors={colors} />
            </defs>
            <BoxDetailDrawing box={box} types={types} colors={colors} gradPrefix={prefix} />
          </svg>
          <PackingSteps s={plan.settings} box={box} />
        </div>
        <table className="form-table">
          <thead>
            <tr>
              <th>PILE</th>
              <th>GASKET</th>
              <th className="n">PCS</th>
              <th>← mm</th>
              <th>→ mm</th>
              <th>↑ mm</th>
              <th>↓ mm</th>
            </tr>
          </thead>
          <tbody>
            {box.stacks.map((s) => {
              const g = types.get(s.typeId)!;
              return (
                <tr key={s.no}>
                  <td>
                    <span className="stack-no" style={{ background: (colors.get(s.typeId) ?? FALLBACK_COLOR).base }}>
                      {s.no}
                    </span>
                  </td>
                  <td>
                    {lineSpec(g)} · {lineName(g)}
                    <span className="cell-note">
                      {packedAs(s.kind, s.units, s.perUnit, s.count)} · {heightNote(s)}
                    </span>
                  </td>
                  <td className="n">{s.count}</td>
                  {s.around ? (
                    KEYS.map((k) => (
                      <td key={k} className="dist">
                        <b>{fmt(s.around![k].gap)}</b>
                        <span className="cell-note">{sideTarget('box', k, s.around![k])}</span>
                      </td>
                    ))
                  ) : (
                    <td colSpan={4} className="nest-cell">
                      {nestNote(s, box.stacks[s.host! - 1], types)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
