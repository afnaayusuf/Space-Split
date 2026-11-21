import { describe, expect, it } from 'vitest';
import { CRATE_SIZES, DEFAULTS } from '../model/presets';
import type { Settings } from '../model/types';
import { boxSizes, orderLines, report, scoreAsNew, scoreSet, type Order } from './history';
import data from './history.json';

/**
 * The planner against the works' own packing history: 85 orders as they were
 * really packed (the signed packing check lists). Of the first 25, every fifth
 * order with boxes is held out as the test set; of the 60 that came after, every
 * third. The test orders are never used for tuning, so their score is how the
 * planner does on orders it was not tuned on.
 *
 * With standard sizes every order is scored as a new one would be: the list is
 * the box sizes of the train orders (the other train orders, for a train order),
 * so an order finds its own box only if another order used the same size.
 * The floors below are the scores the shipped defaults reach, less a point: a
 * change that packs further from the works' practice fails here.
 */
const orders = data as unknown as Order[];
const usable = orders.filter((o) => o.split !== 'excluded');
const train = orders.filter((o) => o.split === 'train');
const test = orders.filter((o) => o.split === 'test');
const MADE: Settings = { ...DEFAULTS, useSizes: false };

describe("the works' packing history", () => {
  it('holds a set of orders out for testing', () => {
    expect(orders).toHaveLength(85);
    const first = usable.filter((o) => o.prn <= '261000030');
    const later = usable.filter((o) => o.prn > '261000030');
    expect(first.filter((o) => o.split === 'test').map((o) => o.prn)).toEqual(first.filter((_, i) => i % 5 === 2).map((o) => o.prn));
    expect(later.filter((o) => o.split === 'test').map((o) => o.prn)).toEqual(later.filter((_, i) => i % 3 === 1).map((o) => o.prn));
    expect(test).toHaveLength(25);
    expect(train).toHaveLength(58);
  });

  it('reads every line but a few beyond its tables', () => {
    const unread = usable.flatMap((o) => orderLines(o).unread);
    // R61 and R96 rings, Series B spiral wound over 36", a rope; and three struck-out lines of partial shipments (quantity 0)
    expect(unread.length).toBeLessThanOrEqual(9);
  });

  it('ships every box size of the history as the standard sizes', () => {
    expect(CRATE_SIZES).toEqual(boxSizes(usable));
  });

  it('makes crates to measure close to the works', () => {
    const tr = scoreSet(train, MADE);
    const te = scoreSet(test, MADE);
    console.log(report('made to measure, train', tr));
    console.log(report('made to measure, test (held out)', te));
    expect(tr.score).toBeGreaterThanOrEqual(FLOOR.madeTrain);
    expect(te.score).toBeGreaterThanOrEqual(FLOOR.madeTest);
  });

  it("picks the works' standard sizes close to the boxes really used, as for new orders", () => {
    const tr = scoreAsNew(train, train, DEFAULTS);
    const te = scoreAsNew(test, train, DEFAULTS);
    console.log(report('standard sizes, train (each as new)', tr));
    console.log(report('standard sizes, test (held out; train sizes only)', te));
    expect(tr.score).toBeGreaterThanOrEqual(FLOOR.sizesTrain);
    expect(te.score).toBeGreaterThanOrEqual(FLOOR.sizesTest);
  });
});

// the shipped defaults reached: made to measure 38.6 train / 41.0 test; standard sizes 39.5 / 42.8
const FLOOR = { madeTrain: 37.6, madeTest: 40, sizesTrain: 38.5, sizesTest: 41.8 };
