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
