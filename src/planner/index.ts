import { DEFAULT_FLEET, DEFAULT_SETTINGS, INCH, worksBands } from '../model/defaults';
import type {
  BandSheets,
  BoxSize,
  CargoSpec,
  Clearance,
  GasketLine,
  JobInfo,
  LinePacking,
  PackagePlan,
  PackedBox,
  PlacedStack,
  PlanInput,
  PlanSettings,
  RuleId,
  UnplacedLine,
  Vehicle,
} from '../model/types';
import { marginOf, pileHeight, type BoxFill } from './boxFill';
import { mergeUnderfilled, packGroup } from './boxes';
import { checkPlan } from './check';
import { pileDistance } from './distance';
import { planFloor } from './floor';
import { makeGroups } from './groups';
import { familyRule, packLine, type LinePack } from './units';

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const SIDES = ['xNeg', 'xPos', 'yNeg', 'yPos'] as const;

export interface PlanOptions {
  floor?: boolean; // false: boxes only (for the adviser)
  rule?: RuleId; // override the rule in the settings
}

/** Turns a PRN, the box ladder and a vehicle into a packing and loading plan under the works' rules. */
export function planPackaging(input: PlanInput, opts: PlanOptions = {}): PackagePlan {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const warnings: string[] = [];
  const warn = (m: string) => {
    if (!warnings.includes(m)) warnings.push(m);
  };
  const { lines, boxSizes, cargo, settings, job } = sanitize(input, warn);
  if (opts.rule) settings.rule = opts.rule;
  const rule = settings.rule;
  const typeById = new Map(lines.map((g) => [g.id, g]));

  const packs = lines.map((g) => packLine(g, rule, settings, warn));
  const packOf = new Map(packs.map((p) => [p.line.id, p]));
  const est = lines.filter((g) => g.weightEstimated && g.unitWeight > 0);
  if (est.length)
    warn(
      est.length === lines.length
        ? `All ${lines.length} weights per piece are estimated from the size (shown in amber). Enter chart weights, or add them to the weight master, before quoting freight.`
        : `${est.length} of ${lines.length} weights per piece ${est.length === 1 ? 'is' : 'are'} estimated from the size (shown in amber). Enter chart weights before quoting freight.`,
    );
  const noWeight = lines.filter((g) => g.unitWeight <= 0);
  if (noWeight.length)
    warn(
      noWeight.length === 1
        ? `${label(noWeight[0])}: no weight per piece; box and truck weights leave it out.`
        : `${noWeight.length} lines have no weight per piece; box and truck weights leave them out.`,
    );

  const groups = makeGroups(packs, rule, settings, warn);
  const rules = { domestic: familyRule(rule, settings) === 'domestic' };
  const used: Record<string, number> = {};
  const budget = { boxes: 0 };
  const fills: BoxFill[] = [];
  const keys: string[] = [];
  const givenOf: (string | null)[] = [];
  const groupOf: string[] = [];
  const unplaced: UnplacedLine[] = [];
  for (const gr of groups) {
    const r = packGroup(gr.packs, gr.qty, boxSizes, used, settings, rules, budget);
    for (const f of r.fills) {
      fills.push(f);
      keys.push(gr.key);
      givenOf.push(gr.given);
      groupOf.push(gr.label);
    }
    unplaced.push(...r.unplaced);
  }
  if (rule !== 'given') {
    const byKey = new Map<string, LinePack[]>();
    for (const gr of groups) byKey.set(gr.key, [...(byKey.get(gr.key) ?? []), ...gr.packs]);
    const before = fills.length;
    mergeUnderfilled(fills, keys, (k) => byKey.get(k) ?? [], boxSizes, used, settings, rules);
    // keep labels in step with the merged list
    if (fills.length !== before) {
      const relabel = fills.map((_, i) => groups.find((g) => g.key === keys[i])?.label ?? '');
      groupOf.splice(0, groupOf.length, ...relabel);
      givenOf.splice(0, givenOf.length, ...fills.map(() => null));
    }
  }

  // box numbers: the check list's own for boxes-as-given, else 1, 2, 3 in packing order
  const labels: string[] = [];
  const count = new Map<string, number>();
  fills.forEach((_, i) => {
    const g = givenOf[i];
    if (g === null) labels.push(String(i + 1));
    else {
      const k = (count.get(g) ?? 0) + 1;
      count.set(g, k);
      labels.push(k === 1 ? g : `${g}-${k}`);
      if (k === 2) warn(`Box ${g} needs more than one box: its contents are too heavy or too deep for one. The extra boxes are numbered ${g}-2, ${g}-3 …`);
    }
  });
  const boxes = fills.map((f, i) => finalizeBox(f, i + 1, labels[i], groupOf[i], typeById, settings));
  for (const b of boxes) {
    if (rule === 'given' && b.ext.h > settings.maxBoxDepth + 1) warn(`Box ${b.label} is ${Math.round(b.ext.h / INCH)}″ deep, over the ${Math.round(settings.maxBoxDepth / INCH)}″ limit.`);
  }

  let units: PackagePlan['units'] = [];
  let unloaded: number[] = [];
  let recommended: string | null = null;
  if (opts.floor !== false) {
    const floor = planFloor(boxes, cargo, settings);
    for (const b of boxes) b.location = floor.locations.get(b.uid) ?? null;
    warnings.push(...floor.warnings);
    units = floor.units;
    unloaded = floor.unloaded;
    // loading sequence: truck, then front to door, then bottom layer first
    const loaded = boxes.filter((b) => b.location);
    loaded.sort((a, b) => {
      const p = a.location!;
      const q = b.location!;
      return p.unit - q.unit || Math.round(p.x) - Math.round(q.x) || Math.round(p.y) - Math.round(q.y) || p.tier - q.tier;
    });
    loaded.forEach((b, i) => (b.location!.load = i + 1));
    // box numbers follow the loading sequence, so BOX NO 1 is the first box on the truck;
    // boxes-as-given keep the check list's own numbers
    if (rule !== 'given') {
      const order = [...loaded, ...boxes.filter((b) => !b.location)];
      order.forEach((b, i) => {
        b.no = i + 1;
        b.label = String(i + 1);
      });
      boxes.sort((a, b) => a.no - b.no);
    }
    const noOf = new Map(boxes.map((b) => [b.uid, b.no]));
    for (const u of units) u.boxUids.sort((a, b) => (boxes.find((x) => x.uid === a)!.location!.load - boxes.find((x) => x.uid === b)!.location!.load));
    const toNo = (uid: number | null) => (uid === null ? null : (noOf.get(uid) ?? null));
    for (const b of loaded) {
      const p = b.location!;
      for (const side of SIDES) p.around[side] = { gap: p.around[side].gap, to: toNo(p.around[side].to) };
      p.on = toNo(p.on);
    }
    recommended = recommendVehicle(boxes, settings, input.fleet?.length ? input.fleet : DEFAULT_FLEET);
  }

  const pieces = boxes.reduce((a, b) => a + b.pieces, 0);
  const plan: PackagePlan = {
    job,
    types: lines,
    cargo,
    settings,
    packing: packs.map((p): LinePacking => ({ typeId: p.line.id, kind: p.kind, perUnit: p.perUnit, note: p.note })),
    boxes,
    units,
    unplacedGaskets: unplaced,
    unloadedBoxUids: unloaded,
    warnings,
    issues: [],
    recommendedVehicle: recommended,
    totals: {
      boxes: boxes.length,
      pieces,
      requested: lines.reduce((a, g) => a + g.quantity, 0),
      net: boxes.reduce((a, b) => a + b.netWeight, 0),
      gross: boxes.reduce((a, b) => a + b.grossWeight, 0),
      cbm: boxes.reduce((a, b) => a + b.cbm, 0),
    },
    ms: 0,
  };
  plan.issues = checkPlan(plan, packOf);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  plan.ms = Math.round(t1 - t0);
  return plan;
}

