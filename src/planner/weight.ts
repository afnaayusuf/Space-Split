import type { GasketLine } from '../model/types';

/** kg per mm³ */
const STEEL = 7.85e-6;

function metalDensity(material: string): number {
  const m = material.toUpperCase();
  if (/INCONEL|ALLOY\s*6/.test(m)) return 8.44e-6;
  if (/MONEL|ALLOY\s*400/.test(m)) return 8.8e-6;
  if (/TITAN/.test(m)) return 4.5e-6;
  if (/SS|STAINLESS|31[06]|304|321|347|F5[13]/.test(m)) return 7.95e-6;
  return STEEL;
}

function softDensity(material: string): number {
  const m = material.toUpperCase();
  if (/PTFE/.test(m)) return 2.15e-6;
  if (/GRAPH/.test(m)) return 1.0e-6;
  if (/RUBBER|BUTYL|EPDM|NEOPRENE|NITRILE|VITON/.test(m)) return 1.4e-6;
  return 1.75e-6; // CNAF
}

const annulus = (od: number, id: number) => (Math.PI / 4) * Math.max(0, od * od - id * id);

/**
 * Weight of one piece from its outline, for lines that have no chart weight.
 * A rough figure: rings and windings are averaged over the whole annulus.
 * The works' charts are exact; enter the chart weight when you have it.
 */
export function estimateWeight(g: GasketLine): number {
  const od = g.od;
  const id = Math.min(g.innerD, od);
  if (od <= 0) return 0;
  const a = annulus(od, id);
  let kg: number;
  switch (g.family) {
    case 'SPW':
      // centering ring and inner ring at 3 mm, winding at 4.5 mm with filler: about 3.5 mm of 6.6 g/cm³ over the annulus
      kg = a * 3.5 * 6.6e-6;
      break;
    case 'KAM':
      kg = a * g.thickness * metalDensity(g.material) * 0.85;
      break;
    case 'DJ':
      kg = a * g.thickness * metalDensity(g.material) * 0.55;
      break;
    case 'RTJ': {
      // ring cross-section about 85 % of width × height, round the pitch circle
      const width = (od - id) / 2;
      const pitch = (od + id) / 2;
      kg = width * g.thickness * 0.85 * Math.PI * pitch * metalDensity(g.material);
      break;
    }
    case 'ISK':
      kg = a * g.thickness * 1.9e-6 * 0.6;
      break;
    default:
      kg = a * Math.max(g.thickness, 1) * softDensity(g.material);
  }
  return Math.round(kg * 1000) / 1000;
}
