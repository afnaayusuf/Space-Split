import type { Crate, Line, Plan } from '../model/types';
import type { Job } from '../state/store';
import { safeName, saveFile } from './files';
import { dims, kg, m1, n0, pct, t1 } from './format';
import { Icon } from './icons';
import { notify } from './toast';
import { xlsx, type Cell } from './xlsx';

interface Props {
  job: Job;
  plan: Plan;
  lines: Map<string, Line>;
  contents: (c: Crate) => { line: string; sl: string; code: string; n: number }[];
}

export function ReportView({ job, plan, lines, contents }: Props) {
  const crates = new Map(plan.crates.map((c) => [c.id, c]));
  const where = new Map<string, { truck: number; step: number }>();
  for (const l of plan.loads) for (const q of l.placed) where.set(q.crate, { truck: l.no, step: q.step });
  const title = job.prn || job.file.replace(/\.[^.]+$/, '');

  const download = async () => {
    const loading: Cell[][] = [['Vehicle', 'Step', 'Crate', 'Layout', 'Outer L', 'Outer W', 'Outer H', 'Gross kg', 'From front mm', 'From left mm', 'Height mm', 'Stands on']];
    for (const l of plan.loads)
      for (const q of [...l.placed].sort((a, b) => a.step - b.step)) {
        const c = crates.get(q.crate)!;
        loading.push([l.no, q.step, c.no, c.name, c.outer.L, c.outer.W, c.outer.H, +c.gross.toFixed(1), Math.round(q.x), Math.round(q.y), Math.round(q.z), q.on === 'floor' ? 'Floor' : q.on === 'same' ? 'Same-footprint crate' : 'Four crates']);
      }
    const crateRows: Cell[][] = [['Crate', 'Layout', 'Inner L', 'Inner W', 'Inner H', 'Outer L', 'Outer W', 'Outer H', 'Gaskets kg', 'Crate kg', 'Gross kg', 'Fill %', 'Vehicle', 'Step']];
    for (const c of plan.crates)
      crateRows.push([c.no, c.name, c.inner.L, c.inner.W, c.inner.H, c.outer.L, c.outer.W, c.outer.H, +c.net.toFixed(1), c.tare, +c.gross.toFixed(1), Math.round(c.fill * 100), where.get(c.id)?.truck ?? 'not loaded', where.get(c.id)?.step ?? '']);
    const contentRows: Cell[][] = [['Crate', 'SL', 'Item code', 'Description', 'Qty', 'kg']];
    for (const c of plan.crates)
      for (const x of contents(c)) {
        const g = lines.get(x.line);
        contentRows.push([c.no, x.sl, x.code, g?.description ?? '', x.n, g ? +(g.kg * x.n).toFixed(2) : '']);
      }
    const data = xlsx([
      { name: 'Loading', rows: loading, widths: [8, 6, 7, 12, 9, 9, 9, 10, 13, 12, 10, 16] },
      { name: 'Crates', rows: crateRows, widths: [7, 14, 9, 9, 9, 9, 9, 9, 11, 9, 10, 7, 9, 6] },
      { name: 'Contents', rows: contentRows, widths: [7, 7, 12, 70, 8, 9] },
    ]);
    const r = await saveFile(`${safeName(title, 'plan')} - load plan.xlsx`, data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (r === 'unavailable') notify('Downloading files is not available here.', { tone: 'bad' });
  };

  return (
    <div className="page report">
      <div className="report-tools no-print">
        <button type="button" className="btn" onClick={() => void download()}>
          <Icon name="download" size={18} /> Excel
        </button>
        {!__ARTIFACT__ && (
          <button type="button" className="btn primary" onClick={() => window.print()}>
            <Icon name="print" size={18} /> Print
          </button>
        )}
      </div>

      <article className="sheet">
        <header className="sheet-head">
          <div>
            <p className="eyebrow">Load plan</p>
            <h1>{title}</h1>
            {job.customer && <p className="muted">{job.customer}</p>}
          </div>
          <dl className="sheet-facts">
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
              <dd>{plan.crates.length}</dd>
            </div>
            <div>
              <dt>Gross</dt>
              <dd>{t1(plan.gross)}</dd>
            </div>
            <div>
              <dt>Vehicles</dt>
              <dd>{plan.loads.length}</dd>
            </div>
          </dl>
        </header>

        {plan.loads.map((l) => (
          <section key={l.no} className="sheet-block">
            <h2>
              Vehicle {l.no} · {l.vehicle.name}
            </h2>
            <p className="muted small">
              {kg(l.kg)} · {m1(l.length)} loading length · centre of gravity {n0(l.cog.x)} mm from the front wall (ideal {n0(l.target)}) · {l.vehicle.kind === 'semi' ? 'kingpin' : 'front'} {kg(l.front)}, rear {kg(l.rear)}
            </p>
            {l.notes.map((n) => (
              <p key={n} className="small warn-text">
                {n}
              </p>
            ))}
            <table className="table compact">
              <thead>
                <tr>
                  <th className="num">Step</th>
                  <th className="num">Crate</th>
                  <th>Layout</th>
                  <th className="num">Outside L × W × H</th>
                  <th className="num">Gross</th>
                  <th className="num">From front</th>
                  <th className="num">From left</th>
                  <th>On</th>
                </tr>
              </thead>
              <tbody>
                {[...l.placed]
                  .sort((a, b) => a.step - b.step)
                  .map((q) => {
                    const c = crates.get(q.crate)!;
                    return (
                      <tr key={q.crate}>
                        <td className="num">{q.step}</td>
                        <td className="num">
                          <b>{c.no}</b>
                        </td>
                        <td>{c.name}</td>
                        <td className="num">{dims(c.outer.L, c.outer.W, c.outer.H)}</td>
                        <td className="num">{kg(c.gross)}</td>
                        <td className="num">{n0(q.x)}</td>
                        <td className="num">{n0(q.y)}</td>
                        <td>{q.on === 'floor' ? 'Floor' : q.on === 'same' ? `On crate ${crates.get(l.placed.find((u) => Math.abs(u.z + u.H - q.z) < 1 && Math.abs(u.x - q.x) < 1 && Math.abs(u.y - q.y) < 1)?.crate ?? '')?.no ?? ''}` : 'Across four'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </section>
        ))}

        <section className="sheet-block">
          <h2>Crate contents</h2>
          <div className="crate-sheets">
            {plan.crates.map((c) => (
              <div key={c.id} className="crate-sheet">
                <h3>
                  Crate {c.no} <span className="muted">· {c.name}</span>
                </h3>
                <p className="muted small">
                  {dims(c.inner.L, c.inner.W, c.inner.H)} mm inside · {dims(c.outer.L, c.outer.W, c.outer.H)} outside · {kg(c.gross)} gross · {pct(c.fill)} full
                  {where.get(c.id) ? ` · vehicle ${where.get(c.id)!.truck}, step ${where.get(c.id)!.step}` : ' · not loaded'}
                </p>
                <table className="table compact">
                  <tbody>
                    {contents(c).map((x) => (
                      <tr key={x.line}>
                        <td>{x.sl}</td>
                        <td>{x.code}</td>
                        <td className="desc">{lines.get(x.line)?.description}</td>
                        <td className="num">{n0(x.n)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      </article>
    </div>
  );
}
