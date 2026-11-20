// EZD-712 (S15c). Expected values: S15c File naming pattern (tokens {address} {description} {rev} {date}; the
// characters / ? < > \ : * | " , # are not allowed; default "{address} {description}" e.g. "336 Golfview Rd
// buildingplans"), S15c Validation (must include {address}; warn when {rev} is missing while the version stays in
// the name), S15c Controls (one Default; name required), the stamp default 3" x 3" bottom right.
import { describe, expect, it } from 'vitest';
import {
  changedFields,
  checkFields,
  checkNamingTemplate,
  exampleName,
  fieldsOf,
  parseCreateBody,
  parsePatchBody,
  profileOf,
  sortProfiles,
  type SubmittalProfile,
} from './profiles';

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: 't',
  department: 'Palm Beach County',
  is_default: true,
  archived_at: null,
  submittal_type: 'electronic',
  sheet_size: '24x36',
  naming_template: '{address} {description}',
  stamp_box_width_in: '3',
  stamp_box_height_in: 3,
  stamp_box_position: 'bottom_right',
  signer: 'none',
  file_split: 'combined',
  max_file_mb: '10',
  revision_naming: 'version_in_name',
  flatten: false,
};
const P = profileOf(ROW, 6);

describe('EZD-712 naming pattern', () => {
  it('the default pattern is valid and warns that {rev} is missing while the version stays in the name', () => {
    expect(checkNamingTemplate('{address} {description}')).toEqual({ error: null, warnRev: true });
    expect(checkNamingTemplate('{address} {description} {rev}')).toEqual({
      error: null,
      warnRev: false,
    });
    expect(checkNamingTemplate('{address} {description}', 'same_name')).toEqual({
      error: null,
      warnRev: false,
    });
  });

  it('must include {address}, use only the known tokens and no forbidden characters', () => {
    expect(checkNamingTemplate('').error).toBe('office.sheet_presets.naming_required');
    expect(checkNamingTemplate('{description} {rev}').error).toBe(
      'office.sheet_presets.naming_needs_address',
    );
    expect(checkNamingTemplate('{address} {permit}').error).toBe(
      'office.sheet_presets.naming_unknown_token',
    );
    expect(checkNamingTemplate('{address} {date}').error).toBeNull();
    for (const c of ['/', '?', '<', '>', '\\', ':', '*', '|', '"', ',', '#']) {
      expect(checkNamingTemplate(`{address} plans${c}`).error, c).toBe(
        'office.sheet_presets.naming_bad_chars',
      );
    }
  });

  it('the example file name for the default pattern is "336 Golfview Rd buildingplans.pdf"', () => {
    expect(exampleName('{address} {description}')).toBe('336 Golfview Rd buildingplans.pdf');
  });
});

