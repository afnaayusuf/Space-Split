import { MaxRects, type RectHeuristic } from '../geometry/maxRects';
import type { BoxLocation, CargoSpec, CargoUnit, Clearance, PackedBox, PlanSettings, Securing } from '../model/types';

const E = 1e-6;

/** Boxes of one size stacked on top of each other, heaviest at the bottom. */
interface Column {
  boxes: PackedBox[];
  l: number;
  w: number;
  height: number;
  weight: number;
  key: number;
}

interface Placed {
  col: Column;
  x: number;
  y: number;
  l: number; // along floor X
  w: number; // along floor Y
  rotated: boolean;
}

interface UnitTry {
  placed: Placed[];
  rest: Column[];
  area: number;
  used: number;
  neat: boolean;
}

export interface FloorResult {
  units: CargoUnit[];
  /** Neighbours in `around` and `on` are box uids here; the caller swaps them for box numbers. */
  locations: Map<number, BoxLocation>;
  unloaded: number[];
  warnings: string[];
}

const HEURISTICS: RectHeuristic[] = ['front', 'bssf', 'baf'];
type ColOrder = 'area' | 'long' | 'weight';
const ORDERS: ColOrder[] = ['area', 'long', 'weight'];

/**
 * Puts the boxes on the cargo floor.
 * Boxes are only stacked on boxes of the same size, so each column has a flat,
 * fully supported top and can be strapped as one unit. Boxes stand in straight
 * rows across the floor, front wall first, with the safety margin between
 * neighbours and to the walls; a free-form layout is used only when it gets
 * more onto the floor. Layer counts from 1 up to the limit are tried; the
 * result that needs the fewest trucks wins, then (in 'fewest' mode) the
 * fewest layers or (in 'compact' mode) the shortest used floor length.
 */
export function planFloor(boxes: PackedBox[], cargo: CargoSpec, s: PlanSettings): FloorResult {
  const locations = new Map<number, BoxLocation>();
  if (boxes.length === 0) return { units: [], locations, unloaded: [], warnings: [] };

  const L = cargo.length;
  const W = cargo.width;
  const maxT = Math.max(1, Math.floor(s.maxTiers));
  type Trial = { T: number; units: Placed[][]; rest: Column[]; tooTall: PackedBox[]; unloaded: number; used: number };
  let best: Trial | null = null;

  for (let T = 1; T <= maxT; T++) {
    const { cols, tooTall, limited } = buildColumns(boxes, T, cargo, s);
    const { units, rest } = planUnits(cols, L, W, cargo.maxPayload, s);
    const unloaded = tooTall.length + rest.reduce((a, c) => a + c.boxes.length, 0);
    const used = units.reduce((a, u) => a + usedLength(u), 0);
    const trial: Trial = { T, units, rest, tooTall, unloaded, used };
    if (!best || betterTrial(trial, best, s)) best = trial;
    if (limited) break; // taller columns are impossible, more layers change nothing
  }

  const trial = best!;
  const warnings: string[] = [];
  const units: CargoUnit[] = trial.units.map((placed, ui) => {
    const tiers = Math.max(...placed.map((p) => p.col.boxes.length));
    // every box with its height range; neighbours are boxes whose height range overlaps, whatever their layer number
    const blocks = placed.flatMap((p) => {
      let z = 0;
      return p.col.boxes.map((b, k) => {
        const blk = { p, b, k, z, h: b.ext.h };
        z += b.ext.h;
        return blk;
      });
    });
    for (const blk of blocks) {
      const beside = blocks.filter((o) => o.p !== blk.p && o.z < blk.z + blk.h - E && o.z + o.h > blk.z + E);
      const { p } = blk;
      locations.set(blk.b.uid, {
        unit: ui,
        tier: blk.k,
        x: p.x,
        y: p.y,
        l: p.l,
        w: p.w,
        z: blk.z,
        rotated: p.rotated,
        around: clearanceOf(p, beside, L, W),
        on: blk.k > 0 ? p.col.boxes[blk.k - 1].uid : null,
        load: 0,
      });
    }
    const weight = placed.reduce((a, p) => a + p.col.weight, 0);
    const cog =
      weight > 0
        ? {
            x: placed.reduce((a, p) => a + p.col.weight * (p.x + p.l / 2), 0) / weight,
            y: placed.reduce((a, p) => a + p.col.weight * (p.y + p.w / 2), 0) / weight,
          }
        : null;
    return {
      index: ui,
      tiers,
      boxUids: placed.flatMap((p) => p.col.boxes.map((b) => b.uid)),
      usedLength: usedLength(placed),
      floorUse: placed.reduce((a, p) => a + p.l * p.w, 0) / (L * W),
      weight,
      cog,
      loadHeight: Math.max(...placed.map((p) => p.col.height)),
      securing: securingFor(placed, W),
    };
  });

  const unloaded = [...trial.tooTall.map((b) => b.uid), ...trial.rest.flatMap((c) => c.boxes.map((b) => b.uid))];
  const tall = new Map<string, PackedBox[]>();
  for (const b of trial.tooTall) tall.set(b.boxName, [...(tall.get(b.boxName) ?? []), b]);
  for (const [name, list] of tall)
    warnings.push(`${list.length} × ${name} ${list.length === 1 ? 'is' : 'are'} ${Math.round(list[0].ext.h)} mm tall outside, more than the ${cargo.height} mm cargo height.`);
  let overCap = 0;
  for (const c of trial.rest) {
    const b = c.boxes[0];
    const fits = (a: number, w: number) => a + 2 * s.edgeGap <= L + E && w + 2 * s.edgeGap <= W + E;
    if (!(fits(c.l, c.w) || (s.allowBoxRotation && fits(c.w, c.l))))
      warnings.push(
        `${b.boxName} (${Math.round(c.l)} × ${Math.round(c.w)} mm outside) does not fit on the ${L} × ${W} mm floor with a ${s.edgeGap} mm margin to the walls${s.allowBoxRotation ? '' : ' without turning it'}.`,
      );
    else if (cargo.maxPayload > 0 && c.weight > cargo.maxPayload + E)
      warnings.push(`A stack of ${c.boxes.length} × ${b.boxName} weighs ${Math.round(c.weight)} kg, over the ${cargo.maxPayload} kg payload.`);
    else overCap += c.boxes.length;
  }
  if (overCap > 0) warnings.push(`${overCap} boxes are left off: the load needs more than ${MAX_UNITS} trucks.`);
  return { units, locations, unloaded, warnings };
}

