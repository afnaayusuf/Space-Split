// Every length is in millimetres and every weight in kilograms.

export type Family = 'SPW' | 'SC' | 'KAM' | 'DJ' | 'RTJ' | 'ISK' | 'PLUG' | 'OTHER';

/** One line of the PRN: so many identical gaskets. */
export interface Line {
  id: string;
  sl: string;
  code: string;
  description: string;
  family: Family;
  od: number;
  bore: number; // inside diameter
  thk: number;
  qty: number;
  kg: number; // per piece
  material: string;
  /** Size or weight came from a table or an estimate rather than the PRN itself. */
  sizeFrom: 'prn' | 'table' | 'description' | 'none';
  weightFrom: 'prn' | 'table' | 'estimate';
  /** EasyCargo's handling flags. Missing (an older job) reads as stackable and rotatable, never tilted. */
  stack?: boolean; // other gaskets may go on top
  tilt?: boolean; // may stand on edge (never used: gaskets lie flat)
  rotate?: boolean; // its crate may turn a quarter on the deck
  group?: string; // the file's Group column
  /** A heat-exchanger gasket with pass-partition ribs across its bore: nothing nests in it. */
  rib?: boolean;
}

export const canStack = (g: { stack?: boolean }) => g.stack !== false;
export const canRotate = (g: { rotate?: boolean }) => g.rotate !== false;

/**
 * A vehicle's load space and the two points the load bears on: the kingpin
 * (or front axle) and the rear axle group, measured from the front wall of
 * the load space. `max` is the most load each may carry.
 */
export interface Vehicle {
  id: string;
  name: string;
  kind: 'semi' | 'rigid' | 'container';
  L: number;
  W: number;
  H: number;
  payload: number;
  front: { x: number; max: number };
  rear: { x: number; max: number };
}

export interface Settings {
  /** Gasket clearances. */
  ring: number; // round a stack nested in a bore
  pile: number; // between stacks side by side
  wall: number; // stack to crate wall
  top: number; // above the tallest stack, under the lid
  sheet: number; // cardboard square between gaskets
  sheetEvery: number; // gaskets to a cardboard square (kammprofile and double jacketed: see `card`)
  card: number; // 3-ply corrugated square under every kammprofile and double jacketed gasket
  bow: number; // spiral wound is not flat: each takes at least OD × bow of height
  maxPile: number; // tallest single stack
  nest: boolean;
  nestMax: number; // largest OD whose bore takes other stacks; 0 = any
  /** Crates are made to measure, within these. */
  crateMaxSide: number; // longest inside side
  crateMaxH: number; // inside height
  crateMaxKg: number;
  board: number; // plank
  skid: number;
  /** Small boxes: up to `lightKg` of gaskets a box has `lightBoard` sides and no skids; skids only above `skidKg`. */
  lightKg: number;
  lightBoard: number;
  skidKg: number;
  square: boolean; // crates are square: a × a cells
  aspect: number; // a crate's stacks no taller than this × its lead square's side; 0 = only the height limit
  fill: number; // a square crate is made wide enough to take what is left at this share of its room; 0 = off
  stackSame: boolean; // squares of a size stand on one another before the crate is made wider
  onTop: number; // a smaller square rides on a bigger one only if its side is at least this share; 0 = any
  inch: boolean; // outside sizes rounded up to whole inches
  wallPct: number; // wall clearance, both sides together, at least this share of the largest square's side
  evenSplit: boolean; // squares of a size needing several crates are shared out evenly
  /** Standard crate sizes: crates are picked from this list (outside, inches) instead of made to measure. */
  useSizes?: boolean;
  crateSizes?: { L: number; W: number; H: number }[];
  sizeWall?: number; // a standard box's side, each side (mm)
  sizeBase?: number; // a standard box's floor and lid together (mm)
  sizeGap?: number; // in a standard box: between stacks and to the walls (mm)
  sizeTop?: number; // in a standard box: above the tallest stack (mm)
  /** On the vehicle. */
  deckWall: number;
  deckGap: number;
  deckTop: number;
  stacking: 'auto' | 'always' | 'never';
  tiers: number; // most identical crates in one stack
  bridge: boolean;
  vehicleId: string;
  vehicles: Vehicle[];
  /** Quarter turns applied to an uploaded truck model so it faces forward. */
  truckTurn: number;
}

