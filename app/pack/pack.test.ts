import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULTS, VEHICLES } from '../model/presets';
import type { Crate, Line, Plan, Settings } from '../model/types';
import { readPrn } from '../parse/readPrn';
import { readSheets } from '../parse/sheet';
import { loadCrates } from './load';
import { makePlan } from './plan';

const E = 0.5; // mm of rounding allowed

/** 3.1's made-to-measure settings, before the defaults were tuned to the works' packing history: the mechanics tests use them. */
const CLASSIC: Settings = {
  ...DEFAULTS,
  ...{ ring: 10, pile: 20, wall: 30, top: 40, sheet: 3, sheetEvery: 1, bow: 0, maxPile: 300, nestMax: 0 },
  ...{ crateMaxSide: 2300, crateMaxH: 1000, crateMaxKg: 2000, board: 22, skid: 100, lightKg: 0, skidKg: 0 },
  ...{ square: false, stackSame: false, fill: 0, aspect: 0, onTop: 0, inch: false, card: 3, wallPct: 0, evenSplit: false },
};

function line(id: string, od: number, bore: number, thk: number, qty: number, kg = 1): Line {
  return { id, sl: id, code: id, description: id, family: 'SC', od, bore, thk, qty, kg, material: '', sizeFrom: 'prn', weightFrom: 'prn' };
}

