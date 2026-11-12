import type { Crate, Group, PlacedGroup, Settings } from '../model/types';

/**
 * A place a square can stand: a floor cell, or the top of a square already
 * there. A top much bigger than the square coming is split into a k × k grid
 * of smaller places, so several small squares sit side by side on one big one.
 */
interface Column {
  cell: number; // the floor cell it stands in
  cx: number;
  cy: number;
  top: number; // side of the place
  h: number; // height of the place above the crate floor
  closed: boolean; // a non-stackable square is on top
}

const up10 = (v: number) => Math.ceil(v / 10 - 1e-9) * 10;

/** Wood: sides, ends, floor and lid in `board` plank at 550 kg/m³, and three skids. */
export function crateTare(o: { L: number; W: number; H: number }, s: Settings, board = s.board, skid = s.skid): number {
  const m = (v: number) => v / 1000;
  const panels = 2 * m(o.L) * m(o.H) + 2 * m(o.W) * m(o.H) + 2 * m(o.L) * m(o.W);
  const skids = 3 * m(o.L) * 0.1 * m(skid) * 0.8;
  return Math.round(550 * (panels * m(board) + skids) * 10) / 10;
}

const INCH = 25.4;
/** Up to the next whole inch. */
const upInch = (v: number) => Math.ceil(v / INCH - 1e-9) * INCH;

/**
 * Packs the squares into crates made to measure. Each crate starts with the
 * largest square left and is a grid of cells that size; squares nearly as big
 * (at least 80 % of the side) fill the other cells. Smaller squares then go on
 * top: on a square close to their own size, or several side by side on a much
 * bigger one, while the height and weight allow — never on a square that
 * carries a non-stackable gasket. The grid is chosen to use the least deck
 * area per square once the crates stand on the vehicle, so narrow crates that
 * go two or three across a deck win over one wide one.
 *
 * Once filled, the cells' piles are moved about the grid, heaviest first, to
 * bring the crate's centre of gravity to its middle. The crate is then sized to
 * what it holds, with `wall` clearance round the squares (or `wallPct` of the
 * largest square's side, if more: big gaskets get more room) and `top` above
 * the tallest stack.
 *
 * With `evenSplit`, squares of a size that need more than one crate are shared
 * out evenly — 40 gaskets in two crates of 20, not 30 and 10.
 */
