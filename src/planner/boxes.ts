import { INCH } from '../model/defaults';
import type { BoxSize, PlanSettings, UnplacedLine } from '../model/types';
import { fillBox, marginOf, stillValid, type BoxFill, type BoxGeom, type FillStrategy, type NestRules } from './boxFill';
import type { LinePack } from './units';

const STRATEGIES: FillStrategy[] = ['row', 'col'];

/** One plan never builds more boxes than this; anything left is reported, not dropped. */
export const MAX_BOXES = 2000;

const total = (r: Record<string, number>) => Object.values(r).reduce((a, n) => a + n, 0);

export function ladderGeom(b: BoxSize, s: PlanSettings): BoxGeom {
  const maxDepth = b.maxDepth > 0 ? b.maxDepth : s.maxBoxDepth;
  return {
    key: `L${b.id}`,
    sizeId: b.id,
    name: b.name || `${Math.round(b.outerL / INCH)}″ box`,
    outerL: b.outerL,
    outerW: b.outerW,
    maxDepth,
    wall: b.wall,
    base: b.base,
    lid: b.lid,
    skid: b.skid,
    innerL: b.outerL - 2 * b.wall,
    innerW: b.outerW - 2 * b.wall,
    maxPile: maxDepth - b.base - b.lid - b.skid - s.headroom,
  };
}

export function customGeom(sideIn: number, s: PlanSettings): BoxGeom {
  const side = sideIn * INCH;
  return {
    key: `C${sideIn}`,
    sizeId: null,
    name: `${sideIn}″ made to measure`,
    outerL: side,
    outerW: side,
    maxDepth: s.maxBoxDepth,
    wall: s.wall,
    base: s.base,
    lid: s.lid,
    skid: s.skid,
    innerL: side - 2 * s.wall,
    innerW: side - 2 * s.wall,
    maxPile: s.maxBoxDepth - s.base - s.lid - s.skid - s.headroom,
  };
}

/** True when an empty box of this size takes one unit of the line. */
export function holds(g: BoxGeom, p: LinePack, s: PlanSettings): boolean {
  const need = p.foot + 2 * marginOf(p, s);
  return need <= Math.min(g.innerL, g.innerW) + 1e-9 && p.height(p.perUnit) <= g.maxPile + 1e-9 && (s.maxBoxWeight <= 0 || p.weight(p.perUnit) <= s.maxBoxWeight);
}

/** Box sizes worth trying for a lead line: ladder sizes in stock, then made-to-measure squares in whole inches. */
function candidates(lead: LinePack, ladder: BoxSize[], used: Record<string, number>, s: PlanSettings): BoxGeom[] {
  const out: BoxGeom[] = [];
  if (s.boxSizing !== 'custom')
    for (const b of ladder) {
      if (!b.enabled || (b.available > 0 && (used[b.id] ?? 0) >= b.available)) continue;
      const g = ladderGeom(b, s);
      if (holds(g, lead, s)) out.push(g);
    }
  if (s.boxSizing === 'custom' || (s.boxSizing === 'ladder-custom' && out.length === 0)) {
    const min = Math.ceil((lead.foot + 2 * marginOf(lead, s) + 2 * s.wall) / INCH - 1e-9);
    const max = Math.floor(s.maxCustomSide / INCH + 1e-9);
    for (let i = min; i <= max && i <= 2 * min + 6; i += i < min + 12 ? 1 : 2) {
      const g = customGeom(i, s);
      if (holds(g, lead, s)) out.push(g);
    }
  }
  return out;
}

/** Smaller outside volume first; at equal volume a stock size, then a lower box. */
function smaller(a: BoxFill, b: BoxFill) {
  if (Math.abs(a.volume - b.volume) > 1) return a.volume < b.volume;
  if ((a.box.sizeId !== null) !== (b.box.sizeId !== null)) return a.box.sizeId !== null;
  return a.outerD < b.outerD;
}

