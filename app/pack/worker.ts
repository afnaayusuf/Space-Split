/// <reference lib="webworker" />
import type { Line, Settings } from '../model/types';
import { makePlan } from './plan';

// Plans off the page's thread, so a PRN of thousands of lines never freezes the screen.
self.onmessage = (e: MessageEvent<{ id: number; lines: Line[]; settings: Settings }>) => {
  const { id, lines, settings } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, plan: makePlan(lines, settings) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
