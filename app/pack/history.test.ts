import { describe, expect, it } from 'vitest';
import { CRATE_SIZES, DEFAULTS } from '../model/presets';
import type { Settings } from '../model/types';
import { orderLines, report, scoreSet, type Order } from './history';
import data from './history.json';

/**
 * The planner against the works' own packing history: 25 orders as they were
 * really packed (the signed packing check lists). A fifth of them — every
 * fifth order with boxes — is held out as the test set: `npm run tune` never
 * sees them, so their score is how the planner does on orders it was not
 * tuned on. The floors below are the scores the shipped defaults reached
 * (train 53.1, test 36.6), less a point: a change that packs further from
 * the works' practice fails here.
 */
const orders = data as unknown as Order[];
const MADE: Settings = { ...DEFAULTS, useSizes: false };

/**
 * Standard sizes scored as if each order were new: its own box sizes are taken
 * off the list (unless another order used the same size), so the planner cannot
 * simply find the box it is scored against.
 */
const key = (b: { L: number; W: number; H: number }) => `${b.L}x${b.W}x${b.H}`;
const sizesOf = (o: Order) => new Set(o.boxes.filter((b) => b.L).map((b) => key({ L: b.L, W: b.B, H: b.H })));
const asNew = (set: Order[]) => {
  const count = new Map<string, number>();
  for (const o of orders) for (const k of sizesOf(o)) count.set(k, (count.get(k) ?? 0) + 1);
  const scores = set.map((o) => scoreSet([o], { ...DEFAULTS, crateSizes: CRATE_SIZES.filter((b) => !sizesOf(o).has(key(b)) || count.get(key(b))! > 1) }).score);
  return scores.reduce((a, b) => a + b, 0) / scores.length;
};
const train = orders.filter((o) => o.split === 'train');
const test = orders.filter((o) => o.split === 'test');

describe("the works' packing history", () => {
  it('holds a fifth of the orders out for testing', () => {
    const usable = orders.filter((o) => o.split !== 'excluded');
    expect(orders).toHaveLength(25);
    expect(test.map((o) => o.prn)).toEqual(usable.filter((_, i) => i % 5 === 2).map((o) => o.prn));
    expect(test).toHaveLength(5);
    expect(train).toHaveLength(19);
  });

  it('reads every line but the R96 ring (beyond the R-ring table)', () => {
    const unread = [...train, ...test].flatMap((o) => orderLines(o).unread);
    expect(unread).toEqual(['RTJ R96 INC625 OCT ASME B16.20']);
  });

  it('makes crates to measure close to the works', () => {
    const tr = scoreSet(train, MADE);
    const te = scoreSet(test, MADE);
    console.log(report('made to measure, train', tr));
    console.log(report('made to measure, test (held out)', te));
    expect(tr.score).toBeGreaterThanOrEqual(52);
    expect(te.score).toBeGreaterThanOrEqual(35.5);
  });

  it("picks the works' standard sizes close to the boxes really used", () => {
    // the box allowances (sizeWall, sizeBase, sizeTop, sizeGap) were calibrated on the train orders only
    const tr = scoreSet(train, DEFAULTS);
    const te = scoreSet(test, DEFAULTS);
    console.log(report('standard sizes, train', tr));
    console.log(report('standard sizes, test (held out)', te));
    expect(tr.score).toBeGreaterThanOrEqual(65.4);
    expect(te.score).toBeGreaterThanOrEqual(46.9);
  });

  it('picks standard sizes well for an order whose own boxes are not on the list', () => {
    const tr = asNew(train);
    const te = asNew(test);
    console.log(`standard sizes, each order as new: train ${tr.toFixed(1)} · test (held out) ${te.toFixed(1)}`);
    expect(tr).toBeGreaterThanOrEqual(44.4);
    expect(te).toBeGreaterThanOrEqual(43.2);
  });
});
