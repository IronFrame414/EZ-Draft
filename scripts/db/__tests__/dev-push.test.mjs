// EZD-146 D1, U1-U6 (vault/plans/EZD-146.md sections 3 and 4). node:test, Node 22 built-ins only.
// The dev migration push goes through the release's createSupabaseCli().push, so no CLI argument holds the
// password; it reaches the child only as PGPASSWORD. Every run here is a recording `run`; nothing is spawned.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const loadDevPush = () => import('../dev-push.mjs');
const loadDump = () => import('../../release/dump.mjs');
const loadPush = () => import('../../release/push.mjs');

// Constants copied from scripts/release/__tests__/cli-password-env.test.mjs (plan section 4).
const U = 'postgresql://postgres.prodref123:S3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const U_NO_PW = 'postgresql://postgres.prodref123@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const OPTIONS_QUERY = 'options=-c%20lock_timeout%3D5s%20-c%20statement_timeout%3D300s';
const ENC = 'postgresql://postgres.prodref123:p%2Fa%25b@h.example:5432/postgres';

const recorder = (result = { code: 0, stdout: 'out', stderr: '' }) => {
  const runs = [];
  const run = async (command, args, opts) => {
    runs.push({ command, args, opts });
    return result;
  };
  return { runs, run };
};

const lines = () => {
  const outLines = [];
  const errLines = [];
  return { outLines, errLines, out: (l) => outLines.push(l), err: (l) => errLines.push(l) };
};

