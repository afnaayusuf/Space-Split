import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../model/presets';
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

  it('packs the train orders close to the works', () => {
    const r = scoreSet(train, DEFAULTS);
    console.log(report('train', r));
    expect(r.score).toBeGreaterThanOrEqual(52);
  });

  it('packs the held-out test orders close to the works', () => {
    const r = scoreSet(test, DEFAULTS);
    console.log(report('test (held out)', r));
    expect(r.score).toBeGreaterThanOrEqual(35.5);
  });
});
