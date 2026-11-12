// Standard dimensions used to fill in a line from its description.
// Spiral wound: ASME B16.20 centering (outer) ring OD and inner ring ID.
// Ring joints: ASME B16.20 pitch diameter and ring width.
// Transcribed for convenience; check against the works' own charts before relying on them.

export const CLASSES = [150, 300, 600, 900, 1500, 2500] as const;

type Row = [number | null, number | null, number | null, number | null, number | null, number | null];

/** NPS → outer ring OD by class (150, 300, 600, 900, 1500, 2500). */
const SPW_OD: Record<string, Row> = {
  '0.5': [47.8, 54.1, 54.1, 63.5, 63.5, 69.9],
  '0.75': [57.2, 66.8, 66.8, 69.9, 69.9, 76.2],
  '1': [66.8, 73.2, 73.2, 79.5, 79.5, 85.9],
  '1.25': [76.2, 82.6, 82.6, 88.9, 88.9, 104.8],
  '1.5': [85.9, 95.3, 95.3, 98.6, 98.6, 117.3],
  '2': [104.8, 111.3, 111.3, 143.0, 143.0, 146.1],
  '2.5': [124.0, 130.3, 130.3, 165.1, 165.1, 168.4],
  '3': [136.7, 149.4, 149.4, 168.4, 174.8, 196.9],
  '4': [174.8, 181.1, 193.8, 206.5, 209.6, 235.0],
  '5': [196.9, 215.9, 241.3, 247.7, 254.0, 279.4],
  '6': [222.3, 251.0, 266.7, 289.1, 282.7, 317.5],
  '8': [279.4, 308.1, 320.8, 358.9, 352.6, 387.4],
  '10': [339.9, 362.0, 400.1, 435.1, 435.1, 476.3],
  '12': [409.7, 422.4, 457.2, 498.6, 520.7, 549.4],
  '14': [450.9, 485.9, 492.3, 520.7, 577.9, null],
  '16': [514.4, 539.8, 565.2, 574.8, 641.4, null],
  '18': [549.4, 596.9, 612.9, 638.3, 704.9, null],
  '20': [606.6, 654.1, 682.8, 698.5, 755.7, null],
  '22': [660.4, 704.9, null, null, null, null],
  '24': [717.6, 774.7, 790.7, 838.2, 901.7, null],
};

/** NPS → inner ring ID by class. */
const SPW_ID: Record<string, Row> = {
  '0.5': [14.2, 14.2, 14.2, 14.2, 14.2, 14.2],
  '0.75': [20.6, 20.6, 20.6, 20.6, 20.6, 20.6],
  '1': [26.9, 26.9, 26.9, 26.9, 26.9, 26.9],
  '1.25': [38.1, 38.1, 38.1, 33.3, 33.3, 33.3],
  '1.5': [44.5, 44.5, 44.5, 41.4, 41.4, 41.4],
  '2': [55.6, 55.6, 55.6, 52.3, 52.3, 52.3],
  '2.5': [66.5, 66.5, 66.5, 63.5, 63.5, 63.5],
  '3': [81.0, 81.0, 81.0, 78.7, 78.7, 78.7],
  '4': [106.4, 106.4, 102.6, 102.6, 97.8, 97.8],
  '5': [131.8, 131.8, 128.3, 128.3, 124.5, 124.5],
  '6': [157.2, 157.2, 154.9, 154.9, 147.3, 147.3],
  '8': [215.9, 215.9, 205.7, 196.9, 196.9, 196.9],
  '10': [268.2, 268.2, 255.3, 246.1, 246.1, 246.1],
  '12': [317.5, 317.5, 307.3, 292.1, 292.1, 292.1],
  '14': [349.3, 349.3, 342.9, 320.8, 320.8, null],
  '16': [400.1, 400.1, 389.9, 374.7, 368.3, null],
  '18': [449.3, 449.3, 438.2, 425.5, 425.5, null],
  '20': [500.1, 500.1, 489.0, 482.6, 476.3, null],
  '22': [551.0, 551.0, null, null, null, null],
  '24': [603.3, 603.3, 590.6, 590.6, 577.9, null],
};

export const SPW_SIZES = Object.keys(SPW_OD).map(Number);

const classIndex = (rating: number) => CLASSES.indexOf(rating as (typeof CLASSES)[number]);

/** Outer ring OD, inner ring ID and winding thickness of a B16.20 spiral wound gasket, or null. */
export function spwDims(size: number, rating: number): { od: number; innerD: number; thickness: number } | null {
  const k = classIndex(rating || 150);
  if (k < 0) return null;
  const od = SPW_OD[String(size)]?.[k];
  const id = SPW_ID[String(size)]?.[k];
  return od && id ? { od, innerD: id, thickness: 4.5 } : null;
}

/** The nominal size whose class-150 (or given class) outer ring is nearest this OD, within 3 %. */
export function spwSizeFromOd(od: number, rating: number): number {
  const k = Math.max(0, classIndex(rating || 150));
  let best = 0;
  let err = Infinity;
  for (const s of SPW_SIZES) {
    const v = SPW_OD[String(s)][k];
    if (v && Math.abs(v - od) < err) {
      err = Math.abs(v - od);
      best = s;
    }
  }
  return err <= od * 0.03 ? best : 0;
}

