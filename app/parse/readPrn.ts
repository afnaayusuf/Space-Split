import { newId } from '../model/presets';
import { estimateKg, rtj, spw } from '../model/tables';
import type { Family, Line } from '../model/types';
import { describe } from './describe';

type Col =
  | 'sl'
  | 'code'
  | 'desc'
  | 'qty'
  | 'total'
  | 'std'
  | 'od'
  | 'bore'
  | 'thk'
  | 'matl'
  | 'kg'
  | 'kgRing'
  | 'type'
  | 'size'
  | 'rating'
  | 'group'
  | 'len'
  | 'wid'
  | 'hgt'
  | 'stack'
  | 'tilt'
  | 'rotate';

/** Which column a header cell names. The last seven are EasyCargo's import template. */
function headerCol(cell: string): Col | null {
  const c = cell.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!c) return null;
  if (c === 'group') return 'group';
  if (c === 'pieces') return 'qty';
  if (c === 'length') return 'len';
  if (c === 'width') return 'wid';
  if (c === 'height') return 'hgt';
  if (c === 'total weight' || c === 'weight') return 'kgRing';
  if (/^stackable/.test(c)) return 'stack';
  if (/^tilt(able)?/.test(c)) return 'tilt';
  if (/^rot(at)?able|^rotation/.test(c)) return 'rotate';
  if (/^(sl|s)\.? ?no\.?$|^sl$|^serial/.test(c)) return 'sl';
  if (/code/.test(c)) return 'code';
  if (/desc|goods/.test(c)) return 'desc';
  if (/^actual ?qty|^qty|quantity|^nos$/.test(c)) return 'qty';
  if (/total ?qty/.test(c)) return 'total';
  if (/std/.test(c)) return 'std';
  if (/^o\.?d\.?$|outer dia|^od /.test(c)) return 'od';
  if (/^i\.?d\.?$|inner dia|^id /.test(c)) return 'bore';
  if (/^thk|thick/.test(c)) return 'thk';
  if (/^matl|^material$|^moc$/.test(c)) return 'matl';
  if (/each ring (wtg|wt|weight)/.test(c)) return 'kg';
  if (/(weight|wtg|wt\.?) per|unit (weight|wt)|kg ?\/ ?(pc|no)/.test(c)) return 'kgRing';
  if (/^type$/.test(c)) return 'type';
  if (/^size$/.test(c)) return 'size';
  if (/^rating$|^class$/.test(c)) return 'rating';
  return null;
}

const CLASSES = [150, 300, 400, 600, 900, 1500, 2500];

/** "2,579" → 2579; "" → 0. */
const number = (s: string | undefined) => {
  const v = parseFloat((s ?? '').replace(/,/g, '').trim());
  return Number.isFinite(v) ? v : 0;
};

const TYPE_WORDS: Record<string, Family> = {
  SPW: 'SPW',
  SWG: 'SPW',
  SC: 'SC',
  KAM: 'KAM',
  KAMPROFILE: 'KAM',
  DJ: 'DJ',
  RTJ: 'RTJ',
  ISK: 'ISK',
};

const DEFAULT_THK: Record<Family, number> = { SPW: 4.5, SC: 3, KAM: 4, DJ: 3.2, RTJ: 15, ISK: 3.2, PLUG: 1.6, OTHER: 3 };

export interface PrnRead {
  lines: Line[];
  skipped: { row: number; text: string; why: string }[];
  prn: string;
  customer: string;
}

/**
 * Reads the rows of a PRN sheet. The header row is found by its column names
 * (a description column and a quantity or OD column). Sizes come from the OD /
 * ID / THK columns when they hold millimetres; on standard lines, where those
 * columns hold the nominal size and the class, they come from the tables.
 */
