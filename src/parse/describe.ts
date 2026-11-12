import { DN_TO_NPS, rtjDims, spwDims, spwSizeFromOd } from '../model/catalog';
import type { Family, GasketLine } from '../model/types';
import { estimateWeight } from '../planner/weight';

export interface ParsedDescription {
  family: Family | null;
  size: number;
  rating: number;
  series: '' | 'A' | 'B';
  ringNo: string;
  style: 'oval' | 'oct' | '';
  material: string;
  od: number;
  innerD: number;
  thickness: number;
  ringThickness: number;
  quantity: number;
}

/** Material codes the works writes on ring joints and their meaning. */
const MATERIALS: Record<string, string> = {
  SI: 'Soft iron',
  F5: 'F5 (5Cr-½Mo)',
  F9: 'F9 (9Cr-1Mo)',
  F11: 'F11 (1¼Cr-½Mo)',
  F12: 'F12 (1Cr-½Mo)',
  F22: 'F22 (2¼Cr-1Mo)',
  F51: 'F51 duplex',
  F53: 'F53 super duplex',
};

function toNumber(s: string): number {
  const t = s.trim().replace(/\s+/g, ' ');
  // 1.1/2  1-1/2  1 1/2  → 1.5 ; 1/2 → 0.5 ; 2.5 → 2.5
  let m = /^(\d+)[.\- ](\d)\/(\d)$/.exec(t);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d)\/(\d)$/.exec(t);
  if (m) return Number(m[1]) / Number(m[2]);
  return parseFloat(t);
}

/**
 * Reads a description of goods as the works writes it, e.g.
 * `SPW 30"X300# 316-OR+316/FG+316-IR`, `SC (RF) 20"X150# NON ASBESTOS BS7531`,
 * `RTJ R24 SI OCT`, `SPW 6" 150# 316L/Graphite x 200`.
 * Anything it cannot read is left blank rather than guessed.
 */
