import type { Settings, Vehicle } from './types';

/**
 * A rigid truck: the front axle under the cab, ahead of the load space, the
 * rear axle(s) about two thirds back; the front axle may carry ~45 % of the
 * payload, the rear all of it.
 */
function rigid(id: string, name: string, L: number, W: number, H: number, payload: number, cab = 1300): Vehicle {
  return { id, name, kind: 'rigid', L, W, H, payload, front: { x: -cab, max: Math.round(payload * 0.45) }, rear: { x: Math.round(L * 0.68), max: payload } };
}

/**
 * The common Indian goods-vehicle bodies, by their usual market names, with
 * the typical inside sizes and payloads freight brokers quote. Bodies vary by
 * builder: check the transporter's figures and edit them under Settings.
 */
export const VEHICLES: Vehicle[] = [
  rigid('ace', 'Tata Ace · 7 ft', 2140, 1440, 1500, 750, 900),
  rigid('pick8', 'Pickup · 8 ft', 2500, 1650, 1600, 1500, 1000),
  rigid('t407', 'Tata 407 · 10 ft', 3050, 1830, 1830, 2500, 1100),
  rigid('t14', '14 ft truck', 4270, 1980, 2130, 4000),
  rigid('t17', '17 ft truck', 5180, 2130, 2130, 5000),
  rigid('t19', '19 ft truck', 5790, 2290, 2290, 7000),
  rigid('t20', '20 ft truck', 6100, 2440, 2440, 7000),
  rigid('t22', '22 ft truck', 6710, 2440, 2440, 9000),
  rigid('t24', '24 ft truck', 7320, 2440, 2440, 10000),
  rigid('sxl32', '32 ft SXL', 9750, 2440, 2440, 8000, 1500),
  rigid('mxl32', '32 ft MXL', 9750, 2440, 2440, 16000, 1500),
  { id: 'c20', name: '20 ft container', kind: 'container', L: 5898, W: 2352, H: 2393, payload: 21700, front: { x: 0, max: 13000 }, rear: { x: 5898, max: 13000 } },
  { id: 'c40', name: '40 ft container', kind: 'container', L: 12032, W: 2352, H: 2393, payload: 26500, front: { x: 0, max: 15900 }, rear: { x: 12032, max: 15900 } },
  { id: 'tr40', name: '40 ft trailer', kind: 'semi', L: 12190, W: 2440, H: 2700, payload: 28000, front: { x: 1200, max: 12000 }, rear: { x: 9900, max: 28000 } },
];

/**
 * Starting settings. The crate figures are tuned to the works' own packing
 * history (pack/history.json: the signed packing check lists of past orders)
 * with `npm run tune`, except the 300 kg box limit, the works' written rule,
 * which the history neither needs nor contradicts.
 */
/**
 * Standard crate sizes (outside, inches, long side first): every box size on
 * the works' signed packing check lists (pack/history.json), smallest first.
 * With "Standard sizes" on, crates are picked from this list.
 */
