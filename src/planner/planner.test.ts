import { describe, expect, it } from 'vitest';
import { RowLayout } from '../geometry/rowLayout';
import { rtjDims, spwDims } from '../model/catalog';
import { DEFAULT_SETTINGS, ladderBoxes, lineFrom, worksBands } from '../model/defaults';
import { sampleInput as exampleInput } from './sample';
import type { GasketLine, PackagePlan, PlanInput, PlanSettings, RuleId } from '../model/types';
import { parseCheckList } from '../parse/checklist';
import { parseBoxCell, parseDescription } from '../parse/describe';
import { planPackaging } from './index';
import { cardSide, packLine } from './units';

const settings = (o: Partial<PlanSettings> = {}): PlanSettings => ({ ...DEFAULT_SETTINGS, bands: worksBands(), ...o });

function job(lines: GasketLine[], rule: RuleId, o: Partial<PlanSettings> = {}): PlanInput {
  return { ...exampleInput(), lines, boxSizes: ladderBoxes(), settings: settings({ rule, ...o }) };
}

/** size of each nested line → size of the line around it */
function nests(plan: PackagePlan): Record<number, number> {
  const size = new Map(plan.types.map((t) => [t.id, t.size]));
  const out: Record<number, number> = {};
  for (const b of plan.boxes)
    for (const st of b.stacks) if (st.host !== null) out[size.get(st.typeId)!] = size.get(b.stacks[st.host - 1].typeId)!;
  return out;
}

describe('reading the works descriptions', () => {
  it('reads size, class and leaves a ring code out of the quantity', () => {
    const p = parseDescription('SPW 30"X300# 316-OR+316/FG+316-IR');
    expect(p).toMatchObject({ family: 'SPW', size: 30, rating: 300, quantity: 0 });
    expect(p.material).toBe('316-OR+316/FG+316-IR');
  });
  it('does not read a standard number as a quantity, and reads the series', () => {
    const p = parseDescription('SPW 30"X150# SS316/GR SERIES-B ASME B16.47');
    expect(p.quantity).toBe(0);
    expect(p.series).toBe('B');
  });
  it('takes the gasket thickness, not the ring thickness', () => {
    const p = parseDescription('SPW 5"X300# 4.5MM GASKET THK 3MM RING THK');
    expect(p.thickness).toBe(4.5);
    expect(p.ringThickness).toBe(3);
  });
  it('reads ring joints and their materials', () => {
    expect(parseDescription('RTJ R24 SI OCT')).toMatchObject({ family: 'RTJ', ringNo: 'R24', material: 'Soft iron', style: 'oct' });
    expect(parseDescription('RTJ R16 F5 OCT').material).toMatch(/^F5/);
    expect(parseDescription('RTJ R16 SS316L OCT').material).toBe('SS316L');
  });
  it('reads soft cut, not spiral wound', () => {
    expect(parseDescription('SC (RF) 20"X150# NON ASBESTOS BS7531')).toMatchObject({ family: 'SC', size: 20, rating: 150, material: 'CNAF BS7531' });
    expect(parseDescription('SC (FF) 8"X150# BUTYL')).toMatchObject({ family: 'SC', material: 'Butyl rubber' });
  });
  it('reads quick entry with a quantity and fractional sizes', () => {
    expect(parseDescription('SPW 6" 150# 316L/Graphite x 200')).toMatchObject({ family: 'SPW', size: 6, rating: 150, quantity: 200 });
    expect(parseDescription('SPW 1.1/2" 300#').size).toBe(1.5);
    expect(parseDescription('SPW 2 1/2" 150#').size).toBe(2.5);
    expect(parseDescription('SPW DN150 PN40').size).toBe(6);
  });
  it('splits a Box No cell across boxes', () => {
    expect(parseBoxCell('2,3,4 (50/50/10)')).toEqual([
      { box: '2', qty: 50 },
      { box: '3', qty: 50 },
      { box: '4', qty: 10 },
    ]);
    expect(parseBoxCell('5')).toEqual([{ box: '5', qty: null }]);
  });
  it('fills a check list from the works columns', () => {
    const text = [
      'SL\tPO SL\tTYPE\tCust Item Code\tDescription Of Goods\tTotal Qty\tActual Qty\tUOM\tBox No',
      '1\t10\tSPW\tA-1\tSPW 6"X150# SS316/GR CS-OR SS316-IR\t24\t24\tNOS\t1',
      '2\t20\tRTJ\tA-2\tRTJ R24 SI OCT\t12\t12\tNOS\t2,3 (6/6)',
    ].join('\n');
    const { lines } = parseCheckList(text);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ family: 'SPW', size: 6, rating: 150, od: 222.3, innerD: 157.2, quantity: 24, itemCode: 'A-1', boxNo: '1' });
    expect(lines[1]).toMatchObject({ family: 'RTJ', ringNo: 'R24', quantity: 12, boxNo: '2,3 (6/6)' });
  });
});

