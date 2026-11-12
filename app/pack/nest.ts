import { canRotate, canStack, type Group, type Line, type Pile, type Settings } from '../model/types';

/**
 * Height one gasket of a line takes in a stack: the gasket (a spiral wound
 * one at least OD × `bow`, as it does not lie flat) and its share of the
 * cardboard — a `sheet` square to every `sheetEvery` gaskets, but a 3-ply
 * corrugated square (`card`) under every kammprofile and double jacketed one.
 */
export function pitchOf(g: Pick<Line, 'family' | 'od' | 'thk'>, s: Settings): number {
  const thk = g.thk > 0 ? g.thk : 3;
  const body = g.family === 'SPW' ? Math.max(thk, g.od * (s.bow ?? 0)) : thk;
  if (g.family === 'KAM' || g.family === 'DJ') return body + (s.card ?? s.sheet);
  return body + s.sheet / Math.max(1, Math.round(s.sheetEvery ?? 1));
}

/**
 * Splits each line into stacks no taller than `maxPile`, evenly: 100 pieces
 * that make 1.3 stacks become two of 50, not 77 and 23. A stack is n gaskets
 * on cardboard squares, so its height is n × the pitch above. A line
 * marked not stackable gives one gasket per stack: nothing may go on it.
 */
export function makePiles(lines: Line[], s: Settings): Pile[] {
  const out: Pile[] = [];
  for (const g of lines) {
    if (!(g.qty > 0) || !(g.od > 0)) continue;
    const thk = g.thk > 0 ? g.thk : 3;
    const layer = pitchOf(g, s);
    const stack = canStack(g);
    const per = stack ? Math.max(1, Math.floor(s.maxPile / layer + 1e-9)) : 1;
    const count = Math.ceil(g.qty / per);
    const base = Math.floor(g.qty / count);
    let extra = g.qty - base * count;
    for (let k = 0; k < count; k++) {
      const n = base + (extra-- > 0 ? 1 : 0);
      out.push({ id: `${g.id}.${k + 1}`, line: g.id, od: g.od, bore: g.bore, thk, pitch: layer, h: +(n * layer).toFixed(2), n, kg: n * g.kg, x: 0, y: 0, depth: 0, stack, rotate: canRotate(g), ...(g.rib ? { rib: true } : {}) });
    }
  }
  return out;
}

/** The height of each layer of a group: the tallest pitch (gasket and cardboard) of the stacks that still have a piece on that layer. */
export function layerHeights(piles: Pile[], sheet: number): number[] {
  const count = Math.max(0, ...piles.map((p) => p.n));
  const out = new Array<number>(count);
  const byN = [...piles].sort((a, b) => b.n - a.n);
  let i = 0;
  let thickest = 0;
  for (let k = count - 1; k >= 0; k--) {
    while (i < byN.length && byN[i].n > k) {
      const p = byN[i++];
      thickest = Math.max(thickest, p.pitch ?? p.thk + sheet);
    }
    out[k] = thickest;
  }
  return out;
}

interface Orbit {
  rho: number; // distance of the slot centres from the bore centre
  slot: number; // radius each slot takes
  angles: number[];
  used: number;
}

interface Host {
  pile: Pile;
  group: number;
  /** Free radius of the bore: half the ID less the clearance. */
  R: number;
  centre: Pile | null;
  orbits: Orbit[];
  /** Smallest radius known not to fit any more. */
  fail: number;
}

/**
 * Nests smaller stacks inside the bores of bigger ones. Stacks go in largest
 * first, each into the tightest bore that still has room, so big bores are
 * kept for big stacks. Inside a bore the first stack goes in the centre; the
 * rest stand on concentric orbits round it, evenly spaced, with `ring`
 * clearance to the bore and `pile` clearance between stacks. A nested stack's
 * own bore takes smaller stacks in turn.
 *
 * Every stack that fits no bore starts a group: a cardboard square as wide as
 * its OD, carrying it and everything nested in it, layer by layer.
 */
