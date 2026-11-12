// EZD-213a - T9, T10 (vault/plans/EZD-213a.md section 4; AC-EZD-213-24): typed rough opening text. Expected values:
// Q-0640 row 5-5; 03g (nearest 1/16"); `G/length.ts` (32-character cap, `LENGTH_REFUSED_MESSAGE_KEY`); plan Decided
// "parseRoughOpening". ASCII only: the multiplication sign is written as the \u00d7 escape (L-042).
import { describe, expect, it } from 'vitest';
import { parseRoughOpening } from './rough-opening';

describe('EZD-213a rough opening text', () => {
  it('EZD-213a T9 rough opening parses', () => {
    const cases: [string, number, number][] = [
      ['34 1/2 x 82 1/2', 34.5, 82.5],
      ['34 1/2" \u00d7 82 1/2"', 34.5, 82.5],
      ['38x82 1/2', 38, 82.5],
      ['3\' 2" x 6\' 10 1/2"', 38, 82.5],
      ['34.03 x 82', 34, 82],
    ];
    for (const [text, width, height] of cases) {
      const r = parseRoughOpening(text);
      expect(r.ok, text).toBe(true);
      if (!r.ok) continue;
      expect(r.width, `${text} width`).toBeCloseTo(width, 9);
      expect(r.height, `${text} height`).toBeCloseTo(height, 9);
    }
  });

  it('EZD-213a T10 rough opening refusals', () => {
    const format = [
      '34 1/2',
      'x 82',
      '34 by 82',
      '',
      '34 x 82 x 6',
      '34 X 82',
      '1'.repeat(33) + ' x 82',
      '34 x ' + '1'.repeat(33),
      'abc x 82',
    ];
    expect(format).toHaveLength(9);
    for (const text of format) {
      expect(parseRoughOpening(text), JSON.stringify(text)).toEqual({
        ok: false,
        reason: 'format',
        messageKey: 'office.length.refused',
      });
    }
    for (const text of ['0 x 82', '34 x 0']) {
      expect(parseRoughOpening(text), text).toEqual({
        ok: false,
        reason: 'not_positive',
        messageKey: 'office.length.refused',
      });
    }
  });
});
