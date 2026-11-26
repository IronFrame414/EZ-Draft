// EZD-123 D1 (AC-EZD-123-4). Expected values: S15d:44 (Version cleanup is two Defaults keys, 30 and 7 days); Q-0697
// (two registry keys); Q-0706 (day values are whole numbers to 365; the version cleanup age and grace may also be 0).
import { describe, expect, it } from 'vitest';
import { defaultRow } from '../../lib/defaults/registry';
import { checkValue, effectiveValue } from '../../lib/defaults/values';

describe('EZD-123 cleanup age and grace', () => {
  it('D1 two company keys, whole days, 30 and 7 by default, 0 allowed (AC-EZD-123-4)', () => {
    const age = defaultRow('version_cleanup_age');
    const grace = defaultRow('version_cleanup_grace');
    expect(age).toBeDefined();
    expect(grace).toBeDefined();
    expect(effectiveValue('version_cleanup_age', {})).toBe(30);
    expect(effectiveValue('version_cleanup_grace', {})).toBe(7);
    expect(effectiveValue('version_cleanup_grace', { version_cleanup_grace: 0 })).toBe(0);
    for (const row of [age!, grace!]) {
      expect(row.perProject).toBe(false);
      expect(checkValue(row, 0).ok).toBe(true);
      expect(checkValue(row, 365).ok).toBe(true);
      expect(checkValue(row, 366).ok).toBe(false);
      expect(checkValue(row, 1.5).ok).toBe(false);
      expect(checkValue(row, -1).ok).toBe(false);
    }
  });
});
