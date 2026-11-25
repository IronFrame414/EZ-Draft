// EZD-613, EZD-643: the migration's edition lists and cutover date match editions.ts, so the two cannot drift.
// EZD-643 moved private.is_code_edition to 20261123164300 (both editions) and added the company default list,
// the table checks and private.edition_for_date.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CODE_EDITIONS,
  COMPANY_EDITION_DEFAULTS,
  EDITION_CUTOVER_DATE,
  EDITION_TIME_ZONE,
} from './editions';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(here, '../../../../supabase/migrations/20261123164300_code_edition_by_permit_date.sql'),
  'utf8',
);
const listIn = (re: RegExp) => {
  const m = re.exec(sql);
  expect(m, String(re)).not.toBeNull();
  return [...m![1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]).sort();
};

describe('EZD-643 edition lists in the migration', () => {
  it('private.is_code_edition and the project check list exactly CODE_EDITIONS', () => {
    expect(
      listIn(
        /function private\.is_code_edition\(p_value text\)[\s\S]*?select p_value in \(([^)]*)\)/,
      ),
    ).toEqual([...CODE_EDITIONS].sort());
    expect(
      listIn(
        /project_code_edition_check\s+check \(code_edition is null or code_edition in \(([^)]*)\)/,
      ),
    ).toEqual([...CODE_EDITIONS].sort());
  });

  it('private.is_code_edition_default and the tenant check list exactly COMPANY_EDITION_DEFAULTS', () => {
    expect(
      listIn(
        /function private\.is_code_edition_default\(p_value text\)[\s\S]*?select p_value in \(([^)]*)\)/,
      ),
    ).toEqual([...COMPANY_EDITION_DEFAULTS].sort());
    expect(
      listIn(
        /tenant_code_edition_check\s+check \(code_edition is null or code_edition in \(([^)]*)\)/,
      ),
    ).toEqual([...COMPANY_EDITION_DEFAULTS].sort());
  });

  it('private.edition_for_date uses the same cutover date and the creation date the same time zone', () => {
    expect(sql).toContain(
      `p_date >= date '${EDITION_CUTOVER_DATE}' then 'fbc9_nec2023' else 'fbc8_nec2020'`,
    );
    expect(sql).toContain(`at time zone '${EDITION_TIME_ZONE}'`);
  });
});
