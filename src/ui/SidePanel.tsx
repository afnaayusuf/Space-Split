import { useEffect, useRef } from 'react';
import type { Clearance, GasketLine, PackagePlan, PackedBox, PlacedStack, PlanSettings, Side } from '../model/types';
import { FALLBACK_COLOR, type TypeColor } from './colors';
import { boxSize, dims, fmt, kg, lineName, lineSpec, mm1, packedAs } from './format';

/** Layer switcher styled like the plan sketches: dark for the open layer, grey for the rest. */
export function LayerTabs({ count, active, onChange }: { count: number; active: number; onChange: (t: number) => void }) {
  return (
    <div className="layer-tabs" role="tablist" aria-label="Box layers">
      {Array.from({ length: Math.max(1, count) }, (_, t) => (
        <button key={t} type="button" role="tab" aria-selected={t === active} className={t === active ? 'is-active' : ''} onClick={() => onChange(t)}>
          Layer {t + 1}
        </button>
      ))}
    </div>
  );
}

type Where = 'floor' | 'box';

const SIDES: { key: keyof Clearance; arrow: string; dir: string }[] = [
  { key: 'xNeg', arrow: '←', dir: 'left' },
  { key: 'xPos', arrow: '→', dir: 'right' },
  { key: 'yNeg', arrow: '↑', dir: 'up' },
  { key: 'yPos', arrow: '↓', dir: 'down' },
];

/** Box number as printed, from its plan number. */
export function labelOf(plan: PackagePlan, no: number): string {
  return plan.boxes.find((b) => b.no === no)?.label ?? String(no);
}

/** What a clearance is measured to, in words. */
export function sideTarget(where: Where, key: keyof Clearance, s: Side, plan?: PackagePlan): string {
  if (s.to !== null) return where === 'floor' ? `box ${plan ? labelOf(plan, s.to) : s.to}` : `pile ${s.to}`;
  if (where === 'box') return 'box wall';
  return key === 'xNeg' ? 'front wall' : key === 'xPos' ? 'door' : 'side wall';
}

