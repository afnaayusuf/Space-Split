import { RowLayout } from '../geometry/rowLayout';
import { INCH } from '../model/defaults';
import type { PlanSettings } from '../model/types';
import type { LinePack } from './units';

/** Which way the rows run: along the box length or along its width. */
export type FillStrategy = 'row' | 'col';

/** Why the loop for one line stopped. */
export type TypeEnd = 'exhausted' | 'blocked' | 'skipped';

/** A box the filler may use: a ladder size or a made-to-measure one. Lengths are mm. */
export interface BoxGeom {
  key: string;
  sizeId: string | null;
  name: string;
  outerL: number;
  outerW: number;
  maxDepth: number; // outside
  wall: number;
  base: number;
  lid: number;
  skid: number;
  innerL: number;
  innerW: number;
  maxPile: number; // tallest pile it can take, after the headroom
}

export interface DraftPile {
  pack: LinePack;
  units: number[]; // pieces in each unit, bottom first
  slot: number; // row-layout index, -1 when nested
  host: number; // pile it stands inside, -1 = on the box floor
  depth: number;
  x: number;
  y: number;
  hasChild: boolean;
}

export interface BoxFill {
  box: BoxGeom;
  strategy: FillStrategy;
  piles: DraftPile[];
  placed: Record<string, number>;
  ended: Record<string, TypeEnd>;
  pieces: number;
  net: number;
  board: number;
  tare: number;
  gross: number;
  material: number;
  outerD: number;
  innerD: number;
  tallest: number;
  volume: number; // outside, mm³
  score: number; // gasket volume / outside volume
  tower: boolean;
}

export interface NestRules {
  domestic: boolean; // the domestic cap and fillers apply
}

export const pileHeight = (p: DraftPile) => p.units.reduce((a, n) => a + p.pack.height(n), 0);
export const marginOf = (pack: LinePack, s: PlanSettings) => (pack.kind === 'bundle' || pack.kind === 'kit' ? s.clearBundle : s.clearCarded);
export const surface = (l: number, w: number, d: number) => (2 * (l * w + l * d + w * d)) / 1e6;

/** May a bundle of `child` stand inside the bore of a bundle of `host`? */
export function canNest(host: LinePack, child: LinePack, s: PlanSettings, rules: NestRules): boolean {
  if (!s.allowNesting) return false;
  if (host.kind !== 'bundle' || child.kind !== 'bundle' || host.bore <= 0) return false;
  const h = host.line;
  const c = child.line;
  if (h.family !== c.family) return false;
  if (!s.nestAnyRating && h.rating !== c.rating) return false;
  if (host.bore - child.foot < s.nestSlack - 1e-9) return false;
  // domestic: nothing nests inside a ring above the cap, except the small fillers
  if (rules.domestic && h.size > s.domesticNestCap + 1e-9 && !(c.size > 0 && c.size <= s.fillerMax + 1e-9)) return false;
  return true;
}

/**
 * Fills one box from what is left of a group, largest footprint first.
 * Each line is cut into units (bundles, squares, cartons); a line gets as
 * many piles as it needs at the box's full height, and its units are dealt
 * evenly over them. A new pile goes first into the tightest free bore that
 * takes it (a bundle in the bore of a bigger bundle), else onto the floor in
 * rows. Afterwards the tallest line is spread over any free floor, and the
 * box is cut to the tallest pile plus the headroom, in whole inches.
 */