/** Ring number → [pitch diameter, ring width]. */
const RINGS: Record<number, [number, number]> = {
  11: [34.14, 6.35], 12: [39.67, 7.95], 13: [42.88, 7.95], 14: [44.45, 7.95], 15: [47.63, 7.95],
  16: [50.8, 7.95], 17: [57.15, 7.95], 18: [60.33, 7.95], 19: [65.07, 7.95], 20: [68.27, 7.95],
  21: [72.23, 11.11], 22: [82.55, 6.35], 23: [82.55, 11.11], 24: [95.25, 11.11], 25: [101.6, 6.35],
  26: [101.6, 11.11], 27: [107.95, 11.11], 28: [111.13, 12.7], 29: [114.3, 6.35], 30: [117.48, 11.11],
  31: [123.83, 11.11], 32: [127.0, 12.7], 33: [131.78, 6.35], 34: [131.78, 11.11], 35: [136.53, 11.11],
  36: [149.23, 7.95], 37: [149.23, 11.11], 38: [157.18, 15.88], 39: [161.93, 11.11], 40: [171.45, 7.95],
  41: [180.98, 11.11], 42: [190.5, 19.05], 43: [193.68, 7.95], 44: [193.68, 11.11], 45: [211.14, 11.11],
  46: [211.14, 12.7], 47: [228.6, 19.05], 48: [247.65, 7.95], 49: [269.88, 11.11], 50: [269.88, 15.88],
  51: [279.4, 22.23], 52: [304.8, 7.95], 53: [323.85, 11.11], 54: [323.85, 15.88], 55: [342.9, 28.58],
  56: [381.0, 7.95], 57: [381.0, 11.11], 58: [381.0, 22.23], 59: [396.88, 7.95], 60: [406.4, 31.75],
  61: [419.1, 11.11], 62: [419.1, 15.88], 63: [419.1, 25.4], 64: [454.03, 7.95], 65: [469.9, 11.11],
  66: [469.9, 15.88], 67: [469.9, 28.58], 68: [517.53, 7.95], 69: [533.4, 11.11], 70: [533.4, 19.05],
  71: [533.4, 28.58], 72: [558.8, 7.95], 73: [584.2, 12.7], 74: [584.2, 19.05], 75: [584.2, 31.75],
  76: [673.1, 7.95], 77: [692.15, 15.88], 78: [692.15, 25.4], 79: [692.15, 34.93],
};

/** Ring width → [oval height, octagonal height]. */
const RING_HEIGHT: Record<string, [number, number]> = {
  '6.35': [11.1, 9.7],
  '7.95': [14.3, 12.7],
  '11.11': [17.5, 15.9],
  '12.7': [19.1, 17.5],
  '15.88': [22.4, 20.6],
  '19.05': [25.4, 23.9],
  '22.23': [28.7, 26.9],
  '25.4': [31.8, 30.2],
  '28.58': [35.1, 33.3],
  '31.75': [38.1, 36.6],
  '34.93': [41.4, 39.6],
};

/** Outside and inside diameter and height of an R-series ring, or null. */
export function rtjDims(ringNo: string, style: 'oval' | 'oct' = 'oct'): { od: number; innerD: number; thickness: number; pitch: number; width: number } | null {
  const m = /^R\s*-?\s*(\d{2,3})$/i.exec(ringNo.trim());
  if (!m) return null;
  const row = RINGS[Number(m[1])];
  if (!row) return null;
  const [pd, w] = row;
  const h = RING_HEIGHT[String(w)];
  return { od: +(pd + w).toFixed(2), innerD: +(pd - w).toFixed(2), thickness: h ? h[style === 'oval' ? 0 : 1] : w * 1.4, pitch: pd, width: w };
}

/** DN (mm) → NPS (inches). */
export const DN_TO_NPS: Record<number, number> = {
  15: 0.5, 20: 0.75, 25: 1, 32: 1.25, 40: 1.5, 50: 2, 65: 2.5, 80: 3, 100: 4, 125: 5, 150: 6, 200: 8, 250: 10,
  300: 12, 350: 14, 400: 16, 450: 18, 500: 20, 550: 22, 600: 24, 650: 26, 700: 28, 750: 30, 800: 32, 850: 34,
  900: 36, 950: 38, 1000: 40, 1050: 42, 1100: 44, 1150: 46, 1200: 48, 1300: 52, 1400: 56, 1500: 60,
};

/** Sizes the way the works writes them: ½, 2½, 24. */
export function inch(n: number): string {
  if (!n) return '–';
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  const f = Math.abs(frac - 0.5) < 0.01 ? '½' : Math.abs(frac - 0.25) < 0.01 ? '¼' : Math.abs(frac - 0.75) < 0.01 ? '¾' : frac > 0.01 ? `.${String(Math.round(frac * 100)).padStart(2, '0')}` : '';
  return `${whole || ''}${f}″`;
}
