// EZD-720 (AC-EZD-720-1 "Switching to the Client set shows the countertop sheets"; AC-EZD-720-2 "the Permit set never
// contains them"). Expected sets: vault/build/assumptions/EZD-720.md Settled (A8.0 Countertop plan and A9.0 Edge
// details join the client set with the first countertop piece and leave with the last; the permit set refuses
// them), S13 Decision 10 (the client set holds R1.0). Counts and membership only (Settled "Numbers for tests").
import { describe, expect, it } from 'vitest';
import {
  ADD_SHEET_TYPES,
  COUNTERTOP_SHEETS,
  defaultSheetSet,
  isCountertopSheet,
  sheetAllowedInSet,
  sheetsForSet,
  withCountertopSheets,
  withFloorSheets,
} from './sheet-set';

const numbers = (s: readonly { number: string }[]) => s.map((x) => x.number);

describe('EZD-720 client set countertop sheets', () => {
  it('AC-1: with a countertop piece the client set holds A8.0 Countertop plan and A9.0 Edge details, then R1.0', () => {
    const client = withCountertopSheets(sheetsForSet('client', []), 'client', 1);
    expect(numbers(client)).toEqual(['A8.0', 'A9.0', 'R1.0']);
    expect(client.slice(0, 2)).toEqual([
      { number: 'A8.0', title: 'Countertop plan', group: 'architectural', viewports: [] },
      { number: 'A9.0', title: 'Edge details', group: 'architectural', viewports: [] },
    ]);
    expect(numbers(withCountertopSheets(sheetsForSet('client', ['rcp']), 'client', 3))).toEqual(['A8.0', 'A9.0', 'R1.0']);
  });

  it('they leave the client set with the last piece', () => {
    const withTops = withCountertopSheets(sheetsForSet('client', []), 'client', 2);
    expect(numbers(withCountertopSheets(withTops, 'client', 0))).toEqual(['R1.0']);
  });

  it('applying it again changes nothing', () => {
    const once = withCountertopSheets(sheetsForSet('client', []), 'client', 1);
    expect(withCountertopSheets(once, 'client', 1)).toEqual(once);
  });

  it('AC-2: the permit set never contains them, with any number of pieces, even when handed them', () => {
    for (const trades of [[], ['rcp']] as const) {
      const permit = sheetsForSet('permit', trades);
      expect(withCountertopSheets(permit, 'permit', 0)).toEqual(permit);
      expect(withCountertopSheets(permit, 'permit', 5)).toEqual(permit);
      const handed = [...permit, ...COUNTERTOP_SHEETS];
      expect(withCountertopSheets(handed, 'permit', 5)).toEqual(permit);
    }
    const floors = withFloorSheets(defaultSheetSet(['rcp']), [
      { id: 'a', name: 'Floor 1' },
      { id: 'b', name: 'Floor 2' },
    ]);
    expect(withCountertopSheets(floors, 'permit', 2).some((s) => isCountertopSheet(s.number))).toBe(false);
  });

  it('AC-2: the permit set refuses the countertop sheets; the client set takes them; other sheets go in either', () => {
    expect(sheetAllowedInSet('permit', 'A8.0')).toBe(false);
    expect(sheetAllowedInSet('permit', 'A9.0')).toBe(false);
    expect(sheetAllowedInSet('client', 'A8.0')).toBe(true);
    expect(sheetAllowedInSet('client', 'A9.0')).toBe(true);
    expect(sheetAllowedInSet('permit', 'A3.0')).toBe(true);
    expect(sheetAllowedInSet('permit', 'R1.0')).toBe(true);
  });

  it('AC-2: Add sheet offers no countertop sheet type', () => {
    expect(ADD_SHEET_TYPES.some((t) => /countertop|edge/.test(t))).toBe(false);
  });
});