export function packCrates(groups: Group[], s: Settings, deckW: number): Crate[] {
  const { pile } = s;
  const hCap = Math.max(0, s.crateMaxH - s.top);
  let left = [...groups].sort((a, b) => b.side - a.side || b.h - a.h);
  const crates: Crate[] = [];

  while (left.length) {
    const lead = left[0];
    const side = lead.side;
    const cell = side + pile;
    // clearance to the walls, both sides together at least `wallPct` of the largest square
    const wall = Math.max(s.wall, ((s.wallPct ?? 0) * side) / 2);
    // no taller than `aspect` × the lead square's side, so small gaskets go in low, wide boxes
    const hc = s.aspect > 0 ? Math.min(hCap, s.aspect * side) : hCap;
    // squares close to the lead in size tile its cells well; the weight cap says how many
    const floorable = left.filter((g) => g.side >= side * 0.8);
    let kg = 0;
    let kCap = 0;
    for (const g of floorable) {
      if (kCap && kg + g.kg > s.crateMaxKg) break;
      kg += g.kg;
      kCap++;
    }
    // the outside — planks, and the 10 mm the inside is rounded up to — must still go across the deck
    const aMax = Math.max(1, Math.floor((deckW - 2 * s.board - 10 - 2 * wall + pile) / cell + 1e-9));
    const bMax = Math.max(1, Math.floor((s.crateMaxSide - 2 * wall + pile) / cell + 1e-9));
    const maxCells = s.square ? Math.min(aMax, bMax) ** 2 : aMax * bMax;
    // with `stackSame` squares of a size stand on one another in a cell up to the height limit before the
    // crate is made wider; otherwise each takes a floor cell
    const stackUp = (list: Group[]) => {
      const st: Group[][] = [];
      const hs: number[] = [];
      for (const g of list) {
        let at = -1;
        if (s.stackSame) at = hs.findIndex((h, n) => h + g.h <= hc + 1e-6 && !st[n][st[n].length - 1].noTop);
        if (at < 0) {
          st.push([g]);
          hs.push(g.h);
        } else {
          st[at].push(g);
          hs[at] += g.h;
        }
      }
      return st;
    };
    let stacks = stackUp(floorable.slice(0, Math.max(1, kCap)));
    if (s.evenSplit) {
      // squares of this size that will not all fit: share them evenly over the crates they need
      const taken = stacks.slice(0, maxCells).reduce((n, st) => n + st.length, 0);
      if (taken < floorable.length) {
        const limit = Math.ceil(floorable.length / Math.ceil(floorable.length / taken));
        if (limit < taken) stacks = stackUp(floorable.slice(0, limit));
      }
    }
    const k = stacks.length;

    // how many cells across: a square crate takes the smallest square grid that holds them;
    // otherwise the grid whose crates use the least deck per square
    let a = 1;
    let bestScore = Infinity;
    if (s.square) {
      // with `fill`, wide enough that everything left (within the weight cap) would fit at that share of the room
      let need = k;
      if (s.fill > 0 && hc > 0) {
        let w = 0;
        let v = 0;
        for (const g of left) {
          if (w + g.kg > s.crateMaxKg && w > 0) continue;
          w += g.kg;
          v += g.side * g.side * g.h;
        }
        need = Math.max(need, v / (cell * cell * hc * s.fill));
      }
      a = Math.max(1, Math.min(aMax, bMax, Math.ceil(Math.sqrt(need) - 1e-9)));
      bestScore = -Infinity;
    }
    for (let across = 1; across <= aMax && !s.square; across++) {
      const cells = Math.min(k, across * bMax);
      const aUsed = Math.min(across, cells);
      const bUsed = Math.ceil(cells / across);
      const Wout = aUsed * cell - pile + 2 * wall + 2 * s.board;
      const Lout = bUsed * cell - pile + 2 * wall + 2 * s.board;
      const perRow = Math.max(1, Math.floor((deckW + s.deckGap) / (Wout + s.deckGap) + 1e-9));
      const score = (deckW * (Lout + s.deckGap)) / (perRow * cells);
      if (score < bestScore - 1e-6) {
        bestScore = score;
        a = across;
      }
    }

    // the floor: one square per cell, across then along, largest first
    const used = new Set<Group>();
    let columns: Column[] = [];
    const placed: (PlacedGroup & { cell: number })[] = [];
    let net = 0;
    let vol = 0;
    const cells = Math.min(k, a * (s.square ? a : bMax));
    for (let n = 0; n < cells; n++) {
      const i = n % a;
      const j = Math.floor(n / a);
      const cx = wall + j * cell + side / 2;
      const cy = wall + i * cell + side / 2;
      let z = 0;
      for (const g of stacks[n]) {
        placed.push({ group: g, x: cx - g.side / 2, y: cy - g.side / 2, z, cell: n });
        z += g.h;
        used.add(g);
        net += g.kg;
        vol += g.side * g.side * g.h;
      }
      const top = stacks[n][stacks[n].length - 1];
      columns.push({ cell: n, cx, cy, top: top.side, h: z, closed: top.noTop });
    }
    // a square crate's empty cells are floor for the smaller squares
    if (s.square)
      for (let n = cells; n < a * a; n++) {
        const i = n % a;
        const j = Math.floor(n / a);
        columns.push({ cell: n, cx: wall + j * cell + side / 2, cy: wall + i * cell + side / 2, top: side, h: 0, closed: false });
      }

    // smaller squares on top: the place it fills best, splitting a much bigger top into a grid of places
    for (const g of left) {
      if (used.has(g)) continue;
      if (net + g.kg > s.crateMaxKg) continue;
      let best: { c: Column; waste: number; k: number } | null = null;
      for (const c of columns) {
        if (c.closed || c.top + 1e-6 < g.side || c.h + g.h > Math.max(hc, g.h) + 1e-6) continue;
        // a much smaller square does not ride on a big one: it goes in a box of its own size
        if (s.onTop > 0 && g.side < s.onTop * c.top) continue;
        const split = Math.floor((c.top + pile) / (g.side + pile) + 1e-9);
        const direct = c.top <= g.side / 0.8 || split < 2;
        const waste = direct ? c.top - g.side : (c.top + pile) / split - pile - g.side;
        if (!best || waste < best.waste - 1e-6 || (Math.abs(waste - best.waste) < 1e-6 && c.h < best.c.h)) best = { c, waste, k: direct ? 1 : split };
      }
      if (!best) continue;
      let target = best.c;
      if (best.k > 1) {
        // the big top becomes k × k places, each standing fully on the square below
        const c = best.c;
        const slot = (c.top + pile) / best.k - pile;
        const subs: Column[] = [];
        for (let u = 0; u < best.k; u++)
          for (let v = 0; v < best.k; v++)
            subs.push({ cell: c.cell, cx: c.cx - c.top / 2 + u * (slot + pile) + slot / 2, cy: c.cy - c.top / 2 + v * (slot + pile) + slot / 2, top: slot, h: c.h, closed: false });
        columns = columns.filter((x) => x !== c).concat(subs);
        target = subs[0];
      }
      placed.push({ group: g, x: target.cx - g.side / 2, y: target.cy - g.side / 2, z: target.h, cell: target.cell });
      target.h += g.h;
      target.top = g.side;
      if (g.noTop) target.closed = true;
      used.add(g);
      net += g.kg;
      vol += g.side * g.side * g.h;
    }
    left = left.filter((g) => !used.has(g));

    // balance: the heaviest cell first, each to the free grid position that keeps the centre of gravity nearest the middle
    // cells in use: the first ones filled, and any empty cell a smaller square went into
    const filled = Math.max(cells, ...placed.map((p) => p.cell + 1));
    const aUsed = Math.min(a, filled);
    const bUsed = Math.ceil(filled / a);
    const innerL = bUsed * cell - pile + 2 * wall;
    const innerW = aUsed * cell - pile + 2 * wall;
    const weight = new Array<number>(filled).fill(0);
    for (const p of placed) weight[p.cell] += p.group.kg;
    const spots: { i: number; j: number }[] = [];
    for (let j = 0; j < bUsed; j++) for (let i = 0; i < aUsed; i++) spots.push({ i, j });
    const free = new Set(spots.map((_, n) => n));
    const midX = innerL / 2;
    const midY = innerW / 2;
    const spotX = (n: number) => wall + spots[n].j * cell + side / 2 - midX;
    const spotY = (n: number) => wall + spots[n].i * cell + side / 2 - midY;
    let mx = 0;
    let my = 0;
    const move = new Map<number, { dx: number; dy: number }>();
    for (const c of [...weight.keys()].sort((p, q) => weight[q] - weight[p])) {
      let pick = -1;
      let bestM = Infinity;
      for (const n of free) {
        const m = Math.hypot(mx + weight[c] * spotX(n), my + weight[c] * spotY(n));
        const tie = Math.hypot(spotX(n), spotY(n)) * 1e-9;
        if (m + tie < bestM) {
          bestM = m + tie;
          pick = n;
        }
      }
      free.delete(pick);
      mx += weight[c] * spotX(pick);
      my += weight[c] * spotY(pick);
      move.set(c, { dx: spotX(pick) - spotX(c), dy: spotY(pick) - spotY(c) });
    }
    for (const p of placed) {
      const d = move.get(p.cell)!;
      p.x += d.dx;
      p.y += d.dy;
    }

    // a light box has thinner sides and stands on no skids; skids only under the heavier ones
    const light = net <= (s.lightKg ?? 0);
    const board = light ? s.lightBoard : s.board;
    const skid = light || net <= (s.skidKg ?? 0) ? 0 : s.skid;
    const innerH = Math.max(...placed.map((p) => p.z + p.group.h)) + s.top;
    let inner = { L: up10(innerL), W: up10(innerW), H: up10(innerH) };
    let outer = { L: inner.L + 2 * board, W: inner.W + 2 * board, H: inner.H + skid + board };
    if (s.inch) {
      // the works' boxes are whole inches outside
      outer = { L: upInch(innerL + 2 * board), W: upInch(innerW + 2 * board), H: upInch(innerH + skid + board) };
      inner = { L: outer.L - 2 * board, W: outer.W - 2 * board, H: outer.H - skid - board };
    }
    const tare = crateTare(outer, s, board, skid);
    // centre of gravity: the gaskets where they stand, the wood at the middle of the box
    const at = (f: (p: PlacedGroup) => number) => placed.reduce((t, p) => t + p.group.kg * f(p), 0) / Math.max(net, 1e-9);
    const gx = board + at((p) => p.x + p.group.side / 2) - outer.L / 2;
    const gy = board + at((p) => p.y + p.group.side / 2) - outer.W / 2;
    const gz = skid + at((p) => p.z + p.group.h / 2);
    const gross = net + tare;
    const piles = placed.flatMap((p) => p.group.piles);
    crates.push({
      id: `k${crates.length + 1}`,
      no: crates.length + 1,
      name: `${aUsed} × ${bUsed} · ${Math.round(side)}`,
      cell,
      a: aUsed,
      b: bUsed,
      inner,
      outer,
      board,
      skid,
      groups: placed.map((p) => ({ group: p.group, x: p.x, y: p.y, z: p.z })),
      net,
      tare,
      gross,
      fill: vol / (inner.L * inner.W * inner.H),
      cog: { x: (net * gx) / gross, y: (net * gy) / gross, z: (net * gz + (tare * outer.H) / 2) / gross },
      stack: piles.every((p) => p.stack),
      rotate: piles.every((p) => p.rotate),
    });
  }
  return crates;
}
