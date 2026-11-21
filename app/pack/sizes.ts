import type { Crate, Group, PlacedGroup, Settings } from '../model/types';
import { crateTare, packCrates } from './crates';
import { MaxRects } from './maxRects';

/**
 * Crates from a list of standard sizes, so the crate makers build the same
 * boxes again and again, instead of a new size for every order.
 *
 * The squares are tried in every standard box, smallest first, laid out flat
 * (side by side, smaller ones on top only when the floor is full) and stacked
 * (squares on one another first); a box takes them if they fit inside it with
 * the clearances. The smallest box that takes everything left wins; when none
 * does, the box that takes the most. Only a square too big for every standard
 * box gets a crate made to measure, marked as such (`custom`).
 */

const IN = 25.4;
export interface StdSize {
  L: number; // outside, inches
  W: number;
  H: number;
}

interface Column {
  cx: number;
  cy: number;
  top: number;
  h: number;
  closed: boolean;
}

interface Fit {
  placed: PlacedGroup[];
  used: Set<Group>;
  net: number;
  vol: number;
}

/** What of `groups` (largest first) fits in a box `inner`, laid out `flat` or stacked. */
function fitInto(groups: Group[], inner: { L: number; W: number; H: number }, s: Settings, flat: boolean): Fit {
  // a big gasket's box carries only squares close to its size: smaller ones go in a box of their own
  const lead = groups[0]?.side ?? 0;
  const alone = (s.sizeAlone ?? 0) > 0 && lead >= s.sizeAlone!;
  // room left in a box: no more than `sizeFill` of its inside in gaskets
  const room = (s.sizeFill ?? 0) > 0 ? s.sizeFill! * inner.L * inner.W * inner.H : Infinity;
  // standard boxes are packed as the works packs them, closer than a crate made to measure
  const pile = s.sizeGap ?? s.pile;
  const wall = s.sizeGap ?? s.wall;
  const hc = inner.H - (s.sizeTop ?? s.top);
  const floor = new MaxRects({ x: 0, y: 0, w: inner.L - 2 * wall + pile, h: inner.W - 2 * wall + pile });
  let columns: Column[] = [];
  const placed: PlacedGroup[] = [];
  const used = new Set<Group>();
  let net = 0;
  let vol = 0;

  const onFloor = (g: Group) => {
    const spot = floor.find(g.side + pile, g.side + pile, false, 'corner');
    if (!spot) return false;
    floor.place(spot);
    const x = wall + spot.x;
    const y = wall + spot.y;
    placed.push({ group: g, x, y, z: 0 });
    columns.push({ cx: x + g.side / 2, cy: y + g.side / 2, top: g.side, h: g.h, closed: g.noTop });
    return true;
  };

  // on a square close to its own size, or several side by side on a much bigger one (as crates.ts does)
  const onTop = (g: Group) => {
    let best: { c: Column; waste: number; k: number } | null = null;
    for (const c of columns) {
      if (c.closed || c.top + 1e-6 < g.side || c.h + g.h > hc + 1e-6) continue;
      if (s.onTop > 0 && g.side < s.onTop * c.top) continue;
      const split = Math.floor((c.top + pile) / (g.side + pile) + 1e-9);
      const direct = c.top <= g.side / 0.8 || split < 2;
      const waste = direct ? c.top - g.side : (c.top + pile) / split - pile - g.side;
      if (!best || waste < best.waste - 1e-6 || (Math.abs(waste - best.waste) < 1e-6 && c.h < best.c.h)) best = { c, waste, k: direct ? 1 : split };
    }
    if (!best) return false;
    let target = best.c;
    if (best.k > 1) {
      const c = best.c;
      const slot = (c.top + pile) / best.k - pile;
      const subs: Column[] = [];
      for (let u = 0; u < best.k; u++)
        for (let v = 0; v < best.k; v++) subs.push({ cx: c.cx - c.top / 2 + u * (slot + pile) + slot / 2, cy: c.cy - c.top / 2 + v * (slot + pile) + slot / 2, top: slot, h: c.h, closed: false });
      columns = columns.filter((x) => x !== c).concat(subs);
      target = subs[0];
    }
    placed.push({ group: g, x: target.cx - g.side / 2, y: target.cy - g.side / 2, z: target.h });
    target.h += g.h;
    target.top = g.side;
    if (g.noTop) target.closed = true;
    return true;
  };

  // the lowest stack from each one on: once nothing left could still go in, stop looking
  const lowest = new Array<number>(groups.length);
  for (let i = groups.length - 1, m = Infinity; i >= 0; i--) lowest[i] = m = Math.min(m, groups[i].h);
  const full = (i: number) => {
    const side = groups[groups.length - 1].side + pile; // sorted largest first: the last is the narrowest
    if (floor.largest >= side * side - 1e-6) return false;
    return columns.every((c) => c.closed || c.h + lowest[i] > hc + 1e-6);
  };

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.h > hc + 1e-6 || (used.size && (net + g.kg > s.crateMaxKg + 1e-6 || vol + g.side * g.side * g.h > room || (alone && g.side < 0.8 * lead)))) {
      if (i === 0) break; // the box is chosen for the first square: no use going on without it
      continue;
    }
    const ok = flat ? onFloor(g) || onTop(g) : onTop(g) || onFloor(g);
    if (!ok) {
      if (i === 0 || full(i)) break;
      continue;
    }
    used.add(g);
    net += g.kg;
    vol += g.side * g.side * g.h;
  }
  return { placed, used, net, vol };
}

