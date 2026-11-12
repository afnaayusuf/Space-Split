import { newJob } from '../model/defaults';
import { applyMaster } from '../model/master';
import type { Job, MasterItem, WorksSetup } from '../model/types';
import { parseCheckRows } from '../parse/checklist';
import { readSheets } from '../parse/sheet';

/** Files opened as a packing check list. */
export const CHECK_LIST_FILES = '.xlsx,.xlsm,.csv,.tsv,.txt';

export const isCheckListFile = (name: string) => /\.(xlsx|xlsm|xls|csv|tsv|txt|pdf)$/i.test(name);

/**
 * A new, unsaved job from a check-list file: the sheet with the most gasket
 * lines, its PRN, PO and customer from above the table, and chart weights
 * from the weight master.
 */
export async function jobFromCheckList(
  name: string,
  data: Uint8Array,
  setup: WorksSetup,
  master: Map<string, MasterItem>,
): Promise<{ job: Job; notes: string[]; sheet: string }> {
  const sheets = await readSheets(name, data);
  const reads = sheets.map((s) => ({ sheet: s.name, ...parseCheckRows(s.rows) }));
  const best = reads.reduce<(typeof reads)[number] | null>((a, b) => (!a || b.lines.length > a.lines.length ? b : a), null);
  if (!best || !best.lines.length) throw new Error(`No gasket lines were found in ${name}.`);
  const info = Object.fromEntries(Object.entries(best.info).filter(([, v]) => v));
  const job = newJob(setup, info);
  job.lines = best.lines.map((g) => applyMaster(g, master));
  return { job, notes: best.notes, sheet: best.sheet };
}
