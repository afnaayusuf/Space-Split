import { useMemo, useState } from 'react';
import type { Crate, Line, Plan, Settings } from '../model/types';
import type { ViewName } from '../three/stage';
import { dims, kg, n0, pct, plural } from './format';
import { Icon } from './icons';
import { classColors, cogText, marks } from './LoadView';
import { CrateStage } from './Stage3D';

interface Props {
  plan: Plan;
  settings: Settings;
  lines: Map<string, Line>;
  colorOf: (line: string) => string;
  contents: (c: Crate) => { line: string; sl: string; code: string; n: number }[];
  dark: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function CratesView(p: Props) {
  const { plan } = p;
  const [truck, setTruck] = useState<number | 'all'>('all');
  const [view, setView] = useState<ViewName>('3d');
  const [apart, setApart] = useState(false);
  const colors = useMemo(() => classColors(plan), [plan]);
  const where = useMemo(() => {
    const m = new Map<string, { truck: number; step: number; on: string }>();
    for (const l of plan.loads) for (const q of l.placed) m.set(q.crate, { truck: l.no, step: q.step, on: q.on });
    return m;
  }, [plan]);
  const shown = plan.crates.filter((c) => truck === 'all' || where.get(c.id)?.truck === truck);
  const sel = plan.crates.find((c) => c.id === p.selected) ?? shown[0] ?? null;
  const items = sel ? p.contents(sel) : [];
  const order = sel ? sel.groups.map((pg, i) => ({ i, side: pg.group.side, pieces: pg.group.piles.reduce((a, q) => a + q.n, 0), lines: new Set(pg.group.piles.map((q) => q.line)).size, on: pg.z > 0 })) : [];

  return (
    <div className="cratesview">
      <aside className="rail rail-left">
        <section className="card card-list">
          <header className="card-head">
            <h3>
              Crates <span className="muted">· {shown.length}</span>
            </h3>
          </header>
          {plan.loads.length > 1 && (
            <div className="pills pills-in">
              <button type="button" className={`pill${truck === 'all' ? ' is-on' : ''}`} onClick={() => setTruck('all')}>
                All
              </button>
              {plan.loads.map((l) => (
                <button key={l.no} type="button" className={`pill${truck === l.no ? ' is-on' : ''}`} onClick={() => setTruck(l.no)}>
                  <Icon name="truck" size={15} /> {l.no}
                </button>
              ))}
            </div>
          )}
          <ol className="crate-list">
            {shown.map((c) => (
              <li key={c.id}>
                <button type="button" className={`crate-row${sel?.id === c.id ? ' is-on' : ''}`} onClick={() => p.onSelect(c.id)}>
                  <span className="chip" style={{ background: colors.get(c.name) }} />
                  <span className="crate-no">{c.no}</span>
                  <span className="crate-meta">
                    <b>{c.name}</b>
                    <span>
                      {dims(c.outer.L, c.outer.W, c.outer.H)} · {pct(c.fill)}
                    </span>
                  </span>
                  <span className="crate-kg">{kg(c.gross)}</span>
                  {!where.has(c.id) && <span className="tag is-bad">not loaded</span>}
                </button>
              </li>
            ))}
          </ol>
        </section>
      </aside>

      <main className="stagebox">
        {sel ? (
          <CrateStage crate={sel} settings={p.settings} colorOf={p.colorOf} dark={p.dark} view={view} explode={apart ? 1 : 0}>
            <div className="stage-top">
              <div className="crate-badge">
                <span className="crate-badge-no">{sel.no}</span>
                <span>
                  <b>{sel.name}</b>
                  <span>{dims(sel.inner.L, sel.inner.W, sel.inner.H)} inside</span>
                </span>
              </div>
            </div>
            <div className="stage-tools" role="toolbar" aria-label="View">
              <button type="button" className={`round${view === '3d' ? ' is-on' : ''}`} aria-label="3D view" title="3D view" onClick={() => setView('3d')}>
                <Icon name="cube" />
              </button>
              <button type="button" className={`round${view === 'top' ? ' is-on' : ''}`} aria-label="Top view" title="Top view" onClick={() => setView('top')}>
                <Icon name="top" />
              </button>
              <button type="button" className={`round${view === 'side' ? ' is-on' : ''}`} aria-label="Side view" title="Side view" onClick={() => setView('side')}>
                <Icon name="side" />
              </button>
              <span className="tool-gap" />
              <button type="button" className={`round${apart ? ' is-on' : ''}`} aria-pressed={apart} aria-label="Pull the squares apart" title="Pull the squares apart" onClick={() => setApart(!apart)}>
                <Icon name="explode" />
              </button>
            </div>
          </CrateStage>
        ) : (
          <div className="stage-fallback">No crates.</div>
        )}
      </main>

      <aside className="rail rail-right">
        {sel && (
          <>
            <section className="card">
              <p className="eyebrow">Crate {sel.no}</p>
              <dl className="leaders">
                <div>
                  <dt>Inside</dt>
                  <dd>{dims(sel.inner.L, sel.inner.W, sel.inner.H)} mm</dd>
                </div>
                <div>
                  <dt>Outside</dt>
                  <dd>{dims(sel.outer.L, sel.outer.W, sel.outer.H)} mm</dd>
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
                  <dt>Crate</dt>
                  <dd>{kg(sel.tare)}</dd>
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
                {where.get(sel.id) && (
                  <div>
                    <dt>Vehicle · step</dt>
                    <dd>
                      {where.get(sel.id)!.truck} · {where.get(sel.id)!.step}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
            <section className="card card-list">
              <header className="card-head">
                <h3>
                  Packing order <span className="muted">· {plural(order.length, 'square')}</span>
                </h3>
              </header>
              <ol className="order-list">
                {order.map((o) => (
                  <li key={o.i} className="order-row">
                    <span className="order-no">{o.i + 1}</span>
                    <span className="grow">
                      <b>{n0(o.side)} mm square</b>
                      <span className="muted small">
                        {plural(o.lines, 'line')} · {o.on ? 'on the square below' : 'on the floor'}
                      </span>
                    </span>
                    <b>{n0(o.pieces)}</b>
                  </li>
                ))}
              </ol>
            </section>
            <section className="card card-list">
              <header className="card-head">
                <h3>
                  Contents <span className="muted">· {plural(items.length, 'line')}</span>
                </h3>
              </header>
              <ul className="contents contents-long">
                {items.map((x) => {
                  const g = p.lines.get(x.line);
                  return (
                    <li key={x.line}>
                      <span className="dot" style={{ background: p.colorOf(x.line) }} />
                      <span className="grow">
                        <b>{x.code || `SL ${x.sl}`}</b>
                        <span className="muted small clip">{g?.description}</span>
                      </span>
                      <b>{n0(x.n)}</b>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