/** Every rule the plan must keep. */
function check(plan: Plan, lines: Line[], s: Settings) {
  const step = s.inch ? 25.4 : 10; // sizes are rounded up to 10 mm, or to whole inches outside
  // every piece is in a stack, no stack over the limit, every group's layers cover its stacks
  const pcs = new Map<string, number>();
  for (const p of plan.piles) pcs.set(p.line, (pcs.get(p.line) ?? 0) + p.n);
  for (const g of lines) if (g.od > 0 && g.qty > 0) expect(pcs.get(g.id), g.id).toBe(g.qty);
  for (const p of plan.piles) expect(p.h).toBeLessThanOrEqual(s.maxPile + E);
  for (const g of plan.groups) {
    expect(g.layers.length).toBe(Math.max(...g.piles.map((p) => p.n)));
    for (const p of g.piles) expect(g.h).toBeGreaterThanOrEqual(p.h - E);
  }

  // nesting: inside a bore with `ring` clearance, `pile` clearance between neighbours, all inside the square
  for (const g of plan.groups) {
    for (const p of g.piles) expect(Math.hypot(p.x, p.y) + p.od / 2).toBeLessThanOrEqual(g.side / 2 + E);
    for (let i = 0; i < g.piles.length; i++)
      for (let j = i + 1; j < g.piles.length; j++) {
        const a = g.piles[i];
        const b = g.piles[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const inA = d + b.od / 2 <= a.bore / 2 - s.ring + E;
        const inB = d + a.od / 2 <= b.bore / 2 - s.ring + E;
        const apart = d >= a.od / 2 + b.od / 2 + s.pile - E;
        expect(inA || inB || apart, `${a.id} / ${b.id}`).toBe(true);
      }
  }

  // crates: squares inside the walls and under the lid, apart from each other, smaller on bigger, sized to the deck
  for (const c of plan.crates) {
    const t = c.inner;
    expect(c.outer.L).toBeCloseTo(t.L + 2 * (c.board ?? s.board), 3);
    for (const pg of c.groups) {
      expect(pg.x).toBeGreaterThanOrEqual(s.wall - E);
      expect(pg.y).toBeGreaterThanOrEqual(s.wall - E);
      expect(pg.x + pg.group.side).toBeLessThanOrEqual(t.L - s.wall + E);
      expect(pg.y + pg.group.side).toBeLessThanOrEqual(t.W - s.wall + E);
      expect(pg.z + pg.group.h).toBeLessThanOrEqual(t.H - s.top + E);
    }
    for (let i = 0; i < c.groups.length; i++)
      for (let j = i + 1; j < c.groups.length; j++) {
        const a = c.groups[i];
        const b = c.groups[j];
        const overlapZ = a.z < b.z + b.group.h - E && b.z < a.z + a.group.h - E;
        if (!overlapZ) continue;
        const apart =
          a.x + a.group.side + s.pile <= b.x + E ||
          b.x + b.group.side + s.pile <= a.x + E ||
          a.y + a.group.side + s.pile <= b.y + E ||
          b.y + b.group.side + s.pile <= a.y + E;
        expect(apart, `crate ${c.no}`).toBe(true);
      }
    for (const pg of c.groups.filter((q) => q.z > E)) {
      const under = c.groups.find(
        (q) => Math.abs(q.z + q.group.h - pg.z) < E && q.x <= pg.x + E && q.y <= pg.y + E && q.x + q.group.side >= pg.x + pg.group.side - E && q.y + q.group.side >= pg.y + pg.group.side - E,
      );
      expect(under, `crate ${c.no}: square ${pg.group.id} stands on a bigger square`).toBeTruthy();
      expect(under!.group.noTop, `crate ${c.no}: something on a non-stackable gasket`).toBe(false);
    }
    // the crate's centre of gravity lies inside it
    expect(Math.abs(c.cog.x)).toBeLessThanOrEqual(c.outer.L / 2);
    expect(Math.abs(c.cog.y)).toBeLessThanOrEqual(c.outer.W / 2);
    expect(c.cog.z).toBeGreaterThan(0);
    expect(c.cog.z).toBeLessThan(c.outer.H);
    if (c.groups.length > 1) {
      expect(c.net).toBeLessThanOrEqual(s.crateMaxKg + E);
      expect(t.H).toBeLessThanOrEqual(s.crateMaxH + step + E);
    }
    expect(t.L).toBeLessThanOrEqual(Math.max(s.crateMaxSide, c.cell + 2 * s.wall) + step + E);
    // made to measure: no more than one cell of slack round the squares
    const xs = c.groups.filter((q) => q.z <= E);
    expect(Math.max(...xs.map((q) => q.x + q.group.side)) + s.wall).toBeGreaterThan(t.L - c.cell - step - E);
  }

  // every crate is loaded exactly once or listed as left behind: none lost, none twice
  const times = new Map<string, number>();
  for (const l of plan.loads) for (const p of l.placed) times.set(p.crate, (times.get(p.crate) ?? 0) + 1);
  const left = new Set(plan.stranded.map((x) => x.crate));
  for (const c of plan.crates) expect((times.get(c.id) ?? 0) + (left.has(c.id) ? 1 : 0), `crate ${c.id}`).toBe(1);

  // vehicles: inside the load space, no two crates in the same space, only the two stacking rules
  const byId = new Map(plan.crates.map((c) => [c.id, c]));
  for (const l of plan.loads) {
    const v = l.vehicle;
    expect(l.kg).toBeLessThanOrEqual(v.payload + E);
    for (const p of l.placed) {
      expect(p.x).toBeGreaterThanOrEqual(s.deckWall - E);
      expect(p.y).toBeGreaterThanOrEqual(s.deckWall - E);
      expect(p.x + p.L).toBeLessThanOrEqual(v.L - s.deckWall + E);
      expect(p.y + p.W).toBeLessThanOrEqual(v.W - s.deckWall + E);
      expect(p.z + p.H).toBeLessThanOrEqual(v.H - s.deckTop + E);
    }
    for (let i = 0; i < l.placed.length; i++)
      for (let j = i + 1; j < l.placed.length; j++) {
        const a = l.placed[i];
        const b = l.placed[j];
        const overlap = a.x < b.x + b.L - E && b.x < a.x + a.L - E && a.y < b.y + b.W - E && b.y < a.y + a.W - E && a.z < b.z + b.H - E && b.z < a.z + a.H - E;
        expect(overlap, `load ${l.no}: ${a.crate} / ${b.crate}`).toBe(false);
      }
    for (const p of l.placed) if (!byId.get(p.crate)!.rotate) expect(p.turned, `crate ${p.crate} may not turn`).toBe(false);
    for (const p of l.placed.filter((q) => q.z > E)) {
      const under = l.placed.filter((q) => Math.abs(q.z + q.H - p.z) < E && q.x < p.x + p.L - E && p.x < q.x + q.L - E && q.y < p.y + p.W - E && p.y < q.y + q.W - E);
      for (const u of under) expect(byId.get(u.crate)!.stack, `load ${l.no}: crate on a non-stackable crate`).toBe(true);
      const top = byId.get(p.crate)!;
      if (p.on === 'same') {
        expect(under).toHaveLength(1);
        const u = under[0];
        expect(Math.abs(u.x - p.x) + Math.abs(u.y - p.y) + Math.abs(u.L - p.L) + Math.abs(u.W - p.W)).toBeLessThan(E);
        expect(byId.get(u.crate)!.gross).toBeGreaterThanOrEqual(top.gross - E);
      } else {
        expect(p.on).toBe('bridge');
        expect(under).toHaveLength(4);
        expect(new Set(under.map((u) => `${u.L}x${u.W}x${u.H}`)).size).toBe(1);
      }
    }
    // centre of gravity near where it should be, when the load is long enough to put it there
    // (a crate on a 2 m pickup cannot always sit right on the point; 250 mm is the least asked)
    if (l.length < v.L * 0.9) expect(Math.abs(l.cog.x - l.target)).toBeLessThan(Math.max(v.L * 0.05, 250));
  }
}

describe('planner', () => {
  it('nests smaller stacks in the bores of bigger ones, with clearance', () => {
    const lines = [line('big', 1200, 1150, 3, 10, 5), line('mid', 600, 560, 3, 10, 2), line('small', 150, 100, 3, 40, 0.3), line('tiny', 40, 30, 1.6, 2000, 0.004)];
    const plan = makePlan(lines, CLASSIC);
    check(plan, lines, CLASSIC);
    // the mid stack sits in the big bore; small ones fill orbits; one group carries them all
    const big = plan.groups.find((g) => g.piles[0].line === 'big')!;
    expect(big.piles.some((p) => p.line === 'mid')).toBe(true);
    expect(plan.groups.length).toBeLessThan(plan.piles.length);
    // by default nothing nests in a bore over `nestMax` (1200 > 1000), but the mid stack still takes the small ones
    const works = makePlan(lines, DEFAULTS);
    check(works, lines, DEFAULTS);
    expect(works.groups.find((g) => g.piles[0].line === 'big')!.piles).toHaveLength(1);
    expect(works.groups.find((g) => g.piles[0].line === 'mid')!.piles.some((p) => p.line === 'small')).toBe(true);
  });

  it('nests nothing in a gasket with ribs across its bore', () => {
    const lines = [{ ...line('ribbed', 800, 700, 4.5, 6, 2), rib: true }, line('small', 300, 200, 3, 6, 0.3)];
    const plan = makePlan(lines, DEFAULTS);
    check(plan, lines, DEFAULTS);
    expect(plan.groups).toHaveLength(2);
    expect(plan.groups.length).toBe(makePlan([{ ...lines[0], rib: false }, lines[1]], DEFAULTS).groups.length + 1);
  });

  it('sizes crates to what they hold and makes narrow ones go two or three across the deck', () => {
    const lines = Array.from({ length: 30 }, (_, i) => line(`a${i}`, 600, 0, 4.5, 60, 0.9));
    const s: Settings = { ...CLASSIC, vehicleId: 'tr40' };
    const plan = makePlan(lines, s);
    check(plan, lines, s);
    const c = plan.crates[0];
    expect(c.a).toBe(1);
    expect(c.inner.W).toBe(660);
    // 60 gaskets split into two stacks of 30; equal squares stack on each other as high as the crate allows
    const stackH = 30 * (4.5 + CLASSIC.sheet);
    const high = Math.floor((CLASSIC.crateMaxH - CLASSIC.top) / stackH);
    expect(c.inner.H).toBe(Math.ceil((high * stackH + CLASSIC.top) / 10) * 10);
    // three such crates stand side by side across a 2.45 m deck
    const rows = new Map<number, number>();
    for (const p of plan.loads[0].placed) rows.set(Math.round(p.x), (rows.get(Math.round(p.x)) ?? 0) + 1);
    expect(Math.max(...rows.values())).toBe(3);
  });

  it('keeps every rule on a mixed PRN of a few hundred lines', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lines: Line[] = [];
    for (let i = 0; i < 300; i++) {
      const od = Math.round(30 + rnd() ** 2 * 2000);
      const width = Math.max(8, Math.round(od * (0.03 + rnd() * 0.25)));
      lines.push(line(`l${i}`, od, od - 2 * width, rnd() < 0.5 ? 2.14 : 4.5, 1 + Math.floor(rnd() ** 3 * 120), +(od * 0.002).toFixed(3)));
    }
    for (const [base, stacking] of [[CLASSIC, 'never'], [CLASSIC, 'always'], [DEFAULTS, 'never'], [DEFAULTS, 'always'], [DEFAULTS, 'auto']] as const) {
      const s = { ...base, stacking };
      const plan = makePlan(lines, s);
      check(plan, lines, s);
      expect(plan.stranded).toHaveLength(0);
    }
  });

  it('stacks only same-footprint crates, or one across four', () => {
    const lines = Array.from({ length: 40 }, (_, i) => line(`a${i}`, 560, 0, 4.5, 60, 0.9));
    const s: Settings = { ...DEFAULTS, stacking: 'always', vehicleId: 't22' };
    const plan = makePlan(lines, s);
    check(plan, lines, s);
    expect(plan.loads[0].placed.some((p) => p.z > 0)).toBe(true);
  });

  it('keeps non-stackable gaskets on top and non-rotatable crates their way round', () => {
    const lines = [
      ...Array.from({ length: 12 }, (_, i) => line(`s${i}`, 560, 400, 4.5, 40, 0.9)),
      { ...line('glass', 300, 0, 10, 6, 2), stack: false },
      { ...line('fixed', 900, 700, 4.5, 30, 3), rotate: false },
    ];
    for (const stacking of ['always', 'auto'] as const) {
      const s: Settings = { ...DEFAULTS, stacking, vehicleId: 't22' };
      const plan = makePlan(lines, s);
      check(plan, lines, s);
      // each non-stackable gasket on its own square, nothing on it
      const glass = plan.piles.filter((p) => p.line === 'glass');
      expect(glass.every((p) => p.n === 1)).toBe(true);
      expect(plan.crates.some((c) => !c.stack)).toBe(true);
      expect(plan.crates.some((c) => !c.rotate)).toBe(true);
    }
  });

  it('balances each crate: its centre of gravity near the middle', () => {
    // one heavy line and many light ones fill a multi-cell crate
    const lines = [line('heavy', 600, 0, 4.5, 60, 8), ...Array.from({ length: 8 }, (_, i) => line(`l${i}`, 590, 0, 4.5, 60, 0.4))];
    const plan = makePlan(lines, DEFAULTS);
    check(plan, lines, DEFAULTS);
    // the heavy stacks are not left at one end: every crate's centre of gravity within 12 % of its middle
    // (without balancing, the heavy cell first in a 1 × 3 crate puts it a third of the way along)
    for (const c of plan.crates.filter((k) => k.a * k.b >= 2)) {
      expect(Math.abs(c.cog.x)).toBeLessThan(c.outer.L * 0.12);
      expect(Math.abs(c.cog.y)).toBeLessThan(c.outer.W * 0.12);
    }
  });

  it('on Auto, picks the smallest vehicle that carries everything', () => {
    const small = [line('a', 300, 200, 4.5, 20, 0.3), line('b', 250, 150, 4.5, 20, 0.2)];
    const plan = makePlan(small, DEFAULTS);
    check(plan, small, DEFAULTS);
    expect(plan.auto).toBe(true);
    expect(plan.loads).toHaveLength(1);
    expect(['ace', 'pick8']).toContain(plan.loads[0].vehicle.id);
    expect(plan.fleet[0].chosen).toBe(true);
  });

  const book = ['Book1.xlsx', '../Book1.xlsx'].find((f) => existsSync(f));
  it.skipIf(!book)('plans the KNPC PRN (Book1.xlsx) within the rules', async () => {
    const sheets = await readSheets('Book1.xlsx', new Uint8Array(readFileSync(book!)));
    const prn = readPrn(sheets[0].rows);
    expect(prn.lines.length).toBeGreaterThan(3900);
    const t = Date.now();
    const plan = makePlan(prn.lines, DEFAULTS);
    const ms = Date.now() - t;
    check(plan, prn.lines, DEFAULTS);
    const fill = plan.crates.reduce((a, c) => a + c.fill, 0) / plan.crates.length;
    console.log(
      `Book1: ${prn.lines.length} lines (${prn.skipped.length} skipped), ${plan.piles.length} stacks → ${plan.groups.length} squares → ${plan.crates.length} crates (avg fill ${Math.round(fill * 100)}%) → ${plan.loads.length} vehicles, ${plan.stranded.length} too big; ${Math.round(plan.gross)} kg gross; ${ms} ms`,
    );
    for (const l of plan.loads) console.log(`  load ${l.no} (${l.vehicle.name}): ${l.placed.length} crates, ${Math.round(l.kg)} kg, ${(l.length / 1000).toFixed(1)} m, CoG ${Math.round(l.cog.x)} (target ${Math.round(l.target)}), front ${Math.round(l.front)} rear ${Math.round(l.rear)}`);
    console.log('  fleet: ' + plan.fleet.slice(0, 5).map((f) => `${f.name} ×${f.count}${f.stranded ? ` (${f.stranded} left)` : ''}`).join(' · '));
    const cogOff = plan.crates.map((c) => Math.hypot(c.cog.x / c.outer.L, c.cog.y / c.outer.W));
    console.log(`  crate CoG off centre: avg ${(100 * cogOff.reduce((a, b) => a + b, 0) / cogOff.length).toFixed(1)}%, worst ${(100 * Math.max(...cogOff)).toFixed(1)}%`);
    expect(ms).toBeLessThan(30000);
  }, 90000);

  const ec = ['EasyCargo.xlsx', '../EasyCargo-ImportTemplateFile-Metric.xlsx'].find((f) => existsSync(f));
  it.skipIf(!ec)('reads the EasyCargo import template, flags and all', async () => {
    const sheets = await readSheets('EasyCargo.xlsx', new Uint8Array(readFileSync(ec!)));
    for (const sh of sheets) {
      const prn = readPrn(sh.rows);
      console.log(`EasyCargo "${sh.name}": ${prn.lines.length} lines, ${prn.skipped.length} skipped; e.g. ${prn.lines.slice(0, 3).map((g) => `${g.description} → OD ${g.od} ID ${g.bore} × ${g.thk} ×${g.qty} ${g.kg} kg ${g.stack ? 'S' : '-'}${g.tilt ? 'T' : '-'}${g.rotate ? 'R' : '-'} [${g.group}]`).join(' | ')}`);
      expect(prn.lines.length).toBeGreaterThan(0);
      expect(prn.lines.every((g) => g.stack === true && g.tilt === false && g.rotate === false)).toBe(true);
      const plan = makePlan(prn.lines, DEFAULTS);
      check(plan, prn.lines, DEFAULTS);
      // nothing in these files is wider than a truck: every crate goes on
      const widest = Math.max(...prn.lines.map((g) => g.od));
      if (widest + 2 * DEFAULTS.wall + 2 * DEFAULTS.board < 2340) expect(plan.stranded, plan.stranded.map((x) => x.why).join('; ')).toHaveLength(0);
    }
  }, 60000);
});

