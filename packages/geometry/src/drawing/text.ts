// EZD-238 Build step 5 (vault/plans/EZD-238.md section 1, Decided "Font measure"; Q-0507): text width from the
// committed advance table; no font file is read at run time.
// EZD-205a Build step 11 (vault/plans/EZD-205a.md section 3; board S03): Instrument Sans 600 for room labels.
import { DM_MONO_400_METRICS, INSTRUMENT_SANS_600_METRICS } from './font-metrics.generated';

export type FontMetrics = {
  unitsPerEm: number;
  notdefAdvance: number;
  advances: Readonly<Record<number, number>>;
};

export const DRAWING_FONTS: {
  'dm-mono-400': FontMetrics;
  'instrument-sans-600': FontMetrics;
} = { 'dm-mono-400': DM_MONO_400_METRICS, 'instrument-sans-600': INSTRUMENT_SANS_600_METRICS };

// Room label letter spacing in em (board S03: 1.5 px at 15 px).
export const ROOM_LABEL_LETTER_SPACING_EM = 0.1;

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
