import type { Crate, Load, Placement, Settings, Vehicle } from '../model/types';
import { MaxRects } from './maxRects';

/** One crate inside a unit, relative to the unit's corner. */
interface Member {
  crate: Crate;
  x: number;
  y: number;
  z: number;
  L: number;
  W: number;
  H: number;
  turned: boolean;
  on: Placement['on'];
}

/** What stands on one patch of floor: a crate, a tower of identical crates, or four crates bridged by a fifth. */
interface Unit {
  L: number;
  W: number;
  H: number;
  kg: number;
  members: Member[];
  rotate: boolean; // may turn a quarter on the deck
}

interface InRow {
  u: Unit;
  x: number;
  y: number;
  turned: boolean;
}

interface Row {
  depth: number;
  units: InRow[];
  kg: number;
  cx: number; // centre of gravity from the row's front edge
  my: number; // moment about the deck centre line
}

const E = 1e-6;
const single = (c: Crate): Unit => ({
  L: c.outer.L,
  W: c.outer.W,
  H: c.outer.H,
  kg: c.gross,
  members: [{ crate: c, x: 0, y: 0, z: 0, L: c.outer.L, W: c.outer.W, H: c.outer.H, turned: false, on: 'floor' }],
  rotate: c.rotate,
});

/** The unit turned a quarter: along and across swap. */
const turn = (u: Unit): Unit => ({
  L: u.W,
  W: u.L,
  H: u.H,
  kg: u.kg,
  members: u.members.map((m) => ({ ...m, x: m.y, y: m.x, L: m.W, W: m.L, turned: !m.turned })),
  rotate: u.rotate,
});

/**
 * Where a crate's centre of gravity is on the deck, as placed. A turned crate
 * has its contents turned a quarter (along becomes across), as the 3D view
 * draws it.
 */
export function crateCog(c: Crate, p: Placement): { x: number; y: number; z: number } {
  const dx = p.turned ? -c.cog.y : c.cog.x;
  const dy = p.turned ? c.cog.x : c.cog.y;
  return { x: p.x + p.L / 2 + dx, y: p.y + p.W / 2 + dy, z: p.z + c.cog.z };
}

export interface Space {
  L: number;
  W: number;
  H: number;
}

export const space = (v: Vehicle, s: Settings): Space => ({ L: v.L - 2 * s.deckWall, W: v.W - 2 * s.deckWall, H: v.H - s.deckTop });

/** Where the load's centre of gravity should be: between the two bearing points in proportion to what each may carry. */
export const targetX = (v: Vehicle) => (v.front.x * v.front.max + v.rear.x * v.rear.max) / (v.front.max + v.rear.max);

/**
 * Builds the units. Crates only go on top of others two ways: on a crate with
 * the same footprint (the heavier underneath, up to `tiers` high), or one crate
 * across a 2 × 2 block of four identical crates — big enough to bear on all
 * four (at least half the block each way) and no heavier than half of what is
 * under it. A crate holding a non-stackable gasket carries nothing: it stands
 * alone, or goes on top. One holding a non-rotatable line keeps its way round.
 */
