// EZD-238 Build step 5 (vault/plans/EZD-238.md section 1, Decided "Font measure"; Q-0507): text width from the
// committed advance table; no font file is read at run time.
import { DM_MONO_400_METRICS } from './font-metrics.generated';

export type FontMetrics = {
  unitsPerEm: number;
  notdefAdvance: number;
  advances: Readonly<Record<number, number>>;
};

export const DRAWING_FONTS: { 'dm-mono-400': FontMetrics } = { 'dm-mono-400': DM_MONO_400_METRICS };

// Width = sum of advance(code point) x sizePt / unitsPerEm; a missing code point counts as notdef.
export function measureTextPt(m: FontMetrics, text: string, sizePt: number): number {
  let units = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const advance = cp === undefined ? undefined : m.advances[cp];
    units += advance ?? m.notdefAdvance;
  }
  return (units * sizePt) / m.unitsPerEm;
}
