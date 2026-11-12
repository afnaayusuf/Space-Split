import { useEffect, useRef, useState } from 'react';
import type { Line, Plan, Settings } from '../model/types';
import PlanWorker from '../pack/worker?worker&inline';
import { makePlan } from '../pack/plan';

/** Plans in a worker whenever the lines or settings change; the last plan stays on screen while the next is worked out. */
export function usePlan(lines: Line[] | null, settings: Settings) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    try {
      worker.current = new PlanWorker();
    } catch {
      worker.current = null; // no workers (very old browser): plan on the page instead
    }
    return () => worker.current?.terminate();
  }, []);

  useEffect(() => {
    if (!lines || !lines.length) {
      setPlan(null);
      setBusy(false);
      return;
    }
    const id = ++seq.current;
    setBusy(true);
    const w = worker.current;
    const done = (p: Plan | null, err: string | null) => {
      if (id !== seq.current) return;
      setPlan(p);
      setError(err);
      setBusy(false);
    };
    if (!w) {
      const t = setTimeout(() => {
        try {
          done(makePlan(lines, settings), null);
        } catch (e) {
          done(null, e instanceof Error ? e.message : String(e));
        }
      }, 0);
      return () => clearTimeout(t);
    }
    const on = (e: MessageEvent<{ id: number; plan?: Plan; error?: string }>) => {
      if (e.data.id === id) done(e.data.plan ?? null, e.data.error ?? null);
    };
    w.addEventListener('message', on);
    w.postMessage({ id, lines, settings });
    return () => w.removeEventListener('message', on);
  }, [lines, settings]);

  return { plan, busy, error };
}