/** A standard box's inside: its sides and its floor and lid take `sizeWall` and `sizeBase`. */
const insideOf = (b: StdSize, s: Settings) => ({
  L: b.L * IN - 2 * (s.sizeWall ?? 12),
  W: b.W * IN - 2 * (s.sizeWall ?? 12),
  H: b.H * IN - (s.sizeBase ?? 25),
});

function makeCrate(n: number, b: StdSize, fit: Fit, s: Settings): Crate {
  const outer = { L: b.L * IN, W: b.W * IN, H: b.H * IN };
  const inner = insideOf(b, s);
  const net = fit.net;
  // the wood weighs what a crate's wood weighs: light boxes thin-sided on no skids, heavier ones in plank on skids
  const light = net <= (s.lightKg ?? 0);
  const board = light ? s.lightBoard : s.board;
  const skid = light || net <= (s.skidKg ?? 0) ? 0 : s.skid;
  const tare = crateTare(outer, s, board, skid);
  const gross = net + tare;
  const at = (f: (p: PlacedGroup) => number) => fit.placed.reduce((t, p) => t + p.group.kg * f(p), 0) / Math.max(net, 1e-9);
  const side = (outer.L - inner.L) / 2;
  const gx = side + at((p) => p.x + p.group.side / 2) - outer.L / 2;
  const gy = side + at((p) => p.y + p.group.side / 2) - outer.W / 2;
  const gz = (outer.H - inner.H) / 2 + at((p) => p.z + p.group.h / 2);
  const piles = fit.placed.flatMap((p) => p.group.piles);
  const f1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return {
    id: `k${n}`,
    no: n,
    name: `${f1(b.L)} × ${f1(b.W)} × ${f1(b.H)} in`,
    standard: true,
    cell: Math.max(...fit.placed.map((p) => p.group.side)),
    a: 1,
    b: 1,
    inner,
    outer,
    board,
    skid,
    groups: fit.placed,
    net,
    tare,
    gross,
    fill: fit.vol / (inner.L * inner.W * inner.H),
    cog: { x: (net * gx) / gross, y: (net * gy) / gross, z: (net * gz + (tare * outer.H) / 2) / gross },
    stack: piles.every((p) => p.stack),
    rotate: piles.every((p) => p.rotate),
  };
}

/** Packs the squares into standard sizes; a square no standard box takes gets a crate made to measure. */
export function packStandard(groups: Group[], s: Settings, deckW: number, sizes: StdSize[]): Crate[] {
  // a box must go across the deck (its short side), or no vehicle could carry it
  const boxes = [...sizes]
    .filter((b) => b.L > 0 && b.W > 0 && b.H > 0 && Math.min(b.L, b.W) * IN <= deckW + 1e-6)
    .sort((a, b) => a.L * a.W * a.H - b.L * b.W * b.H);
  let left = [...groups].sort((a, b) => b.side - a.side || b.h - a.h);
  const crates: Crate[] = [];
  while (left.length) {
    let best: { b: StdSize; fit: Fit } | null = null;
    for (const b of boxes) {
      const inner = insideOf(b, s);
      if (inner.L <= 0 || inner.W <= 0 || inner.H <= 0) continue;
      for (const flat of [true, false]) {
        const fit = fitInto(left, inner, s, flat);
        if (!fit.used.has(left[0])) continue; // a box is chosen for the biggest square left
        const all = fit.used.size === left.length;
        const bestAll = best !== null && best.fit.used.size === left.length;
        // the smallest box taking everything; failing that, the one taking the most (volume), the smaller on a tie
        // the box it fills best, or the one taking the most, the smaller on a tie
        const share = (f: Fit, x: StdSize) => f.vol / (x.L * x.W * x.H);
        const better = s.sizePick === 'fill' ? best !== null && share(fit, b) > share(best.fit, best.b) * 1.02 : best !== null && fit.vol > best.fit.vol * 1.02;
        if (!best || (all && !bestAll) || (!bestAll && !all && better)) best = { b, fit };
      }
      if (best && best.fit.used.size === left.length) break; // boxes go smallest first: the first to take everything wins
    }
    const chosen = best as { b: StdSize; fit: Fit } | null;
    if (chosen) {
      crates.push(makeCrate(crates.length + 1, chosen.b, chosen.fit, s));
      const used = chosen.fit.used;
      left = left.filter((g) => !used.has(g));
      continue;
    }
    // too big for every standard box: a crate made to measure round the biggest square and what goes with it
    const made = packCrates(left, s, deckW)[0];
    const taken = new Set(made.groups.map((p) => p.group));
    crates.push({ ...made, id: `k${crates.length + 1}`, no: crates.length + 1, name: `Custom ${made.name}`, standard: false });
    left = left.filter((g) => !taken.has(g));
  }
  return crates;
}
