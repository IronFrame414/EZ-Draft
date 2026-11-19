// EZD-712: the table checks in the migration list the same values as profiles.ts, so the two cannot drift.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SIGNERS, STAMP_POSITIONS, SUBMITTAL_TYPES } from './profiles';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(here, '../../../../supabase/migrations/20261119140000_create_submittal_profile.sql'),
  'utf8',
);

const listed = (column: string) => {
  const m = new RegExp(`check \\(${column} in \\(([^)]*)\\)\\)`).exec(sql);
  expect(m, column).not.toBeNull();
  return [...m![1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]).sort();
};

describe('EZD-712 submittal profile values in the migration', () => {
  it('submittal_type, stamp_box_position and signer match profiles.ts', () => {
    expect(listed('submittal_type')).toEqual([...SUBMITTAL_TYPES].sort());
    expect(listed('stamp_box_position')).toEqual([...STAMP_POSITIONS].sort());
    // 03c also allows engineer; the screen offers the S15c three.
    expect(listed('signer')).toEqual([...SIGNERS, 'engineer'].sort());
  });

  it('the permit sheet size is fixed at 24x36 and the default pattern is "{address} {description}"', () => {
    expect(sql).toContain("check (sheet_size = '24x36')");
    expect(sql).toContain("naming_template text not null default '{address} {description}'");
  });
});
