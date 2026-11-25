// EZD-1906a (AC-EZD-1906a-1) shared inch text. Expected values: 03g (lengths to 1/16", whole inches and a reduced
// fraction) with the inch mark, editor plan R7 (`${formatInches(n)}"`).
import { describe, expect, it } from 'vitest';
import { inchText } from './inch-text';

describe('EZD-1906a inchText', () => {
  it('whole inches with the inch mark', () => {
    expect(inchText(12)).toBe('12"');
    expect(inchText(0)).toBe('0"');
  });

  it('a fraction reduced, to 1/16"', () => {
    expect(inchText(32.5)).toBe('32 1/2"');
    expect(inchText(25.75)).toBe('25 3/4"');
    expect(inchText(0.0625)).toBe('1/16"');
    expect(inchText(1.375)).toBe('1 3/8"');
  });
});
