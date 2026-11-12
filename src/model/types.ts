// All lengths are millimetres, all weights kilograms. Box sizes are shown in
// whole inches because that is how the works builds and lists them.

// ---------------------------------------------------------------- inputs ---

/** Gasket families as the works names them on a PRN. */
export type Family = 'SPW' | 'SC' | 'KAM' | 'DJ' | 'RTJ' | 'ISK' | 'OTHER';

/**
 * The works' packing types.
 * - export, domestic: the two packing sheets, each with its own bundle counts
 * - knpc: a corrugated square between every ring, one item code per box
 * - consolidated: everything in the PRN in one box (the "general" type)
 * - given: obey the box numbers already on the packing check list
 */
export type RuleId = 'export' | 'domestic' | 'knpc' | 'consolidated' | 'given';

/** How box sizes are chosen: the stock ladder only, the ladder then made-to-measure, or always made-to-measure. */
export type BoxSizing = 'ladder' | 'ladder-custom' | 'custom';

/** One line of a PRN / packing check list. */
export interface GasketLine {
  id: string;
  sl: string;
  poSl: string;
  itemCode: string;
  description: string; // as written on the PRN
  family: Family;
  size: number; // nominal pipe size in inches, 0 = not known
  rating: number; // pressure class, 0 = not known
  ringNo: string; // ring joints: R24, RX45, BX152
  material: string;
  od: number; // outermost diameter (outer ring for spiral wound)
  innerD: number; // innermost diameter (inner ring for spiral wound)
  thickness: number; // height one piece adds to a stack (winding for spiral wound, ring height for RTJ, set height for ISK)
  quantity: number;
  uom: string;
  unitWeight: number; // per piece
  weightEstimated: boolean; // true while the weight comes from the geometry estimate, not a chart or the user
  boxNo: string; // the Box No cell of the check list, e.g. "2,3,4 (50/50/10)"; used by the boxes-as-given rule
}

export interface JobInfo {
  prn: string;
  po: string;
  poDate: string;
  customer: string;
  dispatch: string;
  date: string;
}

/** A standard box size from the works' ladder. Sizes are outside dimensions. */
export interface BoxSize {
  id: string;
  name: string;
  outerL: number;
  outerW: number;
  maxDepth: number; // outside, 0 = the rule's deepest box
  wall: number; // side boards
  base: number;
  lid: number;
  skid: number;
  available: number; // 0 = as many as needed
  enabled: boolean;
}

/** One row of a bundle-count sheet. Sizes are nominal inches, inclusive. */
export interface Band {
  min: number;
  max: number;
  count: number; // pieces per bundle
  carded: boolean; // laid singly on corrugated squares instead of bundled
}

export interface BandSheets {
  exportSPW: Band[];
  domesticSPW: Band[];
  softCut: Band[];
}

export interface CargoSpec {
  presetId: string;
  name: string;
  length: number; // along floor X, front wall to door
  width: number; // along floor Y
  height: number; // 0 = no limit
  maxPayload: number; // 0 = no limit
}

export type TierMode = 'fewest' | 'compact';

export interface PlanSettings {
  rule: RuleId;
  bands: BandSheets;
  generalBands: 'export' | 'domestic'; // bundle counts used by the consolidated and boxes-as-given types

  // which gaskets may share a box
  mixSmall: boolean; // pieces at or under smallMax share one box, whatever their type
  smallMax: number; // inches
  sizeCluster: number; // above smallMax, a piece shares a box only with pieces at least this share of the largest

  // nesting
  allowNesting: boolean;
  nestSlack: number; // bore minus outer diameter, at least this
  nestAnyRating: boolean;
  domesticNestCap: number; // domestic: nothing nests inside a ring above this size
  fillerMax: number; // domestic: sizes up to this are fillers and ignore the cap