const MAX_UNITS = 50;

function betterTrial(a: { T: number; units: unknown[]; unloaded: number; used: number }, b: typeof a, s: PlanSettings) {
  if (a.unloaded !== b.unloaded) return a.unloaded < b.unloaded;
  if (a.units.length !== b.units.length) return a.units.length < b.units.length;
  if (s.tierMode === 'compact' && a.used < b.used - 1) return true;
  return false;
}

/** Boxes only stack on boxes of the same footprint, so a column has a flat, fully supported top. */
function buildColumns(boxes: PackedBox[], T: number, cargo: CargoSpec, s: PlanSettings) {
  const groups = new Map<string, PackedBox[]>();
  for (const b of boxes) {
    const k = `${Math.round(b.ext.l)}x${Math.round(b.ext.w)}`;
    const g = groups.get(k);
    if (g) g.push(b);
    else groups.set(k, [b]);
  }
  const cols: Column[] = [];
  const tooTall: PackedBox[] = [];
  let limited = true;
  let key = 0;
  const topLoad = s.maxTopLoad;
  const weightOf = (st: PackedBox[]) => st.reduce((a, b) => a + b.grossWeight, 0);
  const heightOf = (st: PackedBox[]) => st.reduce((a, b) => a + b.ext.h, 0);
  for (const all of groups.values()) {
    const list = all.filter((b) => !(cargo.height > 0 && b.ext.h > cargo.height + E));
    tooTall.push(...all.filter((b) => !list.includes(b)));
    if (list.length === 0) continue;
    const lowest = Math.min(...list.map((b) => b.ext.h));
    if (list.length > T && (cargo.height <= 0 || lowest * (T + 1) <= cargo.height + E)) limited = false;
    // heaviest at the bottom, the shallow boxes spread over the columns
    const order = [...list].sort((a, b) => b.grossWeight - a.grossWeight || a.uid - b.uid);
    for (let n = Math.ceil(order.length / T); n <= order.length; n++) {
      const stacks: PackedBox[][] = Array.from({ length: n }, () => []);
      order.forEach((b, i) => stacks[i % n].push(b));
      if (cargo.height > 0 && !stacks.every((st) => heightOf(st) <= cargo.height + E)) continue;
      if (topLoad > 0 && !stacks.every((st) => topLoadOk(st, topLoad))) continue;
      // a column heavier than a whole truck can never be loaded; split it while there is more than one box in it
      if (cargo.maxPayload > 0 && !stacks.every((st) => st.length === 1 || weightOf(st) <= cargo.maxPayload + E)) continue;
      for (const st of stacks)
        cols.push({
          boxes: st,
          l: st[0].ext.l,
          w: st[0].ext.w,
          height: st.reduce((a, b) => a + b.ext.h, 0),
          weight: st.reduce((a, b) => a + b.grossWeight, 0),
          key: key++,
        });
      break;
    }
  }
  return { cols, tooTall, limited };
}

