import type { Crate, Line, Settings } from '../model/types';
import { readPrn } from '../parse/readPrn';
import { packCrates } from './crates';
import { packStandard } from './sizes';
import { space } from './load';
import { makePiles, nest } from './nest';

/**
 * The works' own packing history: orders as they were really packed, read off
 * the signed packing check lists (annexure box sizes in inches, gross kg, and
 * the lines with their box numbers). Used to score and tune the planner.
 *
 * `split` keeps a fifth of the orders out of tuning: `test` orders are only
 * ever scored, never tuned on, so their score says how the planner does on
 * orders it has not seen.
 */
export interface Order {
  prn: string;
  customer: string;
  date: string;
  split: 'train' | 'test' | 'excluded';
  why?: string;
  boxes: { no: number; L: number; B: number; H: number; pcs: number; kg: number | null }[];
  lines: { sl: number; desc: string; qty: number; uom: string; box: string }[];
  doubts: string[];
}

export interface BoxFit {
  real: { L: number; B: number; H: number } | null;
  plan: { L: number; B: number; H: number } | null;
  fit: number; // 0–1
}

export interface OrderScore {
  prn: string;
  split: Order['split'];
  score: number; // 0–100
  realBoxes: number;
  planBoxes: number;
  realVol: number; // cubic inches
  planVol: number;
  realKg: number | null;
  planKg: number;
  pairs: BoxFit[];
  unread: string[]; // lines the planner could not size; their boxes are left out
}

const IN = 25.4;

/** The order's lines as the planner reads them: the description and the quantity, as on a check list. */
export function orderLines(o: Order): { lines: Line[]; unread: string[] } {
  const rows = [['SL No', 'Description', 'Qty'], ...o.lines.map((l) => [String(l.sl), l.desc, String(l.qty)])];
  const read = readPrn(rows);
  return { lines: read.lines, unread: read.skipped.map((s) => s.text) };
}

const range = (t: string) => {
  const [a, b] = t.split('-').map(Number);
  return Array.from({ length: b - a + 1 }, (_, k) => a + k);
};
const boxesOf = (b: string) =>
  b
    .split(/[,\s]+/)
    .flatMap((t) => (/^\d+-\d+$/.test(t) ? range(t) : [Number(t)]))
    .filter((n) => n > 0);

/** Boxes the real packer used for lines the planner can read: a box holding only unread lines is left out of the comparison. */
function realBoxes(o: Order, unread: string[]) {
  const readBoxes = new Set<number>();
  for (const l of o.lines) if (!unread.includes(l.desc)) boxesOf(l.box).forEach((n) => readBoxes.add(n));
  // a box no line names (a check list that put every line in box 1) still counts
  const named = new Set(o.lines.flatMap((l) => boxesOf(l.box)));
  return o.boxes.filter((b) => readBoxes.has(b.no) || !named.has(b.no));
}

/** Outside size of a crate in inches, the long side first. */
function inches(c: Crate) {
  const [L, B] = [c.outer.L, c.outer.W].sort((a, b) => b - a);
  return { L: L / IN, B: B / IN, H: c.outer.H / IN };
}

const ratio = (a: number, b: number) => (a > 0 && b > 0 ? Math.min(a, b) / Math.max(a, b) : 0);

/**
 * Crates only: stacks, nesting and crates, as the plan makes them, without
 * loading them on a vehicle (crates are sized for the widest deck on the list).
 */
export function cratesFor(lines: Line[], s: Settings): Crate[] {
  const piles = makePiles(lines, s);
  const groups = nest(piles, s);
  const deckW = Math.max(...s.vehicles.map((v) => space(v, s).W));
  return s.useSizes && s.crateSizes?.length ? packStandard(groups, s, deckW, s.crateSizes) : packCrates(groups, s, deckW);
}

/**
 * How close the planner's crates come to the boxes the works really used.
 * Real and planned boxes are paired biggest with biggest; a pair scores the
 * product of its three size ratios (long side, short side, height), so a box
 * 10 % too big every way scores 0.75. A box with no partner scores 0. The
 * order's score is the pairs' total over the larger of the two box counts,
 * as a percentage: 100 is the same number of boxes at the same sizes.
 */