function makeUnits(crates: Crate[], sp: Space, s: Settings, stack: boolean, payload: number): Unit[] {
  if (!stack) return crates.map(single);
  const foot = (c: Crate) => `${Math.round(c.outer.L)}x${Math.round(c.outer.W)}`;
  const pools = new Map<string, Crate[]>();
  const alone: Crate[] = [];
  for (const c of [...crates].sort((a, b) => b.gross - a.gross)) {
    if (!c.stack) {
      alone.push(c);
      continue;
    }
    const k = foot(c);
    if (!pools.has(k)) pools.set(k, []);
    pools.get(k)!.push(c);
  }
  const tiers = Math.max(1, Math.floor(s.tiers || 2));
  const units: Unit[] = [];

  if (s.bridge && tiers > 1) {
    // the crate a pool would leave over in a short tower: the lightest of each pool with a remainder
    const lonely = [...pools.values()].filter((p) => p.length % tiers !== 0).map((p) => p[p.length - 1]);
    // non-stackable crates may still ride on top
    lonely.push(...alone);
    lonely.sort((a, b) => b.outer.L * b.outer.W - a.outer.L * a.outer.W);
    for (const top of lonely) {
      // a crate already taken into a platform under an earlier bridge is no longer free to ride on top
      const own = top.stack ? pools.get(foot(top))! : alone;
      if (!own.includes(top)) continue;
      let best: { pool: Crate[]; four: Crate[]; bL: number; bW: number; turned: boolean } | null = null;
      for (const [k, pool] of pools) {
        if (k === foot(top)) continue;
        // four of the same height make a level platform
        const byH = new Map<number, Crate[]>();
        for (const c of pool) byH.set(Math.round(c.outer.H), [...(byH.get(Math.round(c.outer.H)) ?? []), c]);
        const four = [...byH.values()].find((g) => g.length >= 4)?.slice(0, 4);
        if (!four) continue;
        const b = four[0].outer;
        if (b.H + top.outer.H > sp.H + E) continue;
        const bL = 2 * b.L + s.deckGap;
        const bW = 2 * b.W + s.deckGap;
        if (bL > sp.L + E || bW > sp.W + E) continue;
        const under = four.reduce((a, c) => a + c.gross, 0);
        if (top.gross > under / 2 || under + top.gross > payload + E) continue;
        for (const turned of top.rotate ? [false, true] : [false]) {
          const tL = turned ? top.outer.W : top.outer.L;
          const tW = turned ? top.outer.L : top.outer.W;
          if (tL <= bL + E && tW <= bW + E && tL >= bL / 2 - E && tW >= bW / 2 - E && (!best || bL * bW < best.bL * best.bW)) best = { pool, four, bL, bW, turned };
        }
      }
      if (!best) continue;
      own.splice(own.indexOf(top), 1);
      const four = best.four;
      for (const c of four) best.pool.splice(best.pool.indexOf(c), 1);
      const b = four[0].outer;
      const tL = best.turned ? top.outer.W : top.outer.L;
      const tW = best.turned ? top.outer.L : top.outer.W;
      units.push({
        L: best.bL,
        W: best.bW,
        H: b.H + top.outer.H,
        kg: four.reduce((a, c) => a + c.gross, 0) + top.gross,
        members: [
          ...four.map((c, i) => ({ crate: c, x: i % 2 ? b.L + s.deckGap : 0, y: i > 1 ? b.W + s.deckGap : 0, z: 0, L: b.L, W: b.W, H: b.H, turned: false, on: 'floor' as const })),
          { crate: top, x: (best.bL - tL) / 2, y: (best.bW - tW) / 2, z: b.H, L: tL, W: tW, H: top.outer.H, turned: best.turned, on: 'bridge' as const },
        ],
        rotate: top.rotate && four.every((c) => c.rotate),
      });
    }
  }
  for (const c of alone) units.push(single(c));

  // same-footprint crates in towers, heaviest at the bottom, as many as the height allows
  for (const pool of pools.values()) {
    let i = 0;
    while (i < pool.length) {
      const tower: Crate[] = [];
      let H = 0;
      let kg = 0;
      while (i < pool.length && tower.length < tiers && H + pool[i].outer.H <= sp.H + E && (!tower.length || kg + pool[i].gross <= payload + E)) {
        H += pool[i].outer.H;
        kg += pool[i].gross;
        tower.push(pool[i++]);
      }
      if (!tower.length) tower.push(pool[i++]); // too tall for the deck on its own: the loader flags it
      let z = 0;
      units.push({
        L: tower[0].outer.L,
        W: tower[0].outer.W,
        H: tower.reduce((a, c) => a + c.outer.H, 0),
        kg: tower.reduce((a, c) => a + c.gross, 0),
        members: tower.map((c, k) => {
          const m = { crate: c, x: 0, y: 0, z, L: c.outer.L, W: c.outer.W, H: c.outer.H, turned: false, on: k ? ('same' as const) : ('floor' as const) };
          z += c.outer.H;
          return m;
        }),
        rotate: tower.every((c) => c.rotate),
      });
    }
  }
  return units;
}

/** Fills one row across the deck, led by `lead` in the given turn, with whatever else fits beside or behind within its depth. */
function fillRow(lead: Unit, pool: Unit[], sp: Space, gap: number, payload: number): { row: InRow[]; used: Set<Unit> } {
  const depth = lead.L;
  const free = new MaxRects({ x: 0, y: 0, w: depth + gap, h: sp.W + gap });
  const row: InRow[] = [];
  const used = new Set<Unit>();
  let kg = 0;
  const put = (u: Unit, orig: Unit, mayTurn: boolean) => {
    // a row never weighs more than the vehicle may carry: it has to go on one vehicle whole
    if (row.length && kg + u.kg > payload + E) return false;
    const spot = free.find(u.L + gap, u.W + gap, mayTurn, mayTurn ? 'fit' : 'corner');
    if (!spot) return false;
    free.place(spot);
    const turned = spot.turned;
    row.push({ u: turned ? turn(u) : u, x: spot.x, y: spot.y, turned });
    used.add(orig);
    kg += u.kg;
    return true;
  };
  put(lead, pool[0], false);
  for (const u of pool.slice(1)) put(u, u, u.rotate);
  return { row, used };
}

