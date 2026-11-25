// EZD-710 (AC-EZD-710-1 "Every sheet shows a complete title block for a filled project"). Expected values: S13 Data
// shown (title block fields; "sheet x of y"; license CGC1541042), S13 Decision 1 (the ten default sheets with the RCP
// ticked), Decision 10 (the client set has no stamp areas), S15b Decision 2 (the seven fields of a complete title
// block), S13 Validation "Numbering" (a never issued set drafts Rev 0), board S13Sheets (date MM/DD/YY, "AS NOTED").
import { describe, expect, it } from 'vitest';
import { defaultSheetSetData, sheetsForSet, type SheetSetSummary } from '../sheets/sheet-set';
import {
  AS_NOTED,
  PLAN_SCALE_TEXT,
  projectTitleBlockMissing,
  sheetDate,
  sheetTitleBlockValues,
  type ProjectTitleBlock,
} from './sheet-title-block';

const FILLED: ProjectTitleBlock = {
  company: {
    name: 'Worth Properties',
    licenseNo: 'CGC1541042',
    contact: { phone: '561-806-8987', website: 'worthprop.com' },
    logoUrl: null,
  },
  companyName: 'Worth Properties',
  licenseNo: 'CGC1541042',
  projectName: 'Kitchen remodel',
  address: '336 Golfview Rd',
  codeEdition: 'FBC 9th ed. · NEC 2023',
  scopeOfWork: 'Kitchen remodel',
  owner: 'Hendricks',
  parcel: '00-43-44-21-01-000-0010',
  drawn: 'JB',
};

const setOf = (kind: 'permit' | 'client'): SheetSetSummary => {
  const d = defaultSheetSetData(kind);
  return {
    id: null,
    kind,
    size: d.size,
    keyPlacement: d.keyPlacement,
    lastIssuedVersionId: null,
    sheets: sheetsForSet(kind, ['rcp']),
  };
};
const TODAY = new Date(2026, 9, 11);

describe('EZD-710 sheet title block values', () => {
  it('AC-EZD-710-1 every sheet of the permit set has a complete title block for a filled project', () => {
    expect(projectTitleBlockMissing(FILLED)).toEqual([]);
    const set = setOf('permit');
    expect(set.sheets).toHaveLength(10);
    set.sheets.forEach((sheet, i) => {
      const v = sheetTitleBlockValues(FILLED, set, sheet, TODAY);
      expect(v.company).toEqual({
        name: 'Worth Properties',
        license: 'CGC1541042',
        contact: ['561-806-8987', 'worthprop.com'],
        logoUrl: null,
      });
      expect(v.projectName).toBe('Kitchen remodel');
      expect(v.address).toBe('336 Golfview Rd');
      expect(v.codeEdition).toBe('FBC 9th ed. · NEC 2023');
      expect(v.scopeOfWork).toBe('Kitchen remodel');
      expect(v.owner).toBe('Hendricks');
      expect(v.parcel).toBe('00-43-44-21-01-000-0010');
      expect(v.stampAreas).toBe(true);
      expect(v.drawn).toBe('JB');
      expect(v.date).toBe('10/11/26');
      expect(v.sheetNumber).toBe(sheet.number);
      expect(v.sheetTitle).toBe(sheet.title);
      expect(v.revision).toBe('REV 0');
      expect(v.sheetOf).toBe(`${i + 1} OF 10`);
      expect(v.scale.length).toBeGreaterThan(0);
    });
  });

  it('plan sheets print 1/4" = 1\'-0"; the others AS NOTED', () => {
    const set = setOf('permit');
    const scale = (n: string) =>
      sheetTitleBlockValues(FILLED, set, set.sheets.find((s) => s.number === n)!, TODAY).scale;
    expect(scale('A1.0')).toBe(PLAN_SCALE_TEXT);
    expect(PLAN_SCALE_TEXT).toBe('1/4" = 1\'-0"');
    expect(scale('A0.0')).toBe(AS_NOTED);
    expect(scale('E2.0')).toBe('AS NOTED');
  });

  it('the client set has no stamp areas (S13 Decision 10) and counts its own sheets', () => {
    const set = setOf('client');
    const v = sheetTitleBlockValues(FILLED, set, set.sheets[0]!, TODAY);
    expect(v.stampAreas).toBe(false);
    expect(v.sheetOf).toBe('1 OF 1');
  });

  it('the company switch off drops the company block; completeness still needs name and license', () => {
    const off = { ...FILLED, company: null };
    const set = setOf('permit');
    expect(sheetTitleBlockValues(off, set, set.sheets[0]!, TODAY).company).toBeNull();
    expect(projectTitleBlockMissing(off)).toEqual([]);
  });

  it('lists the missing fields of an unfilled project in S15b Decision 2 order', () => {
    expect(
      projectTitleBlockMissing({
        ...FILLED,
        licenseNo: null,
        owner: null,
        parcel: ' ',
        scopeOfWork: null,
      }),
    ).toEqual(['license_number', 'parcel_number', 'owner', 'scope_of_work']);
  });

  it('dates read MM/DD/YY', () => {
    expect(sheetDate(new Date(2027, 0, 5))).toBe('01/05/27');
  });
});
