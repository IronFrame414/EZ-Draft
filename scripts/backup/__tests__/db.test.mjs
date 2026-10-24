// EZD-025 T5 (vault/plans/EZD-025.md Tests; Step 4 `db.mjs`; Interface contract): the weekly dump through runDbDump
// with a fake dumper, the stub bucket and the local stack. Expected values: plan T5.
// Cases (b) and (c) use `now` one and two minutes later than (a) so each has its own prefix and "no manifest.json
// key under that prefix" cannot be satisfied by (a)'s manifest.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startStubS3 } from './stub-s3.mjs';
import { exec, inScope, newestMigrationVersion, query, realDeps } from './local-fixture.mjs';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

describe('EZD-025 T5 weekly dump', { skip: !inScope('EZD-025') }, () => {
  let stub;
  let deps;
  let tmpRoot;

  before(async () => {
    stub = await startStubS3({ bucket: 'ezd025-offsite' });
    deps = await realDeps(stub);
    tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'ezd025-t5-'));
  });

  after(async () => {
    await deps?.close();
    await stub?.stop();
    rmSync(tmpRoot, { recursive: true, force: true });
    exec("delete from public.backup_run where kind = 'db_dump' and location like 'db/20261101T08%';");
  });

  /** A dumper fake that writes the given files and records the outDir it was given. */
  const fakeDump = (sizes, { reject = false } = {}) => {
    const calls = [];
    const fn = async ({ outDir }) => {
      calls.push(outDir);
      if (reject) throw Object.assign(new Error('boom'), { code: 'dump_failed' });
      mkdirSync(outDir, { recursive: true });
      const files = ['roles.sql', 'schema.sql', 'data.sql'].map((name, i) => {
        const body = Buffer.alloc(sizes[i], String.fromCharCode(97 + i));
        const p = path.join(outDir, name);
        writeFileSync(p, body);
        return { name, path: p, size: body.length, sha256: sha(body) };
      });
      return { files };
    };
    return { fn, calls };
  };
  const run = async (now, dumper) => {
    const { runDbDump } = await import('../db.mjs');
    return runDbDump(
      { now: new Date(now), local: true },
      { store: deps.store, source: deps.source, dump: dumper.fn, dbUrl: deps.local.dbUrl, tmpDir: tmpRoot },
    );
  };

  test('EZD-025 T5 (a) a good dump is uploaded with the manifest last', async () => {
    const dumper = fakeDump([10, 20, 30]);
    const mark = stub.log.length;
    const r = await run('2026-11-01T08:00:00Z', dumper);
    assert.equal(r.ok, true, 'ok');
    assert.equal(r.location, 'db/20261101T080000Z/', 'location');
    const puts = stub.log.slice(mark).filter((e) => e.method === 'PUT').map((e) => e.key);
    const p = 'db/20261101T080000Z/';
    assert.deepEqual(puts, [`${p}roles.sql`, `${p}schema.sql`, `${p}data.sql`, `${p}manifest.json`], 'PUT order');
    const manifest = JSON.parse(stub.current(`${p}manifest.json`).body.toString('utf8'));
    assert.equal(manifest.format, 1, 'format');
    assert.equal(manifest.newest_migration, newestMigrationVersion(), 'newest_migration');
    assert.equal(manifest.files.length, 3, 'three files');
    [10, 20, 30].forEach((size, i) => {
      const name = ['roles.sql', 'schema.sql', 'data.sql'][i];
      const body = Buffer.alloc(size, String.fromCharCode(97 + i));
      assert.deepEqual(
        { name: manifest.files[i].name, size: manifest.files[i].size, sha256: manifest.files[i].sha256 },
        { name, size, sha256: sha(body) },
        `manifest entry ${name}`,
      );
      assert.match(manifest.files[i].sha256, /^[0-9a-f]{64}$/);
    });
    const rows = query(`select status, bytes_copied from public.backup_run where location = '${p}'`);
    assert.deepEqual(
      rows.map((x) => ({ status: x.status, bytes: Number(x.bytes_copied) })),
      [{ status: 'succeeded', bytes: 60 }],
      'run row',
    );
    assert.equal(dumper.calls.length, 1, 'dumper called once');
    assert.equal(existsSync(dumper.calls[0]), false, 'temporary folder removed');
  });

  for (const [id, now, makeDumper] of [
    ['b', '2026-11-01T08:01:00Z', () => fakeDump([10, 20, 0])],
    ['c', '2026-11-01T08:02:00Z', () => fakeDump([10, 20, 30], { reject: true })],
  ]) {
    test(`EZD-025 T5 (${id}) a failed dump is dump_failed and has no manifest`, async () => {
      const dumper = makeDumper();
      const started = query('select now()::text as t')[0].t;
      const r = await run(now, dumper);
      assert.equal(r.ok, false, 'ok false');
      assert.equal(r.code, 'dump_failed', 'code');
      const prefix = `db/${now.replace(/[-:]/g, '')}/`;
      assert.equal(stub.current(`${prefix}manifest.json`), null, 'no manifest.json key');
      const rows = query(
        `select status, error from public.backup_run
         where kind = 'db_dump' and started_at >= '${started}'::timestamptz
           and error = 'dump_failed'`,
      );
      assert.deepEqual(rows, [{ status: 'failed', error: 'dump_failed' }], 'one failed run row');
      assert.equal(dumper.calls.length, 1, 'dumper called');
      assert.equal(existsSync(dumper.calls[0]), false, 'temporary folder removed');
    });
  }
});