describe('standard sizes', () => {
  it('has the B16.20 rings the works nests', () => {
    expect(spwDims(24, 150)).toMatchObject({ od: 717.6, innerD: 603.3 });
    expect(spwDims(20, 150)!.od).toBe(606.6);
    // the 14″ bore has 9.4 mm of slack for the 10″
    expect(spwDims(14, 150)!.innerD - spwDims(10, 150)!.od).toBeCloseTo(9.4);
  });
  it('sizes an R49 carton at 283 mm', () => {
    const g = lineFrom('RTJ R49 SI OCT', { quantity: 1 });
    expect(rtjDims('R49')!.od).toBeCloseTo(280.99);
    expect(packLine(g, 'export', settings(), () => undefined).foot).toBe(283);
  });
  it('lays a 14″ ring on the 18″ square', () => {
    expect(cardSide(450.9, settings()).side).toBeCloseTo(457.2);
  });
});

describe('the works nesting chains', () => {
  it('export, Class 150: 24⊃18⊃12⊃8⊃5, 22⊃16, 20⊃14⊃10', () => {
    const sizes = [24, 22, 20, 18, 16, 14, 12, 10, 8, 5];
    const lines = sizes.map((n) => lineFrom(`SPW ${n}"X150# SS316/GR CS-OR SS316-IR`, { itemCode: `S${n}`, quantity: n <= 8 ? 10 : 5 }));
    const plan = planPackaging(job(lines, 'export'));
    expect(plan.issues).toEqual([]);
    expect(nests(plan)).toEqual({ 18: 24, 12: 18, 8: 12, 5: 8, 16: 22, 14: 20, 10: 14 });
  });
  it('domestic: 10⊃6⊃3 and 8⊃5⊃2½', () => {
    const sizes = [10, 8, 6, 5, 3, 2.5];
    const lines = sizes.map((n) => lineFrom(`SPW ${n}"X150# SS316/GR CS-OR SS316-IR`, { itemCode: `S${n}`, quantity: n === 10 ? 5 : n >= 6 ? 10 : 24 }));
    const plan = planPackaging(job(lines, 'domestic'));
    expect(plan.issues).toEqual([]);
    expect(nests(plan)).toEqual({ 6: 10, 3: 6, 5: 8, 2.5: 5 });
    expect(plan.warnings.some((w) => /5″ is outside the domestic bundle bands/.test(w))).toBe(true);
  });
  it('never nests across pressure classes', () => {
    const lines = [lineFrom('SPW 24"X150#', { quantity: 5 }), lineFrom('SPW 18"X300#', { quantity: 5 })];
    const plan = planPackaging(job(lines, 'export'));
    expect(Object.keys(nests(plan))).toHaveLength(0);
    const any = planPackaging(job(lines, 'export', { nestAnyRating: true }));
    expect(any.boxes.flatMap((b) => b.stacks).some((s) => s.host !== null)).toBe(true);
  });
});