function pick(cands: BoxFill[], left: number): BoxFill {
  // the works avoids a box deeper than it is wide when anything else will do
  const flat = cands.filter((c) => !c.tower);
  const pool = flat.length ? flat : cands;
  const finishers = pool.filter((c) => c.pieces === left);
  if (finishers.length) return finishers.reduce((a, c) => (smaller(c, a) ? c : a));
  let best = pool[0];
  for (const c of pool) if (c.score > best.score + 1e-12 || (Math.abs(c.score - best.score) <= 1e-12 && smaller(c, best))) best = c;
  // within 3 % of the densest, prefer the one that takes more
  let out = best;
  for (const c of pool) if (c.score >= best.score * 0.97 && c.material > out.material + 1e-6) out = c;
  return out;
}

/**
 * Packs one group (what may share a box) into as few, as small boxes as the
 * rules allow. For each box every candidate size × row direction is filled:
 * if some fill takes everything left the smallest wins; otherwise the densest,
 * preferring one within 3 % that takes more.
 */
export function packGroup(
  packs: LinePack[],
  qty: Record<string, number>,
  ladder: BoxSize[],
  used: Record<string, number>,
  s: PlanSettings,
  rules: NestRules,
  budget: { boxes: number },
): { fills: BoxFill[]; unplaced: UnplacedLine[] } {
  const sorted = [...packs].sort((a, b) => b.foot - a.foot || b.line.od - a.line.od || a.line.id.localeCompare(b.line.id));
  const remaining: Record<string, number> = {};
  for (const p of sorted) remaining[p.line.id] = qty[p.line.id] ?? 0;
  const fills: BoxFill[] = [];
  const unplaced: UnplacedLine[] = [];
  const memo = new Map<string, BoxFill>();

  for (let guard = 0; guard < 4 * MAX_BOXES && budget.boxes < MAX_BOXES; guard++) {
    const lead = sorted.find((p) => remaining[p.line.id] > 0);
    if (!lead) break;
    const cands = candidates(lead, ladder, used, s);
    const fit: BoxFill[] = [];
    for (const g of cands)
      for (const st of STRATEGIES) {
        const key = `${g.key}|${st}`;
        const prev = memo.get(key);
        const f = prev && stillValid(prev, remaining) ? prev : fillBox(g, sorted, remaining, s, st, rules);
        memo.set(key, f);
        if ((f.placed[lead.line.id] ?? 0) > 0) fit.push(f);
      }
    if (fit.length === 0) {
      unplaced.push({ typeId: lead.line.id, quantity: remaining[lead.line.id], reason: whyNot(lead, ladder, used, s) });
      remaining[lead.line.id] = 0;
      continue;
    }
    const best = pick(fit, total(remaining));
    fills.push(best);
    budget.boxes += 1;
    if (best.box.sizeId) used[best.box.sizeId] = (used[best.box.sizeId] ?? 0) + 1;
    for (const id of Object.keys(best.placed)) remaining[id] -= best.placed[id];
  }
  for (const p of sorted)
    if (remaining[p.line.id] > 0)
      unplaced.push({ typeId: p.line.id, quantity: remaining[p.line.id], reason: `The plan stops at ${MAX_BOXES} boxes. Split the PRN.` });
  return { fills, unplaced };
}

/** Floor of the box taken by its floor piles, each grown by half the pile gap. */
function floorShare(f: BoxFill, s: PlanSettings) {
  const area = f.piles.filter((p) => p.host < 0).reduce((a, p) => a + (p.pack.foot + s.pileGap) ** 2, 0);
  return area / ((f.box.innerL + s.pileGap) * (f.box.innerW + s.pileGap));
}

/**
 * Fewer boxes means fewer lids to nail and straps to tension. Two boxes, at
 * least one of them underfilled, are replaced by one when a single box takes
 * everything from both. Only boxes that may share are tried together.
 */
