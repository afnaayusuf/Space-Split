import { FALLBACK_COLOR, type TypeColor } from '../colors';

/** Annulus as one path; with fill-rule evenodd the bore stays open. */
export function ringPath(cx: number, cy: number, R: number, r: number): string {
  const outer = `M${cx - R},${cy}a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 ${-2 * R},0Z`;
  if (r <= 0) return outer;
  return `${outer}M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
}

export const gradId = (prefix: string, typeId: string) => `${prefix}-${typeId}`;

/** Radial gradient per gasket line, running light at the bore to deep at the outer edge. Goes inside <defs>. */
export function RingGradients({ prefix, types, colors }: { prefix: string; types: { id: string; od: number; innerD: number }[]; colors: Map<string, TypeColor> }) {
  return (
    <>
      {types.map((t) => {
        const c = colors.get(t.id) ?? FALLBACK_COLOR;
        const k = t.od > 0 ? Math.min(0.98, Math.max(0, t.innerD / t.od)) : 0;
        return (
          <radialGradient key={t.id} id={gradId(prefix, t.id)} cx="50%" cy="50%" r="50%">
            <stop offset={k} stopColor={c.light} />
            <stop offset={(k + 1) / 2} stopColor={c.base} />
            <stop offset={1} stopColor={c.dark} />
          </radialGradient>
        );
      })}
    </>
  );
}

/** Axis line with a drawn arrow head, sized in drawing units so it scales with the drawing. */
export function AxisArrow({ x1, y1, x2, y2, head }: { x1: number; y1: number; x2: number; y2: number; head: number }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const at = (da: number) => `${x2 - head * Math.cos(a - da)},${y2 - head * Math.sin(a - da)}`;
  return (
    <g className="axis">
      <line x1={x1} y1={y1} x2={x2 - head * 0.7 * Math.cos(a)} y2={y2 - head * 0.7 * Math.sin(a)} />
      <polygon points={`${x2},${y2} ${at(0.42)} ${at(-0.42)}`} />
    </g>
  );
}

/**
 * Orientation marker: a rounded black triangle tucked inside the box corner at
 * (0, 0), tip pointing into the corner. Inside the outline it can only belong
 * to one box, even when neighbours stand a strap-width away.
 *
 * `band` is the empty strip along both walls (board + clearance to the nearest
 * stack); the triangle is sized to stay inside it so it never covers a ring.
 * `cornerR` is the outline's corner radius, so the tip clears the rounding.
 */
export function CornerArrow({ band, cornerR, min, max }: { band: number; cornerR: number; min: number; max: number }) {
  const k = Math.SQRT1_2;
  // tip on the diagonal just past the rounded corner; base midpoint (also on the diagonal) inside the band
  const fit = (band - 2 - (0.414 * cornerR + 2) * k) / (1.1 * k + 0.1);
  const size = Math.max(min, Math.min(max, fit));
  const sw = size * 0.2;
  const tip = 0.414 * cornerR + sw / 2 + 2;
  const ax = tip * k;
  const ay = tip * k;
  const bx = (tip + size) * k;
  const by = (tip + size) * k;
  const hw = size * 0.58;
  const p1 = `${bx + hw * k},${by - hw * k}`;
  const p2 = `${bx - hw * k},${by + hw * k}`;
  return <polygon className="corner-arrow" points={`${ax},${ay} ${p1} ${p2}`} strokeWidth={sw} />;
}

/** Small round tag on a ring, e.g. "30x". */
export function Badge({
  x,
  y,
  r,
  text,
  stroke,
  upright,
  variant = 'count',
}: {
  x: number;
  y: number;
  r: number;
  text: string;
  stroke: string;
  upright?: boolean;
  variant?: 'count' | 'number';
}) {
  const fs = r * (text.length <= 2 ? 1.05 : text.length === 3 ? 0.86 : 0.7);
  return (
    <g className={`badge badge-${variant}`} transform={upright ? `rotate(-90 ${x} ${y})` : undefined}>
      <circle cx={x} cy={y} r={r} style={variant === 'count' ? { stroke } : { fill: stroke }} />
      <text x={x} y={y} fontSize={fs}>
        {text}
      </text>
    </g>
  );
}