describe('EZD-712 profile rows and bodies', () => {
  it('reads a row: numbers from numeric strings, 24x36 always, the project count', () => {
    expect(P.stampBoxWidthIn).toBe(3);
    expect(P.maxFileMb).toBe(10);
    expect(P.sheetSize).toBe('24x36');
    expect(P.isDefault).toBe(true);
    expect(P.archived).toBe(false);
    expect(P.projectCount).toBe(6);
  });

  it('lists the default first, then active by name, then archived', () => {
    const mk = (department: string, extra: Partial<SubmittalProfile> = {}): SubmittalProfile => ({
      ...P,
      id: department,
      department,
      isDefault: false,
      ...extra,
    });
    const order = sortProfiles([
      mk('Old paper', { archived: true }),
      mk('City of West Palm Beach'),
      mk('Palm Beach County', { isDefault: true }),
      mk('Broward County'),
    ]).map((p) => p.department);
    expect(order).toEqual([
      'Palm Beach County',
      'Broward County',
      'City of West Palm Beach',
      'Old paper',
    ]);
  });

  it('changedFields returns only what changed, trimmed; null with no edits', () => {
    const f = fieldsOf(P);
    expect(changedFields(P, f)).toBeNull();
    expect(changedFields(P, { ...f, department: ' Palm Beach County ' })).toBeNull();
    expect(changedFields(P, { ...f, signer: 'architect', stampBoxWidthIn: 6 })).toEqual({
      signer: 'architect',
      stampBoxWidthIn: 6,
    });
  });

  it('checkFields: name required, stamp size from above 0 to 24 inches', () => {
    const f = fieldsOf(P);
    expect(checkFields(f, 'version_in_name')).toEqual([]);
    expect(checkFields({ ...f, department: '  ' }, 'version_in_name')).toEqual([
      'office.sheet_presets.name_required',
    ]);
    expect(checkFields({ ...f, stampBoxWidthIn: NaN }, 'version_in_name')).toEqual([
      'office.sheet_presets.stamp_invalid',
    ]);
  });

  it('parseCreateBody: a trimmed name, an optional source id', () => {
    expect(parseCreateBody({ department: ' Broward County ' })).toEqual({
      department: 'Broward County',
      sourceId: null,
    });
    expect(parseCreateBody({ department: 'Copy', sourceId: ROW.id })).toEqual({
      department: 'Copy',
      sourceId: ROW.id,
    });
    expect(parseCreateBody({ department: '' })).toBeNull();
    expect(parseCreateBody({ department: 'X', sourceId: 'nope' })).toBeNull();
    expect(parseCreateBody({ department: 'X', isDefault: true })).toBeNull();
  });

  it('parsePatchBody: exactly one of fields, setDefault or archived; fields map to columns', () => {
    expect(parsePatchBody({ setDefault: true })).toEqual({ kind: 'default' });
    expect(parsePatchBody({ archived: false })).toEqual({ kind: 'archive', archived: false });
    expect(
      parsePatchBody({ fields: { signer: 'electrical_contractor', stampBoxHeightIn: 2 } }),
    ).toEqual({
      kind: 'fields',
      columns: { signer: 'electrical_contractor', stamp_box_height_in: 2 },
    });
    expect(parsePatchBody({ setDefault: false })).toBeNull();
    expect(parsePatchBody({ setDefault: true, archived: true })).toBeNull();
    expect(parsePatchBody({ fields: {} })).toBeNull();
    expect(parsePatchBody({ fields: { sheetSize: '11x17' } })).toBeNull();
    expect(parsePatchBody({ fields: { namingTemplate: '{description}' } })).toBeNull();
    expect(parsePatchBody({ fields: { stampBoxWidthIn: 0 } })).toBeNull();
    expect(parsePatchBody({ fields: { signer: 'engineer' } })).toBeNull();
  });

  // EZD-714 (S15c Required notes: a multi-select from the notes library; 03c required_notes uuid[]).
  describe('EZD-714 required notes', () => {
    const N1 = '22222222-2222-4222-8222-222222222222';
    const N2 = '33333333-3333-4333-8333-333333333333';

    it('profileOf reads required_notes; a row without them has none', () => {
      expect(P.requiredNotes).toEqual([]);
      expect(profileOf({ ...ROW, required_notes: [N1, N2] }).requiredNotes).toEqual([N1, N2]);
    });

    it('changedFields compares the list by value and order', () => {
      const withNotes = profileOf({ ...ROW, required_notes: [N1, N2] });
      const f = fieldsOf(withNotes);
      expect(changedFields(withNotes, { ...f, requiredNotes: [N1, N2] })).toBeNull();
      expect(changedFields(withNotes, { ...f, requiredNotes: [N2, N1] })).toEqual({
        requiredNotes: [N2, N1],
      });
      expect(changedFields(withNotes, { ...f, requiredNotes: [] })).toEqual({ requiredNotes: [] });
    });

    it('parsePatchBody: requiredNotes is a list of distinct note ids stored as required_notes', () => {
      expect(parsePatchBody({ fields: { requiredNotes: [N1, N2] } })).toEqual({
        kind: 'fields',
        columns: { required_notes: [N1, N2] },
      });
      expect(parsePatchBody({ fields: { requiredNotes: [] } })).toEqual({
        kind: 'fields',
        columns: { required_notes: [] },
      });
      expect(parsePatchBody({ fields: { requiredNotes: [N1, N1] } })).toBeNull();
      expect(parsePatchBody({ fields: { requiredNotes: ['nope'] } })).toBeNull();
      expect(parsePatchBody({ fields: { requiredNotes: N1 } })).toBeNull();
    });
  });
});
