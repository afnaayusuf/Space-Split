import type { PlacedStack } from '../model/types';

/** Clear distance between two piles: ring to ring round the circle, otherwise square edge to edge. */
export function pileDistance(a: PlacedStack, b: PlacedStack): number {
  if (a.shape === 'circle' && b.shape === 'circle') return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
  return Math.max(Math.abs(a.x - b.x) - a.r - b.r, Math.abs(a.y - b.y) - a.r - b.r);
}
