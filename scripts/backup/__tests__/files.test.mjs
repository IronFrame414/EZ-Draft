// EZD-025 T2, T3 and T4 (vault/plans/EZD-025.md Tests; Steps 3 and 4; Interface contract): only new objects are
// copied (T2), the preflight refuses a bucket without versioning or Object Lock before any write (T3, called
// through runFileBackup and runDbDump with a recording dumper, Interface contract answer item 6), and source
// deletes become delete markers while no stored version is ever deleted (T4, through the nightly CLI
// `node scripts/backup/files.mjs --local --only-bucket <bucket>` as a child process). Real store over the stub
// bucket and real source over the local stack. Expected values: plan T2-T4 (Q-0111; Q-0075).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { startStubS3 } from './stub-s3.mjs';
import {
  REPO_ROOT,
  realDeps,
  cleanup,
  createDrillData,
  inScope,
  newBucket,
  query,
  runCli,
  stubEnv,
} from './local-fixture.mjs';

const FILES = 'scripts/backup/files.mjs';

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === '__tests__') continue;
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else out.push(p);
  }
  return out;
}

describe('EZD-025 T3 and T4 the files backup', { skip: !inScope('EZD-025') }, () => {
  let stub;
  let d;
  let env;
  const run = (bucket) => runCli(FILES, ['--local', '--only-bucket', bucket], env);

  before(async () => {
    stub = await startStubS3({ bucket: 'ezd025-offsite' });
    env = stubEnv(stub);
    d = await createDrillData();
  });

  after(async () => {
    await stub.stop();
    await cleanup();
  });

  test('EZD-025 T2 only new objects are copied', async () => {
    const { runFileBackup } = await import('../files.mjs');
    const deps = await realDeps(stub);
    try {
      const S = await newBucket(`${d.bucket}-t2`);
      const A = randomBytes(1_048_576);
      await d.api.upload(S, 'a', A);
      await d.api.upload(S, 'b', Buffer.from('ezd-025'));
      const cursorSql = `select max(updated_at)::text as t from storage.objects where bucket_id = '${S}'`;
      const runs = [];
      const go = async (opts) => {
        const heads = stub.requests('HEAD').length;
        const result = await runFileBackup({ onlyBuckets: [S], ...opts }, deps);
        runs.push({ result, heads: stub.requests('HEAD').length - heads, cursor: query(cursorSql)[0].t });
        return result;
      };

      const r1 = await go({ overlapSeconds: 0 });
      const r2 = await go({ overlapSeconds: 0 });
      await d.api.upload(S, 'c', Buffer.from('ezd-025-c'));
      await d.api.upload(S, 'b', Buffer.from('ezd-025-b2'), { upsert: true });
      const r3 = await go({ overlapSeconds: 0 });
      const r4 = await go({});

      const pick = (r) => ({ ok: r.ok, copied: r.copied, skipped: r.skipped, hidden: r.hidden });
      assert.deepEqual(pick(r1), { ok: true, copied: 2, skipped: 0, hidden: 0 }, 'run 1');
      assert.equal(r1.bytes, 1_048_583, 'run 1 bytes');
      assert.deepEqual(pick(r2), { ok: true, copied: 0, skipped: 0, hidden: 0 }, 'run 2');
      assert.equal(runs[1].heads, 0, 'run 2 sent 0 HEAD requests');
      assert.deepEqual(pick(r3), { ok: true, copied: 2, skipped: 0, hidden: 0 }, 'run 3');
      assert.equal(r3.bytes, 19, 'run 3 bytes');
      assert.deepEqual(pick(r4), { ok: true, copied: 0, skipped: 3, hidden: 0 }, 'run 4');

      const bVersions = stub.versionsOf(`files/${S}/b`).filter((v) => !v.deleteMarker);
      assert.equal(bVersions.length, 2, 'b has 2 versions');
      assert.equal(bVersions.at(-1).body.toString('utf8'), 'ezd-025-b2', 'latest b');

      const rows = query(
        `select kind, scope, status, objects_copied, objects_skipped, objects_hidden, bytes_copied,
                files_cursor::text as cursor
         from public.backup_run where kind = 'files' and scope = 'buckets:${S}' order by started_at`,
      );
      assert.equal(rows.length, 4, 'four run rows');
      rows.forEach((row, i) => {
        const r = [r1, r2, r3, r4][i];
        assert.equal(row.kind, 'files', `row ${i + 1} kind`);
        assert.equal(row.scope, `buckets:${S}`, `row ${i + 1} scope`);
        assert.equal(row.status, 'succeeded', `row ${i + 1} status`);
        assert.equal(row.objects_copied, r.copied, `row ${i + 1} copied`);
        assert.equal(row.objects_skipped, r.skipped, `row ${i + 1} skipped`);
        assert.equal(row.objects_hidden, 0, `row ${i + 1} hidden`);
        assert.equal(Number(row.bytes_copied), r.bytes, `row ${i + 1} bytes`);
        assert.equal(
          query(`select '${row.cursor}'::timestamptz = '${runs[i].cursor}'::timestamptz as eq`)[0].eq,
          true,
          `row ${i + 1} files_cursor is the largest updated_at at that run`,
        );
      });
    } finally {
      await deps.close();
    }
  });

  test('EZD-025 T3 versioning and Object Lock must be on, before any write', async () => {
    const { runFileBackup } = await import('../files.mjs');
    const { runDbDump } = await import('../db.mjs');
    const deps = await realDeps(stub);
    try {
      const cases = [
        ['a', { versioning: 'Suspended' }, 'versioning_off'],
        ['b', { versioning: null }, 'versioning_off'],
        ['c', { objectLock: null }, 'object_lock_off'],
        ['d', { objectLock: { mode: 'COMPLIANCE', days: 91 } }, 'object_lock_off'],
        ['e', { objectLock: { mode: 'GOVERNANCE', days: 90 } }, 'object_lock_off'],
      ];
      for (const [id, change, code] of cases) {
        const bucket = await newBucket(`${d.bucket}-${id}`);
        stub.setVersioning('versioning' in change ? change.versioning : 'Enabled');
        stub.setObjectLock('objectLock' in change ? change.objectLock : { mode: 'GOVERNANCE', days: 91 });

        // files
        let mark = stub.log.length;
        const r = await runFileBackup({ onlyBuckets: [bucket] }, deps);
        assert.equal(r.ok, false, `(${id}) files ok false`);
        assert.equal(r.code, code, `(${id}) files code`);
        assert.equal(stub.log.slice(mark).filter((e) => e.method === 'PUT').length, 0, `(${id}) files PUT requests`);
        const rows = query(
          `select status, error, finished_at is not null as finished from public.backup_run
           where kind = 'files' and scope = 'buckets:${bucket}'`,
        );
        assert.deepEqual(
          rows.map((x) => ({ status: x.status, error: x.error, finished: x.finished })),
          [{ status: 'failed', error: code, finished: true }],
          `(${id}) one failed files run row`,
        );

        // database dump with a recording dumper
        mark = stub.log.length;
        const started = query('select now()::text as t')[0].t;
        const dumpCalls = [];
        const r2 = await runDbDump(
          { now: new Date('2026-11-01T08:00:00Z') },
          {
            store: deps.store,
            source: deps.source,
            dbUrl: deps.local.dbUrl,
            dump: async (args) => {
              dumpCalls.push(args);
              throw new Error('the dumper must not run');
            },
          },
        );
        assert.equal(r2.ok, false, `(${id}) db ok false`);
        assert.equal(r2.code, code, `(${id}) db code`);
        assert.equal(dumpCalls.length, 0, `(${id}) dumper calls`);
        assert.equal(stub.log.slice(mark).filter((e) => e.method === 'PUT').length, 0, `(${id}) db PUT requests`);
        const dbRows = query(
          `select status, finished_at is not null as finished from public.backup_run
           where kind = 'db_dump' and started_at >= '${started}'::timestamptz and error = '${code}'`,
        );
        assert.deepEqual(
          dbRows.map((x) => ({ status: x.status, finished: x.finished })),
          [{ status: 'failed', finished: true }],
          `(${id}) one failed db_dump run row`,
        );
      }
    } finally {
      stub.setVersioning('Enabled');
      stub.setObjectLock({ mode: 'GOVERNANCE', days: 91 });
      await deps.close();
    }
  });

  test('EZD-025 T4 (a) a source delete becomes a delete marker and no version is deleted', async () => {
    const S = await newBucket(`${d.bucket}-s`);
    const A = randomBytes(1_048_576);
    await d.api.upload(S, 'a', A);
    await d.api.upload(S, 'b', Buffer.from('ezd-025'));

    const first = await run(S);
    assert.equal(first.last?.ok, true, 'first run ok');
    assert.deepEqual(stub.currentKeys(`files/${S}/`), [`files/${S}/a`, `files/${S}/b`], 'both copied');

    await d.api.remove(S, ['a']);
    const second = await run(S);
    assert.equal(second.last?.ok, true, 'second run ok');
    assert.equal(second.last?.hidden, 1, 'second run hidden');
    assert.equal(second.last?.copied, 0, 'second run copied');
    const row = query(
      `select objects_hidden from public.backup_run where kind = 'files' and scope = 'buckets:${S}'
       order by started_at desc limit 1`,
    )[0];
    assert.equal(row.objects_hidden, 1, 'run row objects_hidden');

    const key = `files/${S}/a`;
    assert.ok(!stub.currentKeys(`files/${S}/`).includes(key), 'a is absent from ListObjectsV2');
    const get = await fetch(`${stub.endpoint}/${stub.bucket}/${key}`);
    assert.equal(get.status, 404, 'GET answers 404');
    const versions = stub.versionsOf(key);
    assert.equal(versions.filter((v) => v.deleteMarker).length, 1, 'one delete marker');
    const kept = versions.filter((v) => !v.deleteMarker);
    assert.equal(kept.length, 1, 'the earlier version is kept');
    assert.equal(Buffer.compare(kept[0].body, A), 0, 'earlier version bytes equal the upload');

    const third = await run(S);
    assert.equal(third.last?.hidden, 0, 'third run hidden');
  });

  test('EZD-025 T4 (b) an empty source never hides the backup (source_empty)', async () => {
    const S2 = await newBucket(`${d.bucket}-s2`);
    await d.api.upload(S2, 'only', Buffer.from('ezd-025-only'));
    const first = await run(S2);
    assert.equal(first.last?.ok, true, 'first run ok');
    await d.api.remove(S2, ['only']);

    const mark = stub.log.length;
    const r = await run(S2);
    assert.equal(r.last?.ok, false, 'ok false');
    assert.equal(r.last?.code, 'source_empty', 'code');
    assert.equal(stub.log.slice(mark).filter((e) => e.method === 'DELETE').length, 0, 'no DELETE sent');
    const versions = stub.versionsOf(`files/${S2}/only`);
    assert.equal(versions.filter((v) => v.deleteMarker).length, 0, '0 delete markers');
    assert.ok(stub.currentKeys(`files/${S2}/`).includes(`files/${S2}/only`), 'the key is still current');
  });

  test('EZD-025 T4 (c) the whole file sent exactly one DELETE and no version delete', () => {
    const deletes = stub.requests('DELETE');
    assert.equal(deletes.length, 1, 'exactly one DELETE request');
    assert.ok(deletes[0].key.startsWith('files/') && deletes[0].key.endsWith('/a'), 'its key is files/<S>/a');
    assert.equal(deletes[0].query.includes('versionId'), false, 'it carries no versionId');
    assert.equal(stub.requests('DELETE').filter((e) => e.versionId).length, 0, '0 DELETE with versionId');
    assert.equal(
      stub.requests('POST').filter((e) => e.query.includes('delete')).length,
      0,
      '0 POST ?delete',
    );
  });

  test('EZD-025 T4 (c) the source text has no DeleteObjects and DeleteObjectCommand only in s3-store.mjs', () => {
    const dir = path.join(REPO_ROOT, 'scripts', 'backup');
    assert.ok(existsSync(dir), 'scripts/backup exists');
    const files = sourceFiles(dir);
    assert.ok(files.length > 0, 'scripts/backup holds files');
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      const rel = path.relative(dir, f);
      assert.ok(!text.includes('DeleteObjectsCommand'), `${rel}: no DeleteObjectsCommand`);
      assert.ok(
        !/DeleteObjectCommand\s*\(\s*\{[^}]*VersionId/s.test(text),
        `${rel}: no VersionId next to a delete call`,
      );
      if (text.includes('DeleteObjectCommand')) {
        assert.equal(path.basename(f), 's3-store.mjs', `${rel}: DeleteObjectCommand only in s3-store.mjs`);
      }
    }
  });
});
