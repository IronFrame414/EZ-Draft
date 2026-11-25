// EZD-726 the `sheet_set` type (03b Architecture rule 3: a sheet set is a model object; 03d sheet_set: kind permit /
// client, sheet_ids, size "permit 24x36; client 11x17 or 24x36", key_placement "every sheet / cover only",
// submittal_profile_id, last_issued_version_id; 03b rule 5).
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, OBJECT_TYPES, parseModelDocument, parseStoredObject } from './index';

const FLOOR = '11111111-1111-4111-8111-111111111111';
const SET = '22222222-2222-4222-8222-222222222222';
const SHEET_A = '33333333-3333-4333-8333-333333333333';
const SHEET_B = '44444444-4444-4444-8444-444444444444';

const permit = () => ({
  kind: 'permit',
  sheetIds: [] as string[],
  size: '24x36',
  keyPlacement: 'every_sheet',
  submittalProfileId: null as string | null,
  lastIssuedVersionId: null as string | null,
});
const ok = (data: Record<string, unknown>) =>
  parseStoredObject({ id: SET, type: 'sheet_set', schema_version: CURRENT_SCHEMA_VERSION, data }).ok;

describe('EZD-726 sheet_set schema', () => {
  it('is a model object type', () => {
    expect(OBJECT_TYPES).toContain('sheet_set');
    expect(ok(permit())).toBe(true);
  });

  it('the permit set is 24x36 only; the client set is 11x17 or 24x36', () => {
    expect(ok({ ...permit(), size: '11x17' })).toBe(false);
    expect(ok({ ...permit(), kind: 'client', size: '11x17' })).toBe(true);
    expect(ok({ ...permit(), kind: 'client', size: '24x36' })).toBe(true);
    expect(ok({ ...permit(), kind: 'client', size: '8.5x11' })).toBe(false);
    expect(ok({ ...permit(), kind: 'field' })).toBe(false);
  });

  it('the key goes on every sheet or on the cover only', () => {
    expect(ok({ ...permit(), keyPlacement: 'cover_only' })).toBe(true);
    expect(ok({ ...permit(), keyPlacement: 'none' })).toBe(false);
  });

  it('holds its sheet ids once each, a profile link and the last issued version', () => {
    expect(ok({ ...permit(), sheetIds: [SHEET_A, SHEET_B] })).toBe(true);
    expect(ok({ ...permit(), sheetIds: [SHEET_A, SHEET_A.toUpperCase()] })).toBe(false);
    expect(ok({ ...permit(), sheetIds: ['A1.0'] })).toBe(false);
    expect(ok({ ...permit(), submittalProfileId: SHEET_A, lastIssuedVersionId: SHEET_B })).toBe(true);
    expect(ok({ ...permit(), submittalProfileId: 'x' })).toBe(false);
    expect(ok({ ...permit(), level: FLOOR })).toBe(false);
  });

  it('a set names no floor, so a document with a floor and a set is whole', () => {
    const doc = {
      objects: [
        { id: FLOOR, type: 'floor', schema_version: CURRENT_SCHEMA_VERSION, data: { name: 'Floor 1', order: 1 } },
        { id: SET, type: 'sheet_set', schema_version: CURRENT_SCHEMA_VERSION, data: permit() },
      ],
    };
    expect(parseModelDocument(doc).ok).toBe(true);
  });
});
