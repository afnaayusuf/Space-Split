import type { PackagePlan } from '../model/types';
import { canNest, marginOf } from './boxFill';
import { pileDistance } from './distance';
import { familyRule, type LinePack } from './units';

const TOL = 0.01; // mm or kg

/**
 * Independent check of a finished plan against the packing rules. Heights and
 * weights are recomputed here rather than trusted from the plan. An empty list
 * means every pile, box and truck obeys every rule and every piece is
 * accounted for.
 */
export function checkPlan(plan: PackagePlan, packs: Map<string, LinePack>): string[] {
  const s = plan.settings;
  const issues: string[] = [];
  const rules = { domestic: familyRule(s.rule, s) === 'domestic' };

  // every piece is either in a box or reported as not packed
  const packed = new Map<string, number>();
  for (const b of plan.boxes) for (const st of b.stacks) packed.set(st.typeId, (packed.get(st.typeId) ?? 0) + st.count);
  for (const u of plan.unplacedGaskets) packed.set(u.typeId, (packed.get(u.typeId) ?? 0) + u.quantity);
  for (const t of plan.types)
    if ((packed.get(t.id) ?? 0) !== t.quantity) issues.push(`${t.itemCode || t.description}: ${packed.get(t.id) ?? 0} pieces planned, ${t.quantity} ordered.`);

  for (const b of plan.boxes) {
    const tag = `Box ${b.label}`;
    let net = 0;
    let tallest = 0;
    const families = new Set<string>();
    const codes = new Set<string>();
    for (const st of b.stacks) {
      const p = packs.get(st.typeId);
      if (!p) {
        issues.push(`${tag} pile ${st.no} holds an unknown line.`);
        continue;
      }
      families.add(p.line.family);
      codes.add(p.line.itemCode.trim() || p.line.id);
      net += st.count * p.line.unitWeight;
      if (st.units !== Math.ceil(st.count / p.perUnit) && st.units < Math.ceil(st.count / p.perUnit))
        issues.push(`${tag} pile ${st.no}: ${st.count} pieces cannot go in ${st.units} units of ${p.perUnit}.`);
      tallest = Math.max(tallest, st.height);
      if (st.host === null) {
        const m = marginOf(p, s);
        if (st.x - st.r < m - TOL || st.y - st.r < m - TOL || st.x + st.r > b.inner.l - m + TOL || st.y + st.r > b.inner.w - m + TOL)
          issues.push(`${tag} pile ${st.no} is closer than ${m} mm to a box wall.`);
      } else {
        const h = b.stacks[st.host - 1];
        const hp = h ? packs.get(h.typeId) : undefined;
        if (!h || !hp) issues.push(`${tag} pile ${st.no} stands in a missing pile.`);
        else {
          if (!canNest(hp, p, s, rules)) issues.push(`${tag} pile ${st.no} may not nest inside pile ${h.no} under the rule.`);
          if (h.rIn - Math.hypot(st.x - h.x, st.y - h.y) - st.r < s.nestSlack / 2 - TOL) issues.push(`${tag} pile ${st.no} is too tight in the bore of pile ${h.no}.`);
          if (b.stacks.some((o) => o !== st && o.host === st.host)) issues.push(`${tag} pile ${h.no} holds more than one pile in its bore.`);
        }
      }
    }
    // piles on the same level keep the pile gap
    for (let i = 0; i < b.stacks.length; i++)
      for (let j = i + 1; j < b.stacks.length; j++) {
        const a = b.stacks[i];
        const c = b.stacks[j];
        if (a.host !== null || c.host !== null) continue;
        const gap = pileDistance(a, c);
        if (gap < s.pileGap - TOL) issues.push(`${tag} piles ${a.no} and ${c.no} are ${gap.toFixed(1)} mm apart (rule ${s.pileGap} mm).`);
      }
    if (tallest + s.headroom > b.inner.h + TOL) issues.push(`${tag}: the tallest pile leaves less than ${s.headroom.toFixed(1)} mm under the lid.`);
    if (Math.abs(net - b.netWeight) > TOL) issues.push(`${tag} is listed at ${b.netWeight.toFixed(1)} kg net but carries ${net.toFixed(1)} kg.`);
    if (s.rule !== 'given' && b.ext.h > s.maxBoxDepth + TOL) issues.push(`${tag} is deeper than ${Math.round(s.maxBoxDepth)} mm.`);
    if (s.rule !== 'given' && s.maxBoxWeight > 0 && b.grossWeight > s.maxBoxWeight + TOL && b.stacks.length > 1)
      issues.push(`${tag} weighs ${b.grossWeight.toFixed(1)} kg, over the ${s.maxBoxWeight} kg cap.`);
    // what may share a box
    if (s.rule === 'knpc' && codes.size > 1) issues.push(`${tag} holds more than one item code (KNPC).`);
    if ((s.rule === 'export' || s.rule === 'domestic') && families.size > 1) {
      const mixedOk = s.mixSmall && b.stacks.every((st) => {
        const p = packs.get(st.typeId)!;
        return !p.carded && (p.line.size > 0 ? p.line.size : p.line.od / 25.4) <= s.smallMax + TOL;
      });
      if (!mixedOk) issues.push(`${tag} mixes gasket types.`);
    }
  }

  // every box is on a floor or listed as not loaded
  const unloaded = new Set(plan.unloadedBoxUids);
  if (plan.units.length > 0 || plan.unloadedBoxUids.length > 0)
    for (const b of plan.boxes) if (!b.location && !unloaded.has(b.uid)) issues.push(`Box ${b.label} is neither on the floor nor listed as not loaded.`);

  const L = plan.cargo.length;
  const W = plan.cargo.width;
  for (const u of plan.units) {
    const inUnit = plan.boxes.filter((b) => b.location?.unit === u.index);
    for (const b of inUnit) {
      const p = b.location!;
      if (p.x < s.edgeGap - TOL || p.y < s.edgeGap - TOL || p.x + p.l > L - s.edgeGap + TOL || p.y + p.w > W - s.edgeGap + TOL)
        issues.push(`Box ${b.label} is closer than ${s.edgeGap} mm to a cargo wall.`);
      const top = p.z + b.ext.h;
      if (plan.cargo.height > 0 && top > plan.cargo.height + TOL) issues.push(`Box ${b.label} reaches ${Math.round(top)} mm, above the cargo height.`);
      if (p.tier + 1 > s.maxTiers) issues.push(`Box ${b.label} is on layer ${p.tier + 1}; at most ${s.maxTiers} are allowed.`);
      const column = inUnit.filter((o) => Math.abs(o.location!.x - p.x) < TOL && Math.abs(o.location!.y - p.y) < TOL);
      if (p.tier > 0) {
        const below = column.find((o) => o.location!.tier === p.tier - 1);
        const q = below?.location;
        if (!below || !q || q.rotated !== p.rotated || Math.abs(q.l - p.l) > TOL || Math.abs(q.w - p.w) > TOL || Math.abs(q.z + below.ext.h - p.z) > TOL)
          issues.push(`Box ${b.label} is not fully supported by the box below it.`);
      }
      const above = column.filter((o) => o.location!.tier > p.tier).reduce((a, o) => a + o.grossWeight, 0);
      if (s.maxTopLoad > 0 && above > s.maxTopLoad + TOL) issues.push(`Box ${b.label} carries ${Math.round(above)} kg on top; the limit is ${s.maxTopLoad} kg.`);
    }
    for (let i = 0; i < inUnit.length; i++)
      for (let j = i + 1; j < inUnit.length; j++) {
        const a = inUnit[i];
        const c = inUnit[j];
        const p = a.location!;
        const q = c.location!;
        if (!(p.z < q.z + c.ext.h - TOL && q.z < p.z + a.ext.h - TOL)) continue;
        const sepX = Math.max(q.x - (p.x + p.l), p.x - (q.x + q.l));
        const sepY = Math.max(q.y - (p.y + p.w), p.y - (q.y + q.w));
        if (Math.max(sepX, sepY) < s.boxGap - TOL) issues.push(`Boxes ${a.label} and ${c.label} are closer than ${s.boxGap} mm.`);
      }
    const weight = inUnit.reduce((a, b) => a + b.grossWeight, 0);
    if (Math.abs(weight - u.weight) > TOL) issues.push(`Truck ${u.index + 1} is listed at ${Math.round(u.weight)} kg but carries ${Math.round(weight)} kg.`);
    if (plan.cargo.maxPayload > 0 && weight > plan.cargo.maxPayload + TOL)
      issues.push(`Truck ${u.index + 1} carries ${Math.round(weight)} kg, over the ${plan.cargo.maxPayload} kg payload.`);
  }
  return issues;
}
