// EZD-103a U7 (vault/plans/EZD-103a.md sections 3, 4; AC-EZD-103-1).
// Expected values: section 3 "messages" (26 keys, en only, Q-0121 (a)); labels of Decided "Sections"
// (Q-0228 "Sheet presets"; B15x).
import { describe, expect, it } from 'vitest';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';

const DOT = '·';
const LABELS: Record<string, string> = {
  company: 'Company',
  users: 'Users + permissions',
  title_block: 'Title block',
  sheet_presets: 'Sheet presets',
  defaults: 'Defaults',
  catalog: 'Catalog',
  render_models: 'Render models',
  code_edition: 'Code edition',
  libraries: 'Libraries',
  system_status: 'System status',
};

const EXPECTED: Record<string, string> = {
  'office.settings.title': 'Settings',
  'office.settings.back': 'Projects',
  'office.settings.nav_label': 'Company settings',
  'office.settings.nav_aria': 'Settings sections',
  'office.settings.status_company': 'Company',
  'office.settings.badge_units': 'ft-in',
};
for (const [id, label] of Object.entries(LABELS)) {
  EXPECTED[`office.settings.section.${id}`] = label;
  EXPECTED[`office.settings.location.${id}`] =
    id === 'users' ? `Settings ${DOT} Users` : `Settings ${DOT} ${label}`;
}

describe('EZD-103a settings messages', () => {
  it('U7 the 26 office.settings keys in en, none in es', () => {
    const E = en as unknown as Record<string, unknown>;
    const S = es as unknown as Record<string, unknown>;
    const keys = Object.keys(E)
      .filter((k) => k.startsWith('office.settings.'))
      .sort();
    expect(keys).toEqual(Object.keys(EXPECTED).sort());
    expect(keys.length).toBe(26);
    expect(Object.fromEntries(keys.map((k) => [k, E[k]]))).toEqual(EXPECTED);
    expect(Object.keys(S).filter((k) => k.startsWith('office.settings.'))).toEqual([]);
  });
});