export function readPrn(rows: string[][]): PrnRead {
  const out: PrnRead = { lines: [], skipped: [], prn: '', customer: '' };
  let at = -1;
  let map: (Col | null)[] = [];
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const hdr = rows[i].map(headerCol);
    if (hdr.includes('desc') && (hdr.includes('qty') || hdr.includes('total') || hdr.includes('od'))) {
      at = i;
      map = hdr;
      break;
    }
  }
  // the block above the table: PRN No, Customer
  for (let i = 0; i < (at < 0 ? Math.min(rows.length, 10) : at); i++) {
    const cells = rows[i];
    cells.forEach((c, k) => {
      const next = () => cells.slice(k + 1).find((x) => /[a-z0-9]/i.test(x)) ?? '';
      let m = /^PRN\s*(?:NO\.?|NUMBER)?\s*(?:[:\-]\s*(.*))?$/i.exec(c.trim());
      if (m && !out.prn) out.prn = (m[1] ?? '').trim() || next();
      m = /^(?:CUSTOMER|BUYER|CLIENT)(?:\s*NAME)?\s*(?:[:\-]\s*(.*))?$/i.exec(c.trim());
      if (m && !out.customer) out.customer = (m[1] ?? '').trim() || next();
    });
  }

  const col = (k: Col) => map.indexOf(k);
  const get = (cells: string[], k: Col) => {
    const i = col(k);
    if (i >= 0) return cells[i] ?? '';
    // no header: the description is the longest cell
    if (k === 'desc' && at < 0) return cells.reduce((a, b) => (b.length > a.length ? b : a), '');
    return '';
  };

  // the units row under an EasyCargo header: "centimeters", "kilograms", "Y/N"
  let unit = 10; // EasyCargo's metric template is in centimetres
  let first = at + 1;
  if (at >= 0 && rows[first]?.some((c) => /^(centimet|millimet|inch|meter|metre|mm|cm|kilogram|y\/n)/i.test(c.trim()))) {
    const u = (rows[first][col('len')] ?? rows[first].find((c) => c.trim()) ?? '').toLowerCase();
    unit = /^milli|^mm/.test(u) ? 1 : /^inch/.test(u) ? 25.4 : /^met/.test(u) ? 1000 : 10;
    first++;
  }
  const flag = (cells: string[], k: Col) => {
    const v = get(cells, k).trim().toUpperCase();
    return v ? !/^(N|NO|0|FALSE)$/.test(v) : undefined;
  };
  let group = '';

  for (let r = first; r < rows.length; r++) {
    const cells = rows[r];
    // EasyCargo writes the group only on its first row
    if (get(cells, 'group').trim()) group = get(cells, 'group').trim();
    const desc = get(cells, 'desc').trim() || (col('len') >= 0 && number(get(cells, 'len')) > 0 ? `${get(cells, 'len')} × ${get(cells, 'wid')}` : '');
    if (!desc || /^(total|grand total|packed by|checked by)/i.test(desc)) continue;
    const d = describe(desc);
    const qty = Math.round(number(get(cells, 'qty')) || number(get(cells, 'total')) || d.qty);
    if (qty <= 0) {
      out.skipped.push({ row: r + 1, text: desc, why: 'No quantity' });
      continue;
    }

    const typeWord = get(cells, 'type').toUpperCase().replace(/[^A-Z]/g, '');
    const family: Family = TYPE_WORDS[typeWord] ?? d.family ?? 'OTHER';
    const material = get(cells, 'matl').trim();
    const stdCell = get(cells, 'std').toUpperCase();
    const odCell = get(cells, 'od').trim();
    const idCell = get(cells, 'bore').trim();
    let od = number(odCell);
    let bore = number(idCell);
    let thk = number(get(cells, 'thk'));
    let sizeFrom: Line['sizeFrom'] = 'prn';

    // standard lines carry the nominal size and class in the OD / ID columns
    const size = number(get(cells, 'size')) || d.size || (/^\d/.test(odCell) && od <= 60 ? od : 0);
    const rating = number(get(cells, 'rating')) || d.rating || (CLASSES.includes(bore) ? bore : 0);
    const nominal = (stdCell.startsWith('STD') || (bore > od && CLASSES.includes(bore)) || !(od > 0)) && od <= 60;
    if (nominal) {
      od = 0;
      bore = 0;
    }
    if (!(od > 0) && d.od > 0) {
      od = d.od;
      bore = d.bore;
      sizeFrom = 'description';
    }
    let tableKg = 0;
    if (!(od > 0)) {
      const ring = d.ringNo || (/^R\d/i.test(odCell) ? odCell.toUpperCase() : '');
      const r1 = family === 'RTJ' && ring ? rtj(ring, d.style === 'oval' ? 'oval' : 'oct') : null;
      const s1 = size ? spw(size, rating, d.series) : null;
      if (r1) {
        od = r1.od;
        bore = r1.bore;
        thk = thk || r1.thk;
        sizeFrom = 'table';
      } else if (s1) {
        // spiral wound from the works' chart; kammprofile, soft cut, DJ and kits by the same ring size
        od = s1.od;
        bore = s1.bore;
        if (family === 'SPW') tableKg = s1.kg;
        sizeFrom = 'table';
      }
    }
    // EasyCargo rows: the gasket as a square of Length × Width, Height thick; the description's size wins when it has one
    const len = number(get(cells, 'len')) * unit;
    const wid = number(get(cells, 'wid')) * unit;
    if (!(od > 0) && Math.max(len, wid) > 0) {
      od = Math.max(len, wid);
      bore = 0;
      sizeFrom = 'prn';
    }
    if (!thk && number(get(cells, 'hgt')) > 0) thk = number(get(cells, 'hgt')) * unit;
    if (!(od > 0)) {
      out.skipped.push({ row: r + 1, text: desc, why: 'No size' });
      continue;
    }
    if (!(bore >= 0) || bore >= od) bore = 0;
    thk = thk || d.thk || DEFAULT_THK[family];

    const prnKg = number(get(cells, 'kg')) || number(get(cells, 'kgRing'));
    const kg = prnKg || tableKg || estimateKg(family, od, bore, thk, `${material} ${desc}`);
    out.lines.push({
      id: newId('l'),
      sl: get(cells, 'sl').trim() || String(out.lines.length + 1),
      code: get(cells, 'code').trim(),
      description: desc,
      family,
      od: +od.toFixed(2),
      bore: +bore.toFixed(2),
      thk: +thk.toFixed(2),
      qty,
      kg: +kg.toFixed(4),
      material,
      sizeFrom,
      weightFrom: prnKg ? 'prn' : tableKg ? 'table' : 'estimate',
      stack: flag(cells, 'stack') ?? true,
      tilt: flag(cells, 'tilt') ?? false,
      rotate: flag(cells, 'rotate') ?? true,
      // pass-partition ribs across the bore ("WITH RIB", not "WITHOUT RIB"): nothing can nest in it
      ...(/\bWITH\s+RIBS?\b/i.test(desc) ? { rib: true } : {}),
      group,
    });
  }
  return out;
}
