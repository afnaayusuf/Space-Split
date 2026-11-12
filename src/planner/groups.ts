import { inch } from '../model/catalog';
import { familyName } from '../model/defaults';
import type { GasketLine, PlanSettings, RuleId } from '../model/types';
import { parseBoxCell } from '../parse/describe';
import type { LinePack } from './units';

/** Lines that may share boxes, with the pieces of each that this group packs. */
export interface Group {
  key: string; // boxes of the same key may be merged later
  label: string;
  packs: LinePack[];
  qty: Record<string, number>;
  given: string | null; // the check list's box number (boxes-as-given)
  order: number; // larger first on the paperwork
}

const sizeOf = (p: LinePack) => (p.line.size > 0 ? p.line.size : p.line.od / 25.4);

/**
 * Splits the PRN into groups by the rule:
 * - export / domestic: no two gasket types in a box, except pieces at or
 *   under the small-size limit, which share one box; carded rings,
 *   Kammprofile and double jacketed on their squares keep to their own
 *   boxes; every insulation kit line has its own; above the small sizes a
 *   piece only shares with pieces close to its size
 * - knpc: one item code per box
 * - consolidated: everything together
 * - given: one group per box number on the check list
 */
export function makeGroups(packs: LinePack[], rule: RuleId, s: PlanSettings, warn: (m: string) => void): Group[] {
  const all = (list: LinePack[]) => Object.fromEntries(list.map((p) => [p.line.id, p.line.quantity]));
  const biggest = (list: LinePack[]) => Math.max(0, ...list.map((p) => p.foot));
  const groups: Group[] = [];
  const add = (key: string, label: string, list: LinePack[], qty = all(list), given: string | null = null) => {
    if (list.length) groups.push({ key, label, packs: list, qty, given, order: biggest(list) });
  };

  if (rule === 'consolidated') {
    add('all', 'Whole PRN', packs);
  } else if (rule === 'knpc') {
    const byCode = new Map<string, LinePack[]>();
    for (const p of packs) {
      const k = p.line.itemCode.trim() || p.line.description.trim() || p.line.id;
      byCode.set(k, [...(byCode.get(k) ?? []), p]);
    }
    for (const [k, list] of byCode) add(`code:${k}`, `Item ${k}`, list);
  } else if (rule === 'given') {
    const byBox = new Map<string, { list: LinePack[]; qty: Record<string, number> }>();
    const loose: LinePack[] = [];
    for (const p of packs) {
      const cells = parseBoxCell(p.line.boxNo);
      if (cells.length === 0) {
        loose.push(p);
        continue;
      }
      const named = cells.reduce((a, c) => a + (c.qty ?? 0), 0);
      const open = cells.filter((c) => c.qty === null).length;
      const rest = Math.max(0, p.line.quantity - named);
      if (named > p.line.quantity) warn(`${label(p.line)}: the Box No cell splits ${named} pieces but the line has ${p.line.quantity}.`);
      let nth = 0;
      let assigned = 0;
      cells.forEach((c) => {
        // pieces without a figure are shared evenly among the boxes named without one
        let q: number;
        if (c.qty !== null) q = Math.min(c.qty, p.line.quantity);
        else {
          q = Math.floor(rest / open) + (nth < rest % open ? 1 : 0);
          nth += 1;
        }
        q = Math.max(0, Math.min(q, p.line.quantity - assigned));
        assigned += q;
        const g = byBox.get(c.box) ?? { list: [], qty: {} };
        if (!g.list.includes(p)) g.list.push(p);
        g.qty[p.line.id] = (g.qty[p.line.id] ?? 0) + q;
        byBox.set(c.box, g);
      });
      if (assigned < p.line.quantity) {
        const last = byBox.get(cells[cells.length - 1].box)!;
        last.qty[p.line.id] += p.line.quantity - assigned;
        warn(`${label(p.line)}: the Box No cell accounts for ${assigned} of ${p.line.quantity} pieces; the rest go in box ${cells[cells.length - 1].box}.`);
      }
    }
    const keys = [...byBox.keys()].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b));
    for (const k of keys) {
      const g = byBox.get(k)!;
      groups.push({ key: `box:${k}`, label: `Box ${k}`, packs: g.list, qty: g.qty, given: k, order: -(parseFloat(k) || 0) });
    }
    if (loose.length) {
      warn(`${loose.length} ${loose.length === 1 ? 'line has' : 'lines have'} no Box No; ${loose.length === 1 ? 'it is' : 'they are'} packed in extra boxes after the given ones.`);
      add('loose', 'No box number', loose);
      groups[groups.length - 1].order = -1e9;
    }
  } else {
    const small: LinePack[] = [];
    const byFamily = new Map<string, LinePack[]>();
    for (const p of packs) {
      if (p.kind === 'kit') {
        add(`kit:${p.line.id}`, `${familyName(p.line.family)} ${label(p.line)}`, [p]);
        continue;
      }
      if (!p.carded && s.mixSmall && sizeOf(p) <= s.smallMax + 1e-9) {
        small.push(p);
        continue;
      }
      const k = `${p.line.family}${p.carded ? ':carded' : ''}`;
      byFamily.set(k, [...(byFamily.get(k) ?? []), p]);
    }
    add('small', `Small sizes up to ${inch(s.smallMax)}`, small);
    for (const [k, list] of byFamily) {
      const fam = familyName(list[0].line.family);
      const what = list[0].carded ? `${fam} on squares` : fam;
      // a 60″ ring does not share with a 30″ one: cluster by size, largest first
      const sorted = [...list].sort((a, b) => b.foot - a.foot);
      let cluster: LinePack[] = [];
      let lead = 0;
      const flush = () => {
        if (!cluster.length) return;
        const sizes = cluster.map(sizeOf);
        const lo = Math.min(...sizes);
        const hi = Math.max(...sizes);
        add(k, `${what} ${lo === hi ? inch(hi) : `${inch(lo)}–${inch(hi)}`}`, cluster);
        cluster = [];
      };
      for (const p of sorted) {
        const big = sizeOf(p) > s.smallMax;
        if (cluster.length && big && p.foot < s.sizeCluster * lead) flush();
        if (!cluster.length) lead = p.foot;
        cluster.push(p);
      }
      flush();
    }
  }
  return groups.sort((a, b) => b.order - a.order);
}

function label(g: GasketLine) {
  return g.itemCode || g.description || `line ${g.sl}`;
}
