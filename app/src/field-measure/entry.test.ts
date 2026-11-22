// EZD-1419 (AC-EZD-1419-3 "typing 250' asks to confirm"; S17b Validation & warnings "a value outside 0–200 ft asks
// to confirm"). Expected values: 200 ft = 2400"; 250' = 3000"; 9' 0" = 108"; the 1000 ft ceiling (12000") and the
// refusal of 0 and of text that is not a length are vault/build/assumptions.md EZD-1419.
import { describe, expect, it } from 'vitest';
import { CONFIRM_ABOVE_IN, MAX_FIELD_LENGTH_IN, readFieldLength } from './entry';

describe('EZD-1419 typed wall lengths', () => {
  it('AC-EZD-1419-3: 250\' asks to confirm, at 3000"', () => {
    expect(readFieldLength("250'")).toEqual({ kind: 'confirm', inches: 3000 });
    expect(readFieldLength('250\' 6"')).toEqual({ kind: 'confirm', inches: 3006 });
  });

  it('up to 200 ft is taken as typed', () => {
    expect(CONFIRM_ABOVE_IN).toBe(2400);
    expect(readFieldLength("200'")).toEqual({ kind: 'ok', inches: 2400 });
    expect(readFieldLength('9\' 0"')).toEqual({ kind: 'ok', inches: 108 });
    expect(readFieldLength('1/16"')).toEqual({ kind: 'ok', inches: 0.0625 });
  });

  it('just over 200 ft asks to confirm', () => {
    expect(readFieldLength('200\' 0 1/16"')).toEqual({ kind: 'confirm', inches: 2400.0625 });
  });

  it('0, over 1000 ft and text that is not a length are refused', () => {
    expect(MAX_FIELD_LENGTH_IN).toBe(12000);
    expect(readFieldLength("1000'")).toEqual({ kind: 'confirm', inches: 12000 });
    expect(readFieldLength('1000\' 1"')).toEqual({ kind: 'refused' });
    expect(readFieldLength("0'")).toEqual({ kind: 'refused' });
    expect(readFieldLength("9'' 2")).toEqual({ kind: 'refused' });
    expect(readFieldLength('')).toEqual({ kind: 'refused' });
  });
});