  // inside the box
  clearBundle: number; // a bare bundle to the box wall, per side
  clearCarded: number; // a ring on a square, or a ring carton, to the box wall
  pileGap: number; // between neighbouring piles
  headroom: number; // clear above the tallest pile
  bowPct: number; // spiral wound layer pitch is at least this share of the OD

  // corrugated board and cartons
  cardSizes: number[]; // square sheet stock, mm
  cardMargin: number; // the square overhangs the ring by at least this, per side
  cardThickness: number;
  ringsPerCard: number; // carded rings laid singly, one square under each this many
  boardKgPerM2: number; // corrugated board weight
  cartonSide: number; // RTJ carton side = ring OD + this
  cartonDepth: number; // RTJ carton depth = ring height + this

  // the box
  boxSizing: BoxSizing;
  maxBoxDepth: number; // outside
  maxBoxWeight: number; // gross
  maxCustomSide: number; // made-to-measure, outside
  wall: number; // made-to-measure boards
  base: number;
  lid: number;
  skid: number;
  boxKgPerM2: number; // empty box weight per m² of outside surface
  centerContents: boolean;

  // the vehicle
  boxGap: number;
  edgeGap: number;
  allowBoxRotation: boolean;
  maxTiers: number;
  tierMode: TierMode;
  maxTopLoad: number; // kg allowed on top of a box, 0 = no limit
}

/** A vehicle the works loads: inside load-body size and payload. */
export interface Vehicle {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number; // 0 = open body
  maxPayload: number;
}

export interface PlanInput {
  job: JobInfo;
  lines: GasketLine[];
  boxSizes: BoxSize[];
  cargo: CargoSpec;
  settings: PlanSettings;
  fleet?: Vehicle[]; // the works' vehicles, for the recommended truck
}

// ---------------------------------------------------------------- records ---

/** Everything the works sets once and every job uses: box ladder, rules, fleet. */
export interface WorksSetup {
  boxSizes: BoxSize[];
  settings: PlanSettings; // settings.rule is the packing type new jobs start with
  fleet: Vehicle[];
  updatedAt: string;
}

/**
 * A chart weight (and outline) the works has on file for one gasket size,
 * reused whenever that size turns up on a PRN. Keyed by spec (type, size,
 * class or ring number), or by customer item code when one is given.
 */
export interface MasterItem {
  key: string;
  family: Family;
  size: number;
  rating: number;
  ringNo: string;
  itemCode: string;
  description: string;
  od: number;
  innerD: number;
  thickness: number;
  unitWeight: number;
  updatedAt: string;
}

export type JobStatus = 'draft' | 'packed' | 'dispatched';

