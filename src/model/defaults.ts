import { lineFromText } from '../parse/describe';
import type { Band, BandSheets, BoxSize, CargoSpec, Family, GasketLine, Job, JobInfo, PlanSettings, RuleId, Vehicle, WorksSetup } from './types';

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36).slice(-4)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const INCH = 25.4;

export const FAMILIES: { id: Family; name: string; short: string }[] = [
  { id: 'SPW', name: 'Spiral wound', short: 'SPW' },
  { id: 'SC', name: 'Soft cut', short: 'SC' },
  { id: 'KAM', name: 'Kammprofile', short: 'KAM' },
  { id: 'DJ', name: 'Double jacketed', short: 'DJ' },
  { id: 'RTJ', name: 'Ring joint', short: 'RTJ' },
  { id: 'ISK', name: 'Insulation kit', short: 'ISK' },
  { id: 'OTHER', name: 'Other', short: 'Other' },
];
export const familyName = (f: Family) => FAMILIES.find((x) => x.id === f)?.name ?? f;

export const RULES: { id: RuleId; type: number; name: string; detail: string }[] = [
  { id: 'export', type: 5, name: 'Export packing', detail: 'Export bundle counts; bundles nested into the tightest bore; no two gasket types in a box except the small sizes.' },
  { id: 'domestic', type: 6, name: 'Domestic packing', detail: 'Domestic bundle counts; spiral wound 12″ and up singly on corrugated squares; nothing nested above 10″; ½–2″ as filler.' },
  { id: 'knpc', type: 2, name: 'KNPC', detail: 'A corrugated square between every ring; one item code per box.' },
  { id: 'consolidated', type: 3, name: 'Consolidated (general)', detail: 'Everything in the PRN in one box, sized to the largest piece. A second box only when one is too deep or too heavy.' },
  { id: 'given', type: 4, name: 'Boxes as given', detail: 'Obey the Box No on each check-list line; each box is sized to what it holds.' },
];
export const ruleName = (r: RuleId) => RULES.find((x) => x.id === r)?.name ?? r;
export const ruleType = (r: RuleId) => RULES.find((x) => x.id === r)?.type ?? 0;

/** The works' bundle sheets, as written on the export and domestic packing sheets. */
export function worksBands(): BandSheets {
  const b = (min: number, max: number, count: number, carded = false): Band => ({ min, max, count, carded });
  return {
    exportSPW: [b(0.5, 1, 25), b(1.5, 8, 10), b(10, 24, 5), b(26, 0, 5)],
    domesticSPW: [b(0.5, 4, 24), b(6, 8, 10), b(10, 10, 5), b(12, 24, 1, true), b(26, 0, 1, true)],
    softCut: [b(0.5, 4, 24), b(6, 8, 10), b(10, 0, 5)],
  };
}

/**
 * Corrugated square stock: 19 sizes from 18″ (457.2 mm) to 1900 mm, the range
 * the box shop's list covers. Replace with the shop's own sizes under Box sizes.
 */
export const STOCK_CARD_SIZES = [18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 40, 44, 48, 52, 56, 60, 64, 70].map((i) => +(i * INCH).toFixed(1)).concat([1900]);

/** Typical inside load-body sizes of the Indian road fleet and ISO containers. Measure the actual vehicles and edit the list. */
export const DEFAULT_FLEET: Vehicle[] = [
  { id: 'ace', name: 'Tata Ace', length: 2200, width: 1490, height: 1500, maxPayload: 750 },
  { id: 'pickup', name: 'Pick-up (Bolero / Intra)', length: 2690, width: 1690, height: 1600, maxPayload: 1500 },
  { id: 't407', name: '407 / 10 ft', length: 3050, width: 1830, height: 1800, maxPayload: 2500 },
  { id: 'lcv14', name: '14 ft LCV', length: 4270, width: 1980, height: 2000, maxPayload: 4000 },
  { id: 'lcv17', name: '17 ft', length: 5180, width: 2130, height: 2100, maxPayload: 5000 },
  { id: 'tr19', name: '19 ft', length: 5790, width: 2290, height: 2200, maxPayload: 7000 },
  { id: 'tr20', name: '20 ft', length: 6100, width: 2400, height: 2400, maxPayload: 9000 },
  { id: 'tr22', name: '22 ft', length: 6710, width: 2400, height: 2400, maxPayload: 10000 },
  { id: 'tr24', name: '24 ft', length: 7320, width: 2400, height: 2500, maxPayload: 12000 },
  { id: 'sxl32', name: '32 ft SXL', length: 9750, width: 2400, height: 2400, maxPayload: 7500 },
  { id: 'mxl32', name: '32 ft MXL', length: 9750, width: 2400, height: 2400, maxPayload: 15000 },
  { id: 'c20', name: "20' container", length: 5898, width: 2352, height: 2393, maxPayload: 28200 },
  { id: 'c40', name: "40' container", length: 12032, width: 2352, height: 2393, maxPayload: 26700 },
  { id: 'c40hc', name: "40' high cube", length: 12032, width: 2352, height: 2698, maxPayload: 26500 },
];

