// Test fixture only: a Class 150 spiral wound range plus soft cut, ring
// joints, Kammprofile and an insulation kit. Not used by the app.
import { DEFAULT_FLEET, defaultCargo, ladderBoxes, lineFrom, DEFAULT_SETTINGS, worksBands } from '../model/defaults';
import type { GasketLine, PlanInput } from '../model/types';

export function sampleLines(): GasketLine[] {
  const rows: [string, string, number][] = [
    ['SPW 24"X150# SS316/GR CS-OR SS316-IR', 'GSK-SPW-24-150', 10],
    ['SPW 22"X150# SS316/GR CS-OR SS316-IR', 'GSK-SPW-22-150', 5],
    ['SPW 20"X150# SS316/GR CS-OR SS316-IR', 'GSK-SPW-20-150', 10],
    ['SPW 18"X150# SS316/GR CS-OR SS316-IR', 'GSK-SPW-18-150', 10],
    ['SPW 16"X150# SS316/GR CS-OR SS316-IR', 'GSK-SPW-16-150', 5],
    ['SPW 14"X150# SS316/GR CS-OR SS316-IR', 'GSK-SPW-14-150', 10],
    ['SPW 12"X150# SS316/GR CS-OR SS316-IR', 'GSK-SPW-12-150', 10],
    ['SPW 10"X150# SS316/GR CS-OR SS316-IR', 'GSK-SPW-10-150', 15],
    ['SPW 8"X150# SS316/GR CS-OR SS316-IR', 'GSK-SPW-8-150', 20],
    ['SPW 5"X150# SS316/GR CS-OR SS316-IR', 'GSK-SPW-5-150', 20],
    ['SPW 6"X300# SS316/GR CS-OR SS316-IR', 'GSK-SPW-6-300', 30],
    ['SPW 2"X150# SS316/GR CS-OR SS316-IR', 'GSK-SPW-2-150', 60],
    ['SC (RF) 8"X150# NON ASBESTOS 269.9X219.1X3MM', 'GSK-SC-8-150', 40],
    ['RTJ R24 SI OCT', 'GSK-RTJ-R24', 12],
    ['RTJ R45 SS316L OVAL', 'GSK-RTJ-R45', 6],
    ['KAM 10"X300# SS316/GR 362X282.4X4MM', 'GSK-KAM-10-300', 6],
    ['ISK 6"X300# TYPE-F G10 270X168X40MM', 'GSK-ISK-6-300', 4],
  ];
  return rows.map(([d, code, qty], i) => lineFrom(d, { sl: String(i + 1), poSl: String((i + 1) * 10), itemCode: code, quantity: qty }));
}

export function sampleInput(): PlanInput {
  return {
    job: { prn: 'TEST/0001', po: 'PO-TEST', poDate: '2026-10-01', customer: 'Test', dispatch: 'Surface', date: '2026-10-21' },
    lines: sampleLines(),
    boxSizes: ladderBoxes(),
    cargo: defaultCargo(),
    settings: { ...DEFAULT_SETTINGS, bands: worksBands() },
    fleet: DEFAULT_FLEET,
  };
}
