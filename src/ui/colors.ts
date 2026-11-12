import type { GasketLine } from '../model/types';

export type ColorBy = 'item' | 'kind';

export interface TypeColor {
  base: string;
  light: string; // inner edge of the ring
  dark: string; // outer edge and outline
}

// Clip colours in the spirit of Ableton Live's palette: bright, evenly spread, readable on dark grey and on light grey.
const BASES = [
  '#ff9a3c', // orange
  '#5cc8ff', // sky
  '#b5e33a', // lime
  '#ff6f91', // rose
  '#a68cff', // violet
  '#3fd9b0', // mint
  '#ffd23f', // yellow
  '#ff5f4a', // red
  '#4e8df0', // blue
  '#e07ce8', // magenta
  '#8fd16f', // green
  '#d9a36a', // tan
  '#7ad7e8', // cyan
  '#c8c8c8', // silver
];

function mix(hex: string, target: number, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (target - c) * t));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function shade(base: string): TypeColor {
  return { base, light: mix(base, 255, 0.55), dark: mix(base, 0, 0.35) };
}

/** One colour gradient per PRN line, or per gasket type. */
export function buildColorMap(lines: GasketLine[], by: ColorBy): Map<string, TypeColor> {
  const byKey = new Map<string, TypeColor>();
  const out = new Map<string, TypeColor>();
  for (const t of lines) {
    const key = by === 'kind' ? t.family : t.id;
    let c = byKey.get(key);
    if (!c) {
      const i = byKey.size;
      const base = BASES[i % BASES.length];
      // past the first round of hues, vary the depth so repeats still read apart
      c = shade(i < BASES.length ? base : mix(base, i % 2 ? 0 : 255, 0.3));
      byKey.set(key, c);
    }
    out.set(t.id, c);
  }
  return out;
}

export const FALLBACK_COLOR: TypeColor = shade('#8a909c');

/** Corrugated board and carton colour for squares drawn under rings. */
export const KRAFT = { fill: '#b98d57', edge: '#8a6538' };
