// EZD-713 (S15c inspector fields; 03c submittal_profile). Expected values: S15c (File split combined set default /
// per discipline or consultant / one PDF per sheet; Max file size "Empty = no limit", PBC 10 MB; Revision naming
// Version in file name default; Flatten off by default; Bookmarks on; Minimum scale e.g. 3/16" = 1'-0"; warning
// when the pattern omits {rev} unless the profile is set to same name), 08 (West Palm Beach ALL CAPS 30
// characters) and the table checks of 20261119140000_create_submittal_profile.sql (max_file_mb 0 to 10000,
// naming_max_length 1 to 255, min_scale_in_per_ft 0 to 12).
import { describe, expect, it } from 'vitest';
import {
  changedFields,
  checkFields,
  exampleName,
  fieldsOf,
  parsePatchBody,
  profileOf,
  scaleLabel,
} from './profiles';

const P = profileOf({
  id: '11111111-1111-4111-8111-111111111111',
  department: 'Palm Beach County',
  is_default: true,
  archived_at: null,
  naming_template: '{address} {description}',
  max_file_mb: '10',
  naming_max_length: 80,
});

describe('EZD-713 profile settings', () => {
  it('profileOf reads the stored settings; a bare row gets the S15c defaults', () => {
    expect(P).toMatchObject({
      fileSplit: 'combined',
      maxFileMb: 10,
      namingMaxLength: 80,
      namingUpper: false,
      revisionNaming: 'version_in_name',
      flatten: false,
      exportUnsigned: false,
      bookmarks: true,
      tocSheet: false,
      resubmittalMode: 'changed_sheets',
      transmittal: false,
      minScaleInPerFt: null,
    });
    const wpb = profileOf({
      id: 'x',
      file_split: 'per_discipline',
      naming_upper: true,
      naming_max_length: 30,
      revision_naming: 'same_name',
      flatten: true,
      bookmarks: false,
      toc_sheet: true,
      resubmittal_mode: 'full_set_narrative',
      transmittal: true,
      min_scale_in_per_ft: '0.1875',
      export_unsigned: true,
    });
    expect(wpb).toMatchObject({
      fileSplit: 'per_discipline',
      namingUpper: true,
      namingMaxLength: 30,
      revisionNaming: 'same_name',
      flatten: true,
      bookmarks: false,
      tocSheet: true,
      resubmittalMode: 'full_set_narrative',
      transmittal: true,
      minScaleInPerFt: 0.1875,
      exportUnsigned: true,
    });
  });

  it('changedFields sends only the settings that changed; clearing a limit sends null', () => {
    const f = fieldsOf(P);
    expect(changedFields(P, f)).toBeNull();
    expect(
      changedFields(P, {
        ...f,
        fileSplit: 'per_sheet',
        revisionNaming: 'same_name',
        maxFileMb: null,
      }),
    ).toEqual({ fileSplit: 'per_sheet', revisionNaming: 'same_name', maxFileMb: null });
  });

  it('checkFields: max file size and name length are empty or within the table limits', () => {
    const f = fieldsOf(P);
    expect(
      checkFields({ ...f, maxFileMb: null, namingMaxLength: null }, 'version_in_name'),
    ).toEqual([]);
    expect(checkFields({ ...f, maxFileMb: 0 }, 'version_in_name')).toEqual([
      'office.sheet_presets.max_file_invalid',
    ]);
    expect(checkFields({ ...f, maxFileMb: NaN }, 'version_in_name')).toEqual([
      'office.sheet_presets.max_file_invalid',
    ]);
    expect(checkFields({ ...f, namingMaxLength: 256 }, 'version_in_name')).toEqual([
      'office.sheet_presets.naming_max_invalid',
    ]);
    expect(checkFields({ ...f, namingMaxLength: 30.5 }, 'version_in_name')).toEqual([
      'office.sheet_presets.naming_max_invalid',
    ]);
  });

  it('parsePatchBody maps every setting to its column and refuses bad values', () => {
    expect(
      parsePatchBody({
        fields: {
          fileSplit: 'per_sheet',
          maxFileMb: 10,
          namingMaxLength: 80,
          namingUpper: true,
          revisionNaming: 'same_name',
          flatten: true,
          exportUnsigned: true,
          bookmarks: false,
          tocSheet: true,
          resubmittalMode: 'full_set_narrative',
          transmittal: true,
          minScaleInPerFt: 0.1875,
        },
      }),
    ).toEqual({
      kind: 'fields',
      columns: {
        file_split: 'per_sheet',
        max_file_mb: 10,
        naming_max_length: 80,
        naming_upper: true,
        revision_naming: 'same_name',
        flatten: true,
        export_unsigned: true,
        bookmarks: false,
        toc_sheet: true,
        resubmittal_mode: 'full_set_narrative',
        transmittal: true,
        min_scale_in_per_ft: 0.1875,
      },
    });
    expect(
      parsePatchBody({ fields: { maxFileMb: null, namingMaxLength: null, minScaleInPerFt: null } }),
    ).toEqual({
      kind: 'fields',
      columns: { max_file_mb: null, naming_max_length: null, min_scale_in_per_ft: null },
    });
    for (const bad of [
      { fileSplit: 'per_page' },
      { maxFileMb: 0 },
      { maxFileMb: 10001 },
      { maxFileMb: '10' },
      { namingMaxLength: 0 },
      { namingMaxLength: 256 },
      { namingMaxLength: 30.5 },
      { revisionNaming: 'rev_suffix' },
      { resubmittalMode: 'all' },
      { minScaleInPerFt: 0 },
      { minScaleInPerFt: 13 },
      { flatten: 'yes' },
      { bookmarks: 1 },
    ]) {
      expect(parsePatchBody({ fields: bad }), JSON.stringify(bad)).toBeNull();
    }
  });

  it('the example name follows ALL CAPS and the length limit, ".pdf" counted', () => {
    expect(exampleName('{address} {description}')).toBe('336 Golfview Rd buildingplans.pdf');
    expect(exampleName('{address} {description}', { upper: true, maxLength: 30 })).toBe(
      '336 GOLFVIEW RD BUILDINGPL.pdf',
    );
  });

  it('scaleLabel writes the board scales', () => {
    expect(scaleLabel(0.1875)).toBe(`3/16" = 1'-0"`);
    expect(scaleLabel(0.25)).toBe(`1/4" = 1'-0"`);
    expect(scaleLabel(0.125)).toBe(`1/8" = 1'-0"`);
    expect(scaleLabel(1.5)).toBe(`1 1/2" = 1'-0"`);
  });
});
