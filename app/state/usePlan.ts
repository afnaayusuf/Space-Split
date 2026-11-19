import { useEffect, useRef, useState } from 'react';
import type { Line, Plan, Settings } from '../model/types';
import PlanWorker from '../pack/worker?worker&inline';
import { makePlan } from '../pack/plan';

/**
 * Plans in a worker whenever the lines or settings change; the last plan stays
 * on screen while the next is worked out. A change made while a plan is still
 * being worked out stops that worker and starts a fresh one, so the newest
 * settings never wait behind stale plans.
 */
export function usePlan(lines: Line[] | null, settings: Settings) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const pending = useRef(false);
  const seq = useRef(0);

  const spawn = () => {
    try {
      worker.current = new PlanWorker();
    } catch {
      worker.current = null; // no workers (very old browser): plan on the page instead
    }
  };

  useEffect(() => {
    spawn();
    return () => {
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    if (!lines || !lines.length) {
      setPlan(null);
      setBusy(false);
      return;
    }
    const id = ++seq.current;
    setBusy(true);
    if (pending.current && worker.current) {
      worker.current.terminate();
      spawn();
    }
    const w = worker.current;
    const done = (p: Plan | null, err: string | null) => {
      if (id !== seq.current) return;
      pending.current = false;
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
    // the worker itself failed (out of memory, a script error): say so rather than show "Planning…" for good
    const fail = (e: ErrorEvent | MessageEvent) => {
      e.preventDefault?.();
      done(null, e instanceof ErrorEvent && e.message ? `Planning stopped: ${e.message}` : 'Planning stopped: the planner could not finish.');
      worker.current?.terminate();
      spawn();
    };
    w.addEventListener('message', on);
    w.addEventListener('error', fail);
    w.addEventListener('messageerror', fail);
    pending.current = true;
    w.postMessage({ id, lines, settings });
    return () => {
      w.removeEventListener('message', on);
      w.removeEventListener('error', fail);
      w.removeEventListener('messageerror', fail);
    };
  }, [lines, settings]);

  return { plan, busy, error };
}
