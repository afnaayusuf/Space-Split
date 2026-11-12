import { describe, expect, it } from 'vitest';
import { defaultSetup } from '../model/defaults';
import { jobFromCheckList } from '../state/checkListFile';
import { xlsx } from '../ui/xlsx';
import { parseCheckRows, toIsoDate } from './checklist';
import { readDelimited, readSheets } from './sheet';

const enc = new TextEncoder();

/** A zip with deflated entries, the way Excel writes a workbook (CRCs left at 0: the reader does not check them). */
async function deflatedZip(files: Record<string, string>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const packed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const n = enc.encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, 8, true);
    local.setUint32(18, packed.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, n.length, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(10, 8, true);
    cen.setUint32(20, packed.length, true);
    cen.setUint32(24, raw.length, true);
    cen.setUint16(28, n.length, true);
    cen.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), n, packed);
    central.push(new Uint8Array(cen.buffer), n);
    offset += 30 + n.length + packed.length;
  }
  const size = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const CHECK_LIST = [
  ['GOODRICH GASKET PVT LTD'],
  ['PACKING CHECK LIST'],
  ['PRN No', 'GGPL/SE/SO/251000400', '', 'PO No', '4500123456'],
  ['Customer : Reliance Industries', '', '', 'PO Date', '22.10.2026'],
  [],
  ['SL', 'PO SL', 'TYPE', 'Cust Item Code', 'Description Of Goods', 'Total Qty', 'Actual Qty', 'UOM', 'Box No'],
  ['1', '10', 'SPW', 'A-1', 'SPW 6"X150# SS316/GR CS-OR SS316-IR', '24', '24', 'NOS', ''],
  ['2', '20', 'RTJ', 'A-2', 'RTJ R24 SI OCT', '12', '12', 'NOS', ''],
  ['', '', '', '', 'Total', '36', '36', '', ''],
  ['Packed by', '', '', 'Checked by'],
];

describe('check list files', () => {
  it('reads Excel-style CSV with quoted inch marks', () => {
    const rows = readDelimited('SL,Description Of Goods,Total Qty\r\n1,"SPW 6""X150# SS316/GR, CS-OR",24\r\n');
    expect(rows).toEqual([
      ['SL', 'Description Of Goods', 'Total Qty'],
      ['1', 'SPW 6"X150# SS316/GR, CS-OR', '24'],
    ]);
  });

  it('takes the PRN, PO and customer from above the table and the lines from below it', () => {
    const r = parseCheckRows(CHECK_LIST);
    expect(r.info).toEqual({ prn: 'GGPL/SE/SO/251000400', po: '4500123456', customer: 'Reliance Industries', poDate: '2026-10-22' });
    expect(r.lines.map((g) => [g.family, g.quantity, g.itemCode])).toEqual([
      ['SPW', 24, 'A-1'],
      ['RTJ', 12, 'A-2'],
    ]);
  });

  it('reads a workbook WaveForce wrote (stored entries, inline strings)', async () => {
    const book = xlsx([{ name: 'Check list', rows: CHECK_LIST }]);
    const sheets = await readSheets('list.xlsx', book);
    expect(sheets[0].name).toBe('Check list');
    expect(sheets[0].rows[4][4]).toBe('Description Of Goods'); // the blank row is dropped
    expect(parseCheckRows(sheets[0].rows).lines).toHaveLength(2);
  });

  it('reads a workbook as Excel writes it (deflated, shared strings, a blank sheet first)', async () => {
    const strings = ['Description Of Goods', 'Qty', 'Type', 'SPW 4" 300# 316L/GR', 'SPW', 'PRN No:  GGPL/X/1'];
    const book = await deflatedZip({
      'xl/workbook.xml':
        '<workbook xmlns:x="r"><sheets><sheet name="Cover" sheetId="1" x:id="rId1"/><sheet name="List &amp; boxes" sheetId="2" x:id="rId2"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
      'xl/sharedStrings.xml': `<sst>${strings.map((s) => `<si><r><t>${s.replace(/&/g, '&amp;')}</t></r></si>`).join('')}</sst>`,
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"/></sheetData></worksheet>',
      'xl/worksheets/sheet2.xml':
        '<worksheet><sheetData>' +
        '<row r="1"><c r="B1" t="s"><v>5</v></c></row>' +
        '<row r="3"><c r="B3" t="s"><v>2</v></c><c r="C3" t="s"><v>0</v></c><c r="D3" t="s"><v>1</v></c></row>' +
        '<row r="4"><c r="B4" t="s"><v>4</v></c><c r="C4" t="s"><v>3</v></c><c r="D4"><v>39.999999999999993</v></c></row>' +
        '</sheetData></worksheet>',
    });
    const sheets = await readSheets('list.xlsx', book);
    expect(sheets.map((s) => s.name)).toEqual(['Cover', 'List & boxes']);
    expect(sheets[1].rows[2]).toEqual(['', 'SPW', 'SPW 4" 300# 316L/GR', '40']);
    const { job } = await jobFromCheckList('list.xlsx', book, defaultSetup(), new Map());
    expect(job.info.prn).toBe('GGPL/X/1');
    expect(job.lines).toHaveLength(1);
    expect(job.lines[0].quantity).toBe(40);
    expect(job.lines[0].od).toBeGreaterThan(0);
  });

  it('says what to do with files it cannot read', async () => {
    await expect(readSheets('old.xls', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).rejects.toThrow(/\.xlsx/);
    await expect(readSheets('a.pdf', enc.encode('%PDF-1.7'))).rejects.toThrow(/PDF/);
    await expect(jobFromCheckList('empty.csv', enc.encode('hello,world\n'), defaultSetup(), new Map())).rejects.toThrow(/No gasket lines/);
  });

  it('reads the dates the works writes', () => {
    expect(toIsoDate('22.10.2026')).toBe('2026-10-22');
    expect(toIsoDate('2/3/26')).toBe('2026-03-02');
    expect(toIsoDate('22-Oct-2026')).toBe('2026-10-22');
    expect(toIsoDate('2026-10-22')).toBe('2026-10-22');
    expect(toIsoDate('46317')).toBe('2026-10-22');
    expect(toIsoDate('soon')).toBe('');
  });
});
