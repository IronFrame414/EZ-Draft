// EZD-025 T9 (vault/plans/EZD-025.md Tests, Step 2): sent-package files in bucket `exports` at
// <tenant_id>/<project_id>/sent/<uuid>/<file> cannot be removed, moved, overwritten or deleted in SQL, even with
// the secret key; other files in the bucket can still be removed. Local stack only. Expected values: plan T9
// (ticket "deletes of sent-package files are soft deletes"; 11 Data retention; R24 #4a).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  MAIN_DB_CONTAINER,
  cleanup,
  createDrillData,
  exec,
  execStorageDelete,
  inScope,
  query,
  storageApi,
} from './local-fixture.mjs';

const BUCKET = 'exports';

describe('EZD-025 T9 sent-package files are soft deletes', { skip: !inScope('EZD-025') }, () => {
  let d;
  let api;
  const sentName = () => `${d.tenantId}/${d.projectId}/sent/${sentId}/set.pdf`;
  const sentId = randomUUID();
  const outName = () => `${d.tenantId}/${d.projectId}/out/x.pdf`;
  const movedName = () => `${d.tenantId}/${d.projectId}/out/moved.pdf`;
  const X = randomBytes(2048);
  const Y = randomBytes(1024);
  const rows = (name) =>
    Number(query(`select count(*)::int as n from storage.objects where bucket_id = '${BUCKET}' and name = '${name}'`)[0].n);

  before(async () => {
    d = await createDrillData();
    api = storageApi(d.local);
    await api.createBucket(BUCKET);
    assert.equal((await api.upload(BUCKET, sentName(), X)).status, 200, 'upload sent file');
    assert.equal((await api.upload(BUCKET, outName(), Buffer.from('ezd-025'))).status, 200, 'upload out file');
  });

  after(async () => {
    // The trigger refuses the cleanup too, so it is switched off for the delete and back on. storage.objects is
    // owned by supabase_storage_admin, so the DDL runs as supabase_admin.
    const toggle = (state) =>
      exec(
        `do $$ begin if exists (select 1 from pg_trigger where tgname = 'sent_files_soft_delete') then
           alter table storage.objects ${state} trigger sent_files_soft_delete; end if; end $$;`,
        MAIN_DB_CONTAINER,
        'supabase_admin',
      );
    toggle('disable');
    try {
      execStorageDelete(`delete from storage.objects where bucket_id = '${BUCKET}' and name like '${d.tenantId}/%';`);
    } finally {
      toggle('enable');
    }
    await cleanup();
  });

  const assertSentIntact = async (why) => {
    const bytes = await api.download(BUCKET, sentName());
    assert.ok(bytes, `${why}: the sent file still downloads`);
    assert.equal(Buffer.compare(bytes, X), 0, `${why}: exactly X`);
    assert.equal(rows(sentName()), 1, `${why}: one storage.objects row`);
  };

  test('EZD-025 T9 (a) remove of the sent file is refused', async () => {
    await api.remove(BUCKET, [sentName()]);
    await assertSentIntact('after remove');
  });

  test('EZD-025 T9 (b) move of the sent file is refused', async () => {
    await api.move(BUCKET, sentName(), movedName());
    await assertSentIntact('after move');
    assert.equal(rows(movedName()), 0, 'out/moved.pdf has no row');
    assert.equal(await api.download(BUCKET, movedName()), null, 'out/moved.pdf does not exist');
  });

  test('EZD-025 T9 (c) overwrite of the sent file with upsert is refused', async () => {
    await api.upload(BUCKET, sentName(), Y, { upsert: true });
    await assertSentIntact('after upsert');
  });

  test('EZD-025 T9 (e) a SQL delete of the sent row is refused', async () => {
    assert.throws(
      () =>
        execStorageDelete(
          `delete from storage.objects where bucket_id = '${BUCKET}' and name = '${sentName()}';`,
        ),
      /sent_file_change_refused/,
    );
    await assertSentIntact('after SQL delete');
  });

  test('EZD-025 T9 (d) a file outside sent/ can still be removed', async () => {
    await api.remove(BUCKET, [outName()]);
    assert.equal(rows(outName()), 0, 'out/x.pdf has no row');
    assert.equal(await api.download(BUCKET, outName()), null, 'out/x.pdf no longer downloads');
    await assertSentIntact('after removing out/x.pdf');
  });
});
