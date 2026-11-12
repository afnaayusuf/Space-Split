import { newId, blankLine } from '../model/defaults';
import type { Family, GasketLine, JobInfo } from '../model/types';
import { lineFromText } from './describe';

type Col = 'sl' | 'poSl' | 'type' | 'code' | 'desc' | 'total' | 'actual' | 'uom' | 'box';

/** The works' check list column order, used when the pasted rows have no header. */
const ORDER: Col[] = ['sl', 'poSl', 'type', 'code', 'desc', 'total', 'actual', 'uom', 'box'];

function headerCol(cell: string): Col | null {
  const c = cell.toLowerCase().replace(/[^a-z]/g, '');
  if (!c) return null;
  if (c.startsWith('po')) return 'poSl';
  if (c === 'sl' || c === 'slno' || c === 'sno' || c === 'serial') return 'sl';
  if (c.includes('type')) return 'type';
  if (c.includes('code')) return 'code';
  if (c.includes('desc') || c.includes('goods')) return 'desc';
  if (c.includes('actual')) return 'actual';
  if (c.includes('total') || c === 'qty' || c === 'quantity') return 'total';
  if (c.includes('uom') || c === 'unit') return 'uom';
  if (c.includes('box')) return 'box';
  return null;
}

const FAMILY_WORDS: Record<string, Family> = {
  SPW: 'SPW',
  SWG: 'SPW',
  SPIRAL: 'SPW',
  SC: 'SC',
  SOFTCUT: 'SC',
  CNAF: 'SC',
  KAM: 'KAM',
  KAMM: 'KAM',
  KAMMPROFILE: 'KAM',
  DJ: 'DJ',
  RTJ: 'RTJ',
  ISK: 'ISK',
};

export interface CheckListRead {
  lines: GasketLine[];
  notes: string[];
  /** PRN, PO and customer found above the table, when the rows carry them. */
  info: Partial<JobInfo>;
}

/**
 * Reads rows copied from the works' packing check list (Excel) or typed one
 * description per line. Recognised columns: SL, PO SL, TYPE, Cust Item Code,
 * Description Of Goods, Total Qty, Actual Qty, UOM, Box No. A header row maps
 * the columns by name; without one the works' own order is assumed. A single
 * column is read as descriptions.
 */
export function parseCheckList(text: string): CheckListRead {
  return parseCheckRows(
    text
      .split(/\r?\n/)
      .map((r) => r.replace(/\s+$/, ''))
      .filter((r) => r.trim())
      .map((row) => (row.includes('\t') ? row.split('\t') : row.includes(';') ? row.split(';') : [row]).map((c) => c.trim())),
  );
}

const headerOf = (cells: string[]) => {
  const hdr = cells.map(headerCol);
  return cells.filter(Boolean).length > 1 && hdr.includes('desc') && hdr.filter(Boolean).length >= 3 && !cells.some((c) => /\d+\s*"|#/.test(c)) ? hdr : null;
};

/**
 * The same, from rows of cells (a whole sheet of a workbook). Rows above the
 * table's header are read for the PRN, PO and customer instead of lines.
 */
export function parseCheckRows(rows: string[][]): CheckListRead {
  const notes: string[] = [];
  const lines: GasketLine[] = [];
  const info: Partial<JobInfo> = {};
  const first = rows.findIndex((r) => headerOf(r));
  let map: (Col | null)[] | null = null;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells.some(Boolean)) continue;
    const hdr = headerOf(cells);
    if (hdr) {
      map = hdr;
      continue;
    }
    if (first < 0 || i < first) readInfo(cells, info);
    if (i < first) continue;
    const filled = cells.filter(Boolean);
    const get = (k: Col) => {
      if (!map && filled.length === 1) return k === 'desc' ? filled[0] : '';
      const at = map ? map.indexOf(k) : ORDER.indexOf(k);
      return at >= 0 ? (cells[at] ?? '') : '';
    };
    const desc = get('desc');
    if (!desc) continue;
    if (/^(total|grand total|annexure)/i.test(desc) || /^(total)/i.test(get('sl'))) continue;
    const typeWord = get('type').toUpperCase().replace(/[^A-Z]/g, '');
    const qty = parseFloat(get('actual')) || parseFloat(get('total')) || 0;
    const { line, notes: n } = lineFromText(desc, { family: FAMILY_WORDS[typeWord], quantity: qty > 0 ? Math.round(qty) : 0 });
    // a title or remark, not a gasket: no type, size or quantity in it
    if (line.family === 'OTHER' && !line.size && !line.od && !line.quantity) continue;
    notes.push(...n);
    lines.push({
      ...blankLine(),
      ...line,
      id: newId('l'),
      sl: get('sl'),
      poSl: get('poSl'),
      itemCode: get('code'),
      uom: get('uom') || 'NOS',
      boxNo: get('box'),
    } as GasketLine);
  }
  return { lines, notes, info };
}

// ------------------------------------------------------------------ the block above the table

// a label is the whole cell, or the label, a colon or dash, and the value
const LABELS: [keyof JobInfo, RegExp][] = [
  ['poDate', /^(?:customer\s*)?(?:p\.?\s*o\.?|purchase\s*order)\s*date\.?\s*(?:[:\-]\s*(.*))?$/i],
  ['po', /^(?:customer\s*)?(?:p\.?\s*o\.?|purchase\s*order)\s*(?:no\.?|number|#|ref\.?)?\s*(?:[:\-]\s*(.*))?$/i],
  ['prn', /^prn\s*(?:no\.?|number|#)?\s*(?:[:\-]\s*(.*))?$/i],
  ['customer', /^(?:customer|buyer|client|consignee)(?:\s*name)?\s*(?:[:\-]\s*(.*))?$/i],
];

/** "PRN No : GGPL/…" in one cell, or "PRN No" with the value in the next filled cell. */
function readInfo(cells: string[], info: Partial<JobInfo>) {
  for (let c = 0; c < cells.length; c++) {
    for (const [key, re] of LABELS) {
      const m = re.exec(cells[c].trim());
      if (!m) continue;
      if (!info[key]) {
        const value = (m[1] ?? '').trim() || cells.slice(c + 1).find((x) => /[a-z0-9]/i.test(x)) || '';
        if (value && !LABELS.some(([, r]) => r.test(value))) info[key] = key === 'poDate' ? toIsoDate(value) : value;
      }
      break;
    }
  }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** 22.10.2026, 22/10/2026, 22-10-26, 22-Oct-2026, 2026-10-22 or an Excel day number, as 2026-10-22. */
export function toIsoDate(s: string): string {
  const t = s.trim();
  const year = (y: string) => (y.length === 2 ? `20${y}` : y);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2}|\d{4})$/.exec(t);
  if (m) return `${year(m[3])}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{1,2})[\s./\-]*([a-z]{3})[a-z]*[\s./,\-]*(\d{2}|\d{4})$/i.exec(t);
  if (m && MONTHS.includes(m[2].toLowerCase())) return `${year(m[3])}-${String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const n = Number(t);
  if (Number.isFinite(n) && n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
  return '';
}
