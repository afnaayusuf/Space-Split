/**
 * MaxRects rectangle packer, used to place boxes on the cargo floor.
 * x runs along the floor length (front wall to door), y across the width.
 */

export interface Rect {
  x: number;
  y: number;
  w: number; // size along x
  h: number; // size along y
}

export type RectHeuristic = 'front' | 'bssf' | 'baf';

const E = 1e-6;

export class MaxRects {
  private free: Rect[];

  constructor(bounds: Rect) {
    this.free = bounds.w > E && bounds.h > E ? [bounds] : [];
  }

  /**
   * Best spot for a w×h item.
   * 'front': keep the load toward the front wall, then toward y = 0.
   * 'bssf': best short side fit. 'baf': best area fit.
   */
  find(w: number, h: number, allowTurn: boolean, heur: RectHeuristic): (Rect & { rotated: boolean }) | null {
    let best: (Rect & { rotated: boolean }) | null = null;
    let s1 = Infinity;
    let s2 = Infinity;
    const consider = (F: Rect, rw: number, rh: number, rotated: boolean) => {
      if (rw > F.w + E || rh > F.h + E) return;
      let a: number;
      let b: number;
      if (heur === 'front') {
        a = F.x + rw;
        b = F.y + rh;
      } else if (heur === 'bssf') {
        const dw = F.w - rw;
        const dh = F.h - rh;
        a = Math.min(dw, dh);
        b = Math.max(dw, dh);
      } else {
        a = F.w * F.h - rw * rh;
        b = Math.min(F.w - rw, F.h - rh);
      }
      if (a < s1 - E || (Math.abs(a - s1) <= E && b < s2 - E)) {
        s1 = a;
        s2 = b;
        best = { x: F.x, y: F.y, w: rw, h: rh, rotated };
      }
    };
    for (const F of this.free) {
      consider(F, w, h, false);
      if (allowTurn && Math.abs(w - h) > E) consider(F, h, w, true);
    }
    return best;
  }

  place(r: Rect): void {
    const next: Rect[] = [];
    for (const F of this.free) {
      const overlaps =
        r.x < F.x + F.w - E && r.x + r.w > F.x + E && r.y < F.y + F.h - E && r.y + r.h > F.y + E;
      if (!overlaps) {
        next.push(F);
        continue;
      }
      if (r.x > F.x + E) next.push({ x: F.x, y: F.y, w: r.x - F.x, h: F.h });
      if (r.x + r.w < F.x + F.w - E) next.push({ x: r.x + r.w, y: F.y, w: F.x + F.w - r.x - r.w, h: F.h });
      if (r.y > F.y + E) next.push({ x: F.x, y: F.y, w: F.w, h: r.y - F.y });
      if (r.y + r.h < F.y + F.h - E) next.push({ x: F.x, y: r.y + r.h, w: F.w, h: F.y + F.h - r.y - r.h });
    }
    // drop free rectangles that sit inside another one
    this.free = next.filter(
      (a, i) =>
        !next.some(
          (b, j) =>
            j !== i &&
            a.x >= b.x - E &&
            a.y >= b.y - E &&
            a.x + a.w <= b.x + b.w + E &&
            a.y + a.h <= b.y + b.h + E &&
            // of two identical rectangles keep the first
            !(j > i && Math.abs(a.x - b.x) < E && Math.abs(a.y - b.y) < E && Math.abs(a.w - b.w) < E && Math.abs(a.h - b.h) < E),
        ),
    );
  }
}