export function scoreOrder(o: Order, s: Settings): OrderScore {
  const { lines, unread } = orderLines(o);
  const real = realBoxes(o, unread)
    .map((b) => {
      const [L, B] = [b.L, b.B].sort((x, y) => y - x);
      return { L, B, H: b.H, kg: b.kg };
    })
    .sort((a, b) => b.L * b.B * b.H - a.L * a.B * a.H);
  const crates = cratesFor(lines, s);
  const plan = crates.map(inches).sort((a, b) => b.L * b.B * b.H - a.L * a.B * a.H);
  const n = Math.max(real.length, plan.length);
  const pairs: BoxFit[] = [];
  for (let i = 0; i < n; i++) {
    const r = real[i] ?? null;
    const p = plan[i] ?? null;
    const fit = r && p ? ratio(r.L, p.L) * ratio(r.B, p.B) * ratio(r.H, p.H) : 0;
    pairs.push({ real: r && { L: r.L, B: r.B, H: r.H }, plan: p, fit });
  }
  const vol = (b: { L: number; B: number; H: number }) => b.L * b.B * b.H;
  const kgs = real.map((b) => b.kg);
  return {
    prn: o.prn,
    split: o.split,
    score: n ? (100 * pairs.reduce((a, p) => a + p.fit, 0)) / n : 0,
    realBoxes: real.length,
    planBoxes: plan.length,
    realVol: real.reduce((a, b) => a + vol(b), 0),
    planVol: plan.reduce((a, b) => a + vol(b), 0),
    realKg: kgs.every((k) => k != null) ? kgs.reduce((a, k) => a + (k as number), 0) : null,
    planKg: crates.reduce((a, c) => a + c.gross, 0),
    pairs,
    unread,
  };
}

export interface SetScore {
  score: number; // mean order score, 0–100
  boxCount: number; // share of orders with the right number of boxes
  volume: number; // planned over real volume, all orders together
  sideErr: number; // mean absolute error of the long side, inches, over paired boxes
  heightErr: number; // the same for the height
  orders: OrderScore[];
}

export function scoreSet(orders: Order[], s: Settings): SetScore {
  const out = orders.map((o) => scoreOrder(o, s));
  const pairs = out.flatMap((o) => o.pairs).filter((p) => p.real && p.plan);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    score: mean(out.map((o) => o.score)),
    boxCount: mean(out.map((o) => (o.realBoxes === o.planBoxes ? 1 : 0))),
    volume: out.reduce((a, o) => a + o.planVol, 0) / Math.max(1e-9, out.reduce((a, o) => a + o.realVol, 0)),
    sideErr: mean(pairs.map((p) => Math.abs(p.plan!.L - p.real!.L))),
    heightErr: mean(pairs.map((p) => Math.abs(p.plan!.H - p.real!.H))),
    orders: out,
  };
}

const f1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const box = (b: { L: number; B: number; H: number } | null) => (b ? `${f1(b.L)}×${f1(b.B)}×${f1(b.H)}` : '—');

/** A plain-text table of the scores, one row per order. */
export function report(title: string, r: SetScore): string {
  const rows = r.orders.map((o) => {
    const pairs = o.pairs.map((p) => `${box(p.real)} ↔ ${box(p.plan)}`).join('; ');
    const kg = `${o.realKg != null ? Math.round(o.realKg) : '—'}/${Math.round(o.planKg)} kg`;
    return `  ${o.prn} ${o.score.toFixed(0).padStart(3)}  boxes ${o.realBoxes}/${o.planBoxes}  ${kg}  ${pairs}${o.unread.length ? `  (unread: ${o.unread.join(' | ')})` : ''}`;
  });
  return [
    `${title}: score ${r.score.toFixed(1)} / 100 · right box count ${Math.round(r.boxCount * 100)} % · volume ${(r.volume * 100).toFixed(0)} % of real · long side off ${r.sideErr.toFixed(1)} in · height off ${r.heightErr.toFixed(1)} in`,
    '  (real ↔ planned, inches, outside; gross kg real/planned)',
    ...rows,
  ].join('\n');
}
