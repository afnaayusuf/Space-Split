import { describe, expect, it } from 'vitest';
import { DEFAULT_FLEET, defaultSetup, lineFrom, newJob } from '../model/defaults';
import { applyMaster, masterFromLine, parseMasterRows, specKey } from '../model/master';
import { planPackaging } from '../planner';
import { sampleInput } from '../planner/sample';
import { fileOf, planInput, readFile, summaryOf } from './project';
import { browserStore, memoryKV, migrateOld, type Store } from './store';

const latest = <T,>(watch: (cb: (v: T) => void) => () => void): T => {
  let v!: T;
  watch((x) => (v = x))();
  return v;
};

describe('job store in the browser', () => {
  it('saves, lists newest first, reopens and deletes jobs', async () => {
    const store = browserStore(memoryKV());
    const setup = defaultSetup();
    const a = { ...newJob(setup, { prn: 'A' }), lines: [lineFrom('SPW 6"X150#', { quantity: 10 })], updatedAt: '2026-10-01T00:00:00.000Z' };
    const b = { ...newJob(setup, { prn: 'B' }), updatedAt: '2026-10-02T00:00:00.000Z' };
    await store.saveJob(a, summaryOf(a, store.session, { boxes: 1, gross: 12.34 }));
    await store.saveJob(b, summaryOf(b, store.session, null));
    const list = latest(store.watchJobs);
    expect(list.map((j) => j.prn)).toEqual(['B', 'A']);
    expect(list[1]).toMatchObject({ lines: 1, pieces: 10, boxes: 1, gross: 12.3 });
    const back = await store.loadJob(a.id, setup);
    expect(back?.lines[0]).toMatchObject({ family: 'SPW', size: 6, quantity: 10 });
    await store.deleteJob(a.id);
    expect(latest(store.watchJobs).map((j) => j.prn)).toEqual(['B']);
    expect(await store.loadJob(a.id, setup)).toBeNull();
  });

  it('keeps the works setup and the weight master', async () => {
    const store = browserStore(memoryKV());
    expect(await store.loadSetup()).toBeNull();
    const s = defaultSetup();
    s.settings.maxBoxWeight = 250;
    s.fleet = [{ ...DEFAULT_FLEET[0], name: 'Our Ace' }];
    await store.saveSetup(s);
    const back = await store.loadSetup();
    expect(back?.settings.maxBoxWeight).toBe(250);
    expect(back?.fleet[0].name).toBe('Our Ace');
    const m = masterFromLine({ ...lineFrom('SPW 6"X150#'), unitWeight: 0.5, weightEstimated: false })!;
    await store.putMaster([m]);
    await store.putMaster([{ ...m, unitWeight: 0.52 }]);
    expect(latest<ReturnType<typeof parseMasterRows>['items']>(store.watchMaster)).toHaveLength(1);
    expect(latest<ReturnType<typeof parseMasterRows>['items']>(store.watchMaster)[0].unitWeight).toBe(0.52);
    await store.removeMaster([m.key]);
    expect(latest<unknown[]>(store.watchMaster)).toHaveLength(0);
  });

  it('reports a full or blocked browser storage instead of failing silently', async () => {
    const kv = memoryKV();
    kv.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    const store: Store = browserStore(kv);
    const j = newJob(defaultSetup(), { prn: 'X' });
    await expect(store.saveJob(j, summaryOf(j, store.session, null))).rejects.toThrow(/full/);
  });
});

describe('weight master', () => {
  it('files weights by spec and by item code, code first', () => {
    const g = lineFrom('SPW 6"X150# SS316/GR', { itemCode: 'A-1', quantity: 5 });
    expect(g.weightEstimated).toBe(true);
    expect(specKey(g)).toBe('SPW 6 150');
    const bySpec = { ...masterFromLine({ ...g, unitWeight: 0.48 })! };
    const byCode = { ...masterFromLine({ ...g, unitWeight: 0.5 }, true)! };
    expect(byCode.key).toBe('CODE A-1');
    const m = new Map([bySpec, byCode].map((x) => [x.key, x]));
    expect(applyMaster(g, m)).toMatchObject({ unitWeight: 0.5, weightEstimated: false });
    expect(applyMaster({ ...g, itemCode: '' }, m).unitWeight).toBe(0.48);
    // a weight typed on the line wins over the master
    expect(applyMaster({ ...g, unitWeight: 0.7, weightEstimated: false }, m).unitWeight).toBe(0.7);
  });

  it('reads a pasted chart, filling outlines from the standards', () => {
    const { items, skipped } = parseMasterRows('Type\tSize\tClass\tKg\nSPW\t6\t150\t0.48\nSPW\t1-1/2\t300\t0.2\nRTJ\tR24\t\t0.35\nnonsense\t1\t2\t3');
    expect(skipped).toBe(2);
    expect(items.map((i) => i.key)).toEqual(['SPW 6 150', 'SPW 1.5 300', 'RTJ R24']);
    expect(items[0]).toMatchObject({ od: 222.3, innerD: 157.2 });
    expect(items[2].od).toBeCloseTo(106.36);
  });
});