export function mergeUnderfilled(
  fills: BoxFill[],
  keys: string[],
  packsOf: (key: string) => LinePack[],
  ladder: BoxSize[],
  used: Record<string, number>,
  s: PlanSettings,
  rules: NestRules,
) {
  const weak = (f: BoxFill) => floorShare(f, s) < 0.6 || f.tallest < 0.4 * f.box.maxPile;
  for (let round = 0; round < 30; round++) {
    let merged = false;
    // leftovers end up in the last boxes of a group, so only those are paired
    const tail = new Set<number>();
    const seen = new Map<string, number>();
    for (let i = fills.length - 1; i >= 0; i--) {
      const n = seen.get(keys[i]) ?? 0;
      if (n < 16) tail.add(i);
      seen.set(keys[i], n + 1);
    }
    search: for (let a = 0; a < fills.length; a++) {
      if (!tail.has(a)) continue;
      for (let b = a + 1; b < fills.length; b++) {
        if (!tail.has(b) || keys[a] !== keys[b]) continue;
        const A = fills[a];
        const B = fills[b];
        if (!weak(A) && !weak(B)) continue;
        if (s.maxBoxWeight > 0 && A.net + A.board + B.net + B.board > s.maxBoxWeight) continue;
        const union: Record<string, number> = {};
        for (const f of [A, B]) for (const [id, n] of Object.entries(f.placed)) union[id] = (union[id] ?? 0) + n;
        const want = total(union);
        const packs = packsOf(keys[a]).filter((p) => (union[p.line.id] ?? 0) > 0);
        const lead = [...packs].sort((x, y) => y.foot - x.foot)[0];
        if (!lead) continue;
        const free = { ...used };
        for (const f of [A, B]) if (f.box.sizeId) free[f.box.sizeId] = (free[f.box.sizeId] ?? 1) - 1;
        let best: BoxFill | null = null;
        for (const g of candidates(lead, ladder, free, s))
          for (const st of STRATEGIES) {
            const f = fillBox(g, [...packs].sort((x, y) => y.foot - x.foot), union, s, st, rules);
            if (f.pieces === want && (!best || smaller(f, best))) best = f;
          }
        if (best && best.volume <= A.volume + B.volume + 1) {
          for (const f of [A, B]) if (f.box.sizeId) used[f.box.sizeId] -= 1;
          if (best.box.sizeId) used[best.box.sizeId] = (used[best.box.sizeId] ?? 0) + 1;
          fills[a] = best;
          fills.splice(b, 1);
          keys.splice(b, 1);
          merged = true;
          break search;
        }
      }
    }
    if (!merged) return;
  }
}

function whyNot(p: LinePack, ladder: BoxSize[], used: Record<string, number>, s: PlanSettings): string {
  const need = p.foot + 2 * marginOf(p, s);
  const h = p.height(p.perUnit);
  if (s.maxBoxWeight > 0 && p.weight(p.perUnit) > s.maxBoxWeight)
    return `One ${p.kind === 'bundle' ? 'bundle' : 'unit'} weighs ${p.weight(p.perUnit).toFixed(1)} kg, over the ${s.maxBoxWeight} kg box limit.`;
  if (h > s.maxBoxDepth - s.base - s.lid - s.skid - s.headroom) return `One unit is ${Math.round(h)} mm tall, more than the deepest box allows.`;
  if (s.boxSizing === 'ladder') {
    const fits = ladder.filter((b) => b.enabled && holds(ladderGeom(b, s), p, s));
    if (fits.length && fits.every((b) => b.available > 0 && (used[b.id] ?? 0) >= b.available)) return 'Every stock box size that fits is used up.';
    return `Needs a box at least ${Math.ceil(need)} mm inside; no stock size is that big. Allow made-to-measure boxes.`;
  }
  return `Needs a box at least ${Math.ceil(need)} mm inside, larger than the ${Math.round(s.maxCustomSide / INCH)}″ limit.`;
}
