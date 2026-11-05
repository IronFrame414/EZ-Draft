// EZD-201 T17 (vault/plans/EZD-201.md section 4; S01 Validation line 110; Q-0561).
import { describe, expect, test } from 'vitest';
import { en } from './catalogs/en';

describe('EZD-201 length refusal message', () => {
  test('T17 refusal text in the catalog', () => {
    expect(Reflect.get(en, 'office.length.refused')).toBe(
      'Use 12\'6", 12\' 6 1/2", 150" or 12.5\'',
    );
  });
});