describe('files', () => {
  const setup = defaultSetup();
  it('round-trips a job and a backup', () => {
    const j = { ...newJob(setup, { prn: 'P-1' }), lines: [lineFrom('RTJ R24 SI OCT', { quantity: 4 })] };
    const one = readFile(JSON.parse(JSON.stringify(fileOf.job(j))), setup);
    expect(one.jobs[0]).toMatchObject({ id: j.id, info: { prn: 'P-1' } });
    const all = readFile(JSON.parse(JSON.stringify(fileOf.backup({ setup, master: [], jobs: [j] }))), setup);
    expect(all.setup?.boxSizes).toHaveLength(14);
    expect(all.jobs).toHaveLength(1);
  });

  it('opens a project saved by version 1', () => {
    const old = sampleInput();
    const b = readFile(JSON.parse(JSON.stringify({ ...old, settings: { ...old.settings, rule: 'domestic', maxBoxWeight: 280 } })), setup);
    expect(b.jobs[0].rule).toBe('domestic');
    expect(b.jobs[0].lines).toHaveLength(17);
    expect(b.setup?.settings.maxBoxWeight).toBe(280);
  });

  it('refuses a file that is not ours', () => {
    expect(() => readFile({ hello: 1 }, setup)).toThrow(/not a WaveForce/);
  });

  it('still opens files saved under the old name', () => {
    const j = newJob(setup, { prn: 'OLD-1' });
    const old = { ...fileOf.job(j), app: 'space-split' };
    expect(readFile(JSON.parse(JSON.stringify(old)), setup).jobs[0].info.prn).toBe('OLD-1');
  });

  it('brings a real PRN across from version 1 once, and skips the demo', async () => {
    const kv = memoryKV();
    const store = browserStore(kv);
    kv.setItem('space-split/project/v3', JSON.stringify({ ...sampleInput(), job: { ...sampleInput().job, prn: 'REAL/1' } }));
    expect((await migrateOld(kv, store))?.info.prn).toBe('REAL/1');
    expect(await migrateOld(kv, store)).toBeNull();
    const kv2 = memoryKV();
    kv2.setItem('space-split/project/v3', JSON.stringify({ ...sampleInput(), job: { ...sampleInput().job, prn: 'DEMO/2026/0001' } }));
    expect(await migrateOld(kv2, browserStore(kv2))).toBeNull();
  });
});

describe('quick entry', () => {
  it('keeps a typed quantity out of the description of goods', () => {
    const g = lineFrom('SC (RF) 8"X150# CNAF 269.9X219.1X3MM x 40');
    expect(g.quantity).toBe(40);
    expect(g.description).toBe('SC (RF) 8"X150# CNAF 269.9X219.1X3MM');
    expect(lineFrom('SPW 6"X150# SS316/GR').description).toBe('SPW 6"X150# SS316/GR');
  });
});

describe('plan for a job', () => {
  it('numbers boxes in loading order and picks the truck from the works fleet', () => {
    const setup = defaultSetup();
    const job = { ...newJob(setup), lines: sampleInput().lines };
    const plan = planPackaging(planInput(setup, job));
    expect(plan.issues).toEqual([]);
    const loads = plan.boxes.map((b) => b.location!.load);
    expect(plan.boxes.map((b) => b.no)).toEqual(loads);
    expect(plan.boxes.map((b) => b.label)).toEqual(loads.map(String));
    const own = { ...setup, fleet: [{ id: 'big', name: 'Our 32 ft', length: 9750, width: 2400, height: 2400, maxPayload: 15000 }] };
    expect(planPackaging(planInput(own, job)).recommendedVehicle).toBe('Our 32 ft');
  });
});