export function cargoFromVehicle(v: Vehicle): CargoSpec {
  return { presetId: v.id, name: v.name, length: v.length, width: v.width, height: v.height, maxPayload: v.maxPayload };
}

/** The vehicle a job starts on: the 20 ft truck, or the first one in the fleet. */
export function defaultCargo(fleet: Vehicle[] = DEFAULT_FLEET): CargoSpec {
  const v = fleet.find((x) => x.id === 'tr20') ?? fleet[0] ?? DEFAULT_FLEET[6];
  return cargoFromVehicle(v);
}

/**
 * Defaults are the works' figures (docs: packing rules): 1″ headroom, 50 mm a
 * side for a bare bundle, 25 mm for a carded ring or carton, a 5 mm nest
 * slack, bow at 1.25 % of the OD, a 300 kg box and a 30″ deepest box.
 */
export const DEFAULT_SETTINGS: PlanSettings = {
  rule: 'export',
  bands: worksBands(),
  generalBands: 'domestic',
  mixSmall: true,
  smallMax: 24,
  sizeCluster: 0.9,
  allowNesting: true,
  nestSlack: 5,
  nestAnyRating: false,
  domesticNestCap: 10,
  fillerMax: 2,
  clearBundle: 50,
  clearCarded: 25,
  pileGap: 25,
  headroom: INCH,
  bowPct: 1.25,
  cardSizes: STOCK_CARD_SIZES,
  cardMargin: 3,
  cardThickness: 3,
  ringsPerCard: 10,
  boardKgPerM2: 0.55,
  cartonSide: 2,
  cartonDepth: 2,
  boxSizing: 'ladder-custom',
  maxBoxDepth: 30 * INCH,
  maxBoxWeight: 300,
  maxCustomSide: 72 * INCH,
  wall: 12,
  base: 12,
  lid: 12,
  skid: 0,
  boxKgPerM2: 9.5,
  centerContents: true,
  boxGap: 100,
  edgeGap: 100,
  allowBoxRotation: true,
  maxTiers: 2,
  tierMode: 'fewest',
  maxTopLoad: 600,
};

export function blankLine(): GasketLine {
  return {
    id: newId('l'),
    sl: '',
    poSl: '',
    itemCode: '',
    description: '',
    family: 'SPW',
    size: 0,
    rating: 150,
    ringNo: '',
    material: '',
    od: 0,
    innerD: 0,
    thickness: 4.5,
    quantity: 0,
    uom: 'NOS',
    unitWeight: 0,
    weightEstimated: false,
    boxNo: '',
  };
}

export function blankBox(): BoxSize {
  return { id: newId('b'), name: '', outerL: 24 * INCH, outerW: 24 * INCH, maxDepth: 0, wall: 12, base: 12, lid: 12, skid: 0, available: 0, enabled: true };
}

export const today = () => new Date().toISOString().slice(0, 10);
export const blankJob = (): JobInfo => ({ prn: '', po: '', poDate: '', customer: '', dispatch: 'Surface', date: today() });

/**
 * The works' stock box ladder, from their own annexures (outside, inches):
 * 12, 16, 21, 26, 30, 34, 35, 39, 43, 47, 51, 55, 63, 71 — square boxes, depth cut to suit.
 */
export function ladderBoxes(): BoxSize[] {
  return [12, 16, 21, 26, 30, 34, 35, 39, 43, 47, 51, 55, 63, 71].map((i) => ({
    ...blankBox(),
    id: `lad${i}`,
    name: `${i}″ square`,
    outerL: i * INCH,
    outerW: i * INCH,
  }));
}

/** The works setup a new installation starts from. */
export function defaultSetup(): WorksSetup {
  return {
    boxSizes: ladderBoxes(),
    settings: { ...DEFAULT_SETTINGS, bands: worksBands(), cardSizes: [...STOCK_CARD_SIZES] },
    fleet: DEFAULT_FLEET.map((v) => ({ ...v })),
    updatedAt: '',
  };
}

/** An empty job on the works' default packing type and vehicle. */
export function newJob(setup: WorksSetup, info: Partial<JobInfo> = {}): Job {
  const now = new Date().toISOString();
  return {
    id: newId('j'),
    info: { ...blankJob(), ...info },
    lines: [],
    rule: setup.settings.rule,
    cargo: defaultCargo(setup.fleet),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

/** A complete line from a description, with an item code and SL. */
export function lineFrom(text: string, extra: Partial<GasketLine> = {}): GasketLine {
  const { line } = lineFromText(text, extra);
  return { ...blankLine(), ...line, ...extra, id: newId('l') } as GasketLine;
}
