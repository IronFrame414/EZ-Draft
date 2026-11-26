// EZD-703 (S13 Data shown "sheet: ... viewports, scale"; Title block "scale"; board S13Sheets "AS NOTED"): the title
// block prints the scale of the sheet's viewports; a sheet with none reads AS NOTED.
import { describe, expect, it } from 'vitest';
import { defaultSheetSet } from '../sheets/sheet-set';
import { sheetTitleBlockValues, type ProjectTitleBlock } from './sheet-title-block';

const TB = {
  company: null,
  projectName: 'P',
  address: 'A',
  codeEdition: '',
  scopeOfWork: '',
  owner: '',
  parcel: '',
  drawn: '',
} as unknown as ProjectTitleBlock;
const SET = { kind: 'permit' as const, sheets: defaultSheetSet([]), lastIssuedVersionId: null };
const A1 = { number: 'A1.0', title: 'Existing' };
const today = new Date(2026, 10, 26);

describe('EZD-703 title block scale', () => {
  it('prints the given viewport scale, AS NOTED with none', () => {
    expect(sheetTitleBlockValues(TB, SET, A1, today, `1/2" = 1'-0"`).scale).toBe(`1/2" = 1'-0"`);
    expect(sheetTitleBlockValues(TB, SET, A1, today, null).scale).toBe('AS NOTED');
  });
});
