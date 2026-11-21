/**
 * Packing styles: for every order of the history, how well each combination of a
 * few settings (a "style") reproduces the way the works packed it, and how many
 * boxes and how much volume that style uses.
 *
 *   vite-node scripts/styles.ts <part> <parts>     (one slice of the orders)
 *
 * Writes scorecard/styles-<part>.json: for each order, for each style, the match
 * score (0-100, as history.ts scores it), boxes and outside volume (cubic inches).
 * Orders are scored as new ones: the standard sizes are the train orders' sizes,
 * less the order's own. scripts/styles.py picks the smallest set of styles that
 * explains the history and tests the "most efficient style" pick on held-out orders.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULTS } from '../app/model/presets';
import type { Settings } from '../app/model/types';
import data from '../app/pack/history.json';
import { boxSizes, scoreOrder, type Order } from '../app/pack/history';

const [part, parts] = [Number(process.argv[2] ?? 0), Number(process.argv[3] ?? 1)];
const orders = (data as unknown as Order[]).filter((o) => o.split !== 'excluded');
const train = orders.filter((o) => o.split === 'train');

// the grid: clearances only at or above today's, never tighter
const GRID = {
  sizeGap: [10, 20, 30],
  sizeTop: [15, 30, 50],
  sizeAlone: [0, 500, 800, 1200],
  crateMaxKg: [150, 300],
  maxPile: [100, 200],
  pitch: ['tight', 'loose'],
  nest: [true, false],
} as const;

export interface Style {
  sizeGap: number;
  sizeTop: number;
  sizeAlone: number;
  crateMaxKg: number;
  maxPile: number;
  pitch: 'tight' | 'loose';
  nest: boolean;
}
const styles: Style[] = [];
for (const sizeGap of GRID.sizeGap)
  for (const sizeTop of GRID.sizeTop)
    for (const sizeAlone of GRID.sizeAlone)
      for (const crateMaxKg of GRID.crateMaxKg)
        for (const maxPile of GRID.maxPile)
          for (const pitch of GRID.pitch)
            for (const nest of GRID.nest) styles.push({ sizeGap, sizeTop, sizeAlone, crateMaxKg, maxPile, pitch, nest });

/** A style as planner settings: "loose" puts a cardboard under every gasket, 4 mm. */
export const settingsOf = (st: Style, base: Settings): Settings => ({
  ...base,
  sizeGap: st.sizeGap,
  sizeTop: st.sizeTop,
  sizeAlone: st.sizeAlone,
  crateMaxKg: st.crateMaxKg,
  maxPile: st.maxPile,
  nest: st.nest,
  ...(st.pitch === 'loose' ? { sheet: 4, sheetEvery: 1, card: 4 } : {}),
});

const mine = orders.filter((_, i) => i % parts === part);
const out = mine.map((o) => {
  const base = { ...DEFAULTS, useSizes: true, crateSizes: boxSizes(train.filter((x) => x.prn !== o.prn)) };
  const real = scoreOrder(o, base);
  return {
    prn: o.prn,
    split: o.split,
    realBoxes: real.realBoxes,
    realVol: real.realVol,
    runs: styles.map((st) => {
      const r = scoreOrder(o, settingsOf(st, base));
      return [Math.round(r.score * 10) / 10, r.planBoxes, Math.round(r.planVol)];
    }),
  };
});
mkdirSync('scorecard', { recursive: true });
writeFileSync(`scorecard/styles-${part}.json`, JSON.stringify({ styles, orders: out }));
console.log(`part ${part}: ${out.length} orders × ${styles.length} styles`);
