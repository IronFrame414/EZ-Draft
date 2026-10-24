// EZD-023d T21, T26 (vault/plans/EZD-023d.md section 4). node:test, Node 22 built-ins only.
// Pure invocation builders (Steps 1, 2, 4), `runChild` over a process.execPath child, the CLI and psql
// wrappers over a recording `run`, and the off-site uploader over a fake SDK (Step 3). Nothing reaches the
// network, a database or the Supabase CLI.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const loadDump = () => import('../dump.mjs');
const loadPush = () => import('../push.mjs');
const loadBootstrap = () => import('../bootstrap.mjs');
const loadOffsite = () => import('../offsite-upload.mjs');

// `CLEAN`'s BACKUP_SOURCE_DB_URL (release.test.mjs; vault/plans/EZD-023b.md section 4).
const U = 'postgresql://postgres.prodref123:S3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const U_NO_PW = 'postgresql://postgres.prodref123@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const OPTIONS_QUERY = 'options=-c%20lock_timeout%3D5s%20-c%20statement_timeout%3D300s';

// Step 1 values (the test keeps its own copy so the exported arrays are checked, not trusted).
const AUTH_DATA_EXCLUDES_EXPECTED = [
  'auth.sessions',
  'auth.refresh_tokens',
  'auth.one_time_tokens',
  'auth.flow_state',
];
const DUMP_FILES_EXPECTED = ['roles.sql', 'schema.sql', 'data.sql'];
const DATA_ARGS = [
  'db',
  'dump',
  '--db-url',
  U_NO_PW,
  '--data-only',
  '--use-copy',
  '--exclude',
  'auth.sessions',
  '--exclude',
  'auth.refresh_tokens',
  '--exclude',
  'auth.one_time_tokens',
  '--exclude',
  'auth.flow_state',
];
const PSQL_ARGS = ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A'];
// Part b's list (vault/plans/EZD-023b.md Step 1), copied so `childEnv` is checked against the plan, not the code.
const RELEASE_SECRET_NAMES_EXPECTED = [
  'VERCEL_TOKEN',
  'VERCEL_PROJECT_ID',
  'VERCEL_TEAM_ID',
  'TENANT1_OWNER_EMAIL',
  'BACKUP_SOURCE_DB_URL',
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_REGION',
  'BACKUP_S3_BUCKET',
  'RELEASE_S3_ACCESS_KEY_ID',
  'RELEASE_S3_SECRET_ACCESS_KEY',
];

const throwsCode = (fn, code) => {
  assert.throws(fn, (err) => err instanceof Error && err.message === code, `throws ${code}`);
};

