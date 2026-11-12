import { DN_TO_NPS } from '../model/tables';
import type { Family } from '../model/types';

export interface Described {
  family: Family | null;
  size: number; // nominal, inches
  rating: number;
  series: '' | 'A' | 'B';
  ringNo: string;
  style: 'oval' | 'oct' | '';
  od: number;
  bore: number;
  thk: number;
  qty: number;
}

const num = (s: string) => Number(s);

function toInches(s: string): number {
  const t = s.trim().replace(/\s+/g, ' ');
  // 1.1/2  1-1/2  1 1/2  → 1.5 ; 1/2 → 0.5 ; 2.5 → 2.5
  let m = /^(\d+)[.\- ](\d)\/(\d)$/.exec(t);
  if (m) return num(m[1]) + num(m[2]) / num(m[3]);
  m = /^(\d)\/(\d)$/.exec(t);
  if (m) return num(m[1]) / num(m[2]);
  return parseFloat(t);
}

const N = String.raw`(\d+(?:\.\d+)?)`;

/**
 * Reads a description of goods the way the works writes it:
 * `SPW 4"X300# CS-OR+304/FG+304-IR ASME B16.20`, `RTJ R24 SI OCT`,
 * `SC (RF) CMGC NS 933 MM OD X 907 MM ID X 2.14 MM THK, …`,
 * `DIMENSION: OD 445MM X ID 425MM, CORE THK 3.0MM …`,
 * `(2 inch KAMPROFILE GASKET, RATING 600 …) SEALING ELEMENT ID-OD: 69.8MM, 88.9MM, OUTER RING OD: 111MM`.
 * Anything it cannot read is left at zero rather than guessed.
 */
