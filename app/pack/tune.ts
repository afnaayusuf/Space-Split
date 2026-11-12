/**
 * Tunes the planner's settings to the works' packing history (history.json).
 *
 *   npm run tune
 *
 * Only the `train` orders choose the settings. The `test` orders — a fifth of
 * the history, every fifth order — are scored once at the end with the
 * settings found, to show how the planner does on orders it was not tuned on.
 *
 * The search is coordinate descent: each setting in turn is tried at every
 * value on its list with the others held, and the best kept, round after
 * round until nothing improves. It starts from the works' written rules, from
 * the untuned 3.1 settings and from random points, and keeps the best.
 *
 * With 19 orders a search can chase noise, so a move must gain at least
 * `minGain` points. How cautious to be is itself chosen by 5-fold
 * cross-validation inside the train orders: tune on four fifths, score the
 * fifth, for each `minGain`; the one that does best on the fifths it did not
 * see is used for the final tune on all the train orders. The cross-validation
 * starts never include today's defaults (they were tuned on these orders, so
 * the folds' "unseen" orders would have helped choose them); the final tune
 * does, so it is never worse on the train orders than what ships.
 */
import { DEFAULTS } from '../model/presets';
import type { Settings } from '../model/types';
import { report, scoreSet, type Order } from './history';
import data from './history.json';

const orders = data as unknown as Order[];
const train = orders.filter((o) => o.split === 'train');
const test = orders.filter((o) => o.split === 'test');

type Knob = keyof Settings;
type Value = number | boolean;
const SPACE: Partial<Record<Knob, Value[]>> = {
  wall: [10, 20, 30, 40, 50, 60, 75, 90],
  wallPct: [0, 0.05, 0.08, 0.1, 0.12, 0.15, 0.2],
  pile: [0, 10, 20, 30, 50],
  ring: [2, 5, 10, 15],
  top: [0, 10, 25, 40, 60],
  sheet: [0, 1, 2, 3, 4],
  sheetEvery: [1, 2, 5, 10, 25],
  card: [1, 2, 3, 4, 6, 8],
  bow: [0, 0.005, 0.0075, 0.01, 0.0125, 0.015, 0.02],
  maxPile: [100, 150, 200, 250, 300, 400, 500, 600],
  nestMax: [0, 400, 650, 800, 1000],
  crateMaxH: [300, 400, 500, 600, 700, 900],
  crateMaxKg: [150, 200, 250, 300, 400, 500, 2000],
  crateMaxSide: [700, 900, 1100, 1400, 1800, 2300],
  board: [6, 9, 12, 18, 22],
  skid: [0, 25, 50, 75, 100, 125],
  skidKg: [0, 25, 50, 100, 150, 250],
  lightKg: [0, 5, 10, 20, 40],
  lightBoard: [3, 5, 8, 12],
  onTop: [0, 0.3, 0.4, 0.5, 0.6],
  square: [false, true],
  stackSame: [false, true],
  evenSplit: [false, true],
  fill: [0, 0.3, 0.5, 0.7, 0.9],
  aspect: [0, 0.5, 1, 1.5, 2, 3],
  inch: [false, true],
};
const KNOBS = Object.keys(SPACE) as Knob[];

// a fixed seed: the same history always tunes to the same settings
let seed = 20261110;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

let trials = 0;
const scoreOn = (set: Order[], s: Settings) => {
  trials++;
  return scoreSet(set, s).score;
};

