import { inch } from '../model/catalog';
import type { Band, Family, GasketLine, PlanSettings, RuleId, UnitKind } from '../model/types';

/** How one line is packed: what a unit is, its footprint, and its height and weight for n pieces. */
export interface LinePack {
  line: GasketLine;
  kind: UnitKind;
  shape: 'circle' | 'square';
  foot: number; // diameter of a ring unit, side of a square
  bore: number; // free bore of a ring unit, 0 if nothing may go inside
  perUnit: number;
  height: (n: number) => number;
  weight: (n: number) => number; // gaskets plus board
  board: (n: number) => number; // board only
  cards: (n: number) => number;
  material: number; // gasket volume per piece, mm³
  note: string;
  carded: boolean; // never shares a box
}

const fmtBand = (b: Band) => (b.max === 0 ? `${inch(b.min)} and up` : b.min === b.max ? inch(b.min) : `${inch(b.min)}–${inch(b.max)}`);

/** The band a size falls in, or the nearest one with a warning. */
export function bandFor(bands: Band[], size: number): { band: Band; exact: boolean } | null {
  if (bands.length === 0) return null;
  const inBand = bands.find((b) => size >= b.min - 1e-9 && (b.max === 0 || size <= b.max + 1e-9));
  if (inBand) return { band: inBand, exact: true };
  let best = bands[0];
  let d = Infinity;
  for (const b of bands) {
    const hi = b.max === 0 ? Infinity : b.max;
    const dist = size < b.min ? b.min - size : size - hi;
    if (dist < d) {
      d = dist;
      best = b;
    }
  }
  return { band: best, exact: false };
}

/** Smallest stock square that leaves the margin round the ring. */
export function cardSide(od: number, s: PlanSettings): { side: number; stock: boolean } {
  const need = od + 2 * s.cardMargin;
  const fit = [...s.cardSizes].sort((a, b) => a - b).find((c) => c >= need - 1e-9);
  return fit ? { side: fit, stock: true } : { side: Math.ceil(need), stock: false };
}

export function familyRule(rule: RuleId, s: PlanSettings): 'export' | 'domestic' {
  return rule === 'export' ? 'export' : rule === 'domestic' ? 'domestic' : s.generalBands;
}

/**
 * Turns a line into pack units under the chosen rule:
 * spiral wound and soft cut are bundled by size band (domestic spiral wound
 * 12″ and up goes singly on corrugated squares), Kammprofile and double
 * jacketed take one square each, ring joints one carton each, insulation kits
 * one set each. KNPC puts a square between every ring.
 */
export function packLine(g: GasketLine, rule: RuleId, s: PlanSettings, warn: (m: string) => void): LinePack {
  const label = g.itemCode || g.description || `line ${g.sl}`;
  const fam: Family = g.family;
  const sheet = familyRule(rule, s);
  const material = g.thickness * (Math.PI / 4) * Math.max(0, g.od * g.od - g.innerD * g.innerD);
  const bow = fam === 'SPW' ? g.od * (s.bowPct / 100) : 0;
  const pitch = Math.max(g.thickness, bow); // one ring laid on its own
  const square = cardSide(g.od, s);
  const sqArea = (square.side / 1000) ** 2;
  const cardKg = sqArea * s.boardKgPerM2;
  const base = { line: g, material, carded: false };
  if (!square.stock && (fam === 'KAM' || fam === 'DJ' || rule === 'knpc' || fam === 'SPW'))
    warn(`${label}: no stock corrugated square is big enough; a ${Math.ceil(square.side)} mm square is assumed.`);

  if (fam === 'RTJ') {
    const side = Math.ceil(g.od + s.cartonSide);
    const depth = Math.ceil(g.thickness + s.cartonDepth);
    const cartonKg = (2 * side * side + 4 * side * depth) * 1e-6 * s.boardKgPerM2;
    return {
      ...base,
      kind: 'carton',
      shape: 'square',
      foot: side,
      bore: 0,
      perUnit: 1,
      height: () => depth,
      weight: (n) => n * g.unitWeight + cartonKg,
      board: () => cartonKg,
      cards: () => 1,
      note: `one ring per carton, ${side} mm square × ${depth} mm`,
    };
  }
  if (fam === 'ISK') {
    return {
      ...base,
      kind: 'kit',
      shape: 'circle',
      foot: g.od,
      bore: 0,
      perUnit: 1,
      height: () => Math.max(g.thickness, 1),
      weight: (n) => n * g.unitWeight,
      board: () => 0,
      cards: () => 0,
      note: 'one set per unit, in its own box',
      carded: true,
    };
  }
  if (rule === 'knpc' || fam === 'KAM' || fam === 'DJ') {
    const kind: UnitKind = rule === 'knpc' ? 'sheeted' : 'card';
    return {
      ...base,
      kind,
      shape: 'square',
      foot: square.side,
      bore: 0,
      perUnit: 1,
      height: () => pitch + s.cardThickness,
      weight: (n) => n * g.unitWeight + cardKg,
      board: () => cardKg,
      cards: () => 1,
      note: rule === 'knpc' ? `a ${Math.round(square.side)} mm corrugated square between every ring` : `one piece per ${Math.round(square.side)} mm corrugated square`,
      carded: true,
    };
  }

  // bundles: spiral wound by its sheet, soft cut by its own (the same either way), anything else singly
  let count = 1;
  let carded = false;
  let bandNote = 'loose';
  if (fam === 'SPW' || fam === 'SC') {
    const bands = fam === 'SC' ? s.bands.softCut : sheet === 'export' ? s.bands.exportSPW : s.bands.domesticSPW;
    const sheetName = fam === 'SC' ? 'soft cut' : sheet;
    if (!g.size) warn(`${label}: no nominal size, so no bundle band; packed singly.`);
    else {
      const hit = bandFor(bands, g.size);
      if (!hit) warn(`${label}: the ${sheetName} bundle sheet is empty; packed singly.`);
      else {
        count = Math.max(1, Math.floor(hit.band.count));
        carded = fam === 'SPW' && hit.band.carded;
        bandNote = `${fmtBand(hit.band)} ${sheetName}`;
        if (!hit.exact) warn(`${label}: ${inch(g.size)} is outside the ${sheetName} bundle bands; the ${fmtBand(hit.band)} count (${count}) is used. Check with the works.`);
      }
    }
  }
  if (carded) {
    const k = Math.max(1, Math.floor(s.ringsPerCard));
    return {
      ...base,
      kind: 'carded',
      shape: 'square',
      foot: square.side,
      bore: 0,
      perUnit: k,
      height: (n) => n * pitch + s.cardThickness,
      weight: (n) => n * g.unitWeight + cardKg,
      board: () => cardKg,
      cards: () => 1,
      note: `singly on ${Math.round(square.side)} mm corrugated squares, ${k} rings to a square (${bandNote})`,
      carded: true,
    };
  }
  return {
    ...base,
    kind: 'bundle',
    shape: 'circle',
    foot: g.od,
    bore: g.innerD,
    perUnit: count,
    height: (n) => Math.max(n * g.thickness, bow),
    weight: (n) => n * g.unitWeight,
    board: () => 0,
    cards: () => 0,
    note: count === 1 ? `singly (${bandNote})` : `bundles of ${count} (${bandNote})`,
  };
}
