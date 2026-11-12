/**
 * Reads the cells of a spreadsheet file: Excel workbooks (.xlsx, .xlsm) and
 * comma-, semicolon- or tab-separated text. Every sheet comes back as rows of
 * trimmed text; numbers as stored, without Excel's display format.
 */
export interface SheetRows {
  name: string;
  rows: string[][];
}

export async function readSheets(fileName: string, data: Uint8Array): Promise<SheetRows[]> {
  const head = String.fromCharCode(...data.subarray(0, 4));
  if (head === 'PK\u0003\u0004') return readXlsx(data);
  if (data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0)
    throw new Error(`${fileName} is an old Excel file (.xls). Save it as an Excel Workbook (.xlsx) and open that.`);
  if (head === '%PDF') throw new Error(`${fileName} is a PDF. Open the Excel PRN instead.`);
  const text = new TextDecoder().decode(data).replace(/^﻿/, '');
  if (text.includes('\u0000')) throw new Error(`${fileName} is not a spreadsheet WaveForce can read.`);
  return [{ name: fileName, rows: readDelimited(text) }];
}

// ------------------------------------------------------------------ text

/** Comma, semicolon or tab separated text, whichever the first lines use most; quoted fields as Excel writes them. */
export function readDelimited(text: string): string[][] {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n');
  const count = (ch: string) => sample.split(ch).length - 1;
  const sep = ['\t', ';', ','].reduce((best, ch) => (count(ch) > count(best) ? ch : best), '\t');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let fresh = true; // at the start of a cell
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && fresh) {
      quoted = true;
      fresh = false;
    } else if (ch === sep) {
      row.push(cell.trim());
      cell = '';
      fresh = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
      fresh = true;
    } else {
      cell += ch;
      fresh = false;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some(Boolean));
}

// ------------------------------------------------------------------ zip

interface Entry {
  method: number;
  size: number;
  at: number; // local header offset
}

function zipEntries(data: Uint8Array): Map<string, Entry> {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('The workbook is damaged (no zip directory).');
  const total = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const out = new Map<string, Entry>();
  const dec = new TextDecoder();
  for (let n = 0; n < total && v.getUint32(p, true) === 0x02014b50; n++) {
    const nameLen = v.getUint16(p + 28, true);
    const name = dec.decode(data.subarray(p + 46, p + 46 + nameLen));
    out.set(name.replace(/^\//, ''), { method: v.getUint16(p + 10, true), size: v.getUint32(p + 20, true), at: v.getUint32(p + 42, true) });
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return out;
}

async function unzipText(data: Uint8Array, e: Entry): Promise<string> {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const start = e.at + 30 + v.getUint16(e.at + 26, true) + v.getUint16(e.at + 28, true);
  const raw = data.subarray(start, start + e.size);
  if (e.method === 0) return new TextDecoder().decode(raw);
  if (e.method !== 8) throw new Error('The workbook uses a compression WaveForce cannot read.');
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

// ------------------------------------------------------------------ xlsx

const unescape = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/_x([0-9A-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const attrs = (tag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = unescape(m[2]);
  return out;
};

/** The text of a rich or plain string item, without phonetic guides. */
const runs = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join('');

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

async function readXlsx(data: Uint8Array): Promise<SheetRows[]> {
  const files = zipEntries(data);
  const text = async (name: string) => {
    const e = files.get(name);
    return e ? unzipText(data, e) : '';
  };
  const workbook = await text('xl/workbook.xml');
  if (!workbook) throw new Error('This is not an Excel workbook.');
  const rels = new Map<string, string>();
  for (const m of (await text('xl/_rels/workbook.xml.rels')).matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.Id && a.Target) rels.set(a.Id, a.Target.startsWith('/') ? a.Target.slice(1) : `xl/${a.Target}`);
  }
  const shared = [...(await text('xl/sharedStrings.xml')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1]));
  const sheets: SheetRows[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const a = attrs(m[0]);
    // the relationship id, whatever prefix the writer gave its namespace
    const rid = Object.entries(a).find(([k]) => /:id$/.test(k))?.[1] ?? '';
    const path = rels.get(rid);
    if (!path) continue;
    const xml = await text(path);
    if (xml) sheets.push({ name: a.name ?? path, rows: sheetRows(xml, shared) });
  }
  return sheets;
}

function sheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    let next = 0;
    for (const c of (r[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attrs(c[1]);
      const at = a.r ? colIndex(a.r) : next;
      next = at + 1;
      const body = c[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (a.t === 's') value = shared[Number(v)] ?? '';
      else if (a.t === 'inlineStr') value = runs(body);
      else if (a.t === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined) {
        const s = unescape(v);
        const n = Number(s);
        value = a.t === undefined || a.t === 'n' ? (Number.isFinite(n) && s.trim() !== '' ? String(Number(n.toPrecision(12))) : s) : s;
      }
      while (row.length < at) row.push('');
      row[at] = value.trim();
    }
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}