export function describe(text: string): Described {
  const s = ` ${text.toUpperCase().replace(/[″“”]/g, '"').replace(/''/g, '"').replace(/×/g, 'X')} `;
  const out: Described = { family: null, size: 0, rating: 0, series: '', ringNo: '', style: '', od: 0, bore: 0, thk: 0, qty: 0 };
  let m: RegExpExecArray | null;

  // quantity typed after a description in quick entry: "… x 200"
  m = /\sX\s*(\d+)\s*(?:NOS?\.?|PCS)?\s*$/.exec(s);
  if (m && !/MM\s*$/.test(s)) out.qty = num(m[1]);

  // outline written out: 933 MM OD X 907 MM ID X 2.14 MM THK / OD 445MM X ID 425MM / OD = 1535 MM / OUTER RING OD: 111MM
  m = new RegExp(String.raw`OUTER\s*RING\s*OD\s*[:=]?\s*${N}`).exec(s);
  if (m) out.od = num(m[1]);
  if (!out.od) {
    m = new RegExp(String.raw`${N}\s*(?:MM)?\s*OD\b`).exec(s) ?? new RegExp(String.raw`\bOD\s*[:=]?\s*${N}`).exec(s);
    if (m) out.od = num(m[1]);
  }
  m = new RegExp(String.raw`${N}\s*(?:MM)?\s*ID\b`).exec(s) ?? new RegExp(String.raw`\bID\d?\s*[:=]?\s*${N}`).exec(s);
  if (m) out.bore = num(m[1]);
  m = /SEALING\s*ELEMENT\s*ID-OD\s*:?\s*(\d+(?:\.\d+)?)/.exec(s);
  if (m) out.bore = num(m[1]);
  m = new RegExp(String.raw`${N}\s*MM\s*(?:GASKET\s*|CORE\s*)?(?:THK|THICK)`).exec(s) ?? new RegExp(String.raw`(?:CORE\s*)?(?:THK|THICKNESS)\s*[:=]?\s*${N}\s*MM`).exec(s);
  if (m) out.thk = num(m[1]);
  // NS (a X b X c X d): spiral wound outer ring OD … inner ring ID
  m = new RegExp(String.raw`\(\s*${N}\s*X\s*${N}\s*X\s*${N}\s*X\s*${N}\s*\)`).exec(s);
  if (m) {
    out.od = num(m[1]);
    out.bore = num(m[4]);
  }
  // plain 222.3 X 157.2 X 4.5
  if (!out.od) {
    m = new RegExp(String.raw`\s${N}\s*X\s*${N}\s*X\s*${N}\s*(?:MM)?\s`).exec(s);
    if (m && num(m[1]) > num(m[2])) {
      out.od = num(m[1]);
      out.bore = num(m[2]);
      out.thk = out.thk || num(m[3]);
    }
  }

  m = /SERIES[\s-]*([AB])\b/.exec(s);
  if (m) out.series = m[1] as 'A' | 'B';

  // class: 150#, CL300, CLASS 600, RATING 600, 900LB
  m = /(\d{3,4})\s*(?:#|LBS?\b)/.exec(s) ?? /\b(?:CL(?:ASS)?|RATING)\.?\s*(\d{3,4})\b/.exec(s);
  if (m) out.rating = num(m[1]);

  m = /\b(RX|BX|R)\s*-?\s*(\d{2,3})\b/.exec(s);
  if (m && (/\bRTJ\b|RING\s*JOINT/.test(s) || m[1] !== 'R')) out.ringNo = `${m[1]}${m[2]}`;
  if (/\bOCT(?:AGONAL)?\b/.test(s)) out.style = 'oct';
  else if (/\bOVAL\b/.test(s)) out.style = 'oval';

  // the short forms of the EasyCargo sheets: `SC 1130 "1106 #` (OD "ID in mm) and `SPW 28-B "150 #` (size, series, class)
  m = /(\d{3,}(?:\.\d+)?)\s*"\s*(\d{3,}(?:\.\d+)?)\s*#/.exec(s);
  if (m && !out.od && num(m[1]) > num(m[2])) {
    out.od = num(m[1]);
    out.bore = num(m[2]);
  }
  m = /\b(\d{2})\s*-\s*([AB])\s*"/.exec(s);
  if (m) {
    out.size = num(m[1]);
    out.series = m[2] as 'A' | 'B';
  }

  // nominal size: 6", 1.1/2", 2 1/2", 24 INCH, 0.75INCH, DN150, 150NB
  m = /(\d+(?:[.\- ]\d\/\d|\.\d+)?|\d\/\d)\s*(?:"|INCH(?:ES)?\b|INCH)/.exec(s);
  if (out.size) {
    // read above
  } else if (m && toInches(m[1]) <= 120) out.size = toInches(m[1]);
  else {
    m = /\bDN\s*(\d{2,4})\b/.exec(s) ?? /\b(\d{2,4})\s*NB\b/.exec(s);
    if (m && DN_TO_NPS[num(m[1])]) out.size = DN_TO_NPS[num(m[1])];
  }

  // family — kits and ring joints first, soft cut last (its words turn up in spiral wound fillers)
  if (/\bISK\b|INSULAT/.test(s)) out.family = 'ISK';
  else if (out.ringNo || /\bRTJ\b|RING\s*JOINT/.test(s)) out.family = 'RTJ';
  else if (/KAM+(?:PROFILE)?\b|KAMMPROFILE|KAMPROFILE/.test(s)) out.family = 'KAM';
  else if (/\bDJ\b|DOUBLE\s*JACKET/.test(s)) out.family = 'DJ';
  else if (/\bSPW\b|\bSWG\b|SPIRAL/.test(s)) out.family = 'SPW';
  else if (/\bPLUG\b/.test(s)) out.family = 'PLUG';
  else if (/\bSC\b|SOFT\s*CUT|CMGC|CNAF|NON[\s-]*ASBESTOS|\bPTFE\b|GRAPHITE|\bGRF\b|BUTYL|NEOPRENE|\bEPDM\b|RUBBER|DIMENSION/.test(s)) out.family = 'SC';
  return out;
}
