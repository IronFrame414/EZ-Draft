// EZD-711 (AC-EZD-711-2 "year built 1975 sets the lead flag"; S01 "Year built before 1978 sets the lead flag"; board
// S01bWizard "1986 · no lead flag (pre-1978 only)"; vault/build/assumptions.md EZD-711 "1978 or later, or blank, leaves
// it off"): the lead flag rule and the confirmed fields.
import { describe, expect, it } from 'vitest';
import {
  confirmedFields,
  confirmedNames,
  confirmedRecordSchema,
  isPre1978,
  type PropertyFields,
} from './property-record';

const READ: PropertyFields = {
  parcelNo: '00-43-44-21-01-000-0010',
  owner: 'HENDRICKS FAMILY TRUST',
  legalDescription: 'GOLFVIEW HEIGHTS LT 10 BLK 2',
  yearBuilt: 1975,
  livingArea: 2140,
};

describe('EZD-711 lead flag', () => {
  it('year built 1975 sets the lead flag (AC-EZD-711-2)', () => {
    expect(isPre1978(1975)).toBe(true);
  });
  it('1977 sets it; 1978, the board 1986 and a blank year leave it off', () => {
    expect(isPre1978(1977)).toBe(true);
    expect(isPre1978(1978)).toBe(false);
    expect(isPre1978(1986)).toBe(false);
    expect(isPre1978(null)).toBe(false);
    expect(isPre1978(undefined)).toBe(false);
  });
});

describe('EZD-711 confirmed fields', () => {
  it('keeps only the ticked fields; the rest are blank', () => {
    const c = confirmedFields(READ, new Set(['parcelNo', 'owner', 'yearBuilt']));
    expect(c).toEqual({
      parcelNo: '00-43-44-21-01-000-0010',
      owner: 'HENDRICKS FAMILY TRUST',
      legalDescription: null,
      yearBuilt: 1975,
      livingArea: null,
    });
    expect(confirmedNames(c)).toEqual(['parcelNo', 'owner', 'yearBuilt']);
  });

  it('the save body is exactly { fields, sourceUrl } within the column limits', () => {
    expect(confirmedRecordSchema.safeParse({ fields: READ, sourceUrl: null }).success).toBe(true);
    expect(confirmedRecordSchema.safeParse({ fields: READ, sourceUrl: null, extra: 1 }).success).toBe(false);
    expect(confirmedRecordSchema.safeParse({ fields: { ...READ, yearBuilt: 1599 }, sourceUrl: null }).success).toBe(
      false,
    );
    expect(
      confirmedRecordSchema.safeParse({ fields: { ...READ, owner: 'x'.repeat(301) }, sourceUrl: null }).success,
    ).toBe(false);
    const blank = confirmedRecordSchema.parse({ fields: { ...READ, owner: '   ' }, sourceUrl: null });
    expect(blank.fields.owner).toBeNull();
  });
});
