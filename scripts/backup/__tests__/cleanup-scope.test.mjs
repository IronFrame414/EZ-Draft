// EZD-326 (vault/plans/EZD-326.md section 4, Tests T1 and T2; Step 1): cleanup() of local-fixture.mjs removes only
// the backup_run rows and app users that this process made, so one test file's cleanup cannot delete the rows or
// users another file is still using. Local stack only. Expected values: plan EZD-326 section 4; the column checks
// come from supabase/migrations/20261023140000_create_backup_run.sql and the app_user checks from
// supabase/migrations/20261019165202_create_app_user.sql.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cleanup, createDrillData, exec, inScope, newBucket, query } from './local-fixture.mjs';
import { holdRootDbShared } from '../../test-harness/db-lock.mjs';

// Plan section 4: `hex` is randomUUID() without dashes, first 8 characters, new per test.
const hex = () => randomUUID().replace(/-/g, '').slice(0, 8);
// query() wraps its select in a subquery, so the trailing semicolon of a statement is removed first.
const count = (selectSql) => Number(query(selectSql.replace(/;\s*$/, ''))[0].n);

describe('EZD-326 cleanup() removes only what this process made', { skip: !inScope('EZD-326') }, () => {
  let releaseRootDb;
  before(async () => {
    releaseRootDb = await holdRootDbShared();
  });

  after(async () => {
    try {
      await cleanup();
    } finally {
      await releaseRootDb?.();
    }
  });

  test("EZD-326 T1 cleanup() keeps another file's backup_run rows", async () => {
    const h = hex();
    const foreignScope = `buckets:ezd025-${h}-foreign`;
    const ownBucket = `ezd025-${h}-own`;
    const ownScope = `buckets:${ownBucket}`;
    try {
      // Row F: the shape of the T3 (a) row of files.mjs (kind files, status failed, finished_at, error code).
      exec(
        `insert into public.backup_run (kind, scope, status, finished_at, error)
         values ('files', '${foreignScope}', 'failed', now(), 'versioning_off');`,
      );
      await newBucket(ownBucket);
      // Row O: the same shape, for a bucket this process made.
      exec(
        `insert into public.backup_run (kind, scope, status, finished_at, error)
         values ('files', '${ownScope}', 'failed', now(), 'versioning_off');`,
      );
      await cleanup();
      assert.equal(
        count(`select count(*)::int as n from public.backup_run where scope = '${foreignScope}';`),
        1,
        'the other file\'s row F is kept by cleanup()',
      );
      assert.equal(
        count(`select count(*)::int as n from public.backup_run where scope = '${ownScope}';`),
        0,
        'the row O of a bucket this process made is removed by cleanup()',
      );
    } finally {
      exec(`delete from public.backup_run where scope = '${foreignScope}';`);
    }
  });

  test("EZD-326 T2 cleanup() keeps another file's app user", async () => {
    const h = hex();
    const foreignEmail = `ezd025-${h}-foreign@example.com`;
    let foreignId;
    try {
      // App user U: no membership, so only the email pattern of the old cleanup() could reach it.
      foreignId = exec(`insert into public.app_user (email) values ('${foreignEmail}') returning id;`).split('\n')[0];
      const d = await createDrillData();
      await cleanup();
      assert.equal(
        count(`select count(*)::int as n from public.app_user where id = '${foreignId}';`),
        1,
        'the other file\'s app user U is kept by cleanup()',
      );
      assert.equal(
        count(`select count(*)::int as n from public.app_user where id = '${d.appUserId}';`),
        0,
        'the app user createDrillData() made is removed by cleanup()',
      );
      assert.equal(
        count(`select count(*)::int as n from public.tenant where id = '${d.tenantId}';`),
        0,
        'the tenant createDrillData() made is removed by cleanup()',
      );
    } finally {
      if (foreignId) exec(`delete from public.app_user where id = '${foreignId}';`);
    }
  });
});