describe('packing types', () => {
  it('bundles by the export sheet and nests the bundle', () => {
    const plan = planPackaging(job([lineFrom('SPW 24"X150#', { quantity: 12 })], 'export'));
    const st = plan.boxes[0].stacks[0];
    expect(st.kind).toBe('bundle');
    expect(st.perUnit).toBe(5);
    expect(st.units).toBe(3);
  });
  it('domestic lays 12″ and up singly on corrugated squares, ten to a square', () => {
    const plan = planPackaging(job([lineFrom('SPW 14"X150#', { quantity: 23 }), lineFrom('SPW 6"X150#', { quantity: 30 })], 'domestic'));
    expect(plan.issues).toEqual([]);
    const carded = plan.boxes.flatMap((b) => b.stacks).filter((s) => s.kind === 'carded');
    expect(carded.reduce((a, s) => a + s.count, 0)).toBe(23);
    expect(carded.reduce((a, s) => a + s.cards, 0)).toBe(3);
    // the carded ring keeps to its own box
    for (const b of plan.boxes) expect(new Set(b.stacks.map((s) => s.kind === 'carded')).size).toBe(1);
  });
  it('keeps gasket types apart, except the small sizes when allowed', () => {
    const lines = [lineFrom('SPW 2"X150#', { quantity: 50 }), lineFrom('SC (RF) 2"X150# CNAF', { quantity: 48 }), lineFrom('RTJ R24 SI OCT', { quantity: 6 })];
    const mixed = planPackaging(job(lines, 'export'));
    expect(mixed.issues).toEqual([]);
    expect(mixed.boxes).toHaveLength(1);
    const apart = planPackaging(job(lines, 'export', { mixSmall: false }));
    expect(apart.issues).toEqual([]);
    for (const b of apart.boxes) expect(new Set(b.stacks.map((s) => apart.types.find((t) => t.id === s.typeId)!.family)).size).toBe(1);
  });
  it('KNPC: a square between every ring, one item code per box', () => {
    const lines = [lineFrom('SPW 4"X150#', { itemCode: 'K1', quantity: 20 }), lineFrom('SPW 4"X150#', { itemCode: 'K2', quantity: 20 })];
    const plan = planPackaging(job(lines, 'knpc'));
    expect(plan.issues).toEqual([]);
    expect(plan.boxes.length).toBeGreaterThanOrEqual(2);
    for (const b of plan.boxes) for (const s of b.stacks) expect(s.kind).toBe('sheeted');
    for (const b of plan.boxes) expect(new Set(b.stacks.map((s) => s.typeId)).size).toBe(1);
  });
  it('consolidated: the whole PRN in one box', () => {
    const lines = [lineFrom('SPW 20"X150#', { quantity: 4 }), lineFrom('SPW 8"X150#', { quantity: 4 }), lineFrom('SPW 2"X150#', { quantity: 4 })];
    const plan = planPackaging(job(lines, 'consolidated'));
    expect(plan.issues).toEqual([]);
    expect(plan.boxes).toHaveLength(1);
  });
  it('boxes as given: obeys the Box No cells, splits included', () => {
    const lines = [
      lineFrom('SPW 6"X150#', { quantity: 30, boxNo: '1' }),
      lineFrom('SPW 2"X150#', { quantity: 100, boxNo: '2,3 (60/40)' }),
      lineFrom('RTJ R24 SI OCT', { quantity: 4, boxNo: '3' }),
    ];
    const plan = planPackaging(job(lines, 'given'));
    expect(plan.issues).toEqual([]);
    const byLabel = Object.fromEntries(plan.boxes.map((b) => [b.label, b.pieces]));
    expect(byLabel).toEqual({ '1': 30, '2': 60, '3': 44 });
  });
});

describe('box rules', () => {
  const plan = planPackaging(exampleInput());
  it('packs the demo PRN with every rule satisfied', () => {
    expect(plan.issues).toEqual([]);
    expect(plan.unplacedGaskets).toEqual([]);
    expect(plan.totals.pieces).toBe(plan.totals.requested);
  });
  it('keeps the clear inch under every lid and sizes boxes in whole inches', () => {
    for (const b of plan.boxes) {
      const tallest = Math.max(...b.stacks.map((s) => s.height));
      expect(b.inner.h - tallest).toBeGreaterThanOrEqual(25.4 - 1e-6);
      for (const v of [b.ext.l, b.ext.w, b.ext.h]) expect(Math.abs(v / 25.4 - Math.round(v / 25.4))).toBeLessThan(1e-6);
      expect(b.ext.h).toBeLessThanOrEqual(30 * 25.4 + 1e-6);
      expect(b.grossWeight).toBeLessThanOrEqual(300 + 1e-6);
    }
  });
  it('gives every insulation kit line its own box', () => {
    const isk = plan.types.find((t) => t.family === 'ISK')!;
    const boxes = plan.boxes.filter((b) => b.stacks.some((s) => s.typeId === isk.id));
    for (const b of boxes) expect(b.stacks.every((s) => s.typeId === isk.id)).toBe(true);
  });
  it('splits a heavy line over boxes under the 300 kg cap', () => {
    const p = planPackaging(job([lineFrom('SPW 24"X150#', { quantity: 400 })], 'export'));
    expect(p.issues).toEqual([]);
    expect(p.boxes.length).toBeGreaterThan(1);
    for (const b of p.boxes) expect(b.grossWeight).toBeLessThanOrEqual(300 + 1e-6);
  });
  it('recommends a vehicle that takes the load in one trip', () => {
    expect(plan.recommendedVehicle).not.toBeNull();
  });
});

describe('RowLayout', () => {
  it('lays equal items in a straight grid, exactly one gap apart', () => {
    const rows = new RowLayout(1000, 700, 50);
    let n = 0;
    for (let spot = rows.find('a', 100, 0); spot; spot = rows.find('a', 100, 0)) {
      rows.place(spot, 'a', 100);
      n++;
    }
    expect(n).toBe(12);
    const pos = rows.positions();
    expect(new Set(pos.map((p) => p.u)).size).toBe(4);
    expect(pos[1].u - pos[0].u).toBeCloseTo(250);
  });
  it('keeps each item’s own margin from the walls', () => {
    const rows = new RowLayout(600, 600, 20);
    const a = rows.find('a', 100, 50)!;
    rows.place(a, 'a', 100, 50);
    const b = rows.find('b', 100, 25)!;
    expect(a.u - 100).toBeGreaterThanOrEqual(50);
    expect(b.u + 100).toBeLessThanOrEqual(575);
  });
});
