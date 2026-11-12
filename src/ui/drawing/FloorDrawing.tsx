import type { BoxLocation, GasketLine, PackagePlan, PackedBox } from '../../model/types';
import type { TypeColor } from '../colors';
import { BoxGraphic } from './BoxGraphic';
import { AxisArrow } from './shapes';
import type { ViewBox } from './ZoomPan';

export function boxTransform(loc: BoxLocation, box: PackedBox): string {
  // turned boxes rotate 90° clockwise about their own corner, then shift so the footprint starts at (x, y)
  return loc.rotated ? `translate(${loc.x + box.ext.w} ${loc.y}) rotate(90)` : `translate(${loc.x} ${loc.y})`;
}

export function floorBounds(plan: PackagePlan): ViewBox {
  const { length: L, width: W } = plan.cargo;
  const pad = Math.max(L, W) * 0.05;
  return { x: -pad * 1.3, y: -pad * 1.3, w: L + pad * 2.6, h: W + pad * 2.3 };
}

interface Props {
  plan: PackagePlan;
  unit: number;
  tier: number;
  types: Map<string, GasketLine>;
  colors: Map<string, TypeColor>;
  gradPrefix: string;
  selectedNo?: number | null;
  hoverNo?: number | null;
  showCog?: boolean;
  onSelect?: (no: number) => void;
  onOpen?: (no: number) => void;
  onHover?: (no: number | null) => void;
}

/** Cargo floor seen from above: front wall on the left, door on the right, origin at the top-left corner. */
export function FloorDrawing({ plan, unit, tier, types, colors, gradPrefix, selectedNo, hoverNo, showCog, onSelect, onOpen, onHover }: Props) {
  const { length: L, width: W } = plan.cargo;
  const m = Math.min(L, W);
  const inUnit = plan.boxes.filter((b) => b.location?.unit === unit);
  const here = inUnit.filter((b) => b.location!.tier === tier);
  const below = tier > 0 ? inUnit.filter((b) => b.location!.tier === tier - 1) : [];
  const u = plan.units[unit];
  const ax = m * 0.05;
  const fs = m * 0.032;

  return (
    <g className="floor-drawing">
      <rect className="floor" x={0} y={0} width={L} height={W} rx={m * 0.012} />

      {/* origin and axes */}
      <g className="axes">
        <AxisArrow x1={0} y1={-ax * 0.55} x2={ax * 2.2} y2={-ax * 0.55} head={ax * 0.45} />
        <AxisArrow x1={-ax * 0.55} y1={0} x2={-ax * 0.55} y2={ax * 2.2} head={ax * 0.45} />
        <text x={ax * 2.55} y={-ax * 0.55} fontSize={fs} className="axis-label">
          X
        </text>
        <text x={-ax * 0.55} y={ax * 2.65} fontSize={fs} className="axis-label">
          Y
        </text>
        <text x={-ax * 0.6} y={-ax * 0.6} fontSize={fs * 0.8} className="axis-zero">
          0
        </text>
      </g>
      <text className="floor-end" x={-ax * 1.25} y={W / 2} fontSize={fs} transform={`rotate(-90 ${-ax * 1.25} ${W / 2})`}>
        FRONT
      </text>
      <text className="floor-end" x={L + ax * 0.9} y={W / 2} fontSize={fs} transform={`rotate(90 ${L + ax * 0.9} ${W / 2})`}>
        DOOR
      </text>

      {below.map((b) => {
        const p = b.location!;
        return <rect key={`g${b.uid}`} className="ghost" x={p.x} y={p.y} width={p.l} height={p.w} rx={Math.min(p.l, p.w) * 0.035} />;
      })}

      {here.map((b) => {
        const p = b.location!;
        return (
          <g
            key={b.uid}
            className="bx-hit"
            transform={boxTransform(p, b)}
            onClick={onSelect ? () => onSelect(b.no) : undefined}
            onDoubleClick={onOpen ? () => onOpen(b.no) : undefined}
            onPointerEnter={onHover ? () => onHover(b.no) : undefined}
            onPointerLeave={onHover ? () => onHover(null) : undefined}
          >
            <BoxGraphic
              box={b}
              types={types}
              colors={colors}
              gradPrefix={gradPrefix}
              rotated={p.rotated}
              selected={selectedNo === b.no}
              hovered={hoverNo === b.no}
            />
          </g>
        );
      })}

      {showCog && u?.cog && (
        <g className="cog">
          <circle cx={u.cog.x} cy={u.cog.y} r={m * 0.022} />
          <line x1={u.cog.x - m * 0.04} y1={u.cog.y} x2={u.cog.x + m * 0.04} y2={u.cog.y} />
          <line x1={u.cog.x} y1={u.cog.y - m * 0.04} x2={u.cog.x} y2={u.cog.y + m * 0.04} />
          <text x={u.cog.x + m * 0.03} y={u.cog.y - m * 0.03} fontSize={fs * 0.75}>
            CoG
          </text>
          <title>Centre of gravity of the load</title>
        </g>
      )}
    </g>
  );
}
