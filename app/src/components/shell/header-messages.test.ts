// EZD-011b · H9: the office.header.* message keys (vault/plans/EZD-011b.md Sections 4 and 6).
// Sources: Section 6 (04 Header card; S03); R26 R17 (office is English only); EZD-026c KEY_PATTERN.
import { describe, expect, it } from 'vitest';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import { KEY_PATTERN } from '../../lib/messages/language';

const EXPECTED: Record<string, string> = {
  'office.header.wordmark_ez': 'ez',
  'office.header.wordmark_draft': 'draft',
  'office.header.views': 'Views',
  'office.header.view.plan': 'Plan',
  'office.header.view.3d': '3D',
  'office.header.view.sheets': 'Sheets',
  'office.header.view.render': 'Render',
  'office.header.share': 'Share',
  'office.header.export': 'Export',
  'office.header.issue_set': 'Issue set',
};

describe('EZD-011b header messages', () => {
  it('H9: en holds exactly the 10 office.header keys with their values, es holds no office key, keys match KEY_PATTERN', () => {
    const headerEntries = Object.entries(en).filter(([k]) => k.startsWith('office.header.'));
    expect(Object.fromEntries(headerEntries)).toEqual(EXPECTED);
    expect(Object.keys(es).filter((k) => k.startsWith('office.'))).toEqual([]);
    for (const k of Object.keys(EXPECTED)) expect(KEY_PATTERN.test(k), k).toBe(true);
  });
});