export const CRATE_SIZES: { L: number; W: number; H: number }[] = [
  { L: 6.5, W: 6.5, H: 1.5 }, { L: 4, W: 4, H: 4 }, { L: 4, W: 4, H: 9 }, { L: 6, W: 6, H: 4 },
  { L: 5.5, W: 5.5, H: 7 }, { L: 6, W: 6, H: 6 }, { L: 5, W: 5, H: 9 }, { L: 9.5, W: 9.5, H: 2.5 },
  { L: 8, W: 8, H: 4 }, { L: 5, W: 5, H: 11 }, { L: 7, W: 7, H: 6 }, { L: 9, W: 9, H: 4 }, { L: 6, W: 6, H: 11 },
  { L: 11, W: 11, H: 4 }, { L: 10, W: 10, H: 5 }, { L: 16, W: 16, H: 2 }, { L: 15, W: 12, H: 4 },
  { L: 16, W: 16, H: 3 }, { L: 14, W: 14, H: 4 }, { L: 12, W: 12, H: 5.5 }, { L: 12, W: 12, H: 6 },
  { L: 15, W: 15, H: 5 }, { L: 24, W: 24, H: 2 }, { L: 14, W: 14, H: 6 }, { L: 12, W: 12, H: 10 },
  { L: 14, W: 14, H: 10 }, { L: 32, W: 32, H: 2 }, { L: 14, W: 14, H: 11 }, { L: 15, W: 15, H: 11.5 },
  { L: 36, W: 36, H: 2 }, { L: 17, W: 17, H: 11 }, { L: 17, W: 17, H: 11.5 }, { L: 19, W: 19, H: 11 },
  { L: 19, W: 19, H: 12 }, { L: 16, W: 16, H: 17 }, { L: 21, W: 21, H: 10 }, { L: 21, W: 21, H: 11 },
  { L: 16, W: 16, H: 19 }, { L: 52, W: 52, H: 2 }, { L: 21, W: 21, H: 14 }, { L: 24, W: 24, H: 12 },
  { L: 23, W: 13, H: 24 }, { L: 32, W: 17, H: 14 }, { L: 27, W: 27, H: 11 }, { L: 22, W: 22, H: 17 },
  { L: 21, W: 21, H: 19 }, { L: 24.5, W: 24.5, H: 14 }, { L: 26, W: 26, H: 13 }, { L: 29, W: 16, H: 19 },
  { L: 21, W: 21, H: 20 }, { L: 22, W: 22, H: 19 }, { L: 26, W: 26, H: 14 }, { L: 24.5, W: 24.5, H: 16 },
  { L: 35, W: 35, H: 8 }, { L: 29.5, W: 29.5, H: 11.5 }, { L: 31, W: 31, H: 11 }, { L: 24, W: 24, H: 19 },
  { L: 22, W: 22, H: 23 }, { L: 31.5, W: 31.5, H: 11.5 }, { L: 31, W: 31, H: 12 }, { L: 22, W: 22, H: 24 },
  { L: 29, W: 29, H: 14 }, { L: 31.5, W: 31.5, H: 12 }, { L: 24, W: 24, H: 21 }, { L: 22, W: 22, H: 25 },
  { L: 35, W: 35, H: 10 }, { L: 35.5, W: 35.5, H: 10 }, { L: 31.5, W: 31.5, H: 13 }, { L: 27, W: 27, H: 18 },
  { L: 26, W: 26, H: 20 }, { L: 27, W: 27, H: 19 }, { L: 30, W: 30, H: 16 }, { L: 35, W: 35, H: 12 },
  { L: 35.5, W: 35.5, H: 12 }, { L: 31, W: 31, H: 16 }, { L: 35, W: 35, H: 13 }, { L: 24, W: 24, H: 28 },
  { L: 39, W: 39, H: 11 }, { L: 27, W: 27, H: 24 }, { L: 35.5, W: 35.5, H: 14 }, { L: 29, W: 29, H: 21 },
  { L: 39, W: 39, H: 12 }, { L: 35, W: 35, H: 15 }, { L: 43, W: 43, H: 10 }, { L: 35, W: 35, H: 16 },
  { L: 34, W: 34, H: 17 }, { L: 39, W: 39, H: 13 }, { L: 35.5, W: 35.5, H: 16 }, { L: 41, W: 41, H: 12 },
  { L: 35, W: 35, H: 17 }, { L: 35.5, W: 35.5, H: 18 }, { L: 31, W: 31, H: 24 }, { L: 35, W: 35, H: 19 },
  { L: 43, W: 43, H: 13 }, { L: 47, W: 47, H: 11 }, { L: 39, W: 39, H: 16 }, { L: 35.5, W: 35.5, H: 20 },
  { L: 43, W: 43, H: 14 }, { L: 51, W: 51, H: 10 }, { L: 47, W: 47, H: 12 }, { L: 35, W: 35, H: 23 },
  { L: 39, W: 27, H: 28 }, { L: 55, W: 55, H: 10 }, { L: 64, W: 64, H: 7.5 }, { L: 47, W: 47, H: 14 },
  { L: 49, W: 49, H: 13 }, { L: 58, W: 55, H: 10 }, { L: 51, W: 51, H: 13 }, { L: 43, W: 43, H: 22 },
  { L: 59, W: 59, H: 12 }, { L: 49, W: 49, H: 18 }, { L: 67, W: 67, H: 10 }, { L: 42, W: 42, H: 26 },
  { L: 55, W: 55, H: 16 }, { L: 63, W: 63, H: 13 }, { L: 55, W: 55, H: 18 }, { L: 42, W: 42, H: 31 },
  { L: 71, W: 71, H: 12 }, { L: 79, W: 79, H: 12 }, { L: 71, W: 71, H: 15 }, { L: 85, W: 85, H: 11 },
  { L: 67, W: 67, H: 20 }, { L: 71, W: 71, H: 19 }, { L: 97, W: 97, H: 11 }, { L: 71, W: 71, H: 21 },
  { L: 85, W: 85, H: 16 }, { L: 79, W: 79, H: 23 },
];

export const DEFAULTS: Settings = {
  ring: 15,
  pile: 10,
  wall: 10,
  top: 25,
  sheet: 1,
  sheetEvery: 5,
  card: 1,
  bow: 0.01,
  maxPile: 100,
  nest: true,
  nestMax: 1000,
  crateMaxSide: 2300,
  crateMaxH: 500,
  crateMaxKg: 300,
  board: 22,
  skid: 75,
  lightKg: 10,
  lightBoard: 5,
  skidKg: 0,
  square: true,
  stackSame: true,
  fill: 0.3,
  aspect: 1.5,
  onTop: 0,
  inch: true,
  wallPct: 0,
  evenSplit: false,
  useSizes: true,
  crateSizes: CRATE_SIZES,
  sizeWall: 3,
  sizeBase: 10,
  sizeGap: 10,
  sizeTop: 15,
  sizeAlone: 800,
  deckWall: 50,
  deckGap: 40,
  deckTop: 100,
  stacking: 'auto',
  tiers: 2,
  bridge: true,
  vehicleId: 'auto',
  vehicles: VEHICLES,
  truckTurn: 0,
};

let seq = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
