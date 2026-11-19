/**
 * The planner against the works' packing history, as data for the score card.
 *
 *   npm run scorecard          (writes scorecard/scorecard.json, then scorecard/WaveForce-scorecard.xlsx)
 *
 * For every order in app/pack/history.json the planner packs the lines with the
 * shipped settings; its crates are paired with the real boxes the same way the
 * history test scores them (biggest with biggest), and every gasket line is
 * followed into the crate the planner put it in. The workbook itself (scores as
 * formulas) is written by scripts/scorecard.py.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { CRATE_SIZES, DEFAULTS } from '../app/model/presets';
import type { Crate } from '../app/model/types';
import data from '../app/pack/history.json';
import { cratesFor, orderLines, scoreOrder, type Order } from '../app/pack/history';

const IN = 25.4;
const orders = (data as unknown as Order[]).filter((o) => o.split !== 'excluded');

// each order as if it were new: its own box sizes off the standard list, unless another order used the same size
const key = (b: { L: number; W: number; H: number }) => `${b.L}x${b.W}x${b.H}`;
const sizesOf = (o: Order) => new Set(o.boxes.filter((b) => b.L).map((b) => key({ L: b.L, W: b.B, H: b.H })));
const used = new Map<string, number>();
for (const o of orders) for (const k of sizesOf(o)) used.set(k, (used.get(k) ?? 0) + 1);
const asNew = (o: Order) => scoreOrder(o, { ...DEFAULTS, crateSizes: CRATE_SIZES.filter((b) => !sizesOf(o).has(key(b)) || used.get(key(b))! > 1) }).score;

const range = (t: string) => {
  const [a, b] = t.split('-').map(Number);
  return Array.from({ length: b - a + 1 }, (_, k) => a + k);
};
const boxesOf = (b: string) =>
  b
    .split(/[,\s]+/)
    .flatMap((t) => (/^\d+-\d+$/.test(t) ? range(t) : [Number(t)]))
    .filter((n) => n > 0);

type Dims = { L: number; B: number; H: number };
const sorted = (L: number, B: number, H: number): Dims => {
  const [a, b] = [L, B].sort((x, y) => y - x);
  return { L: a, B: b, H };
};
const inches = (c: Crate): Dims => sorted(c.outer.L / IN, c.outer.W / IN, c.outer.H / IN);
const vol = (d: Dims) => d.L * d.B * d.H;
const ratio = (a: number, b: number) => (a > 0 && b > 0 ? Math.min(a, b) / Math.max(a, b) : 0);
const fit = (a: Dims, b: Dims) => ratio(a.L, b.L) * ratio(a.B, b.B) * ratio(a.H, b.H);

const out = orders.map((o) => {
  const { lines, unread } = orderLines(o);
  const crates = cratesFor(lines, DEFAULTS);
  const check = scoreOrder(o, DEFAULTS);

  // real boxes as the history test counts them: a box holding only lines the planner cannot read is left out
  const readBoxes = new Set<number>();
  for (const l of o.lines) if (!unread.includes(l.desc)) boxesOf(l.box).forEach((n) => readBoxes.add(n));
  const named = new Set(o.lines.flatMap((l) => boxesOf(l.box)));
  const real = o.boxes
    .filter((b) => readBoxes.has(b.no) || !named.has(b.no))
    .map((b) => ({ no: b.no, ...sorted(b.L, b.B, b.H), kg: b.kg, pcs: b.pcs }))
    .sort((a, b) => vol(b) - vol(a));
  const plan = crates.map((c) => ({ no: c.no, kind: c.standard === true ? 'Standard' : c.standard === false ? 'Custom' : 'Made to measure', ...inches(c), kg: Math.round(c.gross * 10) / 10, pcs: c.groups.reduce((n, g) => n + g.group.piles.reduce((m, p) => m + p.n, 0), 0) })).sort((a, b) => vol(b) - vol(a));
  const n = Math.max(real.length, plan.length);
  const pairs = Array.from({ length: n }, (_, i) => ({ real: real[i] ?? null, plan: plan[i] ?? null }));
  const score = n ? (100 * pairs.reduce((a, p) => a + (p.real && p.plan ? fit(p.real, p.plan) : 0), 0)) / n : 0;
  if (Math.abs(score - check.score) > 1e-6) throw new Error(`${o.prn}: pairing differs from the history test (${score} vs ${check.score})`);

  // every line: its real box(es) and the planner's crate(s); the closest pair of the two is the one shown
  const crateOf = new Map<string, number[]>();
  for (const c of crates) for (const g of c.groups) for (const p of g.group.piles) crateOf.set(p.line, [...new Set([...(crateOf.get(p.line) ?? []), c.no])]);
  const realByNo = new Map(o.boxes.map((b) => [b.no, sorted(b.L, b.B, b.H)]));
  const planByNo = new Map(crates.map((c) => [c.no, inches(c)]));
  const lineRows = o.lines.map((l) => {
    const g = lines.find((x) => x.description === l.desc && x.sl === String(l.sl));
    const realNos = boxesOf(l.box).filter((no) => realByNo.has(no));
    const planNos = g ? crateOf.get(g.id) ?? [] : [];
    let best: { r: number; p: number; f: number } | null = null;
    for (const r of realNos) for (const p of planNos) {
      const f = fit(realByNo.get(r)!, planByNo.get(p)!);
      if (!best || f > best.f) best = { r, p, f };
    }
    return {
      sl: l.sl,
      desc: l.desc,
      qty: l.qty,
      read: !!g,
      family: g?.family ?? '',
      od: g?.od ?? null,
      id: g?.bore ?? null,
      thk: g?.thk ?? null,
      realBoxes: l.box,
      planCrates: planNos.join(', '),
      realBox: best ? { no: best.r, ...realByNo.get(best.r)! } : realNos.length ? { no: realNos[0], ...realByNo.get(realNos[0])! } : null,
      planCrate: best ? { no: best.p, ...planByNo.get(best.p)! } : planNos.length ? { no: planNos[0], ...planByNo.get(planNos[0])! } : null,
    };
  });

  return {
    prn: o.prn,
    customer: o.customer,
    date: o.date,
    split: o.split,
    pairs: pairs.map((p) => ({
      real: p.real && { no: p.real.no, L: p.real.L, B: p.real.B, H: p.real.H, kg: p.real.kg, pcs: p.real.pcs },
      plan: p.plan && { no: p.plan.no, kind: p.plan.kind, L: p.plan.L, B: p.plan.B, H: p.plan.H, kg: p.plan.kg, pcs: p.plan.pcs },
    })),
    lines: lineRows,
    score,
    asNew: DEFAULTS.useSizes ? asNew(o) : null,
  };
});

mkdirSync('scorecard', { recursive: true });
const settings = Object.fromEntries(Object.entries(DEFAULTS).filter(([k]) => k !== 'vehicles'));
writeFileSync('scorecard/scorecard.json', JSON.stringify({ made: new Date().toISOString().slice(0, 10), settings, orders: out }, null, 1));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
for (const split of ['train', 'test'] as const) console.log(`${split}: ${mean(out.filter((o) => o.split === split).map((o) => o.score)).toFixed(1)}`);
console.log(`scorecard/scorecard.json: ${out.length} orders`);