export function fillBox(
  box: BoxGeom,
  packs: LinePack[],
  remaining: Record<string, number>,
  s: PlanSettings,
  strategy: FillStrategy,
  rules: NestRules,
): BoxFill {
  const alongL = strategy === 'row';
  const rows = new RowLayout(alongL ? box.innerL : box.innerW, alongL ? box.innerW : box.innerL, s.pileGap);
  const piles: DraftPile[] = [];
  const placed: Record<string, number> = {};
  const ended: Record<string, TypeEnd> = {};
  const fullTare = surface(box.outerL, box.outerW, box.maxDepth) * s.boxKgPerM2;
  const cap = s.maxBoxWeight > 0 ? s.maxBoxWeight - fullTare : Infinity;
  let weight = 0;

  const newPile = (pack: LinePack): DraftPile | null => {
    let host = -1;
    let slack = Infinity;
    piles.forEach((p, i) => {
      if (p.hasChild || !canNest(p.pack, pack, s, rules)) return;
      const sl = p.pack.bore - pack.foot;
      if (sl < slack) {
        slack = sl;
        host = i;
      }
    });
    if (host >= 0) {
      piles[host].hasChild = true;
      const p: DraftPile = { pack, units: [], slot: -1, host, depth: piles[host].depth + 1, x: 0, y: 0, hasChild: false };
      piles.push(p);
      return p;
    }
    const m = marginOf(pack, s);
    const spot = rows.find(pack.line.id, pack.foot / 2, m);
    if (!spot) return null;
    const p: DraftPile = { pack, units: [], slot: rows.place(spot, pack.line.id, pack.foot / 2, m), host: -1, depth: 0, x: 0, y: 0, hasChild: false };
    piles.push(p);
    return p;
  };

  for (const pack of packs) {
    const id = pack.line.id;
    const left = remaining[id] ?? 0;
    placed[id] = 0;
    if (left <= 0) {
      ended[id] = 'skipped';
      continue;
    }
    const full = pack.perUnit;
    const nUnits = Math.ceil(left / full);
    const tail = left - (nUnits - 1) * full;
    const h1 = pack.height(full);
    const perPile = Math.floor((box.maxPile + 1e-9) / h1);
    const w1 = pack.weight(full);
    const byWeight = w1 > 0 ? Math.floor((cap - weight) / w1 + 1e-9) : Infinity;
    let take = Math.min(nUnits, byWeight);
    if (perPile < 1 || take <= 0) {
      ended[id] = 'blocked';
      continue;
    }
    const want = Math.ceil(take / perPile);
    const mine: DraftPile[] = [];
    for (let k = 0; k < want; k++) {
      const p = newPile(pack);
      if (!p) break;
      mine.push(p);
    }
    if (mine.length === 0) {
      ended[id] = 'blocked';
      continue;
    }
    take = Math.min(take, mine.length * perPile);
    const units = Array.from({ length: take }, (_, i) => (i === nUnits - 1 ? tail : full));
    deal(units, mine);
    const pieces = units.reduce((a, n) => a + n, 0);
    placed[id] = pieces;
    weight += units.reduce((a, n) => a + pack.weight(n), 0);
    ended[id] = take === nUnits ? 'exhausted' : 'blocked';
  }

  // spread the line that sets the depth over any floor still free
  for (let guard = 0; guard < 60; guard++) {
    let tall: DraftPile | null = null;
    for (const p of piles) if (!tall || pileHeight(p) > pileHeight(tall)) tall = p;
    if (!tall || tall.units.length < 2) break;
    const before = pileHeight(tall);
    const p = newPile(tall.pack);
    if (!p) break;
    const mine = piles.filter((q) => q.pack === tall!.pack);
    const units = mine.flatMap((q) => q.units).sort((a, b) => b - a);
    for (const q of mine) q.units = [];
    deal(units, mine);
    if (Math.max(...mine.map(pileHeight)) >= before - 1e-9) break;
  }

  // positions: floor piles from the rows, nested ones share their host's centre
  const pos = rows.positions();
  for (const p of piles) {
    if (p.slot >= 0) {
      const q = pos[p.slot];
      p.x = alongL ? q.u : q.v;
      p.y = alongL ? q.v : q.u;
    } else {
      p.x = piles[p.host].x;
      p.y = piles[p.host].y;
    }
  }
  const used = piles.filter((p) => p.units.length > 0);
  // a pile that ended up empty after levelling still holds its spot; drop it (and keep hosts in order)
  const kept = dropEmpty(piles);

  let pieces = 0;
  let net = 0;
  let board = 0;
  let material = 0;
  for (const p of used) {
    for (const n of p.units) {
      pieces += n;
      net += n * p.pack.line.unitWeight;
      board += p.pack.board(n);
      material += n * p.pack.material;
    }
  }
  const tallest = used.length ? Math.max(...used.map(pileHeight)) : 0;
  const boards = box.base + box.lid + box.skid;
  const outerD = Math.min(box.maxDepth, Math.ceil((tallest + s.headroom + boards) / INCH - 1e-9) * INCH);
  const innerD = outerD - boards;
  const tare = surface(box.outerL, box.outerW, outerD) * s.boxKgPerM2;
  const volume = box.outerL * box.outerW * outerD;
  return {
    box,
    strategy,
    piles: kept,
    placed,
    ended,
    pieces,
    net,
    board,
    tare,
    gross: net + board + tare,
    material,
    outerD,
    innerD,
    tallest,
    volume,
    score: volume > 0 ? material / volume : 0,
    tower: outerD > Math.min(box.outerL, box.outerW) + 1e-6,
  };
}

/** Deal units over piles so heights stay even: each unit goes to the lowest pile. */
function deal(units: number[], piles: DraftPile[]) {
  for (const n of units) {
    let low = piles[0];
    for (const p of piles) if (pileHeight(p) < pileHeight(low) - 1e-9) low = p;
    low.units.push(n);
  }
  // full units at the bottom, a part unit on top
  for (const p of piles) p.units.sort((a, b) => b - a);
}

function dropEmpty(piles: DraftPile[]): DraftPile[] {
  const keep = piles.map((p) => p.units.length > 0);
  // a host whose child is kept must stay
  for (let i = piles.length - 1; i >= 0; i--) if (keep[i] && piles[i].host >= 0) keep[piles[i].host] = true;
  const index = new Map<number, number>();
  const out: DraftPile[] = [];
  piles.forEach((p, i) => {
    if (!keep[i]) return;
    index.set(i, out.length);
    out.push(p);
  });
  for (const p of out) {
    if (p.host >= 0) p.host = index.get(p.host)!;
    p.hasChild = false;
  }
  for (const p of out) if (p.host >= 0) out[p.host].hasChild = true;
  return out;
}

/**
 * A fill computed for an earlier, larger remainder can be reused when every
 * line it placed was stopped by space or weight (not by running out), and at
 * least as much of each is still waiting.
 */
export function stillValid(f: BoxFill, remaining: Record<string, number>): boolean {
  for (const id of Object.keys(f.placed)) {
    const n = f.placed[id];
    if (n === 0) continue;
    if (f.ended[id] !== 'blocked') return false;
    if ((remaining[id] ?? 0) < n) return false;
  }
  return true;
}
