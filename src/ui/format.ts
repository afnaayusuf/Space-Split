import { inch } from '../model/catalog';
import { familyName } from '../model/defaults';
import type { GasketLine, UnitKind } from '../model/types';

const cache = new Map<number, Intl.NumberFormat>();

function nf(digits: number) {
  let f = cache.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    cache.set(digits, f);
  }
  return f;
}

/** Number with Indian digit grouping and a fixed number of decimals. */
export function fmt(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return '–';
  const r = Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v; // avoid "-0.0"
  return nf(digits).format(r);
}

/** "1 box", "3 boxes" */
export const count = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

export const mm1 = (v: number) => fmt(v, 1);
export const kg = (v: number) => fmt(v, v >= 100 ? 0 : 1);
export const pct = (v: number) => `${fmt(v * 100, 0)}%`;
export const inches = (mm: number) => Math.round(mm / 25.4);

export function dims(l: number, w: number, h?: number) {
  return h === undefined ? `${fmt(l)} × ${fmt(w)}` : `${fmt(l)} × ${fmt(w)} × ${fmt(h)}`;
}

/** Outside box size in whole inches, the way the annexure lists it. */
export const boxSize = (e: { l: number; w: number; h: number }) => `${inches(e.l)} × ${inches(e.w)} × ${inches(e.h)}″`;

/** Short name of a line: item code if there is one, else the description. */
export function lineName(g: GasketLine): string {
  return g.itemCode.trim() || g.description.trim() || `Line ${g.sl}`;
}

/** SPW 6″ 150#, RTJ R24, KAM 10″ 300# */
export function lineSpec(g: GasketLine): string {
  if (g.family === 'RTJ') return `RTJ ${g.ringNo || inch(g.size)}`;
  const fam = g.family === 'OTHER' ? familyName(g.family) : g.family;
  return `${fam} ${g.size ? inch(g.size) : ''}${g.rating ? ` ${g.rating}#` : ''}`.trim();
}

export function unitWord(kind: UnitKind, n: number): string {
  const one = { bundle: 'bundle', carded: 'square', card: 'square', sheeted: 'sheet', carton: 'carton', kit: 'set' }[kind];
  return n === 1 ? one : `${one}s`;
}

/** How one line sits in a box over all its piles: "6 bundles × 10 in 3 piles". */
export function packedSummary(piles: { kind: UnitKind; units: number; perUnit: number; count: number }[]): string {
  if (piles.length === 0) return '';
  const p = piles[0];
  const units = piles.reduce((a, s) => a + s.units, 0);
  const pieces = piles.reduce((a, s) => a + s.count, 0);
  return `${packedAs(p.kind, units, p.perUnit, pieces)}${piles.length > 1 ? ` in ${piles.length} piles` : ''}`;
}

/** "3 bundles × 5", "2 squares, 10 rings each", "6 cartons" */
export function packedAs(kind: UnitKind, units: number, perUnit: number, pieces: number): string {
  if (kind === 'bundle') return perUnit === 1 ? `${pieces} loose` : units * perUnit === pieces ? `${units} ${unitWord(kind, units)} × ${perUnit}` : `${units} ${unitWord(kind, units)} (${perUnit} a bundle)`;
  if (kind === 'carded') return `${pieces} singly on ${units} ${unitWord(kind, units)}`;
  if (kind === 'card' || kind === 'sheeted') return `${pieces} on ${units} ${unitWord(kind, units)}`;
  return `${units} ${unitWord(kind, units)}`;
}