/** The smallest vehicle in the works' fleet that takes every box in one trip. */
function recommendVehicle(boxes: PackedBox[], s: PlanSettings, fleet: Vehicle[]): string | null {
  if (boxes.length === 0 || boxes.length > 200) return null;
  const gross = boxes.reduce((a, b) => a + b.grossWeight, 0);
  const bySize = [...fleet].sort((a, b) => a.length * a.width - b.length * b.width || a.maxPayload - b.maxPayload);
  for (const p of bySize) {
    if (p.maxPayload > 0 && gross > p.maxPayload) continue;
    const cargo: CargoSpec = { presetId: p.id, name: p.name, length: p.length, width: p.width, height: p.height, maxPayload: p.maxPayload };
    const f = planFloor(boxes, cargo, s);
    if (f.units.length === 1 && f.unloaded.length === 0) return p.name;
  }
  return null;
}

const label = (g: GasketLine) => g.itemCode || g.description || `line ${g.sl}`;

function uniqueIds() {
  const seen = new Set<string>();
  return (id: string | undefined, fallback: string) => {
    let v = id || fallback;
    while (seen.has(v)) v = `${v}~`;
    seen.add(v);
    return v;
  };
}

function bandsOk(b: BandSheets | undefined): BandSheets {
  const w = worksBands();
  if (!b) return w;
  const clean = (list: unknown, def: BandSheets[keyof BandSheets]) =>
    Array.isArray(list)
      ? list
          .map((x) => ({ min: num(x?.min), max: Math.max(0, num(x?.max)), count: Math.max(1, Math.floor(num(x?.count, 1))), carded: x?.carded === true }))
          .filter((x) => x.min > 0)
      : def;
  return { exportSPW: clean(b.exportSPW, w.exportSPW), domesticSPW: clean(b.domesticSPW, w.domesticSPW), softCut: clean(b.softCut, w.softCut) };
}