describe('EZD-146 dev migration push', () => {
  test('EZD-146 D1 EZD-146 done when: no CLI argument in the dev or release push holds a password', async () => {
    const { runDevPush, DEV_DB_URL_NAME } = await loadDevPush();
    const { createSupabaseCli } = await loadDump();
    const { MIGRATION_TIMEOUTS } = await loadPush();
    assert.equal(DEV_DB_URL_NAME, 'SUPABASE_DEV_DB_URL', 'DEV_DB_URL_NAME');
    const { runs, run } = recorder();
    for (const dbUrl of [U, ENC]) {
      const o = lines();
      const code = await runDevPush({ env: { SUPABASE_DEV_DB_URL: dbUrl }, root: '/r', run, out: o.out, err: o.err });
      assert.equal(code, 0, `runDevPush resolves 0 for ${dbUrl === U ? 'U' : 'ENC'}`);
    }
    const cli = createSupabaseCli({ root: '/r', run });
    for (const dbUrl of [U, ENC]) {
      await cli.pushDryRun({ dbUrl, workdir: '/tmp/w' });
      await cli.push({ dbUrl, workdir: '/tmp/w', ...MIGRATION_TIMEOUTS });
    }
    assert.equal(runs.length, 6, 'six runs');
    assert.deepEqual(
      runs[0].args,
      ['db', 'push', '--db-url', U_NO_PW + '?' + OPTIONS_QUERY, '--workdir', '/r', '--yes'],
      'run 1 args',
    );
    assert.equal(runs[0].command, '/r/node_modules/.bin/supabase', 'run 1 command');
    assert.equal(runs[0].opts.cwd, '/r', 'run 1 cwd');
    assert.equal(
      runs[1].args[3],
      'postgresql://postgres.prodref123@h.example:5432/postgres?' + OPTIONS_QUERY,
      'run 2 url without password',
    );
    const expected = ['S3cret', 'p/a%b', 'S3cret', 'S3cret', 'p/a%b', 'p/a%b'];
    let leaks = 0;
    runs.forEach((r, i) => {
      assert.equal(r.opts.env.PGPASSWORD === expected[i], true, `run ${i + 1} PGPASSWORD`);
      for (const arg of r.args) {
        for (const needle of ['S3cret', 'p%2Fa%25b', 'p/a%b']) if (arg.includes(needle)) leaks += 1;
      }
    });
    assert.equal(leaks, 0, 'no argument holds the password');
  });

  test('EZD-146 U1 success lines', async () => {
    const { runDevPush } = await loadDevPush();
    const { run } = recorder({
      code: 0,
      stdout: 'Finished supabase db push.\n',
      stderr: 'Applying migration 20261012093000_create_tenant.sql...\n',
    });
    const o = lines();
    const code = await runDevPush({ env: { SUPABASE_DEV_DB_URL: U }, root: '/r', run, out: o.out, err: o.err });
    assert.equal(code, 0, 'returns 0');
    assert.deepEqual(
      o.outLines,
      ['applied migration: 20261012093000_create_tenant.sql', 'dev migration push done: 1 migration(s)'],
      'out lines',
    );
    assert.deepEqual(o.errLines, [], 'no err lines');
  });

  test('EZD-146 U2 missing URL', async () => {
    const { runDevPush } = await loadDevPush();
    for (const [label, env] of [
      ['absent', {}],
      ['empty', { SUPABASE_DEV_DB_URL: '' }],
    ]) {
      const { runs, run } = recorder();
      const o = lines();
      const code = await runDevPush({ env, root: '/r', run, out: o.out, err: o.err });
      assert.equal(code, 1, `${label}: returns 1`);
      assert.deepEqual(o.errLines, ['dev migration push failed: dev_db_url_missing'], `${label}: err`);
      assert.equal(runs.length, 0, `${label}: run never called`);
    }
  });

  test('EZD-146 U3 invalid URLs', async () => {
    const { runDevPush } = await loadDevPush();
    for (const [dbUrl, code] of [
      ['http://u:S3cret@h/d', 'db_url_invalid'],
      [U + '?options=x', 'db_url_has_options'],
    ]) {
      const { runs, run } = recorder();
      const o = lines();
      const result = await runDevPush({ env: { SUPABASE_DEV_DB_URL: dbUrl }, root: '/r', run, out: o.out, err: o.err });
      assert.equal(result, 1, `${code}: returns 1`);
      assert.deepEqual(o.errLines, [`dev migration push failed: ${code}`], `${code}: err`);
      assert.equal(runs.length, 0, `${code}: run never called`);
      const leaked = [...o.outLines, ...o.errLines].filter((l) => l.includes('S3cret'));
      assert.deepEqual(leaked, [], `${code}: no line holds the password`);
    }
  });

  test('EZD-146 U4 CLI failure keeps the password out of the log', async () => {
    const { runDevPush } = await loadDevPush();
    const V = 'postgresql://postgres.stubref:Pw123abc@example.invalid:5432/postgres';
    const { run } = recorder({
      code: 1,
      stdout: '',
      stderr: 'Connecting to remote database...\nfailed to connect: ' + V + '\nhint Pw123abc\n',
    });
    const o = lines();
    const code = await runDevPush({ env: { SUPABASE_DEV_DB_URL: V }, root: '/r', run, out: o.out, err: o.err });
    assert.equal(code, 1, 'returns 1');
    assert.deepEqual(
      o.errLines,
      [
        'dev migration push failed: supabase db push exited 1',
        '  | Connecting to remote database...',
        '  | failed to connect: postgresql://postgres.stubref:***@example.invalid:5432/postgres',
      ],
      'err lines',
    );
    assert.deepEqual(
      o.errLines.filter((l) => l.includes('Pw123abc')),
      [],
      'no err line holds the password',
    );
    assert.deepEqual(o.outLines, [], 'no out lines');
  });

  test('EZD-146 U5 the percent-encoded password is masked too', async () => {
    const { runDevPush } = await loadDevPush();
    const { run } = recorder({
      code: 1,
      stdout: '',
      stderr: 'Connecting to remote database...\ntoken p%2Fa%25b seen\nplain p/a%b seen\nfailed to connect: ' + ENC + '\n',
    });
    const o = lines();
    const code = await runDevPush({ env: { SUPABASE_DEV_DB_URL: ENC }, root: '/r', run, out: o.out, err: o.err });
    assert.equal(code, 1, 'returns 1');
    assert.deepEqual(
      o.errLines,
      [
        'dev migration push failed: supabase db push exited 1',
        '  | Connecting to remote database...',
        '  | failed to connect: postgresql://postgres.prodref123:***@h.example:5432/postgres',
      ],
      'err lines',
    );
    assert.deepEqual(
      o.errLines.filter((l) => l.includes('p%2Fa%25b') || l.includes('p/a%b')),
      [],
      'no err line holds either form of the password',
    );
    assert.deepEqual(o.outLines, [], 'no out lines');
  });

  test('EZD-146 U6 the child env never carries SUPABASE_DEV_DB_URL', async () => {
    const { runDevPush } = await loadDevPush();
    const had = Object.prototype.hasOwnProperty.call(process.env, 'SUPABASE_DEV_DB_URL');
    const saved = process.env.SUPABASE_DEV_DB_URL;
    process.env.SUPABASE_DEV_DB_URL = U;
    try {
      const { runs, run } = recorder();
      const o = lines();
      const codeA = await runDevPush({ env: process.env, root: '/r', run, out: o.out, err: o.err });
      const codeB = await runDevPush({ env: { SUPABASE_DEV_DB_URL: U }, root: '/r', run, out: o.out, err: o.err });
      assert.equal(codeA, 0, 'env: process.env resolves 0');
      assert.equal(codeB, 0, 'injected env resolves 0');
      assert.equal(runs.length, 2, 'two runs');
      runs.forEach((r, i) => {
        assert.equal('SUPABASE_DEV_DB_URL' in r.opts.env, false, `run ${i + 1} has no SUPABASE_DEV_DB_URL`);
        assert.equal(r.opts.env.PGPASSWORD === 'S3cret', true, `run ${i + 1} PGPASSWORD`);
        const holders = Object.keys(r.opts.env).filter((k) => String(r.opts.env[k]).includes('S3cret'));
        assert.deepEqual(holders, ['PGPASSWORD'], `run ${i + 1} only PGPASSWORD holds the password`);
      });
    } finally {
      if (had) process.env.SUPABASE_DEV_DB_URL = saved;
      else delete process.env.SUPABASE_DEV_DB_URL;
    }
  });
});
