// EZD-042 T1-T8 (vault/plans/EZD-042.md section 4). node:test, Node 22 built-ins only.
// The Supabase CLI gets the database password only as PGPASSWORD in the child env, never in an argument.
// T1-T7 run over a recording `run`; T8 uses the real CLI against the local stack (Docker).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inScope, stackStatus } from '../../backup/__tests__/local-fixture.mjs';

const loadDump = () => import('../dump.mjs');
const loadPush = () => import('../push.mjs');

const U = 'postgresql://postgres.prodref123:S3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const U_NO_PW = 'postgresql://postgres.prodref123@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const OPTIONS_QUERY = 'options=-c%20lock_timeout%3D5s%20-c%20statement_timeout%3D300s';
const DATA_ARGS_NO_PW = [
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
const SECRET_NAMES = [
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
const ENC = 'postgresql://postgres.prodref123:p%2Fa%25b@h.example:5432/postgres';

const recorder = (result = { code: 0, stdout: 'out', stderr: '' }) => {
  const runs = [];
  const run = async (command, args, opts) => {
    runs.push({ command, args, opts });
    return result;
  };
  return { runs, run };
};

const withEnv = async (vars, fn) => {
  const saved = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

const isDbUrlInvalid = (err) =>
  err instanceof Error &&
  err.message === 'db_url_invalid' &&
  err.code === 'db_url_invalid' &&
  !Object.prototype.hasOwnProperty.call(err, 'cause');
const codeIs = (code) => (err) => err instanceof Error && err.message === code;
const pgKeys = (env) => Object.keys(env).filter((k) => k.startsWith('PG'));

describe('EZD-042 Supabase CLI password through the environment', () => {
  test('EZD-042 T1 splitDbPassword values', async () => {
    const { splitDbPassword } = await loadPush();
    const cases = [
      ['a', U, { url: U_NO_PW, password: 'S3cret' }],
      ['b', `${U}?sslmode=require`, { url: `${U_NO_PW}?sslmode=require`, password: 'S3cret' }],
      ['c', 'postgresql://u%40x:p%2Fa%25b@h:5432/d', { url: 'postgresql://u%40x@h:5432/d', password: 'p/a%b' }],
      ['d', 'postgres://u:p@[::1]:5432/d', { url: 'postgres://u@[::1]:5432/d', password: 'p' }],
      ['e', 'postgresql://u@h:5432/d', { url: 'postgresql://u@h:5432/d', password: '' }],
      ['f', 'postgresql://u:@h/d', { url: 'postgresql://u@h/d', password: '' }],
      ['g', 'postgresql://u:p:q@h/d', { url: 'postgresql://u@h/d', password: 'p:q' }],
    ];
    for (const [id, input, expected] of cases) {
      const got = splitDbPassword(input);
      assert.equal(got.url === expected.url, true, `(${id}) url`);
      assert.equal(got.password === expected.password, true, `(${id}) password`);
      assert.deepEqual(Object.keys(got).sort(), ['password', 'url'], `(${id}) keys`);
    }
  });

  test('EZD-042 T2 splitDbPassword refusals', async () => {
    const { splitDbPassword } = await loadPush();
    const inputs = [
      undefined,
      42,
      '',
      'not a url',
      'http://u:S3cret@h/d',
      'postgresql://u:S3cret@h1:5432,h2:5432/d',
      'postgresql://u:%E0%A4%A@h/d',
    ];
    for (const input of inputs) {
      let caught;
      try {
        splitDbPassword(input);
      } catch (err) {
        caught = err;
      }
      assert.equal(caught !== undefined && isDbUrlInvalid(caught), true, `refuses ${String(input)}`);
      let leaked = 0;
      for (const name of Object.getOwnPropertyNames(caught)) {
        if (String(caught[name]).includes('S3cret')) leaked += 1;
      }
      assert.equal(leaked, 0, `no own property holds the password for ${String(input)}`);
    }
  });

  test('EZD-042 T3 buildDumpInvocation returns { args, env }', async () => {
    const dump = await loadDump();
    const a = dump.buildDumpInvocation('data', { dbUrl: U });
    assert.deepEqual(a.args, DATA_ARGS_NO_PW, '(a) args');
    assert.deepEqual(a.env, { PGPASSWORD: 'S3cret' }, '(a) env');

    const b = dump.buildDumpInvocation('roles', { dbUrl: U, file: '/tmp/d/roles.sql' });
    assert.deepEqual(
      b.args,
      ['db', 'dump', '--db-url', U_NO_PW, '--role-only', '--file', '/tmp/d/roles.sql'],
      '(b) args',
    );
    assert.deepEqual(b.env, { PGPASSWORD: 'S3cret' }, '(b) env');

    const c = dump.buildDumpInvocation('schema', { local: true, dbUrl: 'not a url' });
    assert.deepEqual(c.args, ['db', 'dump', '--local'], '(c) args');
    assert.deepEqual(c.env, {}, '(c) env');

    const d = dump.buildDumpInvocation('roles', { dbUrl: ENC });
    assert.deepEqual(d.env, { PGPASSWORD: 'p/a%b' }, '(d) env');
    assert.equal(
      d.args[3] === 'postgresql://postgres.prodref123@h.example:5432/postgres',
      true,
      '(d) url without password',
    );

    const e = dump.buildDumpInvocation('roles', { dbUrl: 'postgresql://u@h:5432/d' });
    assert.deepEqual(e.env, {}, '(e) env');
    assert.equal(e.args[3], 'postgresql://u@h:5432/d', '(e) url');

    assert.throws(() => dump.buildDumpInvocation('roles', { dbUrl: 'http://u:p@h/d' }), isDbUrlInvalid, '(f)');
    assert.throws(
      () => dump.buildDumpInvocation('logs', { dbUrl: 'not a url' }),
      codeIs('dump_kind_invalid'),
      '(g)',
    );
  });

  test('EZD-042 T4 buildPushInvocation returns { args, env }', async () => {
    const push = await loadPush();
    const a = push.buildPushInvocation({ dbUrl: U, workdir: '/tmp/w', dryRun: false });
    assert.deepEqual(
      a.args,
      ['db', 'push', '--db-url', `${U_NO_PW}?${OPTIONS_QUERY}`, '--workdir', '/tmp/w', '--yes'],
      '(a) args',
    );
    assert.deepEqual(a.env, { PGPASSWORD: 'S3cret' }, '(a) env');

    const b = push.buildPushInvocation({ dbUrl: U, workdir: '/tmp/w', dryRun: true });
    assert.deepEqual(
      b.args,
      ['db', 'push', '--db-url', U_NO_PW, '--workdir', '/tmp/w', '--yes', '--dry-run'],
      '(b) args',
    );
    assert.deepEqual(b.env, { PGPASSWORD: 'S3cret' }, '(b) env');

    const c = push.buildPushInvocation({ dbUrl: `${U}?sslmode=require`, workdir: '/tmp/w', dryRun: false });
    assert.equal(c.args[3], `${U_NO_PW}?sslmode=require&${OPTIONS_QUERY}`, '(c) url');

    assert.throws(
      () => push.buildPushInvocation({ dbUrl: `${U}?options=x`, workdir: '/tmp/w', dryRun: false }),
      codeIs('db_url_has_options'),
      '(d)',
    );
    assert.throws(
      () => push.buildPushInvocation({ dbUrl: 'not a url', workdir: '/tmp/w', dryRun: false }),
      isDbUrlInvalid,
      '(e)',
    );
  });

  test('EZD-042 T5 the wrapper builds the env and the args', async () => {
    const dump = await loadDump();
    const { runs, run } = recorder();
    const inherited = {
      PGPASSWORD: 'inherited_T5',
      PGSERVICE: 'svc_T5',
      PGHOST: 'evil.example',
      PGPASSFILE: '/tmp/pgpass_T5',
      GITHUB_TOKEN: 'ghs_T5',
      BACKUP_SOURCE_DB_URL: U,
    };
    const results = await withEnv(inherited, async () => {
      const cli = dump.createSupabaseCli({ root: '/r', run });
      return [
        await cli.dump('data', { dbUrl: U, file: '/tmp/d/data.sql', exclude: dump.AUTH_DATA_EXCLUDES }),
        await cli.pushDryRun({ dbUrl: U, workdir: '/tmp/w' }),
        await cli.push({ dbUrl: U, workdir: '/tmp/w', lockTimeout: '5s', statementTimeout: '300s' }),
        await cli.dump('schema', { local: true, file: '/tmp/d/schema.sql' }),
      ];
    });
    assert.deepEqual(results, ['out', 'out', 'out', 'out'], 'each resolves stdout');
    assert.equal(runs.length, 4, 'four runs');
    const expectedArgs = [
      [...DATA_ARGS_NO_PW, '--file', '/tmp/d/data.sql'],
      ['db', 'push', '--db-url', U_NO_PW, '--workdir', '/tmp/w', '--yes', '--dry-run'],
      ['db', 'push', '--db-url', `${U_NO_PW}?${OPTIONS_QUERY}`, '--workdir', '/tmp/w', '--yes'],
      ['db', 'dump', '--local', '--file', '/tmp/d/schema.sql'],
    ];
    runs.forEach((r, i) => {
      assert.equal(r.command, path.join('/r', 'node_modules', '.bin', 'supabase'), `run ${i + 1} command`);
      assert.equal(r.opts.cwd, '/r', `run ${i + 1} cwd`);
      assert.deepEqual(r.args, expectedArgs[i], `run ${i + 1} args`);
      assert.equal(r.opts.env.PATH === process.env.PATH, true, `run ${i + 1} PATH`);
      assert.equal('GITHUB_TOKEN' in r.opts.env, false, `run ${i + 1} no GITHUB_TOKEN`);
      for (const name of SECRET_NAMES) assert.equal(name in r.opts.env, false, `run ${i + 1} no ${name}`);
      if (i < 3) {
        assert.equal(r.opts.env.PGPASSWORD === 'S3cret', true, `run ${i + 1} PGPASSWORD`);
        assert.deepEqual(pgKeys(r.opts.env), ['PGPASSWORD'], `run ${i + 1} only PGPASSWORD`);
      } else {
        assert.deepEqual(pgKeys(r.opts.env), [], 'run 4 no PG names');
      }
    });
  });

  test('EZD-042 T6 EZD-042 done when: no supabase CLI argument holds the production password', async () => {
    const dump = await loadDump();
    const push = await loadPush();
    const { runs, run } = recorder();
    const cli = dump.createSupabaseCli({ root: '/r', run });
    const expected = [];
    for (const [dbUrl, pw] of [
      [U, 'S3cret'],
      [ENC, 'p/a%b'],
    ]) {
      await cli.dump('roles', { dbUrl, file: '/tmp/d/roles.sql' });
      await cli.dump('schema', { dbUrl, file: '/tmp/d/schema.sql' });
      await cli.dump('data', { dbUrl, file: '/tmp/d/data.sql', exclude: dump.AUTH_DATA_EXCLUDES });
      await cli.pushDryRun({ dbUrl, workdir: '/tmp/w' });
      await cli.push({ dbUrl, workdir: '/tmp/w', ...push.MIGRATION_TIMEOUTS });
      expected.push(pw, pw, pw, pw, pw);
    }
    assert.equal(runs.length, 10, 'ten runs');
    let leaks = 0;
    runs.forEach((r, i) => {
      for (const arg of r.args) {
        for (const needle of ['S3cret', 'p%2Fa%25b', 'p/a%b']) if (arg.includes(needle)) leaks += 1;
      }
      assert.equal(r.opts.env.PGPASSWORD === expected[i], true, `run ${i + 1} PGPASSWORD`);
    });
    assert.equal(leaks, 0, 'no argument holds the password');
  });

  test('EZD-042 T7 wrapper refusals and exit codes', async () => {
    const dump = await loadDump();
    {
      const { runs, run } = recorder();
      const cli = dump.createSupabaseCli({ root: '/r', run });
      await assert.rejects(() => cli.dump('roles', { dbUrl: 'http://u:S3cret@h/d' }), isDbUrlInvalid, '(a) dump');
      await assert.rejects(() => cli.pushDryRun({ dbUrl: '', workdir: '/tmp/w' }), isDbUrlInvalid, '(a) dry run');
      await assert.rejects(() => cli.push({ dbUrl: 'not a url', workdir: '/tmp/w' }), isDbUrlInvalid, '(a) push');
      assert.equal(runs.length, 0, '(a) run never called');
    }
    {
      const { run } = recorder({ code: 1, stdout: 'o', stderr: 'e' });
      const cli = dump.createSupabaseCli({ root: '/r', run });
      await assert.rejects(
        () => cli.push({ dbUrl: U, workdir: '/tmp/w' }),
        (err) =>
          err instanceof Error &&
          err.message === 'supabase db push exited 1' &&
          err.exitCode === 1 &&
          err.stderr === 'e',
        '(b)',
      );
    }
  });
});

describe('EZD-042 Supabase CLI password on the local stack', { skip: !inScope('EZD-042') }, () => {
  test('EZD-042 T8 the real CLI takes the password from PGPASSWORD', { timeout: 120_000 }, async () => {
    const dump = await loadDump();
    const { splitDbPassword } = await loadPush();
    const { dbUrl } = stackStatus();
    assert.notEqual(splitDbPassword(dbUrl).password, '', 'precondition: the local URL has a password');
    const w = new URL(dbUrl);
    w.password = 'wrong-ezd042';
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd042-'));
    try {
      const cli = dump.createSupabaseCli();
      await cli.dump('roles', { dbUrl, file: path.join(tmp, 'roles.sql') });
      assert.equal(statSync(path.join(tmp, 'roles.sql')).size > 0, true, '(a) roles.sql is not empty');
      await assert.rejects(
        () => cli.dump('roles', { dbUrl: w.href, file: path.join(tmp, 'wrong.sql') }),
        (err) =>
          err instanceof Error &&
          err.message === 'supabase db dump exited 1' &&
          /password authentication failed/.test(err.stderr),
        '(b) wrong password is refused',
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
