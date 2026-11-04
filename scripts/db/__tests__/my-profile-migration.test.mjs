// EZD-319 (vault/plans/EZD-319.md section 4): the my-profile migration is renamed past the newest version
// applied on the cloud dev database, and its bytes are unchanged. node:test, Node 22 built-ins only.
// T1 and T2 read the migrations folder. T3 runs the SQL on the local stack through scripts/db/sql.mjs, so it
// is skipped outside its scope and needs the stack the root `test` script starts with `pnpm db:up`.
// Expected values: plan section 1 "Decided for the builder" (new version), the ticket's Scope, plan section 4
// (F2 run 41704119291, F7 hash), EZD-108 section 3 (function signatures), migration lines 57-58 and 76-77
// (privileges), scripts/db/sql.mjs (-t -A output format).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inScope } from '../../backup/__tests__/local-fixture.mjs';
import { holdRootDbShared } from '../../test-harness/db-lock.mjs';
import { runLocalSql } from '../sql.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const migrationsDir = path.join(repo, 'supabase', 'migrations');
const SUFFIX = '_create_my_profile_functions.sql';
const RENAMED = '20261103180001_create_my_profile_functions.sql';
const OLD = '20261030205252_create_my_profile_functions.sql';
const DEV_NEWEST = '20261103180000'; // the newest version applied on ezdraft-dev (plan section 1, F2)
const RENAMED_SHA256 = '08918f6b065e739d11e48ec7dc42adbbb4ac3ad96b5a7bbb7687175be2fa5c21'; // plan section 1, F7

const SQL = [
  "select version from supabase_migrations.schema_migrations where version in ('20261030205252', '20261103180001') order by version;",
  "select to_regprocedure('public.update_my_profile(text,text)') is not null, to_regprocedure('public.current_user_has_password()') is not null;",
  "select has_function_privilege('authenticated', 'public.update_my_profile(text,text)', 'execute'), has_function_privilege('anon', 'public.update_my_profile(text,text)', 'execute'), has_function_privilege('authenticated', 'public.current_user_has_password()', 'execute'), has_function_privilege('anon', 'public.current_user_has_password()', 'execute');",
].join('\n');

describe('EZD-319 my-profile migration file', () => {
  // ---------- T1 ----------
  test('EZD-319 T1 the my-profile migration is renamed past dev\'s newest version, done when', () => {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(SUFFIX));
    assert.deepEqual(files, [RENAMED]);
    assert.equal(existsSync(path.join(migrationsDir, OLD)), false, `${OLD} is absent`);
    const version = files[0].slice(0, 14);
    assert.ok(version > DEV_NEWEST, `${version} is greater than ${DEV_NEWEST}`);
  });

  // ---------- T2 ----------
  test('EZD-319 T2 the renamed file\'s bytes are unchanged', () => {
    const digest = createHash('sha256')
      .update(readFileSync(path.join(migrationsDir, RENAMED)))
      .digest('hex');
    assert.equal(digest, RENAMED_SHA256);
  });
});

describe('EZD-319 my-profile migration on the local stack', { skip: !inScope('EZD-319') }, () => {
  let releaseRootDb;
  before(async () => {
    releaseRootDb = await holdRootDbShared();
  });
  after(async () => {
    if (releaseRootDb) await releaseRootDb();
  });

  // ---------- T3 ----------
  test('EZD-319 T3 the local stack builds from all migrations with the renamed file, done when', async () => {
    const r = await runLocalSql(SQL);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '20261103180001\nt|t\nt|f|t|f\n');
  });
});