function descend(start: Settings, set: Order[], minGain: number): { s: Settings; score: number } {
  let s = { ...start };
  let best = scoreOn(set, s);
  for (let round = 0; round < 10; round++) {
    let moved = false;
    for (const k of KNOBS) {
      let pick: { v: Value; sc: number } | null = null;
      for (const v of SPACE[k]!) {
        if (s[k] === v) continue;
        const sc = scoreOn(set, { ...s, [k]: v } as Settings);
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

// 3.1's made-to-measure settings, before any tuning
const UNTUNED: Settings = {
  ...DEFAULTS,
  ...{ ring: 10, pile: 20, wall: 30, top: 40, sheet: 3, sheetEvery: 1, card: 3, bow: 0, maxPile: 300, nestMax: 0 },
  ...{ crateMaxSide: 2300, crateMaxH: 1000, crateMaxKg: 2000, board: 22, skid: 100, lightKg: 0, skidKg: 0, lightBoard: 22 },
  ...{ square: false, stackSame: false, evenSplit: false, fill: 0, aspect: 0, onTop: 0, inch: false, wallPct: 0 },
};
// the works' written rules (GasketPack 3D packing rules): 1 in headroom, 50 mm a side, OD × 1.25 % bow,
// ten rings to a corrugated square, a 3-ply square under every kammprofile and double jacketed one,
// 300 kg boxes, whole inches, ply sides
const WORKS: Settings = {
  ...UNTUNED,
  ...{ wall: 50, top: 25, bow: 0.0125, sheetEvery: 10, card: 4, crateMaxKg: 300, crateMaxH: 700, board: 12 },
  ...{ square: true, stackSame: true, inch: true, skidKg: 100, lightKg: 10, lightBoard: 5 },
};
const randomStart = (): Settings => {
  const s = { ...WORKS } as unknown as Record<string, Value>;
  for (const k of KNOBS) if (rand() < 0.5) s[k] = SPACE[k]![Math.floor(rand() * SPACE[k]!.length)];
  return s as unknown as Settings;
};

function tune(set: Order[], minGain: number, restarts: number, extra: Settings[] = []): Settings {
  const starts: Settings[] = [WORKS, UNTUNED, ...extra, ...Array.from({ length: restarts }, randomStart)];
  let win: { s: Settings; score: number } | null = null;
  for (const st of starts) {
    const r = descend(st, set, minGain);
    if (!win || r.score > win.score + 1e-9) win = r;
  }
  return win!.s;
}

const t0 = Date.now();
const GAINS = [0, 0.5, 1, 2];
const FOLDS = 5;
const RESTARTS = 6; // random starting points per tune (twice that for the final one)
const folds = Array.from({ length: FOLDS }, (_, f) => train.filter((_, i) => i % FOLDS === f));
const cv: { gain: number; score: number }[] = [];
for (const gain of GAINS) {
  const scores = folds.map((fold) => {
    const rest = train.filter((o) => !fold.includes(o));
    return scoreSet(fold, tune(rest, gain, RESTARTS)).score;
  });
  const mean = scores.reduce((a, b) => a + b, 0) / FOLDS;
  cv.push({ gain, score: mean });
  console.log(`cross-validation, min gain ${gain}: ${mean.toFixed(1)}  (folds ${scores.map((x) => x.toFixed(0)).join(' ')})`);
}
const gain = cv.reduce((a, b) => (b.score > a.score + 1e-9 ? b : a)).gain;
const tuned = tune(train, gain, RESTARTS * 2, [DEFAULTS]);
console.log(`\nmin gain ${gain}; ${trials} trials in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

const pick = (s: Settings) => Object.fromEntries(KNOBS.map((k) => [k, s[k]]));
console.log('tuned: ' + JSON.stringify(pick(tuned)));
console.log('changed from defaults: ' + KNOBS.filter((k) => tuned[k] !== DEFAULTS[k]).map((k) => `${k} ${DEFAULTS[k]} → ${tuned[k]}`).join(', '));
const out = [
  report('UNTUNED (3.1) · train', scoreSet(train, UNTUNED)),
  report('DEFAULTS · train', scoreSet(train, DEFAULTS)),
  report('TUNED · train', scoreSet(train, tuned)),
  report('TUNED · test (held out, scored once)', scoreSet(test, tuned)),
].join('\n\n');
console.log('\n' + out);
