import { useMemo, useState } from 'react';
import type { Plan } from '../model/types';
import type { Job } from '../state/store';
import { kg, n0, n1, n2, plural } from './format';

const PAGE = 300;

export function LinesView({ job, plan, colorOf, onCrate }: { job: Job; plan: Plan | null; colorOf: (line: string) => string; onCrate: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);

  // which crates each line went into
  const cratesOf = useMemo(() => {
    const m = new Map<string, { id: string; no: number }[]>();
    for (const c of plan?.crates ?? [])
      for (const pg of c.groups)
        for (const p of pg.group.piles) {
          const list = m.get(p.line) ?? [];
          if (!list.some((x) => x.id === c.id)) list.push({ id: c.id, no: c.no });
          m.set(p.line, list);
        }
    return m;
  }, [plan]);

  const t = q.trim().toLowerCase();
  const rows = t ? job.lines.filter((g) => `${g.sl} ${g.code} ${g.description} ${g.material}`.toLowerCase().includes(t)) : job.lines;
  const shown = all ? rows : rows.slice(0, PAGE);

  return (
    <div className="page">
      <section className="card">
        <header className="card-head wrap">
          <div>
            <p className="eyebrow">{job.file}</p>
            <h2 className="title-l">{plural(job.lines.length, 'line')}</h2>
          </div>
          <input className="search" type="search" placeholder="Find a line" aria-label="Find a line" value={q} onChange={(e) => setQ(e.target.value)} />
        </header>

        {job.skipped.length > 0 && (
          <div className="banner is-warn">
            <span>{plural(job.skipped.length, 'row')} not planned.</span>
            <button type="button" className="link" onClick={() => setShowSkipped(!showSkipped)}>
              {showSkipped ? 'Hide' : 'Show'}
            </button>
          </div>
        )}
        {showSkipped && (
          <table className="table compact">
            <thead>
              <tr>
                <th>Row</th>
                <th>Description</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {job.skipped.map((s) => (
                <tr key={s.row}>
                  <td className="num">{s.row}</td>
                  <td className="desc">{s.text}</td>
                  <td>{s.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th aria-label="Colour" />
                <th>SL</th>
                <th>Item code</th>
                <th>Description</th>
                <th className="num">OD</th>
                <th className="num">ID</th>
                <th className="num">THK</th>
                <th className="num">Qty</th>
                <th className="num">kg / pc</th>
                <th className="num">kg</th>
                <th title="Stackable · Tiltable · Rotatable">S · T · R</th>
                <th>Crates</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => {
                const cs = cratesOf.get(g.id) ?? [];
                return (
                  <tr key={g.id}>
                    <td>
                      <span className="dot" style={{ background: colorOf(g.id) }} />
                    </td>
                    <td>{g.sl}</td>
                    <td>{g.code}</td>
                    <td className="desc">{g.description}</td>
                    <td className={`num${g.sizeFrom === 'table' ? ' is-table' : ''}`} title={g.sizeFrom === 'table' ? 'From the size table' : undefined}>
                      {n1(g.od)}
                    </td>
                    <td className="num">{g.bore ? n1(g.bore) : '–'}</td>
                    <td className="num">{n2(g.thk)}</td>
                    <td className="num">{n0(g.qty)}</td>
                    <td className={`num${g.weightFrom === 'estimate' ? ' is-est' : g.weightFrom === 'table' ? ' is-table' : ''}`} title={g.weightFrom === 'estimate' ? 'Estimated' : g.weightFrom === 'table' ? 'From the SPW chart' : undefined}>
                      {g.kg < 1 ? g.kg.toFixed(3) : n2(g.kg)}
                    </td>
                    <td className="num">{kg(g.kg * g.qty)}</td>
                    <td className="flags" title={`${g.stack !== false ? 'Stackable' : 'Not stackable'} · ${g.tilt ? 'Tiltable' : 'Not tiltable'} · ${g.rotate !== false ? 'Rotatable' : 'Not rotatable'}`}>
                      {g.stack !== false ? 'Y' : <b>N</b>} · {g.tilt ? 'Y' : 'N'} · {g.rotate !== false ? 'Y' : <b>N</b>}
                    </td>
                    <td className="crates-cell">
                      {cs.slice(0, 6).map((c) => (
                        <button key={c.id} type="button" className="mini" onClick={() => onCrate(c.id)}>
                          {c.no}
                        </button>
                      ))}
                      {cs.length > 6 && <span className="muted small">+{cs.length - 6}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!all && rows.length > PAGE && (
          <button type="button" className="btn ghost wide" onClick={() => setAll(true)}>
            Show all {n0(rows.length)}
          </button>
        )}
      </section>
    </div>
  );
}
