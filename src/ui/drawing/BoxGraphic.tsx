import type { GasketLine, PackedBox } from '../../model/types';
import { FALLBACK_COLOR, type TypeColor } from '../colors';
import { Badge, CornerArrow, gradId, ringPath } from './shapes';

export interface BoxGraphicProps {
  box: PackedBox;
  types: Map<string, GasketLine>;
  colors: Map<string, TypeColor>;
  gradPrefix: string;
  /** The parent turns this box 90° clockwise; text and badges are turned back upright. */
  rotated?: boolean;
  /** Large single-box drawing: shows the wall line and pile numbers. */
  detail?: boolean;
  selected?: boolean;
  hovered?: boolean;
  activeStack?: number | null;
  onStackEnter?: (no: number | null) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * One box seen from above, in its own frame: the arrow corner is the origin,
 * x runs along the box length, y along the width. Bundles are drawn as rings,
 * rings on corrugated squares and ring cartons as a square with the ring in it.
 */
export function BoxGraphic({ box, types, colors, gradPrefix, rotated, detail, selected, hovered, activeStack, onStackEnter }: BoxGraphicProps) {
  const { ext, wall, inner } = box;
  const m = Math.min(ext.l, ext.w);
  const rx = m * 0.025;
  const floor = box.stacks.filter((s) => s.host === null);
  // empty strip along the walls at the arrow corner: board plus the smallest clearance to any pile
  const band = wall + (floor.length ? Math.min(...floor.map((s) => Math.min(s.x - s.r, s.y - s.r))) : m * 0.1);
  const countAngle = rotated ? -Math.PI / 4 : Math.PI / 4;
  const numberAngle = rotated ? (3 * Math.PI) / 4 : (-3 * Math.PI) / 4;
  const ordered = [...box.stacks].sort((a, b) => a.depth - b.depth || a.no - b.no);
  const active = activeStack != null ? box.stacks.find((s) => s.no === activeStack) : null;
  const hs = clamp(m * 0.022, 7, 22);

  return (
    <g className={['bx', selected && 'is-selected', hovered && 'is-hover'].filter(Boolean).join(' ')}>
      <rect className="bx-body" x={0} y={0} width={ext.l} height={ext.w} rx={rx} />
      {detail && wall > 0 && <rect className="bx-wall" x={wall} y={wall} width={inner.l} height={inner.w} rx={Math.max(0, rx - wall)} />}
      <text className="bx-mark" x={ext.l / 2} y={ext.w / 2} fontSize={m * 0.3} transform={rotated ? `rotate(-90 ${ext.l / 2} ${ext.w / 2})` : undefined}>
        {box.label}
      </text>

      <g transform={`translate(${wall} ${wall})`}>
        {ordered.map((s) => {
          const c = colors.get(s.typeId) ?? FALLBACK_COLOR;
          const t = types.get(s.typeId);
          const tip = `Pile ${s.no} · ${t?.itemCode || t?.description || ''} · ${s.count} pcs`;
          const enter = onStackEnter ? () => onStackEnter(s.no) : undefined;
          const leave = onStackEnter ? () => onStackEnter(null) : undefined;
          if (s.shape === 'square') {
            const ringIn = t ? t.innerD / 2 : s.ringR * 0.7;
            return (
              <g key={s.no} onPointerEnter={enter} onPointerLeave={leave}>
                <rect
                  className={s.kind === 'carton' ? 'carton' : 'card'}
                  x={s.x - s.r}
                  y={s.y - s.r}
                  width={2 * s.r}
                  height={2 * s.r}
                  rx={Math.min(s.r * 0.06, 8)}
                />
                <path className="ring" d={ringPath(s.x, s.y, s.ringR, ringIn)} fill={`url(#${gradId(gradPrefix, s.typeId)})`} stroke={c.dark}>
                  <title>{tip}</title>
                </path>
              </g>
            );
          }
          return (
            <path
              key={s.no}
              className="ring"
              d={ringPath(s.x, s.y, s.r, s.rIn)}
              fill={`url(#${gradId(gradPrefix, s.typeId)})`}
              stroke={c.dark}
              onPointerEnter={enter}
              onPointerLeave={leave}
            >
              <title>{tip}</title>
            </path>
          );
        })}
        {active && (
          active.shape === 'square' ? (
            <rect
              className="ring-focus"
              x={active.x - active.r - clamp(m * 0.01, 4, 12)}
              y={active.y - active.r - clamp(m * 0.01, 4, 12)}
              width={2 * active.r + 2 * clamp(m * 0.01, 4, 12)}
              height={2 * active.r + 2 * clamp(m * 0.01, 4, 12)}
              rx={6}
            />
          ) : (
            <circle className="ring-focus" cx={active.x} cy={active.y} r={active.r + clamp(m * 0.012, 4, 14)} />
          )
        )}
        {ordered.map((s) => {
          const c = colors.get(s.typeId) ?? FALLBACK_COLOR;
          const R = s.shape === 'square' ? s.ringR : s.r;
          const rIn = s.shape === 'square' ? (types.get(s.typeId)?.innerD ?? 0) / 2 : s.rIn;
          const ring = R - rIn;
          const rb = clamp(Math.max(ring * 0.55, R * 0.085), 6, detail ? 34 : 30);
          const rm = (R + rIn) / 2;
          // on a square the count sits in the corner of the square, clear of the ring
          const sq = s.shape === 'square' ? s.r * 0.78 : 0;
          const at = (a: number) => (s.shape === 'square' ? { x: s.x + sq * Math.sign(Math.cos(a)), y: s.y + sq * Math.sign(Math.sin(a)) } : { x: s.x + rm * Math.cos(a), y: s.y + rm * Math.sin(a) });
          const pc = at(countAngle);
          const pn = at(numberAngle);
          const r2 = s.shape === 'square' ? clamp(s.r * 0.12, 6, detail ? 30 : 26) : rb;
          return (
            <g key={s.no}>
              <Badge x={pc.x} y={pc.y} r={r2} text={`${s.count}x`} stroke={c.dark} upright={rotated} />
              {detail && <Badge x={pn.x} y={pn.y} r={r2 * 0.82} text={String(s.no)} stroke={c.dark} upright={rotated} variant="number" />}
            </g>
          );
        })}
      </g>

      <CornerArrow band={band} cornerR={rx} min={clamp(m * 0.03, 12, 24)} max={clamp(m * 0.042, 20, 44)} />

      {selected &&
        [
          [0, 0],
          [ext.l, 0],
          [0, ext.w],
          [ext.l, ext.w],
        ].map(([x, y]) => <rect key={`${x}-${y}`} className="handle" x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} />)}
    </g>
  );
}
