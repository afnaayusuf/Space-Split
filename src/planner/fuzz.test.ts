import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ladderBoxes, lineFrom, worksBands } from '../model/defaults';
import { sampleInput as exampleInput } from './sample';
import type { PlanInput, RuleId } from '../model/types';
import { planPackaging } from './index';

/** Small deterministic PRNG so failures can be replayed by seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIZES = [0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24];
const RINGS = ['R11', 'R16', 'R24', 'R37', 'R45', 'R49', 'R53', 'R65'];
const RULES: RuleId[] = ['export', 'domestic', 'knpc', 'consolidated', 'given'];

export function scenario(seed: number): PlanInput {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const rule = pick(RULES);
  const n = int(1, 9);
  const lines = Array.from({ length: n }, (_, i) => {
    const kind = pick(['SPW', 'SPW', 'SPW', 'SC', 'RTJ', 'KAM', 'ISK']);
    const size = pick(SIZES);
    const cls = pick([150, 150, 300, 600]);
    const text =
      kind === 'SPW'
        ? `SPW ${size}"X${cls}# SS316/GR`
        : kind === 'SC'
          ? `SC (RF) ${size}"X${cls}# CNAF 3MM THK`
          : kind === 'RTJ'
            ? `RTJ ${pick(RINGS)} SI OCT`
            : kind === 'KAM'
              ? `KAM ${size}"X${cls}# ${Math.round(size * 25.4 + 60)}X${Math.round(size * 25.4)}X4MM`
              : `ISK ${size}"X${cls}# ${Math.round(size * 25.4 + 80)}X${Math.round(size * 25.4)}X40MM`;
    const box = rule === 'given' ? pick(['1', '2', '1,2', '3', '']) : '';
    return lineFrom(text, { itemCode: `C${i % 4}`, sl: String(i + 1), quantity: int(1, 120), boxNo: box });
  });
  return {
    ...exampleInput(),
    lines: lines.filter((l) => l.od > 0),
    boxSizes: ladderBoxes().filter(() => r() < 0.8),
    settings: {
      ...DEFAULT_SETTINGS,
      bands: worksBands(),
      rule,
      mixSmall: r() < 0.7,
      allowNesting: r() < 0.85,
      nestAnyRating: r() < 0.2,
      boxSizing: pick(['ladder', 'ladder-custom', 'custom'] as const),
      pileGap: pick([10, 25, 50]),
      maxTiers: int(1, 3),
      allowBoxRotation: r() < 0.8,
    },
  };
}

describe('random PRNs', () => {
  it('obey every packing rule and account for every piece', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 120; seed++) {
      const plan = planPackaging(scenario(seed));
      if (plan.issues.length) failures.push(`seed ${seed}: ${plan.issues.slice(0, 3).join(' | ')}`);
      const packed = plan.boxes.reduce((a, b) => a + b.pieces, 0) + plan.unplacedGaskets.reduce((a, u) => a + u.quantity, 0);
      if (packed !== plan.totals.requested) failures.push(`seed ${seed}: ${packed} of ${plan.totals.requested} pieces accounted for`);
    }
    expect(failures).toEqual([]);
  }, 120000);
});
