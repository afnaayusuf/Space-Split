/**
 * Tunes the planner with standard crate sizes to the works' packing history.
 *
 *   npm run tune:sizes
 *
 * Every order is scored as a new order would be (history.ts, scoreAsNew): the
 * standard sizes are the box sizes of the other train orders, so an order can
 * only find its own box if another order used the same size. Only the train
 * orders choose the settings; the test orders are scored once at the end, with
 * the train orders' sizes as the list.
 *
 * The search is coordinate descent over the box allowances and the stacking
 * settings. How big a gain a move must bring (`minGain`) is chosen by 5-fold
 * cross-validation inside the train orders, so that the search does not chase
 * noise; the cross-validated score is printed as the expected score on new orders.
 */
import { DEFAULTS } from '../model/presets';
import type { Settings } from '../model/types';
import { scoreAsNew, type Order } from './history';
import data from './history.json';

const orders = data as unknown as Order[];
const train = orders.filter((o) => o.split === 'train');
const test = orders.filter((o) => o.split === 'test');

type Value = number | boolean | string;
const SPACE: Partial<Record<keyof Settings, Value[]>> = {
  sizeWall: [0, 2, 3, 5, 8, 12],
  sizeBase: [0, 5, 10, 15, 20, 30],
  sizeTop: [0, 5, 10, 15, 25],
  sizeGap: [0, 2, 3, 5, 10],
  crateMaxKg: [100, 150, 200, 250, 300, 400, 500],
  sheet: [0, 1, 2, 3, 4],
  sheetEvery: [1, 2, 5, 10],
  card: [1, 2, 4, 6],
  bow: [0, 0.005, 0.0075, 0.01, 0.0125, 0.015, 0.02],
  maxPile: [60, 80, 100, 150, 200, 300, 400],
  nestMax: [0, 400, 600, 800, 1000],
  ring: [2, 5, 10, 15, 25],
  nest: [false, true],
  onTop: [0, 0.3, 0.5, 0.7],
  sizePick: ['volume', 'fill'] as unknown as Value[],
  sizeAlone: [0, 400, 600, 800, 1000, 1400],
  sizeFill: [0, 0.3, 0.4, 0.5, 0.6, 0.8],
};
const KNOBS = Object.keys(SPACE) as (keyof Settings)[];
const START: Settings = { ...DEFAULTS, useSizes: true };

let evals = 0;
const scoreOn = (set: Order[], pool: Order[], s: Settings) => {
  evals++;
  return scoreAsNew(set, pool, s).score;
};

function descend(start: Settings, set: Order[], minGain: number): { s: Settings; score: number } {
  let s = { ...start };
  let best = scoreOn(set, set, s);
  for (let round = 0; round < 8; round++) {
    let moved = false;
    for (const k of KNOBS) {
      let pick: { v: Value; sc: number } | null = null;
      for (const v of SPACE[k]!) {
        if (s[k] === v) continue;
        const sc = scoreOn(set, set, { ...s, [k]: v } as Settings);
        if (sc > best + minGain && (!pick || sc > pick.sc)) pick = { v, sc };
      }
      if (pick) {
        s = { ...s, [k]: pick.v } as Settings;
        best = pick.sc;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { s, score: best };
}

const t0 = Date.now();
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

// how cautious to be: 5-fold cross-validation inside the train orders
const GAINS = [0.1, 0.3, 0.6, 1, 2];
const K = 5;
const folds = Array.from({ length: K }, (_, f) => train.filter((_, i) => i % K === f));
const cv = GAINS.map((g) => {
  const scores: number[] = [];
  for (let f = 0; f < K; f++) {
    const rest = train.filter((o) => !folds[f].includes(o));
    const tuned = descend(START, rest, g).s;
    // the held-out fold scored as new orders, with the rest's sizes as the list
    scores.push(...scoreAsNew(folds[f], rest, tuned).orders.map((o) => o.score));
  }
  console.log(`  minGain ${g}: cross-validated ${mean(scores).toFixed(1)}`);
  return { g, cv: mean(scores) };
});
const pick = cv.reduce((a, b) => (b.cv > a.cv + 1e-9 ? b : a));
const base = mean(folds.flatMap((f) => scoreAsNew(f, train.filter((o) => !f.includes(o)), START).orders.map((o) => o.score)));
console.log(`cross-validation (train only): today's settings ${base.toFixed(1)}, tuned with minGain ${pick.g} ${pick.cv.toFixed(1)}`);

// tuning only goes ahead when cross-validation says it beats today's settings on orders it did not see
const final = pick.cv > base ? descend(START, train, pick.g) : { s: START, score: scoreOn(train, train, START) };
if (pick.cv <= base) console.log("cross-validation says tuning would not help on new orders: today's settings are kept");
const changed = KNOBS.filter((k) => final.s[k] !== START[k]).map((k) => `${String(k)}: ${String(START[k])} → ${String(final.s[k])}`);
console.log(`\ntuned on ${train.length} train orders (${evals} trials, ${Math.round((Date.now() - t0) / 1000)} s): ${changed.join(', ') || 'no change'}`);
console.log(`train, each as new: ${final.score.toFixed(1)} (today ${scoreOn(train, train, START).toFixed(1)})`);
console.log(`TEST (${test.length} held-out orders, scored once): ${scoreAsNew(test, train, final.s).score.toFixed(1)} (today ${scoreAsNew(test, train, START).score.toFixed(1)})`);
