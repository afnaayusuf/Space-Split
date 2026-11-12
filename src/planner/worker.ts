import type { PlanInput } from '../model/types';
import { planPackaging } from './index';

// Runs the planner off the main thread so the page stays responsive on big orders.
self.onmessage = (e: MessageEvent<{ id: number; input: PlanInput }>) => {
  const { id, input } = e.data;
  try {
    self.postMessage({ id, plan: planPackaging(input) });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