// ------------------------------------------------------------------ the plan

/** A stack of gaskets from one line: a gasket on every cardboard square, bottom up. */
export interface Pile {
  id: string;
  line: string;
  od: number;
  bore: number;
  thk: number;
  h: number; // n × pitch
  n: number;
  /** Height each gasket takes with its share of cardboard; missing in older plans: thk + sheet. */
  pitch?: number;
  kg: number;
  /** Centre, from the centre of the group's square. */
  x: number;
  y: number;
  depth: number; // 0 = the group's own stack, 1 = in its bore, …
  stack: boolean; // false: one gasket, nothing on top of it
  rotate: boolean;
  rib?: boolean; // ribs across the bore: nothing nests in it
}

/**
 * One stack and the stacks nested in its bore, on a pile of cardboard squares
 * (side = the largest OD). Layer k carries every stack with more than k
 * gaskets; `layers[k]` is its height: the cardboard plus the thickest gasket on it.
 */
export interface Group {
  id: string;
  side: number;
  h: number; // all the layers
  kg: number;
  layers: number[];
  piles: Pile[];
  noTop: boolean; // carries a non-stackable gasket: nothing goes on this square
}

export interface PlacedGroup {
  group: Group;
  /** Corner of the base square nearest the crate's origin, inside the crate; z = height of its base. */
  x: number;
  y: number;
  z: number;
}

/** A crate made to measure: a grid of `a` × `b` cells of `cell` mm, smaller squares stacked on the bigger ones. */
export interface Crate {
  id: string;
  no: number;
  name: string; // "2 × 3 · 600"
  cell: number;
  a: number; // cells across
  b: number; // cells along
  inner: { L: number; W: number; H: number };
  outer: { L: number; W: number; H: number };
  /** Its own plank and skids (a light box has thinner sides and none). Missing in older plans: the settings'. */
  board?: number;
  skid?: number;
  groups: PlacedGroup[];
  net: number;
  tare: number;
  gross: number;
  fill: number; // stack volume over inside volume
  /** Centre of gravity of the loaded crate: x along L and y along W from the crate's middle, z up from its underside. */
  cog: { x: number; y: number; z: number };
  stack: boolean; // other crates may stand on it
  rotate: boolean; // may turn a quarter on the deck
  /** Picked from the standard sizes (true), or made to measure because none would take it (false); missing when standard sizes are off. */
  standard?: boolean;
}

export interface Placement {
  crate: string;
  /** Corner nearest the front-left of the deck, at floor level z. */
  x: number;
  y: number;
  z: number;
  L: number; // as placed, along the deck
  W: number;
  H: number;
  turned: boolean;
  step: number; // loading order on this vehicle, from 1
  on: 'floor' | 'same' | 'bridge'; // same = on a crate with the same footprint
}

export interface Load {
  no: number;
  vehicle: Vehicle;
  placed: Placement[];
  kg: number;
  length: number; // loading metres used, mm
  cog: { x: number; y: number; z: number };
  target: number;
  front: number; // load on the kingpin / front axle
  rear: number;
  offset: number; // gap left at the front wall to bring the centre of gravity right
  notes: string[];
}

export interface Plan {
  lines: number;
  pieces: number;
  piles: Pile[];
  groups: Group[];
  crates: Crate[];
  loads: Load[];
  skipped: { line: string; why: string }[];
  stranded: { crate: string; why: string }[];
  notes: string[];
  net: number;
  gross: number;
  ms: number;
  /** With the vehicle on Auto: how each vehicle type would do, best first. */
  fleet: FleetOption[];
  auto: boolean;
}

export interface FleetOption {
  id: string;
  name: string;
  count: number; // vehicles needed
  stranded: number; // crates it cannot take
  kgUse: number; // payload used, 0–1, over all the vehicles
  lengthUse: number; // loading length used, 0–1
  chosen: boolean;
}