describe('EZD-023d child-process invocations and the off-site uploader', () => {
  // T21 --------------------------------------------------------------------------------------------------------
  test('EZD-023d T21 child-process invocations: dump, push, psql, childEnv, runChild and the wrappers', async () => {
    const dump = await loadDump();
    const push = await loadPush();
    const bs = await loadBootstrap();

    // Step 1 and Step 2 constants.
    assert.deepEqual([...dump.AUTH_DATA_EXCLUDES], AUTH_DATA_EXCLUDES_EXPECTED, 'AUTH_DATA_EXCLUDES');
    assert.ok(Object.isFrozen(dump.AUTH_DATA_EXCLUDES), 'AUTH_DATA_EXCLUDES is frozen');
    assert.deepEqual([...dump.DUMP_FILES], DUMP_FILES_EXPECTED, 'DUMP_FILES');
    assert.ok(Object.isFrozen(dump.DUMP_FILES), 'DUMP_FILES is frozen');
    assert.equal(dump.DUMP_EXCLUDE_FLAG, '--exclude', 'DUMP_EXCLUDE_FLAG');
    assert.ok(dump.ROLE_PASSWORD_RE instanceof RegExp, 'ROLE_PASSWORD_RE is a RegExp');
    assert.deepEqual(
      { ...push.MIGRATION_TIMEOUTS },
      { lockTimeout: '5s', statementTimeout: '300s' },
      'MIGRATION_TIMEOUTS',
    );
    assert.ok(Object.isFrozen(push.MIGRATION_TIMEOUTS), 'MIGRATION_TIMEOUTS is frozen');

    // (a) data dump with the default auth exclusions.
    assert.deepEqual(dump.buildDumpInvocation('data', { dbUrl: U }).args, DATA_ARGS, '(a)');

    // (b) roles dump to a file.
    assert.deepEqual(
      dump.buildDumpInvocation('roles', { dbUrl: U, file: '/tmp/d/roles.sql' }).args,
      ['db', 'dump', '--db-url', U_NO_PW, '--role-only', '--file', '/tmp/d/roles.sql'],
      '(b)',
    );

    // (c) schema dump of the local stack (EZD-025's form).
    assert.deepEqual(dump.buildDumpInvocation('schema', { local: true }).args, ['db', 'dump', '--local'], '(c)');

    // (d) exclude on a non-data kind; unknown kind.
    throwsCode(() => dump.buildDumpInvocation('roles', { dbUrl: U, exclude: ['x.y'] }), 'dump_exclude_data_only');
    throwsCode(() => dump.buildDumpInvocation('logs', { dbUrl: U }), 'dump_kind_invalid');

    // (e) real push carries the timeouts in the URL; (f) the dry run does not.
    assert.deepEqual(
      push.buildPushInvocation({ dbUrl: U, workdir: '/tmp/w', dryRun: false }).args,
      ['db', 'push', '--db-url', `${U_NO_PW}?${OPTIONS_QUERY}`, '--workdir', '/tmp/w', '--yes'],
      '(e)',
    );
    assert.deepEqual(
      push.buildPushInvocation({ dbUrl: U, workdir: '/tmp/w', dryRun: true }).args,
      ['db', 'push', '--db-url', U_NO_PW, '--workdir', '/tmp/w', '--yes', '--dry-run'],
      '(f)',
    );

    // (g) withTimeouts appends with `&` after an existing query; an existing `options` key fails closed.
    assert.equal(push.withTimeouts(`${U}?sslmode=require`), `${U}?sslmode=require&${OPTIONS_QUERY}`, '(g)');
    throwsCode(() => push.withTimeouts(`${U}?options=x`), 'db_url_has_options');

    // (h) psql flags (scripts/db/sql.mjs).
    assert.deepEqual(
      bs.buildPsqlInvocation({ dbUrl: U }),
      {
        command: 'psql',
        args: PSQL_ARGS,
        env: {
          PGHOST: 'aws-0-us-east-1.pooler.supabase.com',
          PGPORT: '5432',
          PGUSER: 'postgres.prodref123',
          PGPASSWORD: 'S3cret',
          PGDATABASE: 'postgres',
        },
      },
      '(h)',
    );

    // (i) childEnv drops the release secrets, the job token and the backup key.
    assert.deepEqual(
      dump.childEnv({
        PATH: '/bin',
        HOME: '/h',
        GITHUB_TOKEN: 'g',
        VERCEL_TOKEN: 'v',
        TENANT1_OWNER_EMAIL: 'e',
        RELEASE_S3_SECRET_ACCESS_KEY: 'r',
        BACKUP_S3_SECRET_ACCESS_KEY: 'b',
        BACKUP_S3_ACCESS_KEY_ID: 'k',
      }),
      { PATH: '/bin', HOME: '/h' },
      '(i)',
    );

    // (j) pending migration names only, distinct, in order.
    assert.deepEqual(
      push.parsePendingMigrations(
        'x 20261101000000_a.sql\n • 20261101000000_a.sql postgresql://u:p@h/d 20261102000000_b_c.sql',
      ),
      ['20261101000000_a.sql', '20261102000000_b_c.sql'],
      '(j)',
    );

    // (k) runChild: stdin is written and closed, both streams captured, the exit code returned, no inherit.
    {
      const script =
        "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',(d)=>{s+=d;});" +
        "process.stdin.on('end',()=>{process.stdout.write(s);process.stderr.write('e');process.exitCode=2;});";
      const r = await dump.runChild(process.execPath, ['-e', script], { input: 'in' });
      assert.deepEqual(r, { code: 2, stdout: 'in', stderr: 'e' }, '(k)');
    }

    // (l) the CLI and psql wrappers over a recording `run`.
    {
      const runs = [];
      const run = async (command, args, opts) => {
        runs.push({ command, args, opts });
        return { code: 1, stdout: 'o', stderr: 'e' };
      };
      const saved = { GITHUB_TOKEN: process.env.GITHUB_TOKEN, VERCEL_TOKEN: process.env.VERCEL_TOKEN };
      process.env.GITHUB_TOKEN = 'ghs_T21';
      process.env.VERCEL_TOKEN = 'tok_T21';
      try {
        const cli = dump.createSupabaseCli({ root: '/r', run });
        await assert.rejects(
          () => cli.dump('data', { dbUrl: U, file: '/tmp/d/data.sql', exclude: dump.AUTH_DATA_EXCLUDES }),
          (err) =>
            err instanceof Error &&
            err.message === 'supabase db dump exited 1' &&
            err.exitCode === 1 &&
            err.stderr === 'e',
          '(l) dump rejection',
        );
        const sql = bs.createSql({ run });
        await assert.rejects(
          () => sql('select 1;', { dbUrl: U }),
          (err) =>
            err instanceof Error && err.message === 'psql exited 1' && err.exitCode === 1 && err.stderr === 'e',
          '(l) sql rejection',
        );
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
      assert.equal(runs.length, 2, '(l) two child runs');
      const [d, p] = runs;
      assert.equal(d.command, path.join('/r', 'node_modules', '.bin', 'supabase'), '(l) supabase command');
      assert.deepEqual(d.args, [...DATA_ARGS, '--file', '/tmp/d/data.sql'], '(l) dump args');
      assert.equal(p.command, 'psql', '(l) psql command');
      assert.deepEqual(p.args, PSQL_ARGS, '(l) psql args');
      assert.equal(p.opts.input, 'select 1;', '(l) the SQL goes on stdin');
      for (const [id, r] of [
        ['dump', d],
        ['sql', p],
      ]) {
        assert.ok(r.opts && r.opts.env && typeof r.opts.env === 'object', `(l) ${id} run got an env`);
        for (const name of [...RELEASE_SECRET_NAMES_EXPECTED, 'GITHUB_TOKEN']) {
          assert.ok(!(name in r.opts.env), `(l) ${id} env holds no ${name}`);
        }
      }
    }
  });

  // T26 --------------------------------------------------------------------------------------------------------
  test('EZD-023d T26 off-site uploader: write-only puts with Content-MD5 and no SDK text in errors', async (t) => {
    const mod = await loadOffsite();
    const configs = [];
    const inputs = [];
    let sendImpl = async () => ({ $metadata: { httpStatusCode: 200 } });
    class Fake {
      constructor(cfg) {
        configs.push(cfg);
      }
      send(cmd) {
        return sendImpl(cmd);
      }
    }
    class FakeCmd {
      constructor(input) {
        this.input = input;
        inputs.push(input);
      }
    }
    const cfg = {
      endpoint: 'https://s3.us-west-004.backblazeb2.com',
      region: 'us-west-004',
      bucket: 'ezd-test',
      accessKeyId: 'relkey_TEST',
      secretAccessKey: 'rel-secret-TEST',
    };
    const uploader = mod.createOffsiteUploader(cfg, { S3Client: Fake, PutObjectCommand: FakeCmd });

    assert.ok(Object.isFrozen(uploader), 'the uploader is frozen');
    assert.deepEqual(Object.keys(uploader), ['putFile', 'putJson'], 'exactly putFile and putJson');
    assert.equal(configs.length, 1, 'one S3Client');
    assert.deepEqual(
      configs[0],
      {
        endpoint: 'https://s3.us-west-004.backblazeb2.com',
        region: 'us-west-004',
        forcePathStyle: true,
        credentials: { accessKeyId: 'relkey_TEST', secretAccessKey: 'rel-secret-TEST' },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      },
      'client config',
    );

    const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-023d-offsite-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'roles.sql');
    writeFileSync(file, 'abc');

    // (a) putFile.
    await uploader.putFile('releases/x/roles.sql', file, { contentType: 'application/sql' });
    assert.equal(inputs.length, 1, '(a) one command');
    assert.deepEqual(
      inputs[0],
      {
        Bucket: 'ezd-test',
        Key: 'releases/x/roles.sql',
        Body: Buffer.from('abc'),
        ContentType: 'application/sql',
        ContentMD5: 'kAFQmDzST7DWlj99KOF/cg==',
      },
      '(a) command input',
    );

    // (b) putJson.
    await uploader.putJson('releases/x/manifest.json', { a: 1 });
    assert.equal(inputs.length, 2, '(b) second command');
    const body = '{\n  "a": 1\n}\n';
    assert.equal(inputs[1].Bucket, 'ezd-test', '(b) bucket');
    assert.equal(inputs[1].Key, 'releases/x/manifest.json', '(b) key');
    assert.equal(inputs[1].Body, body, '(b) body');
    assert.equal(inputs[1].ContentType, 'application/json', '(b) content type');
    assert.equal(inputs[1].ContentMD5, createHash('md5').update(body).digest('base64'), '(b) Content-MD5');

    // (c) an SDK error with a status: only the key and the status come back.
    sendImpl = async () => {
      throw Object.assign(new Error('denied rel-secret-TEST relkey_TEST'), {
        $metadata: { httpStatusCode: 403 },
      });
    };
    await assert.rejects(
      () => uploader.putFile('releases/x/roles.sql', file, { contentType: 'application/sql' }),
      (err) => err instanceof Error && err.message === 'offsite put failed: releases/x/roles.sql (403)',
      '(c)',
    );

    // (d) a network error has no status.
    sendImpl = async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    };
    await assert.rejects(
      () => uploader.putFile('releases/x/roles.sql', file, { contentType: 'application/sql' }),
      (err) => err instanceof Error && err.message === 'offsite put failed: releases/x/roles.sql (network)',
      '(d)',
    );
  });
});