/** Clear distance on each side, as drawn, to the nearest neighbour or wall. */
export function Around({ around, where, plan }: { around: Clearance; where: Where; plan?: PackagePlan }) {
  return (
    <dl className="around">
      {SIDES.map(({ key, arrow, dir }) => {
        const s = around[key];
        return (
          <div key={key} className={s.to === null ? 'is-wall' : 'is-next'}>
            <dt>
              <span aria-hidden="true">{arrow}</span>
              <span className="sr-only">{dir}</span>
            </dt>
            <dd>
              <b>{fmt(s.gap)}</b> <span>mm to {sideTarget(where, key, s, plan)}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Dots({ box, colors }: { box: PackedBox; colors: Map<string, TypeColor> }) {
  return (
    <span className="dots" aria-hidden="true">
      {box.contents.map((c) => (
        <i key={c.typeId} style={{ background: (colors.get(c.typeId) ?? FALLBACK_COLOR).base }} />
      ))}
    </span>
  );
}

/** Which corner of the footprint carries the arrow, as seen in the drawing. */
export function arrowCorner(box: PackedBox) {
  return box.location?.rotated ? 'top right' : 'top left';
}

/** Load order, layer, what the box stands on and how it is turned, in one line. */
export function placeNote(box: PackedBox, plan: PackagePlan) {
  const p = box.location;
  if (!p) return 'Not on the floor plan';
  return [
    plan.units.length > 1 ? `Truck ${p.unit + 1}` : null,
    `Load #${p.load}`,
    `Layer ${p.tier + 1}`,
    p.on !== null ? `on box ${labelOf(plan, p.on)}` : 'on the deck',
    p.rotated ? 'turned 90°' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function BoxCard({
  box,
  plan,
  colors,
  selected,
  onSelect,
  onOpen,
  onHover,
}: {
  box: PackedBox;
  plan: PackagePlan;
  colors: Map<string, TypeColor>;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onHover: (on: boolean) => void;
}) {
  const p = box.location;
  const el = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!selected) return;
    const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.current?.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
  }, [selected]);
  return (
    <article ref={el} className={`box-card${selected ? ' is-selected' : ''}`} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <button type="button" className="box-card-main" onClick={onSelect} onDoubleClick={onOpen} aria-pressed={selected}>
        <span className="box-card-head">
          <span className="boxno">
            BOX NO: <b>{box.label}</b>
          </span>
          <span className="box-card-size">{boxSize(box.ext)}</span>
        </span>
        <span className="box-card-group">{box.group}</span>
        {p && <Around around={p.around} where="floor" plan={plan} />}
        <span className="box-card-place">{placeNote(box, plan)}</span>
        <span className="box-card-meta">
          <Dots box={box} colors={colors} />
          {box.stacks.length} {box.stacks.length === 1 ? 'pile' : 'piles'} · {fmt(box.pieces)} pcs · {kg(box.grossWeight)} kg
        </span>
      </button>
      <button type="button" className="box-card-open" onClick={onOpen}>
        Open
      </button>
    </article>
  );
}

/** "Inside pile 2 (SPW 24″ 150#), centred · 25 mm clear all round" for a nested pile. */
export function nestNote(st: PlacedStack, host: PlacedStack | undefined, types: Map<string, GasketLine>) {
  const h = host ? types.get(host.typeId) : undefined;
  return `Inside pile ${st.host}${h ? ` (${lineSpec(h)})` : ''}, centred · ${fmt(st.boreGap ?? 0, 1)} mm clear all round`;
}

export function heightNote(st: PlacedStack) {
  const board =
    st.cards > 0 ? ` · ${st.cards} ${st.kind === 'carton' ? (st.cards === 1 ? 'carton' : 'cartons') : st.cards === 1 ? 'corrugated square' : 'corrugated squares'}` : '';
  return `${mm1(st.height)} mm high${board}`;
}

function StackRow({
  st,
  box,
  types,
  color,
  active,
  onHover,
}: {
  st: PlacedStack;
  box: PackedBox;
  types: Map<string, GasketLine>;
  color: TypeColor;
  active: boolean;
  onHover: (no: number | null) => void;
}) {
  const t = types.get(st.typeId);
  return (
    <li
      className={`stack-row${active ? ' is-active' : ''}${st.host ? ' is-nested' : ''}`}
      style={st.host ? { marginLeft: `${Math.min(4, st.depth) * 12}px` } : undefined}
      onMouseEnter={() => onHover(st.no)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="stack-no" style={{ background: color.base }}>
        {st.no}
      </span>
      <div className="stack-body">
        <div className="stack-title">
          <span className="stack-name">{t ? `${lineSpec(t)} · ${lineName(t)}` : st.typeId}</span>
          <span className="stack-count">{st.count} pcs</span>
        </div>
        <p className="stack-pack">{packedAs(st.kind, st.units, st.perUnit, st.count)}</p>
        {st.around ? <Around around={st.around} where="box" /> : <p className="nest-note">{nestNote(st, box.stacks[st.host! - 1], types)}</p>}
        <p className="stack-height">{heightNote(st)}</p>
      </div>
    </li>
  );
}

/** The packing steps for one box, with the rule's numbers filled in. */
export function PackingSteps({ s, box }: { s: PlanSettings; box: PackedBox }) {
  const kinds = new Set(box.stacks.map((x) => x.kind));
  const nested = box.stacks.some((x) => x.host !== null);
  return (
    <ol className="steps">
      {kinds.has('bundle') && <li>Strap each line into bundles of the count shown before anything else.</li>}
      {kinds.has('sheeted') && <li>Put a corrugated square between every ring.</li>}
      {kinds.has('carded') && <li>Lay the large rings singly, a corrugated square under every {s.ringsPerCard}.</li>}
      {kinds.has('card') && <li>One piece to each corrugated square.</li>}
      {kinds.has('carton') && <li>Put each ring joint in its own carton, then box the cartons.</li>}
      <li>Set the piles down in number order, keeping the distances listed. The arrow marks the corner the drawing starts from.</li>
      {nested && <li>Nested piles go in after the pile around them, centred in its bore.</li>}
      <li>Stuff the gaps so nothing can slide, and keep {fmt(s.headroom / 25.4, 1)}″ clear above the tallest pile.</li>
      <li>Close the lid, strap the box and mark it BOX NO {box.label}.</li>
    </ol>
  );
}

export function BoxDetailPanel({
  box,
  plan,
  types,
  colors,
  activeStack,
  onStackHover,
  onBack,
  backLabel,
}: {
  box: PackedBox;
  plan: PackagePlan;
  types: Map<string, GasketLine>;
  colors: Map<string, TypeColor>;
  activeStack: number | null;
  onStackHover: (no: number | null) => void;
  onBack: () => void;
  backLabel: string;
}) {
  const s = plan.settings;
  const p = box.location;
  const gaps = box.stacks.map((x) => x.nearestGap).filter((g): g is number => g !== null);
  const minGap = gaps.length ? Math.min(...gaps) : null;
  const bores = box.stacks.map((x) => x.boreGap).filter((g): g is number => g !== null);
  const minBore = bores.length ? Math.min(...bores) : null;

  return (
    <div className="box-detail-panel">
      <button type="button" className="back" onClick={onBack}>
        ← {backLabel}
      </button>
      <header className="detail-head">
        <span className="boxno big">
          BOX NO: <b>{box.label}</b>
        </span>
        <span className="detail-type">{box.group}</span>
      </header>

      {p ? (
        <div className="placed-at">
          <h3>On the floor</h3>
          <Around around={p.around} where="floor" plan={plan} />
          <p className="muted">
            {placeNote(box, plan)} · arrow at the {arrowCorner(box)}
          </p>
        </div>
      ) : plan.units.length > 0 ? (
        <p className="warn-text">This box is not on the floor plan. See the notes on the floor view.</p>
      ) : null}

      <dl className="facts">
        <div>
          <dt>Outside</dt>
          <dd>
            {boxSize(box.ext)} <span className="muted">· {dims(box.ext.l, box.ext.w, box.ext.h)} mm</span>
          </dd>
        </div>
        <div>
          <dt>Inside</dt>
          <dd>
            {dims(box.inner.l, box.inner.w, box.inner.h)} mm · {fmt(box.headroom)} mm clear on top
          </dd>
        </div>
        <div>
          <dt>Box</dt>
          <dd>{box.sizeId ? `${box.boxName}, from the ladder` : 'made to measure'}</dd>
        </div>
        <div>
          <dt>Weight</dt>
          <dd>
            {kg(box.netWeight)} gaskets + {kg(box.packWeight)} board + {kg(box.tare)} box = <b>{kg(box.grossWeight)} kg</b>
          </dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd>{fmt(box.cbm, 3)} m³</dd>
        </div>
      </dl>

      <section className="spacing">
        <h3>Spacing in this box</h3>
        <ul>
          {minGap !== null && (
            <li>
              Piles at least <b>{fmt(minGap)} mm</b> apart <span className="muted">(rule {fmt(s.pileGap)})</span>
            </li>
          )}
          <li>
            Bundles {fmt(s.clearBundle)} mm, squares and cartons {fmt(s.clearCarded)} mm from the box walls
          </li>
          {minBore !== null && (
            <li>
              Nested piles at least <b>{fmt(minBore, 1)} mm</b> clear of the bore around them <span className="muted">(slack {fmt(s.nestSlack)} mm)</span>
            </li>
          )}
        </ul>
      </section>

      <section className="spacing">
        <h3>How to pack</h3>
        <PackingSteps s={s} box={box} />
      </section>

      <section className="spacing">
        <h3>Piles · distances on each side</h3>
        <ol className="stack-list">
          {box.stacks.map((st) => (
            <StackRow
              key={st.no}
              st={st}
              box={box}
              types={types}
              color={colors.get(st.typeId) ?? FALLBACK_COLOR}
              active={activeStack === st.no}
              onHover={onStackHover}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}