function topLoadOk(stack: PackedBox[], limit: number) {
  let above = 0;
  for (let k = stack.length - 1; k >= 0; k--) {
    if (above > limit + E) return false;
    above += stack[k].grossWeight;
  }
  return true;
}

function sortCols(cols: Column[], order: ColOrder): Column[] {
  const v = (c: Column) => (order === 'area' ? c.l * c.w : order === 'long' ? Math.max(c.l, c.w) : c.weight);
  return [...cols].sort((a, b) => v(b) - v(a) || b.weight - a.weight || a.key - b.key);
}

/** More boxes on the floor first; at equal area, neat rows beat a free-form layout, then shorter use of the floor. */
function betterUnit(r: UnitTry, best: UnitTry | null) {
  if (!best) return true;
  if (Math.abs(r.area - best.area) > E) return r.area > best.area;
  if (r.neat !== best.neat) return r.neat;
  if (Math.abs(r.used - best.used) > E) return r.used < best.used;
  return r.placed.length > best.placed.length;
}

function planUnits(cols: Column[], L: number, W: number, payload: number, s: PlanSettings) {
  let rest = cols;
  const units: Placed[][] = [];
  while (rest.length > 0 && units.length < MAX_UNITS) {
    let best: UnitTry | null = null;
    for (const order of ORDERS) {
      const sorted = sortCols(rest, order);
      for (const turn of [false, true]) {
        const r = packUnitRows(sorted, L, W, payload, s, turn);
        if (betterUnit(r, best)) best = r;
      }
      for (const h of HEURISTICS) {
        const r = packUnitFree(sorted, L, W, payload, s, h);
        if (betterUnit(r, best)) best = r;
      }
    }
    if (!best || best.placed.length === 0) break;
    units.push(best.placed);
    rest = best.rest;
  }
  return { units, rest };
}

/**
 * One floor in straight rows across the width, starting at the front wall.
 * A row is as deep as its first box and boxes line up along its front edge.
 * Later, smaller boxes go to the first row with room. `turn` prefers boxes
 * turned 90° (their width along the truck).
 */
function packUnitRows(cols: Column[], L: number, W: number, payload: number, s: PlanSettings, turn: boolean): UnitTry {
  const g = s.boxGap;
  const x1 = L - s.edgeGap;
  const y0 = s.edgeGap;
  const y1 = W - s.edgeGap;
  const rows: { x: number; depth: number; yEnd: number; n: number }[] = [];
  const placed: Placed[] = [];
  const rest: Column[] = [];
  let weight = 0;
  let area = 0;
  for (const c of cols) {
    if (payload > 0 && weight + c.weight > payload + E) {
      rest.push(c);
      continue;
    }
    const opts = [{ l: c.l, w: c.w, rotated: false }];
    if (s.allowBoxRotation && Math.abs(c.l - c.w) > E) opts.push({ l: c.w, w: c.l, rotated: true });
    if (turn) opts.reverse();

    let spot: { row: (typeof rows)[number]; o: (typeof opts)[number]; y: number } | null = null;
    for (const row of rows) {
      const y = row.n ? row.yEnd + g : y0;
      // of the ways that fit, take the one that fills the row's depth best
      for (const o of opts) if (o.l <= row.depth + E && y + o.w <= y1 + E && (!spot || o.l > spot.o.l + E)) spot = { row, o, y };
      if (spot) break;
    }
    if (!spot) {
      const last = rows[rows.length - 1];
      const x = last ? last.x + last.depth + g : s.edgeGap;
      const o = opts.find((k) => x + k.l <= x1 + E && y0 + k.w <= y1 + E);
      if (o) {
        const row = { x, depth: o.l, yEnd: y0, n: 0 };
        rows.push(row);
        spot = { row, o, y: y0 };
      }
    }
    if (!spot) {
      rest.push(c);
      continue;
    }
    spot.row.yEnd = spot.y + spot.o.w;
    spot.row.n += 1;
    placed.push({ col: c, x: spot.row.x, y: spot.y, l: spot.o.l, w: spot.o.w, rotated: spot.o.rotated });
    weight += c.weight;
    area += c.l * c.w;
  }
  return { placed, rest, area, used: usedLength(placed), neat: true };
}