describe('loading', () => {
  const crate = (id: string, L: number, W: number, H: number, kg: number) =>
    ({ id, no: 0, name: id, cell: 0, a: 1, b: 1, inner: { L, W, H }, outer: { L, W, H }, board: 22, skid: 0, groups: [], net: kg, tare: 0, gross: kg, fill: 0, cog: { x: 0, y: 0, z: H / 2 }, stack: true, rotate: true }) as unknown as Crate;
  const tally = (r: ReturnType<typeof loadCrates>, crates: Crate[]) => {
    const times = new Map<string, number>();
    for (const l of r.loads) for (const p of l.placed) times.set(p.crate, (times.get(p.crate) ?? 0) + 1);
    for (const x of r.stranded) times.set(x.crate, (times.get(x.crate) ?? 0) + 1);
    return crates.map((c) => times.get(c.id) ?? 0);
  };

  it('never bridges with a crate already under another bridge', () => {
    const s = { ...DEFAULTS, stacking: 'always', bridge: true, tiers: 2 } as Settings;
    const v = VEHICLES.find((x) => x.id === 'tr40')!;
    // A1–A4 make the platform B0 bridges; A4, the lightest of its size, must not then also ride on C1–C4
    const crates = [
      crate('A0', 500, 500, 600, 200),
      ...[1, 2, 3, 4].map((i) => crate(`A${i}`, 500, 500, 400, 150 - i)),
      crate('B0', 900, 900, 400, 100),
      ...[1, 2, 3, 4].map((i) => crate(`C${i}`, 400, 400, 400, 120)),
    ];
    expect(tally(loadCrates(crates, v, s), crates)).toEqual(crates.map(() => 1));
  });

  it('keeps every vehicle within its payload, rows and towers included', () => {
    const s = { ...DEFAULTS, stacking: 'always', tiers: 2 } as Settings;
    const v = VEHICLES.find((x) => x.id === 'ace')!;
    const crates = [1, 2, 3, 4].map((i) => crate(`P${i}`, 600, 600, 500, 300));
    const r = loadCrates(crates, v, s);
    for (const l of r.loads) expect(l.kg).toBeLessThanOrEqual(v.payload);
    expect(tally(r, crates)).toEqual(crates.map(() => 1));
  });
});
