// EZD-613: the migration's edition list (private.is_code_edition) matches CODE_EDITIONS, so the two cannot drift.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CODE_EDITIONS } from './editions';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(here, '../../../../supabase/migrations/20261119120000_create_code_edition.sql'),
  'utf8',
);

describe('EZD-613 edition list in the migration', () => {
  it('private.is_code_edition lists exactly CODE_EDITIONS', () => {
    const m = /select p_value in \(([^)]*)\)/.exec(sql);
    expect(m).not.toBeNull();
    const listed = [...m![1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
    expect(listed.sort()).toEqual([...CODE_EDITIONS].sort());
  });
});