function sanitize(input: PlanInput, warn: (m: string) => void) {
  const gid = uniqueIds();
  const bid = uniqueIds();
  const lines: GasketLine[] = [];
  (input.lines ?? []).forEach((g, i) => {
    const t: GasketLine = {
      ...g,
      id: gid(g.id, `l${i}`),
      od: num(g.od),
      innerD: Math.max(0, num(g.innerD)),
      thickness: num(g.thickness),
      quantity: Math.floor(num(g.quantity)),
      unitWeight: Math.max(0, num(g.unitWeight)),
      size: Math.max(0, num(g.size)),
      rating: Math.max(0, num(g.rating)),
    };
    const name = label(t) || `Line ${i + 1}`;
    if (t.quantity <= 0) return;
    if (t.od <= 0 || t.thickness <= 0) warn(`${name}: outer diameter and thickness must be above 0. Line skipped.`);
    else if (t.innerD >= t.od) warn(`${name}: inner diameter must be smaller than outer diameter. Line skipped.`);
    else lines.push(t);
  });
  const boxSizes: BoxSize[] = (input.boxSizes ?? [])
    .map((b, i) => ({
      ...b,
      id: bid(b.id, `b${i}`),
      outerL: num(b.outerL),
      outerW: num(b.outerW),
      maxDepth: Math.max(0, num(b.maxDepth)),
      wall: Math.max(0, num(b.wall)),
      base: Math.max(0, num(b.base)),
      lid: Math.max(0, num(b.lid)),
      skid: Math.max(0, num(b.skid)),
      available: Math.max(0, Math.floor(num(b.available))),
    }))
    .filter((b) => b.enabled && b.outerL > 2 * b.wall && b.outerW > 2 * b.wall);

  const cargo: CargoSpec = {
    ...input.cargo,
    length: Math.max(0, num(input.cargo.length)),
    width: Math.max(0, num(input.cargo.width)),
    height: Math.max(0, num(input.cargo.height)),
    maxPayload: Math.max(0, num(input.cargo.maxPayload)),
  };
  if (cargo.length <= 0 || cargo.width <= 0) {
    warn('Cargo floor length and width must be above 0. Using 6100 × 2400 mm.');
    cargo.length = cargo.length || 6100;
    cargo.width = cargo.width || 2400;
  }

  const s = { ...DEFAULT_SETTINGS, ...input.settings };
  const pos = (v: unknown, d: number) => Math.max(0, num(v, d));
  const settings: PlanSettings = {
    ...s,
    bands: bandsOk(s.bands),
    smallMax: pos(s.smallMax, 24),
    sizeCluster: Math.min(1, pos(s.sizeCluster, 0.9)),
    nestSlack: pos(s.nestSlack, 5),
    domesticNestCap: pos(s.domesticNestCap, 10),
    fillerMax: pos(s.fillerMax, 2),
    clearBundle: pos(s.clearBundle, 50),
    clearCarded: pos(s.clearCarded, 25),
    pileGap: pos(s.pileGap, 25),
    headroom: pos(s.headroom, INCH),
    bowPct: pos(s.bowPct, 1.25),
    cardSizes: Array.isArray(s.cardSizes) ? s.cardSizes.map((c) => num(c)).filter((c) => c > 0) : DEFAULT_SETTINGS.cardSizes,
    cardMargin: pos(s.cardMargin, 3),
    cardThickness: pos(s.cardThickness, 3),
    ringsPerCard: Math.max(1, Math.floor(num(s.ringsPerCard, 10))),
    boardKgPerM2: pos(s.boardKgPerM2, 0.55),
    cartonSide: pos(s.cartonSide, 2),
    cartonDepth: pos(s.cartonDepth, 2),
    maxBoxDepth: Math.max(4 * INCH, num(s.maxBoxDepth, 30 * INCH)),
    maxBoxWeight: pos(s.maxBoxWeight, 300),
    maxCustomSide: Math.max(6 * INCH, num(s.maxCustomSide, 72 * INCH)),
    wall: pos(s.wall, 12),
    base: pos(s.base, 12),
    lid: pos(s.lid, 12),
    skid: pos(s.skid, 0),
    boxKgPerM2: pos(s.boxKgPerM2, 9.5),
    boxGap: pos(s.boxGap, 100),
    edgeGap: pos(s.edgeGap, 100),
    maxTiers: Math.max(1, Math.floor(num(s.maxTiers, 1))),
    maxTopLoad: pos(s.maxTopLoad, 0),
  };
  const j: Partial<JobInfo> = input.job ?? {};
  const job: JobInfo = { prn: j.prn ?? '', po: j.po ?? '', poDate: j.poDate ?? '', customer: j.customer ?? '', dispatch: j.dispatch ?? '', date: j.date ?? '' };
  return { lines, boxSizes, cargo, settings, job };
}

