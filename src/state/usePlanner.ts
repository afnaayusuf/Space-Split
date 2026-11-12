import { useEffect, useRef, useState } from 'react';
import type { PackagePlan, PlanInput } from '../model/types';
import { planPackaging } from '../planner';
import PlannerWorker from '../planner/worker?worker&inline';

type Reply = { id: number; plan?: PackagePlan; error?: string };

/**
 * Re-plans shortly after the input stops changing, in a worker so typing
 * stays smooth. A newer run replaces one still in progress. `current` is
 * true when the plan shown was made from the input passed in now.
 */
export function usePlanner(input: PlanInput, delay = 350) {
  const [result, setResult] = useState<{ plan: PackagePlan; input: PlanInput } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const pending = useRef(false);
  const runId = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    const id = ++runId.current;
    setBusy(true);

    const finish = (r: Reply) => {
      if (r.id !== runId.current) return;
      if (r.plan) {
        setResult({ plan: r.plan, input });
        setError(null);
      } else setError(r.error ?? 'Planning failed.');
      setBusy(false);
    };
    const runHere = () => {
      try {
        finish({ id, plan: planPackaging(input) });
      } catch (err) {
        finish({ id, error: err instanceof Error ? err.message : String(err) });
      }
    };

    const timer = setTimeout(
      () => {
        if (pending.current && worker.current) {
          worker.current.terminate();
          worker.current = null;
        }
        if (!worker.current) {
          try {
            worker.current = new PlannerWorker();
          } catch {
            worker.current = null;
          }
        }
        const w = worker.current;
        if (!w) {
          runHere();
          return;
        }
        pending.current = true;
        w.onmessage = (e: MessageEvent<Reply>) => {
          pending.current = false;
          finish(e.data);
        };
        w.onerror = (ev) => {
          ev.preventDefault();
          pending.current = false;
          w.terminate();
          worker.current = null;
          runHere();
        };
        w.postMessage({ id, input });
      },
      first.current ? 0 : delay,
    );
    first.current = false;
    return () => clearTimeout(timer);
  }, [input, delay]);

  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
      pending.current = false;
    },
    [],
  );

  return { plan: result?.plan ?? null, busy, error, current: !!result && result.input === input && !busy };
}