/** One PRN: its header, lines, packing type and vehicle. */
export interface Job {
  id: string;
  info: JobInfo;
  lines: GasketLine[];
  rule: RuleId;
  cargo: CargoSpec;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

/** What the job list shows without loading the lines. */
export interface JobSummary {
  id: string;
  prn: string;
  po: string;
  customer: string;
  rule: RuleId;
  status: JobStatus;
  lines: number;
  pieces: number;
  boxes: number | null; // from the last plan seen when the job was saved
  gross: number | null;
  createdAt: string;
  updatedAt: string;
  session: string; // which open window saved it last
}

// ---------------------------------------------------------------- output ---

/** How the pieces of one pile are packed. */
export type UnitKind =
  | 'bundle' // rings strapped together
  | 'carded' // rings laid singly, a corrugated square under each few (domestic spiral wound 12" and up)
  | 'card' // one piece per corrugated square (Kammprofile, double jacketed)
  | 'sheeted' // a corrugated square between every ring (KNPC)
  | 'carton' // one ring per carton (RTJ)
  | 'kit'; // an insulation kit set

/** Clear distance on one side, and what it is measured to. */
export interface Side {
  gap: number;
  to: number | null; // number of the neighbouring pile or box; null = the wall
}

/** Clear distances on the four sides, as drawn: xNeg = left, xPos = right, yNeg = up, yPos = down. */
export interface Clearance {
  xNeg: Side;
  xPos: Side;
  yNeg: Side;
  yPos: Side;
}

/** A pile: units of one line stacked on one spot of the box floor, or inside the bore of another pile. */
export interface PlacedStack {
  no: number; // 1-based, also the order to pack them in
  typeId: string; // the line
  kind: UnitKind;
  shape: 'circle' | 'square';
  count: number; // pieces
  units: number; // bundles, squares or cartons
  perUnit: number; // pieces in a full unit
  x: number; // centre, from the arrow corner on the inside of the walls
  y: number;
  r: number; // half the footprint: ring radius, or half the square
  rIn: number; // bore radius, 0 when it cannot hold anything
  ringR: number; // radius of the ring itself (inside a square it is smaller than r)
  height: number;
  unitHeight: number; // height of one full unit
  cards: number; // corrugated squares in this pile
  host: number | null; // number of the pile this one stands inside, centred
  depth: number;
  nearestGap: number | null;
  nearestNo: number | null;
  around: Clearance | null; // piles on the box floor
  boreGap: number | null; // nested piles: clearance all round to the bore around them
}

export interface BoxContentLine {
  typeId: string;
  pieces: number;
  stacks: number;
  weight: number;
}

export interface BoxLocation {
  unit: number; // 0-based truck / container
  tier: number; // 0-based layer
  x: number; // near corner of the footprint, from the floor origin
  y: number;
  l: number; // footprint along floor X
  w: number; // footprint along floor Y
  z: number; // height of the box base above the floor
  rotated: boolean; // turned 90° clockwise relative to the drawing of the box
  around: Clearance; // nearest box or cargo wall on each side, by box number
  on: number | null; // box number this one stands on
  load: number; // loading sequence, 1 = first on
}

export interface PackedBox {
  uid: number;
  no: number; // box number on the paperwork
  label: string; // as printed: the number, or the check list's own box number
  sizeId: string | null; // ladder entry, null = made to measure
  boxName: string;
  group: string; // what the box holds, e.g. "Spiral wound 10–24″"
  inner: { l: number; w: number; h: number };
  ext: { l: number; w: number; h: number };
  wall: number;
  headroom: number; // clear space above the tallest pile
  stacks: PlacedStack[];
  contents: BoxContentLine[];
  pieces: number;
  netWeight: number; // gaskets
  packWeight: number; // corrugated squares and cartons
  tare: number; // the empty box
  grossWeight: number;
  cbm: number;
  floorUse: number;
  fillRate: number;
  cog: { x: number; y: number } | null;
  location: BoxLocation | null;
}

export interface Securing {
  overTop: number; // lashes over the top, one per row of boxes
  xLash: number;
  boxStraps: number;
  cornerBoards: number;
  webbing: number; // metres
  tarpaulin: { l: number; w: number }; // metres
}

export interface CargoUnit {
  index: number;
  tiers: number;
  boxUids: number[];
  usedLength: number;
  floorUse: number;
  weight: number;
  cog: { x: number; y: number } | null;
  loadHeight: number;
  securing: Securing;
}

export interface UnplacedLine {
  typeId: string;
  quantity: number;
  reason: string;
}

/** How one line was packed, for the notes and the paperwork. */
export interface LinePacking {
  typeId: string;
  kind: UnitKind;
  perUnit: number;
  note: string; // e.g. "bundles of 5 (10–24″ export)"
}

export interface PackagePlan {
  job: JobInfo;
  types: GasketLine[];
  cargo: CargoSpec;
  settings: PlanSettings;
  packing: LinePacking[];
  boxes: PackedBox[];
  units: CargoUnit[];
  unplacedGaskets: UnplacedLine[];
  unloadedBoxUids: number[];
  warnings: string[];
  issues: string[]; // geometry self-check, empty when every rule holds
  recommendedVehicle: string | null;
  totals: {
    boxes: number;
    pieces: number;
    requested: number;
    net: number;
    gross: number;
    cbm: number;
  };
  ms: number;
}