function makeRows(units: Unit[], sp: Space, gap: number, payload: number): { rows: Row[]; dropped: Unit[] } {
  let pool = [...units].sort((a, b) => Math.max(b.L, b.W) - Math.max(a.L, a.W) || b.kg - a.kg);
  const rows: Row[] = [];
  const dropped: Unit[] = [];
  while (pool.length) {
    const lead = pool[0];
    // lead across the deck when it fits that way (shallower row), else along it; keep the fuller row
    const options = (lead.rotate ? [lead.L <= lead.W ? lead : turn(lead), lead.L <= lead.W ? turn(lead) : lead] : [lead]).filter((u) => u.W <= sp.W + E && u.L <= sp.L + E);
    let best: { row: InRow[]; used: Set<Unit>; depth: number; density: number } | null = null;
    for (const o of options) {
      const r = fillRow(o, pool, sp, gap, payload);
      const depth = Math.max(...r.row.map((p) => p.x + p.u.L));
      const area = r.row.reduce((a, p) => a + p.u.L * p.u.W, 0);
      const density = area / (depth * sp.W);
      if (!best || density > best.density + 1e-9) best = { ...r, depth, density };
    }
    if (!best) {
      dropped.push(lead);
      pool = pool.slice(1);
      continue;
    }
    // centre the row across the deck
    const width = Math.max(...best.row.map((p) => p.y + p.u.W));
    const shift = (sp.W - width) / 2;
    for (const p of best.row) p.y += shift;
    const kg = best.row.reduce((a, p) => a + p.u.kg, 0);
    rows.push({
      depth: best.depth,
      units: best.row,
      kg,
      cx: best.row.reduce((a, p) => a + p.u.kg * (p.x + p.u.L / 2), 0) / kg,
      my: best.row.reduce((a, p) => a + p.u.kg * (p.y + p.u.W / 2 - sp.W / 2), 0),
    });
    pool = pool.filter((u) => !best!.used.has(u));
  }
  return { rows, dropped };
}

/**
 * Orders the rows on one vehicle so the centre of gravity lands on the target:
 * tries a few orders, then swaps rows pairwise while it helps. A short load
 * may start back from the front wall when that is the only way to get there.
 */
function arrange(rows: Row[], v: Vehicle, sp: Space, s: Settings) {
  const target = targetX(v) - s.deckWall; // in deck-space terms
  const score = (order: Row[]) => {
    let pos = 0;
    let m = 0;
    let kg = 0;
    for (const r of order) {
      m += r.kg * (pos + r.cx);
      kg += r.kg;
      pos += r.depth + s.deckGap;
    }
    const length = pos - s.deckGap;
    const rel = m / kg;
    const offset = Math.min(Math.max(target - rel, 0), Math.max(0, sp.L - length));
    const err = Math.abs(offset + rel - target);
    return { cost: err * 20 + offset, offset, length };
  };
  const starts = [rows, [...rows].sort((a, b) => a.kg - b.kg), [...rows].sort((a, b) => b.kg - a.kg)];
  let best = starts.map((o) => ({ order: o, ...score(o) })).reduce((a, b) => (b.cost < a.cost ? b : a));
  for (let pass = 0; pass < 40; pass++) {
    let better = false;
    for (let i = 0; i < best.order.length; i++)
      for (let j = i + 1; j < best.order.length; j++) {
        const o = [...best.order];
        [o[i], o[j]] = [o[j], o[i]];
        const sc = score(o);
        if (sc.cost < best.cost - 1e-6) {
          best = { order: o, ...sc };
          better = true;
        }
      }
    if (!better) break;
  }
  return best;
}

export interface LoadResult {
  loads: Load[];
  stranded: { crate: string; why: string }[];
}