function finalizeBox(f: BoxFill, no: number, label: string, group: string, types: Map<string, GasketLine>, s: PlanSettings): PackedBox {
  const g = f.box;
  const L = g.innerL;
  const W = g.innerW;
  // centre the floor piles, but never closer to a wall than each pile's own clearance
  let dx = 0;
  let dy = 0;
  const top = f.piles.filter((p) => p.host < 0);
  if (s.centerContents && top.length > 0) {
    const ext = (fn: (p: (typeof top)[number]) => number) => top.map(fn);
    const minX = Math.min(...ext((p) => p.x - p.pack.foot / 2));
    const maxX = Math.max(...ext((p) => p.x + p.pack.foot / 2));
    const minY = Math.min(...ext((p) => p.y - p.pack.foot / 2));
    const maxY = Math.max(...ext((p) => p.y + p.pack.foot / 2));
    const lo = (k: 'x' | 'y') => Math.max(...top.map((p) => marginOf(p.pack, s) - (p[k] - p.pack.foot / 2)));
    const hi = (k: 'x' | 'y', len: number) => Math.min(...top.map((p) => len - marginOf(p.pack, s) - (p[k] + p.pack.foot / 2)));
    dx = Math.min(Math.max(L / 2 - (minX + maxX) / 2, lo('x')), hi('x', L));
    dy = Math.min(Math.max(W / 2 - (minY + maxY) / 2, lo('y')), hi('y', W));
  }

  const stacks: PlacedStack[] = f.piles.map((p, i) => {
    const full = p.pack.perUnit;
    return {
      no: i + 1,
      typeId: p.pack.line.id,
      kind: p.pack.kind,
      shape: p.pack.shape,
      count: p.units.reduce((a, n) => a + n, 0),
      units: p.units.length,
      perUnit: full,
      x: p.x + dx,
      y: p.y + dy,
      r: p.pack.foot / 2,
      rIn: p.pack.shape === 'circle' ? p.pack.line.innerD / 2 : 0,
      ringR: p.pack.line.od / 2,
      height: pileHeight(p),
      unitHeight: p.pack.height(full),
      cards: p.units.reduce((a, n) => a + p.pack.cards(n), 0),
      host: p.host >= 0 ? p.host + 1 : null,
      depth: p.depth,
      nearestGap: null,
      nearestNo: null,
      around: null,
      boreGap: null,
    };
  });
  for (const st of stacks) {
    for (const o of stacks) {
      if (o === st || o.host !== st.host) continue;
      const gap = pileDistance(st, o);
      if (st.nearestGap === null || gap < st.nearestGap) {
        st.nearestGap = gap;
        st.nearestNo = o.no;
      }
    }
    if (st.host === null) st.around = clearance(st, stacks, L, W);
    else {
      const h = stacks[st.host - 1];
      st.boreGap = h.rIn - Math.hypot(st.x - h.x, st.y - h.y) - st.r;
    }
  }

  const contents = new Map<string, { pieces: number; stacks: number; weight: number }>();
  let mx = 0;
  let my = 0;
  for (const st of stacks) {
    const c = contents.get(st.typeId) ?? { pieces: 0, stacks: 0, weight: 0 };
    const w = st.count * (types.get(st.typeId)?.unitWeight ?? 0);
    c.pieces += st.count;
    c.stacks += 1;
    c.weight += w;
    contents.set(st.typeId, c);
    mx += w * st.x;
    my += w * st.y;
  }
  const floorArea = stacks.filter((st) => st.host === null).reduce((a, st) => a + (st.shape === 'circle' ? Math.PI * st.r * st.r : 4 * st.r * st.r), 0);
  return {
    uid: no,
    no,
    label,
    sizeId: g.sizeId,
    boxName: g.name,
    group,
    inner: { l: L, w: W, h: f.innerD },
    ext: { l: g.outerL, w: g.outerW, h: f.outerD },
    wall: g.wall,
    headroom: f.innerD - f.tallest,
    stacks,
    contents: [...contents.entries()].map(([typeId, c]) => ({ typeId, ...c })),
    pieces: f.pieces,
    netWeight: f.net,
    packWeight: f.board,
    tare: f.tare,
    grossWeight: f.gross,
    cbm: f.volume / 1e9,
    floorUse: floorArea / (L * W),
    fillRate: f.score,
    cog: f.net > 0 ? { x: mx / f.net, y: my / f.net } : null,
    location: null,
  };
}

/** Nearest wall or floor pile on each side of a pile, as drawn. */
function clearance(st: PlacedStack, stacks: PlacedStack[], L: number, W: number): Clearance {
  const c: Clearance = {
    xNeg: { gap: st.x - st.r, to: null },
    xPos: { gap: L - st.x - st.r, to: null },
    yNeg: { gap: st.y - st.r, to: null },
    yPos: { gap: W - st.y - st.r, to: null },
  };
  for (const o of stacks) {
    if (o === st || o.host !== null) continue;
    const reach = o.r + st.r - 1e-6;
    const dx = o.x - st.x;
    const dy = o.y - st.y;
    const inX = Math.abs(dy) < reach;
    const inY = Math.abs(dx) < reach;
    let side: keyof Clearance | null = null;
    if (inX && (!inY || Math.abs(dx) >= Math.abs(dy))) side = dx < 0 ? 'xNeg' : 'xPos';
    else if (inY) side = dy < 0 ? 'yNeg' : 'yPos';
    const gap = pileDistance(st, o);
    if (side && gap < c[side].gap - 1e-6) c[side] = { gap, to: o.no };
  }
  return c;
}