/** One floor, free-form. Every box is grown by the box gap so that touching rectangles end up exactly one gap apart. */
function packUnitFree(cols: Column[], L: number, W: number, payload: number, s: PlanSettings, h: RectHeuristic): UnitTry {
  const g = s.boxGap;
  const mr = new MaxRects({ x: s.edgeGap - g / 2, y: s.edgeGap - g / 2, w: L - 2 * s.edgeGap + g, h: W - 2 * s.edgeGap + g });
  const placed: Placed[] = [];
  const rest: Column[] = [];
  let weight = 0;
  let area = 0;
  for (const c of cols) {
    if (payload > 0 && weight + c.weight > payload + E) {
      rest.push(c);
      continue;
    }
    const p = mr.find(c.l + g, c.w + g, s.allowBoxRotation, h);
    if (!p) {
      rest.push(c);
      continue;
    }
    mr.place(p);
    weight += c.weight;
    area += c.l * c.w;
    placed.push({ col: c, x: p.x + g / 2, y: p.y + g / 2, l: p.w - g, w: p.h - g, rotated: p.rotated });
  }
  return { placed, rest, area, used: usedLength(placed), neat: false };
}

/**
 * Securing as a planning figure: an over-top lash across every row of
 * boxes, two X-lashes over the door end, two straps round every box, a corner
 * board wherever a lash crosses a box edge, and a tarpaulin that covers the
 * load and hangs down to the deck.
 */
function securingFor(placed: Placed[], W: number): Securing {
  if (placed.length === 0) return { overTop: 0, xLash: 0, boxStraps: 0, cornerBoards: 0, webbing: 0, tarpaulin: { l: 0, w: 0 } };
  const fronts = [...placed].map((p) => p.x).sort((a, b) => a - b);
  let rows = 0;
  let last = -Infinity;
  for (const x of fronts) {
    if (x > last + 50) rows += 1;
    last = x;
  }
  const H = Math.max(...placed.map((p) => p.col.height));
  const used = usedLength(placed);
  const xLash = 2;
  const half = (v: number) => Math.ceil(v * 2) / 2;
  return {
    overTop: rows,
    xLash,
    boxStraps: 2 * placed.reduce((a, p) => a + p.col.boxes.length, 0),
    cornerBoards: 2 * (rows + xLash),
    webbing: Math.ceil(rows * ((W + 2 * H) / 1000 + 1) + xLash * (Math.hypot(W, H) / 1000 + 1)),
    tarpaulin: { l: half((used + 2 * H) / 1000 + 0.5), w: half((W + 2 * H) / 1000 + 0.5) },
  };
}

function usedLength(placed: Placed[]) {
  return placed.reduce((a, p) => Math.max(a, p.x + p.l), 0);
}

/** Nearest box (at an overlapping height) or cargo wall on each side of a footprint. */
function clearanceOf(r: Placed, beside: { p: Placed; b: PackedBox }[], L: number, W: number): Clearance {
  const c: Clearance = {
    xNeg: { gap: r.x, to: null },
    xPos: { gap: L - (r.x + r.l), to: null },
    yNeg: { gap: r.y, to: null },
    yPos: { gap: W - (r.y + r.w), to: null },
  };
  const take = (side: keyof Clearance, gap: number, uid: number) => {
    if (gap < c[side].gap - E) c[side] = { gap, to: uid };
  };
  for (const { p: o, b } of beside) {
    const yOverlap = o.y < r.y + r.w - E && o.y + o.w > r.y + E;
    const xOverlap = o.x < r.x + r.l - E && o.x + o.l > r.x + E;
    if (yOverlap) {
      if (o.x + o.l <= r.x + E) take('xNeg', r.x - (o.x + o.l), b.uid);
      if (o.x >= r.x + r.l - E) take('xPos', o.x - (r.x + r.l), b.uid);
    }
    if (xOverlap) {
      if (o.y + o.w <= r.y + E) take('yNeg', r.y - (o.y + o.w), b.uid);
      if (o.y >= r.y + r.w - E) take('yPos', o.y - (r.y + r.w), b.uid);
    }
  }
  return c;
}
