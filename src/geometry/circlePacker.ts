/**
 * Greedy circle packer for gasket stacks.
 *
 * Each circle goes to the lowest free spot: smallest y then x for order 'row',
 * smallest x then y for order 'col'. That spot always touches two obstacles
 * (walls, the container rim, or circles already placed), so the candidates are
 * every wall/circle and circle/circle tangency. They are kept in a list and
 * updated as circles are added instead of being rebuilt each time.
 *
 * Gaps are the caller's job: inflate every radius by gap/2 and move the walls
 * out by gap/2, then two circles touching means exactly one gap between them.
 */

export type Container =
  | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'circle'; cx: number; cy: number; r: number };

export type PackOrder = 'row' | 'col';

export interface Point {
  x: number;
  y: number;
}

export interface Circle extends Point {
  r: number;
}

const EPS = 1e-5;

/** Uniform grid; a circle is listed in every cell its bounding box touches. */
class SpatialHash {
  private cells = new Map<number, number[]>();
  private seen: number[] = [];
  private tick = 0;

  constructor(private readonly size: number) {}

  private key(ix: number, iy: number) {
    return (ix + 32768) * 65536 + (iy + 32768);
  }

  insert(idx: number, c: Circle) {
    const s = this.size;
    const ix0 = Math.floor((c.x - c.r) / s);
    const ix1 = Math.floor((c.x + c.r) / s);
    const iy0 = Math.floor((c.y - c.r) / s);
    const iy1 = Math.floor((c.y + c.r) / s);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        const k = this.key(ix, iy);
        const cell = this.cells.get(k);
        if (cell) cell.push(idx);
        else this.cells.set(k, [idx]);
      }
    }
    this.seen[idx] = 0;
  }

  /** Calls fn once per circle whose box may overlap the query box. fn returning true stops the query. */
  query(x: number, y: number, r: number, fn: (idx: number) => boolean | void): boolean {
    const t = ++this.tick;
    const s = this.size;
    const ix0 = Math.floor((x - r) / s);
    const ix1 = Math.floor((x + r) / s);
    const iy0 = Math.floor((y - r) / s);
    const iy1 = Math.floor((y + r) / s);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        const cell = this.cells.get(this.key(ix, iy));
        if (!cell) continue;
        for (const idx of cell) {
          if (this.seen[idx] === t) continue;
          this.seen[idx] = t;
          if (fn(idx)) return true;
        }
      }
    }
    return false;
  }
}

/** Points at distance r1 from (x1,y1) and r2 from (x2,y2). */
function intersect(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, out: Point[]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d2 = dx * dx + dy * dy;
  const d = Math.sqrt(d2);
  if (d < EPS || d > r1 + r2 + EPS || d < Math.abs(r1 - r2) - EPS) return;
  const a = (r1 * r1 - r2 * r2 + d2) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const h = h2 > 0 ? Math.sqrt(h2) : 0;
  const mx = x1 + (a * dx) / d;
  const my = y1 + (a * dy) / d;
  const ox = (-dy / d) * h;
  const oy = (dx / d) * h;
  out.push({ x: mx + ox, y: my + oy });
  if (h > 0) out.push({ x: mx - ox, y: my - oy });
}

export class CirclePacker {
  readonly circles: Circle[] = [];
  private readonly hash: SpatialHash;
  private candR = -1;
  private cands: Point[] = [];

  constructor(
    readonly container: Container,
    readonly order: PackOrder = 'row',
  ) {
    const span =
      container.kind === 'rect'
        ? Math.min(container.x1 - container.x0, container.y1 - container.y0)
        : container.r * 2;
    this.hash = new SpatialHash(Math.max(5, span / 24));
  }

  /** True when a circle of radius r centred at (x, y) is inside the container and clear of every circle. */
  fits(x: number, y: number, r: number): boolean {
    const c = this.container;
    if (c.kind === 'rect') {
      if (x - r < c.x0 - EPS || x + r > c.x1 + EPS || y - r < c.y0 - EPS || y + r > c.y1 + EPS) return false;
    } else {
      const dx = x - c.cx;
      const dy = y - c.cy;
      if (Math.sqrt(dx * dx + dy * dy) + r > c.r + EPS) return false;
    }
    const hit = this.hash.query(x, y, r, (j) => {
      const o = this.circles[j];
      const dx = o.x - x;
      const dy = o.y - y;
      const m = o.r + r - EPS;
      return dx * dx + dy * dy < m * m;
    });
    return !hit;
  }

