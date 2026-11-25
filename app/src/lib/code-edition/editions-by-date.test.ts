// EZD-643 (Q-0220; Q-0765; board S15gCode). Expected values: Q-0765 ("a date on or after 12/31/2026 gives FBC 9th
// ed. with NEC 2023 and an earlier date gives FBC 8th ed. with NEC 2020; with no date, the project's creation date
// decides. A project whose edition was picked by hand keeps it"); board S15gCode ("By permit date (automatic)",
// "From 12/31/26", "FBC 8th ed. · NEC 2020"); assumptions EZD-643 (the creation date is read in Florida time; a
// company with no default runs the 9th Edition).
import { describe, expect, it } from 'vitest';
import { catalogFor } from '../../server/messages/catalog';
import {
  BY_PERMIT_DATE,
  CODE_EDITIONS,
  COMPANY_EDITION_DEFAULTS,
  companyDefault,
  companyEdition,
  companyEditionLabel,
  editionForDate,
  editionForProject,
  editionLabel,
  floridaDate,
  isCodeEdition,
  isPermitDate,
  parseCodeEditionPatch,
  projectEdition,
  settingsOf,
} from './editions';

describe('EZD-643 other code editions', () => {
  it('a project runs FBC 9th ed. with NEC 2023 or FBC 8th ed. with NEC 2020; By permit date is not an edition', () => {
    expect(CODE_EDITIONS).toEqual(['fbc9_nec2023', 'fbc8_nec2020']);
    expect(COMPANY_EDITION_DEFAULTS).toEqual(['by_permit_date', 'fbc9_nec2023', 'fbc8_nec2020']);
    expect(isCodeEdition(BY_PERMIT_DATE)).toBe(false);
    const en = catalogFor('office', 'en');
    expect(en[editionLabel('fbc8_nec2020')]).toBe('FBC 8th ed. · NEC 2020');
    expect(en[companyEditionLabel('by_permit_date')]).toBe('By permit date (automatic)');
  });

  it('Q-0765: on or after 12/31/2026 the 9th Edition, earlier the 8th', () => {
    expect(editionForDate('2026-12-31')).toBe('fbc9_nec2023');
    expect(editionForDate('2027-03-01')).toBe('fbc9_nec2023');
    expect(editionForDate('2026-12-30')).toBe('fbc8_nec2020');
    expect(editionForDate('2025-06-15')).toBe('fbc8_nec2020');
  });

  it('Q-0765: with no permit date the creation date decides, read in Florida time', () => {
    // 2026-12-31 03:30 UTC is still 12/30 in Florida (UTC-5): the 8th Edition.
    expect(floridaDate('2026-12-31T03:30:00Z')).toBe('2026-12-30');
    expect(editionForProject({ createdAt: '2026-12-31T03:30:00Z' })).toBe('fbc8_nec2020');
    expect(floridaDate('2026-12-31T05:30:00Z')).toBe('2026-12-31');
    expect(editionForProject({ createdAt: '2026-12-31T05:30:00Z' })).toBe('fbc9_nec2023');
    // A permit date wins over the creation date.
    expect(editionForProject({ permitDate: '2027-01-04', createdAt: '2026-11-01T12:00:00Z' })).toBe(
      'fbc9_nec2023',
    );
    expect(editionForProject({ permitDate: '2026-12-01', createdAt: '2027-02-01T12:00:00Z' })).toBe(
      'fbc8_nec2020',
    );
  });

  it('a project with its own edition keeps it; one with none follows the company default, always to an edition', () => {
    expect(projectEdition('fbc8_nec2020', 'fbc9_nec2023')).toBe('fbc8_nec2020');
    expect(projectEdition('fbc9_nec2023', 'by_permit_date', { permitDate: '2026-01-01' })).toBe(
      'fbc9_nec2023',
    );
    expect(projectEdition(null, 'fbc8_nec2020')).toBe('fbc8_nec2020');
    expect(projectEdition(null, 'by_permit_date', { permitDate: '2026-01-01' })).toBe(
      'fbc8_nec2020',
    );
    expect(projectEdition(null, 'by_permit_date', { permitDate: '2027-01-01' })).toBe(
      'fbc9_nec2023',
    );
    expect(projectEdition(null, 'by_permit_date', { createdAt: '2026-11-20T15:00:00Z' })).toBe(
      'fbc8_nec2020',
    );
    // A company with no default runs the 9th Edition (EZD-613).
    expect(companyDefault(null)).toBe('fbc9_nec2023');
    expect(companyEdition(null)).toBe('fbc9_nec2023');
    expect(isCodeEdition(companyEdition('by_permit_date'))).toBe(true);
  });

  it('the company settings read and PATCH take By permit date and the 8th Edition', () => {
    expect(settingsOf('by_permit_date', {})).toEqual({
      edition: 'by_permit_date',
      optionalLoadCalc: false,
      available: ['fbc9_nec2023', 'fbc8_nec2020'],
    });
    expect(parseCodeEditionPatch({ edition: 'by_permit_date' })).toEqual({
      edition: 'by_permit_date',
    });
    expect(parseCodeEditionPatch({ edition: 'fbc8_nec2020' })).toEqual({ edition: 'fbc8_nec2020' });
    expect(parseCodeEditionPatch({ edition: 'fbc7_nec2017' })).toBeNull();
  });

  it('a permit date is a real calendar day written YYYY-MM-DD', () => {
    expect(isPermitDate('2026-12-31')).toBe(true);
    for (const bad of ['2026-02-30', '12/31/2026', '2026-1-5', '', null, 20261231]) {
      expect(isPermitDate(bad), String(bad)).toBe(false);
    }
  });
});
