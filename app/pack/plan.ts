import type { Crate, FleetOption, Line, Load, Plan, Settings, Vehicle } from '../model/types';
import { packCrates } from './crates';
import { packStandard } from './sizes';
import { loadCrates, space, type LoadResult } from './load';
import { makePiles, nest } from './nest';

const area = (v: Vehicle) => v.L * v.W;

/** Better of two ways to carry the load: fewer crates left behind, then fewer vehicles, then less deck hired. */
const cost = (r: LoadResult, v: Vehicle) => [r.stranded.length, r.loads.length, r.loads.length * area(v)];
const less = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return a[i] < b[i];
  return false;
};

/**
 * With the vehicle on Auto: every vehicle type on the list is tried; the one
 * that takes every crate in the fewest vehicles, and of those the least deck,
 * wins. The last vehicle — usually part-full — is then swapped for the
 * smallest type that still takes its crates in one trip.
 */
function pickFleet(crates: Crate[], s: Settings): { result: LoadResult; fleet: FleetOption[]; mixed: string | null } {
  const tried = s.vehicles.map((v) => ({ v, r: loadCrates(crates, v, s) }));
  const best = tried.reduce((a, b) => (less(cost(b.r, b.v), cost(a.r, a.v)) ? b : a));
  const loads: Load[] = [...best.r.loads];
  let mixed: string | null = null;
  const last = loads[loads.length - 1];
  if (last && loads.length > 1) {
    const ids = new Set(last.placed.map((p) => p.crate));
    const rest = crates.filter((c) => ids.has(c.id));
    for (const v of [...s.vehicles].sort((a, b) => area(a) - area(b))) {
      if (area(v) >= area(last.vehicle)) break;
      const r = loadCrates(rest, v, s);
      if (r.loads.length === 1 && !r.stranded.length) {
        loads[loads.length - 1] = { ...r.loads[0], no: last.no };
        mixed = v.name;
        break;
      }
    }
  }
  const fleet: FleetOption[] = tried
    .map(({ v, r }) => ({
      id: v.id,
      name: v.name,
      count: r.loads.length,
      stranded: r.stranded.length,
      kgUse: r.loads.length ? r.loads.reduce((a, l) => a + l.kg, 0) / (r.loads.length * v.payload) : 0,
      lengthUse: r.loads.length ? r.loads.reduce((a, l) => a + l.length, 0) / (r.loads.length * v.L) : 0,
      chosen: v === best.v,
      key: cost(r, v),
    }))
    .sort((a, b) => (less(a.key, b.key) ? -1 : less(b.key, a.key) ? 1 : 0))
    .map((o) => ({ id: o.id, name: o.name, count: o.count, stranded: o.stranded, kgUse: o.kgUse, lengthUse: o.lengthUse, chosen: o.chosen }));
  return { result: { loads, stranded: best.r.stranded }, fleet, mixed };
}

/** The whole plan: stacks, nesting, crates, vehicles. Crates are numbered in loading order. */
export function makePlan(lines: Line[], s: Settings): Plan {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const skipped: Plan['skipped'] = [];
  const good: Line[] = [];
  for (const g of lines) {
    if (!(g.qty > 0)) skipped.push({ line: g.id, why: 'No quantity' });
    else if (!(g.od > 0)) skipped.push({ line: g.id, why: 'No size' });
    else good.push(g);
  }
  const piles = makePiles(good, s);
  const groups = nest(piles, s);
  const auto = s.vehicleId === 'auto' || !s.vehicles.some((v) => v.id === s.vehicleId);
  const vehicle = s.vehicles.find((v) => v.id === s.vehicleId) ?? s.vehicles[0];
  // crates are sized for the deck they go on; on Auto, for the widest deck on the list
  const deckW = auto ? Math.max(...s.vehicles.map((v) => space(v, s).W)) : space(vehicle, s).W;
  const crates = s.useSizes && s.crateSizes?.length ? packStandard(groups, s, deckW, s.crateSizes) : packCrates(groups, s, deckW);
  let fleet: FleetOption[] = [];
  let mixed: string | null = null;
  let res: LoadResult;
  if (auto) ({ result: res, fleet, mixed } = pickFleet(crates, s));
  else res = loadCrates(crates, vehicle, s);
  const { loads, stranded } = res;

  // number the crates in the order they go on: vehicle 1 first, front to back
  const order = new Map<string, number>();
  for (const l of loads) for (const p of [...l.placed].sort((a, b) => a.step - b.step)) order.set(p.crate, order.size + 1);
  for (const c of crates) if (!order.has(c.id)) order.set(c.id, order.size + 1);
  for (const c of crates) c.no = order.get(c.id)!;
  crates.sort((a, b) => a.no - b.no);

  const notes: string[] = [];
  if (auto && loads.length) {
    const main = loads[0].vehicle.name;
    const n = loads.length - (mixed ? 1 : 0);
    notes.push(`Vehicles picked on Auto: ${n} × ${main}${mixed ? ` and 1 × ${mixed} for the last crates` : ''}.`);
  }
  const custom = crates.filter((c) => c.standard === false);
  if (custom.length)
    notes.push(
      `${custom.length} ${custom.length === 1 ? 'crate fits' : 'crates fit'} no standard size and ${custom.length === 1 ? 'is' : 'are'} made to measure (Custom): crate ${custom.map((c) => c.no).join(', ')}.`,
    );
  const heavy = crates.filter((c) => c.net > s.crateMaxKg).length;
  if (heavy) notes.push(`${heavy} ${heavy === 1 ? 'crate holds' : 'crates hold'} more than ${s.crateMaxKg} kg: one stack is heavier than the crate limit.`);
  const tall = crates.filter((c) => c.inner.H > s.crateMaxH).length;
  if (tall) notes.push(`${tall} ${tall === 1 ? 'crate is' : 'crates are'} taller than ${s.crateMaxH} mm inside: one stack needs the room.`);
  const est = good.filter((g) => g.weightFrom === 'estimate').length;
  if (est) notes.push(`${est} ${est === 1 ? 'line has' : 'lines have'} an estimated weight.`);

  const net = crates.reduce((a, c) => a + c.net, 0);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    lines: good.length,
    pieces: good.reduce((a, g) => a + g.qty, 0),
    piles,
    groups,
    crates,
    loads,
    skipped,
    stranded,
    notes,
    net,
    gross: crates.reduce((a, c) => a + c.gross, 0),
    ms: Math.round(t1 - t0),
    fleet,
    auto,
  };
}