export function nest(piles: Pile[], s: Settings): Group[] {
  const sorted = [...piles].sort((a, b) => b.od - a.od || b.h - a.h);
  const groups: { root: Pile; piles: Pile[] }[] = [];
  const hosts: Host[] = []; // by free radius, smallest first

  const addHost = (p: Pile, group: number) => {
    const R = p.bore / 2 - s.ring;
    if (R < 8 || p.rib || (s.nestMax > 0 && p.od > s.nestMax)) return;
    const h: Host = { pile: p, group, R, centre: null, orbits: [], fail: Infinity };
    let lo = 0;
    let hi = hosts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (hosts[mid].R < R) lo = mid + 1;
      else hi = mid;
    }
    hosts.splice(lo, 0, h);
  };

  /** A place for a stack of radius r in this bore (relative to the bore centre) and the orbit it uses, or null. */
  const placeIn = (h: Host, r: number): { x: number; y: number; orbit: Orbit | null } | null => {
    if (r > h.R + 1e-6 || r >= h.fail) return null;
    if (!h.centre) return { x: 0, y: 0, orbit: null };
    // a free slot on an orbit made for stacks no more than twice as wide
    for (const o of h.orbits) {
      if (o.used < o.angles.length && o.slot >= r - 1e-6 && o.slot <= r * 2) {
        const a = o.angles[o.used];
        return { x: o.rho * Math.cos(a), y: o.rho * Math.sin(a), orbit: o };
      }
    }
    // a new orbit outside the last one
    const last = h.orbits[h.orbits.length - 1];
    const inner = last ? last.rho + last.slot : h.centre.od / 2;
    const rho = inner + s.pile + r;
    if (rho + r > h.R + 1e-6) return null;
    const half = Math.asin(Math.min(1, (r + s.pile / 2) / rho));
    const count = Math.max(1, Math.floor(Math.PI / half + 1e-9));
    const step = (2 * Math.PI) / count;
    const start = h.orbits.length % 2 ? step / 2 : 0;
    const orbit: Orbit = { rho, slot: r, angles: Array.from({ length: count }, (_, k) => start + k * step), used: 0 };
    h.orbits.push(orbit);
    return { x: rho * Math.cos(orbit.angles[0]), y: rho * Math.sin(orbit.angles[0]), orbit };
  };

  const take = (h: Host, p: Pile, at: { x: number; y: number; orbit: Orbit | null }) => {
    if (at.orbit) at.orbit.used++;
    else h.centre = p;
    p.x = h.pile.x + at.x;
    p.y = h.pile.y + at.y;
    p.depth = h.pile.depth + 1;
  };

  for (const p of sorted) {
    const r = p.od / 2;
    let placed = false;
    // a non-stackable gasket stands alone: nested in a bore it would have the host's next cardboard on top
    if (s.nest && p.stack) {
      // first host with a big enough bore
      let lo = 0;
      let hi = hosts.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (hosts[mid].R < r) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < hosts.length && !placed; i++) {
        const h = hosts[i];
        const at = placeIn(h, r);
        if (!at) {
          h.fail = Math.min(h.fail, r);
          continue;
        }
        take(h, p, at);
        groups[h.group].piles.push(p);
        addHost(p, h.group);
        placed = true;
      }
    }
    if (!placed) {
      p.x = 0;
      p.y = 0;
      p.depth = 0;
      groups.push({ root: p, piles: [p] });
      if (p.stack) addHost(p, groups.length - 1);
    }
  }

  return groups.map((g, i) => {
    const layers = layerHeights(g.piles, s.sheet);
    return {
      id: `g${i + 1}`,
      side: g.root.od,
      h: +layers.reduce((a, b) => a + b, 0).toFixed(2),
      kg: g.piles.reduce((a, p) => a + p.kg, 0),
      layers,
      piles: g.piles,
      noTop: g.piles.some((p) => !p.stack),
    };
  });
}
