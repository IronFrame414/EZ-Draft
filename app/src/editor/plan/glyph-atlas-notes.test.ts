// EZD-216 (Q-0687 (b): the Latin-1 letters á, é, ñ, ü, ° and ½ join the glyph atlas so notes print and the crew can
// read Spanish; ATLAS_SIZE_PX 1024 at ATLAS_CELL_PX 64 holds 16 × 16 cells).
import { TEXT_CHARS } from '@ezdraft/geometry';
import { describe, expect, test } from 'vitest';
import {
  ATLAS_CHARS,
  ATLAS_COLUMNS,
  ATLAS_EXTRA_CHARS,
  ATLAS_FONTS,
  atlasCell,
  atlasCellIndex,
} from './glyph-atlas';

describe('EZD-216 note characters in the glyph atlas', () => {
  test('every note character has a cell in both fonts, each cell used once, inside the 16 × 16 atlas', () => {
    expect([...ATLAS_EXTRA_CHARS].sort()).toEqual(['°', '½', 'á', 'é', 'ñ', 'ü'].sort());
    const seen = new Set<number>();
    for (let f = 0; f < ATLAS_FONTS.length; f++) {
      for (const ch of TEXT_CHARS) {
        const i = atlasCellIndex(f, ch);
        expect(i).not.toBeNull();
        expect(seen.has(i!)).toBe(false);
        seen.add(i!);
        expect(i!).toBeLessThan(ATLAS_COLUMNS * ATLAS_COLUMNS);
      }
    }
    expect(seen.size).toBe(2 * (ATLAS_CHARS.length + 6));
  });

  test('the first two fonts keep their cells; the extra letters follow them', () => {
    expect(atlasCellIndex(0, ' ')).toBe(0);
    expect(atlasCellIndex(1, '·')).toBe(191);
    expect(atlasCellIndex(0, ATLAS_EXTRA_CHARS[0]!)).toBe(192);
    expect(atlasCellIndex(1, ATLAS_EXTRA_CHARS[0]!)).toBe(198);
    expect(atlasCell('dm-mono-400', 'ñ')).not.toBeNull();
  });
});