export function parseDescription(text: string): ParsedDescription {
  const raw = text.replace(/[″“”]/g, '"').replace(/''/g, '"').replace(/[×]/g, 'X');
  let s = ` ${raw.toUpperCase()} `;
  const out: ParsedDescription = {
    family: null,
    size: 0,
    rating: 0,
    series: '',
    ringNo: '',
    style: '',
    material: '',
    od: 0,
    innerD: 0,
    thickness: 0,
    ringThickness: 0,
    quantity: 0,
  };
  const cut = (re: RegExp) => {
    s = s.replace(re, ' ');
  };

  // quantity: only when written as "x 200", "qty 200" or "200 nos" at the very end
  let m = /\s(?:X|QTY\.?|QTY:)\s*(\d+)\s*(?:NOS?\.?|PCS)?\s*$/.exec(s) ?? /\s(\d+)\s*(?:NOS?\.?|PCS)\s*$/.exec(s);
  if (m) {
    out.quantity = Number(m[1]);
    s = s.slice(0, m.index) + ' ';
  }

  // thicknesses: "4.5MM GASKET THK 3MM RING THK" — the gasket one wins, a ring one is kept apart
  const thk = [...s.matchAll(/(\d+(?:\.\d+)?)\s*MM\s*(GASKET|WINDING|RING|SHEET)?\s*(?:THK|THICK(?:NESS)?)\.?/g)];
  for (const t of thk) {
    const v = Number(t[1]);
    if (t[2] === 'RING') out.ringThickness = v;
    else if (!out.thickness || t[2] === 'GASKET' || t[2] === 'WINDING') out.thickness = v;
  }
  cut(/(\d+(?:\.\d+)?)\s*MM\s*(GASKET|WINDING|RING|SHEET)?\s*(?:THK|THICK(?:NESS)?)\.?/g);

  // explicit outline: 222.3 X 157.2 X 4.5 (MM)
  m = /\s(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)\s*(?:MM)?\s/.exec(s);
  if (m) {
    out.od = Number(m[1]);
    out.innerD = Number(m[2]);
    out.thickness = out.thickness || Number(m[3]);
    s = s.replace(m[0], ' ');
  }

  m = /SERIES[\s-]*([AB])\b/.exec(s);
  if (m) {
    out.series = m[1] as 'A' | 'B';
    cut(/SERIES[\s-]*[AB]\b/);
  }

  // pressure class: 150#, CL300, CLASS 600, 900LB
  m = /(\d{3,4})\s*(?:#|LBS?\b)/.exec(s) ?? /\bCL(?:ASS)?\.?\s*(\d{3,4})\b/.exec(s);
  if (m) {
    out.rating = Number(m[1]);
    s = s.replace(m[0], ' ');
  }

  // ring number before sizes, so R24 is not read as anything else
  m = /\b(RX|BX|R)\s*-?\s*(\d{2,3})\b/.exec(s);
  const ringish = /\bRTJ\b|RING\s*JOINT|\bOCT\b|\bOVAL\b/.test(s);
  if (m && (ringish || m[1] !== 'R' || /^\s*R\s*-?\d/.test(s.trim()))) {
    out.ringNo = `${m[1]}${m[2]}`;
    s = s.replace(m[0], ' ');
  }
  if (/\bOCT(?:AGONAL)?\b/.test(s)) out.style = 'oct';
  else if (/\bOVAL\b/.test(s)) out.style = 'oval';

  // nominal size: 6", 1.1/2", 2 1/2", 24 INCH, DN150, 150NB
  m = /(\d+(?:[.\- ]\d\/\d|\.\d+)?|\d\/\d)\s*(?:"|INCH(?:ES)?\b|IN\b)/.exec(s);
  if (m) {
    out.size = toNumber(m[1]);
    s = s.replace(m[0], ' ');
  } else {
    m = /\bDN\s*(\d{2,4})\b/.exec(s) ?? /\b(\d{2,4})\s*NB\b/.exec(s);
    if (m && DN_TO_NPS[Number(m[1])]) {
      out.size = DN_TO_NPS[Number(m[1])];
      s = s.replace(m[0], ' ');
    } else if (m) {
      out.size = Number(m[1]);
      s = s.replace(m[0], ' ');
    }
  }

  // family — insulation kits and ring joints first, soft cut last (its words also turn up in spiral wound fillers)
  const has = (re: RegExp) => re.test(s);
  if (has(/\bISK\b|INSULAT/)) out.family = 'ISK';
  else if (out.ringNo || has(/\bRTJ\b|RING\s*JOINT/)) out.family = 'RTJ';
  else if (has(/\bKAM+(?:PROFILE)?\b|KAMMPROFILE/)) out.family = 'KAM';
  else if (has(/\bDJ\b|DOUBLE\s*JACKET/)) out.family = 'DJ';
  else if (has(/\bSPW\b|\bSWG\b|SPIRAL/)) out.family = 'SPW';
  else if (has(/\bSC\b|SOFT\s*CUT|CNAF|NON[\s-]*ASBESTOS|\bPTFE\b|GRAPHITE\s*SHEET|BUTYL|NEOPRENE|\bEPDM\b|RUBBER|\bCAF\b/)) out.family = 'SC';
  cut(/\bISK\b|\bRTJ\b|RING\s*JOINT|\bKAM+(?:PROFILE)?\b|KAMMPROFILE|\bDJ\b|DOUBLE\s*JACKET(?:ED)?|\bSPW\b|\bSWG\b|SPIRAL\s*WOUND|\bSC\b|SOFT\s*CUT|\bGASKETS?\b|\bOCT(?:AGONAL)?\b|\bOVAL\b|\(RF\)|\(FF\)|\bRF\b|\bFF\b|ASME\s*B\s*16\.\d+|\bB16\.\d+\b|\bTYPE\b/g);

  // what is left is the material
  // a lone X is what joined size and class ("20"X150#")
  let mat = s
    .replace(/(^|\s)X(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
    .trim();
  if (out.family === 'SC') {
    if (/NON[\s-]*ASBESTOS|CNAF/.test(mat)) mat = mat.replace(/NON[\s-]*ASBESTOS|CNAF/, 'CNAF').trim();
    if (/BUTYL/.test(mat)) mat = mat.replace(/BUTYL/, 'Butyl rubber');
  }
  const code = mat.split(/[\s/+]/)[0];
  if (MATERIALS[code]) mat = MATERIALS[code] + mat.slice(code.length);
  out.material = mat;
  return out;
}

/** Splits a Box No cell: "2,3,4 (50/50/10)" → boxes 2, 3 and 4 with 50, 50 and 10 pieces. */
export function parseBoxCell(cell: string): { box: string; qty: number | null }[] {
  const t = cell.trim();
  if (!t) return [];
  const m = /^([^()]+?)\s*\(([^)]*)\)\s*$/.exec(t);
  const boxes = (m ? m[1] : t)
    .split(/[,;&]|\bAND\b/i)
    .map((x) => x.trim())
    .filter(Boolean);
  const qtys = m
    ? m[2]
        .split(/[/,;]/)
        .map((x) => parseFloat(x))
        .filter((x) => Number.isFinite(x))
    : [];
  return boxes.map((box, i) => ({ box, qty: qtys.length === boxes.length ? qtys[i] : null }));
}

/** A complete line from a description, with dimensions and weight filled in where the standards cover it. */
export function lineFromText(text: string, base: Partial<GasketLine> = {}): { line: Partial<GasketLine>; notes: string[] } {
  const p = parseDescription(text);
  const notes: string[] = [];
  const family: Family = (base.family && base.family !== 'OTHER' ? base.family : p.family) ?? 'OTHER';
  // a quantity typed after the description ("… x 200") is not part of the description of goods
  const description = p.quantity
    ? text
        .trim()
        .replace(/\s+(?:x|qty\.?:?)\s*\d+\s*(?:nos?\.?|pcs)?\s*$/i, '')
        .replace(/\s+\d+\s*(?:nos?\.?|pcs)\s*$/i, '')
    : text.trim();
  const line: Partial<GasketLine> = {
    ...base,
    description,
    family,
    size: p.size || base.size || 0,
    rating: p.rating || base.rating || 0,
    ringNo: p.ringNo,
    material: p.material,
    od: p.od,
    innerD: p.innerD,
    thickness: p.thickness,
  };
  if (p.quantity && !base.quantity) line.quantity = p.quantity;
  if (family === 'SPW' && (!line.od || !line.innerD)) {
    const d = spwDims(line.size ?? 0, line.rating ?? 0);
    if (d) {
      line.od = d.od;
      line.innerD = d.innerD;
      line.thickness = line.thickness || d.thickness;
    } else if (line.size) notes.push(`${text.trim()}: no B16.20 size for ${line.size}″ class ${line.rating || '?'}; enter OD and ID.`);
  }
  if (family === 'RTJ' && p.ringNo && !line.od) {
    const d = rtjDims(p.ringNo, p.style === 'oval' ? 'oval' : 'oct');
    if (d) {
      line.od = d.od;
      line.innerD = d.innerD;
      line.thickness = line.thickness || d.thickness;
    } else notes.push(`${text.trim()}: ring ${p.ringNo} is not in the ring table; enter its size.`);
  }
  if ((family === 'SC' || family === 'KAM' || family === 'DJ' || family === 'ISK') && !line.od)
    notes.push(`${text.trim()}: there is no standard size table for this type here; enter OD, ID and thickness.`);
  if (family === 'SPW' && !line.size && line.od) line.size = spwSizeFromOd(line.od, line.rating ?? 0);
  if (family === 'RTJ' && !line.size && line.od) line.size = Math.round((line.od / 25.4) * 2) / 2;
  if (!line.thickness) line.thickness = family === 'SPW' ? 4.5 : family === 'SC' ? 3 : family === 'KAM' ? 4 : family === 'DJ' ? 3.2 : 0;
  if (line.od && !base.unitWeight) {
    line.unitWeight = estimateWeight(line as GasketLine);
    line.weightEstimated = true;
  }
  return { line, notes };
}
