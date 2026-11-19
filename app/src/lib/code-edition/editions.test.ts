// EZD-613 (S15g; Q-0220; AC-EZD-613-1). Expected values: Q-0220 and S15g Decision 1 (v1 has one edition, FBC 9th
// ed. with NEC 2023); S15g Save (a project with its own edition keeps it); assumptions EZD-613 (a project with no
// edition reads the company default; the load-calc default is off, assumptions EZD-615).
import { describe, expect, it } from 'vitest';
import {
  CODE_EDITIONS,
  DEFAULT_CODE_EDITION,
  companyEdition,
  optionalLoadCalcOf,
  parseCodeEditionPatch,
  projectEdition,
  settingsOf,
} from './editions';

describe('EZD-613 code editions', () => {
  it('v1 offers FBC 9th ed. with NEC 2023 only, and it is the default', () => {
    expect(CODE_EDITIONS).toEqual(['fbc9_nec2023']);
    expect(DEFAULT_CODE_EDITION).toBe('fbc9_nec2023');
    expect(companyEdition(null)).toBe('fbc9_nec2023');
    expect(companyEdition('FBC 2023')).toBe('fbc9_nec2023');
  });

  it('AC-EZD-613-1: a project with its own edition keeps it whatever the company default is', () => {
    expect(projectEdition('fbc9_nec2023', null)).toBe('fbc9_nec2023');
    expect(projectEdition('fbc9_nec2023', 'fbc8_nec2020')).toBe('fbc9_nec2023');
    // No edition of its own: the company default.
    expect(projectEdition(null, 'fbc9_nec2023')).toBe('fbc9_nec2023');
    expect(projectEdition(null, null)).toBe('fbc9_nec2023');
  });

  it('the optional load-calc default is off unless stored on', () => {
    expect(optionalLoadCalcOf({})).toBe(false);
    expect(optionalLoadCalcOf(null)).toBe(false);
    expect(optionalLoadCalcOf({ optional_load_calc: 'yes' })).toBe(false);
    expect(optionalLoadCalcOf({ optional_load_calc: true })).toBe(true);
    expect(settingsOf(null, { optional_load_calc: true })).toEqual({
      edition: 'fbc9_nec2023',
      optionalLoadCalc: true,
      available: ['fbc9_nec2023'],
    });
  });

  it('the PATCH body takes an edition from the list and a boolean, nothing else', () => {
    expect(parseCodeEditionPatch({ edition: 'fbc9_nec2023' })).toEqual({ edition: 'fbc9_nec2023' });
    expect(parseCodeEditionPatch({ optionalLoadCalc: false })).toEqual({ optionalLoadCalc: false });
    for (const bad of [
      {},
      null,
      [],
      { edition: 'FBC 2023' },
      { edition: null },
      { optionalLoadCalc: 'on' },
      { edition: 'fbc9_nec2023', other: 1 },
    ]) {
      expect(parseCodeEditionPatch(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