function plan(crates: Crate[], v: Vehicle, s: Settings, stack: boolean): LoadResult {
  const sp = space(v, s);
  const stranded: LoadResult['stranded'] = [];
  const ok: Crate[] = [];
  for (const c of crates) {
    const o = c.outer;
    const flat = (o.L <= sp.L + E && o.W <= sp.W + E) || (c.rotate && o.W <= sp.L + E && o.L <= sp.W + E);
    if (!flat) stranded.push({ crate: c.id, why: `${Math.round(o.L)} × ${Math.round(o.W)} mm is wider than the ${v.name} (${sp.W} mm clear)` });
    else if (o.H > sp.H + E) stranded.push({ crate: c.id, why: `${Math.round(o.H)} mm high, over the ${sp.H} mm clear height` });
    else if (c.gross > v.payload) stranded.push({ crate: c.id, why: `${Math.round(c.gross)} kg, over the payload` });
    else ok.push(c);
  }
  const { rows, dropped } = makeRows(makeUnits(ok, sp, s, stack, v.payload), sp, s.deckGap, v.payload);
  for (const u of dropped) for (const m of u.members) stranded.push({ crate: m.crate.id, why: `does not fit on the ${v.name} deck` });

  // rows onto vehicles: first one with length and payload left
  const bins: { rows: Row[]; length: number; kg: number }[] = [];
  for (const r of rows) {
    let bin = bins.find((b) => b.length + (b.rows.length ? s.deckGap : 0) + r.depth <= sp.L + E && b.kg + r.kg <= v.payload + E);
    if (!bin) {
      bin = { rows: [], length: 0, kg: 0 };
      bins.push(bin);
    }
    bin.length += (bin.rows.length ? s.deckGap : 0) + r.depth;
    bin.kg += r.kg;
    bin.rows.push(r);
  }

  const loads = bins.map((bin, n): Load => {
    const a = arrange(bin.rows, v, sp, s);
    const placed: Placement[] = [];
    let pos = s.deckWall + a.offset;
    let lateral = 0;
    let step = 0;
    for (const r of a.order) {
      // mirror the row across the deck when that evens out the side-to-side balance
      const mirror = Math.abs(lateral - r.my) < Math.abs(lateral + r.my) - 1e-6;
      lateral += mirror ? -r.my : r.my;
      const units = r.units
        .map((p) => ({ ...p, y: mirror ? sp.W - p.y - p.u.W : p.y }))
        .sort((p, q) => p.x - q.x || p.y - q.y);
      for (const p of units) {
        const members = [...p.u.members].sort((m1, m2) => m1.z - m2.z || m1.x - m2.x || m1.y - m2.y);
        for (const m of members) {
          const my = mirror ? p.u.W - m.y - m.W : m.y;
          placed.push({
            crate: m.crate.id,
            x: pos + p.x + m.x,
            y: s.deckWall + p.y + my,
            z: m.z,
            L: m.L,
            W: m.W,
            H: m.H,
            turned: m.turned,
            step: ++step,
            on: m.on,
          });
        }
      }
      pos += r.depth + s.deckGap;
    }
    // the load's centre of gravity from each crate's own, where it stands
    const byId = new Map(crates.map((c) => [c.id, c]));
    const kg = placed.reduce((t, p) => t + byId.get(p.crate)!.gross, 0);
    const cogs = placed.map((p) => ({ kg: byId.get(p.crate)!.gross, ...crateCog(byId.get(p.crate)!, p) }));
    const cog = { x: cogs.reduce((t, c) => t + c.kg * c.x, 0) / kg, y: cogs.reduce((t, c) => t + c.kg * c.y, 0) / kg, z: cogs.reduce((t, c) => t + c.kg * c.z, 0) / kg };
    const span = v.rear.x - v.front.x;
    const front = (kg * (v.rear.x - cog.x)) / span;
    const rear = kg - front;
    const target = targetX(v);
    const frontName = v.kind === 'semi' ? 'kingpin' : v.kind === 'rigid' ? 'front axle' : 'front end';
    const notes: string[] = [];
    if (a.offset > 150) notes.push(`The load starts ${Math.round(a.offset)} mm back from the front wall to put the centre of gravity over the axles: block the gap at the front.`);
    if (front > v.front.max) notes.push(`The ${frontName} carries ${Math.round(front)} kg, over its ${v.front.max} kg.`);
    if (rear > v.rear.max) notes.push(`The rear axles carry ${Math.round(rear)} kg, over their ${v.rear.max} kg.`);
    if (Math.abs(cog.x - target) > 0.05 * v.L) notes.push(`The centre of gravity is ${Math.round(Math.abs(cog.x - target))} mm ${cog.x < target ? 'ahead of' : 'behind'} the ideal point.`);
    if (Math.abs(cog.y - v.W / 2) > 0.05 * v.W) notes.push(`The load leans ${Math.round(Math.abs(cog.y - v.W / 2))} mm to the ${cog.y < v.W / 2 ? 'left' : 'right'}.`);
    return { no: n + 1, vehicle: v, placed, kg, length: a.length, cog, target, front, rear, offset: a.offset, notes };
  });
  return { loads, stranded };
}

/**
 * Loads the crates. With stacking on "auto" the crates go single-high when one
 * vehicle takes them that way, and stacked (by the two rules above) only when
 * that saves a vehicle.
 */
export function loadCrates(crates: Crate[], v: Vehicle, s: Settings): LoadResult {
  if (s.stacking === 'never') return plan(crates, v, s, false);
  if (s.stacking === 'always') return plan(crates, v, s, true);
  const flat = plan(crates, v, s, false);
  if (flat.loads.length <= 1) return flat;
  const stacked = plan(crates, v, s, true);
  return stacked.loads.length < flat.loads.length ? stacked : flat;
}
