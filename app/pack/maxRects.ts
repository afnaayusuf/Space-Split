/** MaxRects rectangle packer: base squares on a crate floor, crates on a deck. */

export interface Rect {
  x: number;
  y: number;
  w: number; // along x
  h: number; // along y
}

const E = 1e-6;

export class MaxRects {
  private free: Rect[];

  constructor(bounds: Rect) {
    this.free = bounds.w > E && bounds.h > E ? [bounds] : [];
  }

  /** Room left, roughly: the largest free rectangle's area. */
  get largest(): number {
    return this.free.reduce((a, f) => Math.max(a, f.w * f.h), 0);
  }

  /**
   * Best spot for a w×h item: 'corner' keeps items toward x = 0 then y = 0,
   * 'fit' takes the free rectangle it fills most closely (best short side).
   */
  find(w: number, h: number, turn: boolean, how: 'corner' | 'fit'): (Rect & { turned: boolean }) | null {
    let best: (Rect & { turned: boolean }) | null = null;
    let s1 = Infinity;
    let s2 = Infinity;
    const consider = (F: Rect, rw: number, rh: number, turned: boolean) => {
      if (rw > F.w + E || rh > F.h + E) return;
      let a: number;
      let b: number;
      if (how === 'corner') {
        a = F.x + rw;
        b = F.y + rh;
      } else {
        const dw = F.w - rw;
        const dh = F.h - rh;
        a = Math.min(dw, dh);
        b = Math.max(dw, dh);
      }
      if (a < s1 - E || (Math.abs(a - s1) <= E && b < s2 - E)) {
        s1 = a;
        s2 = b;
        best = { x: F.x, y: F.y, w: rw, h: rh, turned };
      }
    };
    for (const F of this.free) {
      consider(F, w, h, false);
      if (turn && Math.abs(w - h) > E) consider(F, h, w, true);
    }
    return best;
  }

  place(r: Rect): void {
    const next: Rect[] = [];
    for (const F of this.free) {
      const overlaps = r.x < F.x + F.w - E && r.x + r.w > F.x + E && r.y < F.y + F.h - E && r.y + r.h > F.y + E;
      if (!overlaps) {
        next.push(F);
        continue;
      }
      if (r.x > F.x + E) next.push({ x: F.x, y: F.y, w: r.x - F.x, h: F.h });
      if (r.x + r.w < F.x + F.w - E) next.push({ x: r.x + r.w, y: F.y, w: F.x + F.w - r.x - r.w, h: F.h });
      if (r.y > F.y + E) next.push({ x: F.x, y: F.y, w: F.w, h: r.y - F.y });
      if (r.y + r.h < F.y + F.h - E) next.push({ x: F.x, y: r.y + r.h, w: F.w, h: F.y + F.h - r.y - r.h });
    }
    // drop free rectangles inside another one; of two identical ones keep the first
    this.free = next.filter(
      (a, i) =>
        !next.some(
          (b, j) =>
            j !== i &&
            a.x >= b.x - E &&
            a.y >= b.y - E &&
            a.x + a.w <= b.x + b.w + E &&
            a.y + a.h <= b.y + b.h + E &&
            !(j > i && Math.abs(a.x - b.x) < E && Math.abs(a.y - b.y) < E && Math.abs(a.w - b.w) < E && Math.abs(a.h - b.h) < E),
        ),
    );
  }
}
