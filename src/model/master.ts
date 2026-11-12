import { rtjDims, spwDims } from './catalog';
import { FAMILIES } from './defaults';
import type { Family, GasketLine, MasterItem } from './types';

/**
 * The weight master: one chart weight per gasket size, so a weight entered
 * once is used on every later PRN. A line is matched by its customer item
 * code first, then by its spec — type and size with the class, or the ring
 * number for ring joints.
 */

const num = (s: string) => {
  const v = parseFloat(s.replace(/[^\d.\-]/g, ''));
  return Number.isFinite(v) ? v : 0;
};

export function specKey(g: Pick<GasketLine, 'family' | 'size' | 'rating' | 'ringNo'>): string | null {
  if (g.family === 'RTJ') return g.ringNo ? `RTJ ${g.ringNo.trim().toUpperCase()}` : null;
  if (!g.size) return null;
  return `${g.family} ${+g.size.toFixed(3)} ${g.rating || 0}`;
}

export const codeKey = (code: string) => (code.trim() ? `CODE ${code.trim().toUpperCase()}` : null);

/** The master entry that covers a line, if any. */
export function findMaster(master: Map<string, MasterItem>, g: GasketLine): MasterItem | null {
  const byCode = codeKey(g.itemCode);
  if (byCode && master.has(byCode)) return master.get(byCode)!;
  const bySpec = specKey(g);
  return (bySpec && master.get(bySpec)) || null;
}

/**
 * Fills a line from the master: the chart weight always, and the outline
 * when the line has none. Lines whose weight was typed in stay as they are.
 */
export function applyMaster(g: GasketLine, master: Map<string, MasterItem>): GasketLine {
  const m = findMaster(master, g);
  if (!m) return g;
  const out = { ...g };
  if (!(out.od > 0) && m.od > 0) {
    out.od = m.od;
    out.innerD = m.innerD;
    out.thickness = m.thickness || out.thickness;
  }
  if (m.unitWeight > 0 && (out.weightEstimated || !(out.unitWeight > 0))) {
    out.unitWeight = m.unitWeight;
    out.weightEstimated = false;
  }
  return out;
}

/** A master entry from a line whose weight is known. Keyed by spec when it has one, else by item code. */
export function masterFromLine(g: GasketLine, byCode = false): MasterItem | null {
  const key = byCode ? codeKey(g.itemCode) : (specKey(g) ?? codeKey(g.itemCode));
  if (!key || !(g.unitWeight > 0)) return null;
  return {
    key,
    family: g.family,
    size: g.size,
    rating: g.rating,
    ringNo: g.ringNo,
    itemCode: key.startsWith('CODE ') ? g.itemCode.trim() : '',
    description: g.description,
    od: g.od,
    innerD: g.innerD,
    thickness: g.thickness,
    unitWeight: g.unitWeight,
    updatedAt: new Date().toISOString(),
  };
}

const FAMILY_WORDS: Record<string, Family> = {
  SPW: 'SPW',
  SWG: 'SPW',
  SC: 'SC',
  CNAF: 'SC',
  KAM: 'KAM',
  KAMM: 'KAM',
  DJ: 'DJ',
  RTJ: 'RTJ',
  ISK: 'ISK',
};

/**
 * Reads chart rows pasted from Excel. Columns: Type, Size (or ring number for
 * RTJ), Class, kg per piece, then optionally OD, ID, Thickness and Item code.
 * A header row and rows it cannot read are skipped and counted.
 */
export function parseMasterRows(text: string): { items: MasterItem[]; skipped: number } {
  const items: MasterItem[] = [];
  let skipped = 0;
  const now = new Date().toISOString();
  for (const row of text.split(/\r?\n/)) {
    if (!row.trim()) continue;
    const c = (row.includes('\t') ? row.split('\t') : row.split(/[,;]/)).map((x) => x.trim());
    const fam = FAMILY_WORDS[(c[0] ?? '').toUpperCase().replace(/[^A-Z]/g, '')] ?? (FAMILIES.some((f) => f.id === c[0]) ? (c[0] as Family) : null);
    if (!fam) {
      skipped += 1;
      continue;
    }
    const ring = fam === 'RTJ' ? (c[1] ?? '').toUpperCase().replace(/\s+/g, '') : '';
    const size = fam === 'RTJ' ? 0 : sizeOf(c[1] ?? '');
    const rating = num(c[2] ?? '');
    const kg = num(c[3] ?? '');
    let od = num(c[4] ?? '');
    let innerD = num(c[5] ?? '');
    let thickness = num(c[6] ?? '');
    const itemCode = c[7] ?? '';
    if (!od) {
      const d = fam === 'SPW' ? spwDims(size, rating) : fam === 'RTJ' ? rtjDims(ring) : null;
      if (d) {
        od = d.od;
        innerD = d.innerD;
        thickness = thickness || d.thickness;
      }
    }
    const base = { family: fam, size, rating, ringNo: ring };
    const key = itemCode ? codeKey(itemCode) : specKey(base);
    if (!key || !(kg > 0)) {
      skipped += 1;
      continue;
    }
    items.push({ key, ...base, itemCode, description: '', od, innerD, thickness, unitWeight: kg, updatedAt: now });
  }
  return { items, skipped };
}

function sizeOf(s: string): number {
  const t = s.replace(/["″]|in(ch)?/gi, '').trim();
  let m = /^(\d+)[.\- ](\d)\/(\d)$/.exec(t);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d)\/(\d)$/.exec(t);
  if (m) return Number(m[1]) / Number(m[2]);
  return num(t);
}
