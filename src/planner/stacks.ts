import { INCH } from '../model/defaults';

/** A length in whole inches, the way box sizes are written on the annexure. */
export const wholeInches = (mm: number) => Math.round(mm / INCH);

/** "34 × 34 × 8" from outside dimensions in mm. */
export function boxInches(ext: { l: number; w: number; h: number }): string {
  return `${wholeInches(ext.l)} × ${wholeInches(ext.w)} × ${wholeInches(ext.h)}`;
}
