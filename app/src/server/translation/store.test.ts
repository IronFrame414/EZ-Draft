// EZD-1501 (AC-EZD-1501-1 "after trimming and collapsing spaces"): the phrase key rule.
import { describe, expect, it } from 'vitest';
import { normalizePhrase } from './store';

describe('EZD-1501 normalizePhrase', () => {
  it('trims and collapses every run of white space to one space', () => {
    expect(normalizePhrase('  Install   grab bar\t at 33"  ')).toBe('Install grab bar at 33"');
    expect(normalizePhrase('Line one\n\nline two')).toBe('Line one line two');
  });

  it('keeps case and punctuation (only spaces are changed)', () => {
    expect(normalizePhrase('GFCI receptacle, 42" AFF')).toBe('GFCI receptacle, 42" AFF');
  });
});
