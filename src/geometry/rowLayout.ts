const E = 1e-9;

interface Column {
  key: string;
  u: number; // centre line
  r: number;
  nextV: number; // where the next item in this column would start
  items: number[];
}

interface Row {
  v0: number;
  depth: number;
  uEnd: number;
  cols: Column[];
}

export interface RowSpot {
  row: number;
  col: number | null; // existing column, or null for a new one
  u: number;
  v: number;
}

/**
 * Sets items down in straight rows, the way a packer lays piles in a box: a
 * row runs along U and rows follow each other along V. A row is as deep as
 * its first item. Each column in a row holds items of one key only, so smaller
 * piles line up two or three deep beside a large one. Items are squares of
 * side 2r (a ring is placed by its bounding square). Feed items largest first;
 * each goes to the first row with room. Neighbours are `gap` apart and every
 * item keeps its own `margin` from the walls.
 */
export class RowLayout {
  private rows: Row[] = [];
  private items: { u: number; v: number; r: number; margin: number }[] = [];

  constructor(
    private readonly U: number,
    private readonly V: number,
    private readonly gap: number,
  ) {}

  find(key: string, r: number, margin: number): RowSpot | null {
    const d = 2 * r;
    const uMax = this.U - margin;
    const vMax = this.V - margin;
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (d > row.depth + E || row.v0 < margin - E || row.v0 + d > vMax + E) continue;
      for (let c = 0; c < row.cols.length; c++) {
        const col = row.cols[c];
        if (col.key === key && col.u - r >= margin - E && col.u + r <= uMax + E && col.nextV + d <= Math.min(row.v0 + row.depth, vMax) + E)
          return { row: i, col: c, u: col.u, v: col.nextV + r };
      }
      const start = Math.max(margin, row.cols.length ? row.uEnd + this.gap : margin);
      if (start + d <= uMax + E) return { row: i, col: null, u: start + r, v: row.v0 + r };
    }
    const last = this.rows[this.rows.length - 1];
    const v = Math.max(margin, last ? last.v0 + last.depth + this.gap : margin);
    if (v + d <= vMax + E && margin + d <= uMax + E) return { row: this.rows.length, col: null, u: margin + r, v: v + r };
    return null;
  }

  /** Places an item at a spot returned by `find`; returns its index. */
  place(spot: RowSpot, key: string, r: number, margin = 0): number {
    const d = 2 * r;
    if (spot.row === this.rows.length) this.rows.push({ v0: spot.v - r, depth: d, uEnd: 0, cols: [] });
    const row = this.rows[spot.row];
    let c = spot.col;
    if (c === null) {
      row.cols.push({ key, u: spot.u, r, nextV: row.v0, items: [] });
      c = row.cols.length - 1;
      row.uEnd = spot.u + r;
    }
    const col = row.cols[c];
    col.nextV = spot.v + r + this.gap;
    const idx = this.items.length;
    col.items.push(idx);
    this.items.push({ u: spot.u, v: spot.v, r, margin });
    return idx;
  }

  /**
   * Final centres. A column shorter than its row is centred in the row's
   * depth, which only ever widens the gaps to the rows on either side.
   */
  positions(): { u: number; v: number }[] {
    const out = this.items.map((it) => ({ u: it.u, v: it.v }));
    for (const row of this.rows) {
      for (const col of row.cols) {
        const n = col.items.length;
        const block = n * 2 * col.r + (n - 1) * this.gap;
        // never closer to the far wall than an item's own margin
        const room = Math.min(...col.items.map((i) => this.V - this.items[i].margin - (this.items[i].v + this.items[i].r)));
        const shift = Math.min((row.depth - block) / 2, room);
        if (shift > E) for (const i of col.items) out[i].v += shift;
      }
    }
    return out;
  }
}
