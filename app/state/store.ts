import { DEFAULTS } from '../model/presets';
import type { Line, Settings, Vehicle } from '../model/types';

/** The PRN being planned: what was read from the file. */
export interface Job {
  file: string;
  prn: string;
  customer: string;
  lines: Line[];
  skipped: { row: number; text: string; why: string }[];
  opened: string; // ISO date
}

const KEY_SETTINGS = 'waveforce/v3/settings';
const KEY_JOB = 'waveforce/v3/job';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Crate settings as 3.1 shipped them, before they were tuned to the works' history. */
const EARLIER_DEFAULTS: Record<string, unknown> = { ring: 10, pile: 20, wall: 30, top: 40, sheet: 3, maxPile: 300, crateMaxSide: 2300, crateMaxH: 1000, crateMaxKg: 2000, board: 22, skid: 100 };

/** Settings as saved, with anything missing (a newer version's fields) from the defaults and anything dropped left out. */
export function loadSettings(): Settings {
  const s = read<Record<string, unknown>>(KEY_SETTINGS);
  if (!s) return DEFAULTS;
  const defaults = DEFAULTS as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...defaults };
  for (const k of Object.keys(defaults)) if (k in s && typeof s[k] === typeof defaults[k]) out[k] = s[k];
  // a value still at an earlier version's default moves to today's (tuned to the works' packing history)
  for (const [k, was] of Object.entries(EARLIER_DEFAULTS)) if (s[k] === was) out[k] = defaults[k];
  // the vehicle list is the current catalogue, with the user's edits to any type kept by id
  const saved = new Map((Array.isArray(s.vehicles) ? (s.vehicles as Vehicle[]) : []).map((v) => [v.id, v]));
  out.vehicles = DEFAULTS.vehicles.map((v) => ({ ...v, ...(saved.get(v.id) ?? {}) }));
  if (out.vehicleId !== 'auto' && !DEFAULTS.vehicles.some((v) => v.id === out.vehicleId)) out.vehicleId = 'auto';
  return out as unknown as Settings;
}

export const saveSettings = (s: Settings) => write(KEY_SETTINGS, s);

export function loadJob(): Job | null {
  const j = read<Job>(KEY_JOB);
  return j && Array.isArray(j.lines) ? j : null;
}

export const saveJob = (j: Job | null) => write(KEY_JOB, j);