  /** Best free position for a circle of radius r, or null when it does not fit anywhere. */
  find(r: number): Point | null {
    if (Math.abs(r - this.candR) > 1e-9) this.rebuild(r);
    let best: Point | null = null;
    for (const p of this.cands) if (!best || this.better(p, best)) best = p;
    return best ? { x: best.x, y: best.y } : null;
  }

  place(x: number, y: number, r: number): void {
    const idx = this.circles.length;
    const c: Circle = { x, y, r };
    this.circles.push(c);
    this.hash.insert(idx, c);
    if (this.candR <= 0) return;

    const R = this.candR;
    const keep: Point[] = [];
    const m = R + r - EPS;
    for (const p of this.cands) {
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy >= m * m) keep.push(p);
    }
    const fresh: Point[] = [];
    this.wallCands(c, R, fresh);
    const near: number[] = [];
    this.hash.query(x, y, r + 2 * R, (j) => {
      if (j !== idx) near.push(j);
    });
    for (const j of near) this.pairCands(c, this.circles[j], R, fresh);
    for (const p of fresh) if (this.fits(p.x, p.y, R)) keep.push(p);
    this.cands = keep;
  }

  private better(a: Point, b: Point): boolean {
    if (this.order === 'row') {
      if (a.y < b.y - 1e-7) return true;
      if (a.y > b.y + 1e-7) return false;
      return a.x < b.x;
    }
    if (a.x < b.x - 1e-7) return true;
    if (a.x > b.x + 1e-7) return false;
    return a.y < b.y;
  }

  private rebuild(r: number) {
    this.candR = r;
    const out: Point[] = [];
    this.baseCands(r, out);
    const n = this.circles.length;
    for (let i = 0; i < n; i++) {
      const a = this.circles[i];
      this.wallCands(a, r, out);
      const near: number[] = [];
      this.hash.query(a.x, a.y, a.r + 2 * r, (j) => {
        if (j > i) near.push(j);
      });
      for (const j of near) this.pairCands(a, this.circles[j], r, out);
    }
    this.cands = out.filter((p) => this.fits(p.x, p.y, r));
  }

  private baseCands(r: number, out: Point[]) {
    const c = this.container;
    if (c.kind === 'rect') {
      out.push({ x: c.x0 + r, y: c.y0 + r }, { x: c.x1 - r, y: c.y0 + r });
      out.push({ x: c.x0 + r, y: c.y1 - r }, { x: c.x1 - r, y: c.y1 - r });
    } else {
      const R = c.r - r;
      if (R < -EPS) return;
      if (R < EPS) out.push({ x: c.cx, y: c.cy });
      else out.push({ x: c.cx, y: c.cy - R }, { x: c.cx - R, y: c.cy });
    }
  }

  private wallCands(a: Circle, r: number, out: Point[]) {
    const c = this.container;
    const d = a.r + r;
    if (c.kind === 'rect') {
      for (const X of [c.x0 + r, c.x1 - r]) {
        const dx = X - a.x;
        if (Math.abs(dx) <= d) {
          const h = Math.sqrt(Math.max(0, d * d - dx * dx));
          out.push({ x: X, y: a.y - h }, { x: X, y: a.y + h });
        }
      }
      for (const Y of [c.y0 + r, c.y1 - r]) {
        const dy = Y - a.y;
        if (Math.abs(dy) <= d) {
          const h = Math.sqrt(Math.max(0, d * d - dy * dy));
          out.push({ x: a.x - h, y: Y }, { x: a.x + h, y: Y });
        }
      }
    } else {
      const R = c.r - r;
      if (R < 0) return;
      intersect(c.cx, c.cy, R, a.x, a.y, d, out);
    }
  }

  private pairCands(a: Circle, b: Circle, r: number, out: Point[]) {
    const lim = a.r + b.r + 2 * r;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    if (dx * dx + dy * dy > lim * lim) return;
    intersect(a.x, a.y, a.r + r, b.x, b.y, b.r + r, out);
  }
}

/** Square grid positions for identical circles, row by row from the origin corner. */
export function squareLattice(c: Container, r: number): Point[] {
  if (c.kind !== 'rect') return [];
  const nx = Math.floor((c.x1 - c.x0) / (2 * r) + 1e-9);
  const ny = Math.floor((c.y1 - c.y0) / (2 * r) + 1e-9);
  const out: Point[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out.push({ x: c.x0 + r + 2 * r * i, y: c.y0 + r + 2 * r * j });
  return out;
}
