// EZD-709 (S15b; R24 #7, #26, #48; AC-EZD-709-1, AC-EZD-709-2). Expected values: S15b Controls (the company
// switch is the only control; preview at 24x36 and 11x17, "Updates on change"), S15b Validation ("Missing
// tenant-level fields (company name, license) are listed here as warnings"), S15b Decision 2 (the seven fields of
// a complete title block), R24 #7 (seal box and department stamp, two blank areas) and #26 (Version N / Rev N).
import { describe, expect, it } from 'vitest';
import {
  companyLine,
  missingCompanyFields,
  missingTitleBlockFields,
  parseTitleBlockPatch,
  titleBlockOf,
  titleBlockPreview,
  type TitleBlockSettings,
} from './title-block';

const SETTINGS: TitleBlockSettings = {
  config: { showCompany: true },
  company: {
    name: 'Acme Remodeling',
    licenseNo: 'CGC000001',
    contact: { phone: '555-0100', email: 'office@acme.test', website: 'acme.test' },
    logoUrl: null,
  },
  codeEdition: 'fbc9_nec2023',
};

describe('EZD-709 title block config', () => {
  it('reads tenant.title_block; a missing switch is on', () => {
    expect(titleBlockOf({})).toEqual({ showCompany: true });
    expect(titleBlockOf(null)).toEqual({ showCompany: true });
    expect(titleBlockOf({ show_company: false })).toEqual({ showCompany: false });
    expect(titleBlockOf({ show_company: 'no' })).toEqual({ showCompany: true });
  });

  it('accepts only { showCompany: boolean }', () => {
    expect(parseTitleBlockPatch({ showCompany: false })).toEqual({ showCompany: false });
    expect(parseTitleBlockPatch({ showCompany: true })).toEqual({ showCompany: true });
    for (const bad of [null, [], {}, { showCompany: 'true' }, { showCompany: true, layout: 'x' }, 'x']) {
      expect(parseTitleBlockPatch(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('AC-EZD-709-1 preview updates on change', () => {
  it('switching the company block off removes it from the preview; on brings it back', () => {
    const on = titleBlockPreview(SETTINGS, { showCompany: true }, '24x36');
    expect(on.company).toEqual({
      name: 'Acme Remodeling',
      licenseNo: 'CGC000001',
      contact: ['555-0100', 'office@acme.test', 'acme.test'],
      logoUrl: null,
    });
    const off = titleBlockPreview(SETTINGS, { showCompany: false }, '24x36');
    expect(off.company).toBeNull();
  });

  it('the size toggle changes the sheet: 24x36 is 36" x 24", 11x17 is 17" x 11"', () => {
    expect(titleBlockPreview(SETTINGS, SETTINGS.config, '24x36').sheet).toEqual({ width: 36, height: 24 });
    expect(titleBlockPreview(SETTINGS, SETTINGS.config, '11x17').sheet).toEqual({ width: 17, height: 11 });
  });

  it('seal box, department stamp and revision block are always there, whatever the switch', () => {
    for (const showCompany of [true, false]) {
      const p = titleBlockPreview(SETTINGS, { showCompany }, '11x17');
      expect(p.sealBox).toBe(true);
      expect(p.stampArea).toBe(true);
      expect(p.revisions.map((r) => [r.kind, r.number])).toEqual([
        ['version', 1],
        ['rev', 1],
      ]);
    }
  });

  it('the company line lists only what is filled', () => {
    expect(companyLine(SETTINGS.company)).toBe(
      'Acme Remodeling · CGC000001 · 555-0100 · office@acme.test · acme.test',
    );
    expect(companyLine({ ...SETTINGS.company, licenseNo: null, contact: { phone: ' ' } })).toBe(
      'Acme Remodeling',
    );
  });
});

describe('AC-EZD-709-2 missing company fields are listed', () => {
  it('a missing license is listed', () => {
    expect(missingCompanyFields({ name: 'Acme Remodeling', licenseNo: null })).toEqual(['license_number']);
    expect(missingCompanyFields({ name: 'Acme Remodeling', licenseNo: '  ' })).toEqual(['license_number']);
  });

  it('both missing are listed in order; none missing is an empty list', () => {
    expect(missingCompanyFields({ name: '', licenseNo: null })).toEqual(['company_name', 'license_number']);
    expect(missingCompanyFields({ name: 'Acme Remodeling', licenseNo: 'CGC000001' })).toEqual([]);
  });

  it('a complete title block needs all seven fields of S15b Decision 2', () => {
    expect(missingTitleBlockFields({})).toEqual([
      'company_name',
      'license_number',
      'project_address',
      'parcel_number',
      'owner',
      'scope_of_work',
      'code_edition',
    ]);
    expect(
      missingTitleBlockFields({
        company_name: 'Acme Remodeling',
        license_number: 'CGC000001',
        project_address: '1 Test St',
        parcel_number: '00-00',
        owner: 'Pat Owner',
        scope_of_work: 'Kitchen remodel',
        code_edition: 'fbc9_nec2023',
      }),
    ).toEqual([]);
  });
});
