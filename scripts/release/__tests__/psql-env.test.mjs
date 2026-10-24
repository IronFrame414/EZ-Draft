// EZD-041 T1-T6 (vault/plans/EZD-041.md section 4). node:test, Node 22 built-ins only.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const loadBootstrap = () => import('../bootstrap.mjs');
const loadPush = () => import('../push.mjs');

const U = 'postgresql://postgres.prodref123:S3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const U_ENV = {
  PGHOST: 'aws-0-us-east-1.pooler.supabase.com',
  PGPORT: '5432',
  PGUSER: 'postgres.prodref123',
  PGPASSWORD: 'S3cret',
  PGDATABASE: 'postgres',
};
const ARGS = ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A'];
const TIMEOUT_ENV = { ...U_ENV, PGOPTIONS: '-c lock_timeout=5s -c statement_timeout=300s' };

const errState = (e) =>
  JSON.stringify(e, Object.getOwnPropertyNames(e).filter((k) => k !== 'stack')) + e.message;

async function withEnv(patch, fn) {
  const old = {};
  for (const k of Object.keys(patch)) old[k] = process.env[k];
  Object.assign(process.env, patch);
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(patch)) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
}

describe('EZD-041 psql connection through the environment', () => {
  test('EZD-041 T1 invocation', async () => {
    const bs = await loadBootstrap();
    const a = bs.buildPsqlInvocation({ dbUrl: U });
    assert.deepStrictEqual(a, { command: 'psql', args: ARGS, env: U_ENV });
    for (const el of a.args) {
      for (const bad of ['S3cret', 'postgresql://', 'prodref123', 'pooler']) {
        assert.ok(!el.includes(bad), `${el} contains ${bad}`);
      }
    }
    assert.ok(Object.isFrozen(bs.PSQL_ARGS));
    assert.deepStrictEqual([...bs.PSQL_ARGS], ARGS);
    const b = bs.buildPsqlInvocation({ dbUrl: U });
    assert.notStrictEqual(a.args, b.args);
  });

  test('EZD-041 T2 decoding and query', async () => {
    const bs = await loadBootstrap();
    const { withTimeouts } = await loadPush();
    assert.deepStrictEqual(
      bs.pgEnvFromUrl(
        'postgresql://postgres.prodref123:p%40ss%2Fw%25rd@Host.Example:6543/my%20db?sslmode=require&application_name=a+b',
      ),
      {
        PGHOST: 'Host.Example',
        PGPORT: '6543',
        PGUSER: 'postgres.prodref123',
        PGPASSWORD: 'p@ss/w%rd',
        PGDATABASE: 'my db',
        PGSSLMODE: 'require',
        PGAPPNAME: 'a+b',
      },
    );
    assert.deepStrictEqual(bs.pgEnvFromUrl(withTimeouts(U)), TIMEOUT_ENV);
    assert.deepStrictEqual(bs.PG_QUERY_ENV, {
      options: 'PGOPTIONS',
      sslmode: 'PGSSLMODE',
      sslrootcert: 'PGSSLROOTCERT',
      application_name: 'PGAPPNAME',
      connect_timeout: 'PGCONNECT_TIMEOUT',
      target_session_attrs: 'PGTARGETSESSIONATTRS',
    });
  });

  test('EZD-041 T3 defaults and hosts', async () => {
    const bs = await loadBootstrap();
    assert.deepStrictEqual(bs.pgEnvFromUrl('postgres://u@h'), { PGHOST: 'h', PGUSER: 'u' });
    assert.deepStrictEqual(bs.pgEnvFromUrl('postgresql://u:p@[::1]:5432/d'), {
      PGHOST: '::1',
      PGPORT: '5432',
      PGUSER: 'u',
      PGPASSWORD: 'p',
      PGDATABASE: 'd',
    });
  });

  test('EZD-041 T4 refusals', async () => {
    const bs = await loadBootstrap();
    const bad = [
      undefined,
      '',
      'not a url',
      'mysql://u:S3cret@h/d',
      'postgresql:///d',
      'postgresql://u:S3cret@:5432/d',
      'postgresql://u:S3cret@h1:5432,h2:5432/d',
      `${U}#x`,
      `${U}?foo=1`,
      `${U}?password=S3cret`,
      `${U}?host=h2`,
      `${U}?sslmode=require&sslmode=disable`,
      `${U}?sslmode`,
      `${U}?sslmode=`,
      'postgresql://u:%zz@h/d',
    ];
    const check = (fn, label) => {
      let err;
      try {
        fn();
      } catch (e) {
        err = e;
      }
      assert.ok(err instanceof Error, `${label} should throw`);
      assert.equal(err.message, 'db_url_invalid', label);
      assert.equal(err.code, 'db_url_invalid', label);
      const st = errState(err);
      assert.ok(!st.includes('S3cret') && !st.includes('%zz'), `${label} leaks`);
      assert.ok(!('cause' in err), `${label} has cause`);
    };
    for (const u of bad) check(() => bs.pgEnvFromUrl(u), String(u));
    check(() => bs.buildPsqlInvocation({ dbUrl: 'mysql://u:S3cret@h/d' }), 'buildPsqlInvocation');
  });

  test('EZD-041 T5 wrapper over a recording run', async () => {
    const bs = await loadBootstrap();
    const { withTimeouts } = await loadPush();
    await withEnv(
      {
        PGSERVICE: 'leak',
        PGHOSTADDR: '10.0.0.9',
        PGPASSFILE: '/tmp/x',
        BACKUP_SOURCE_DB_URL: U,
        GITHUB_TOKEN: 'ghs_T5',
      },
      async () => {
        const runs = [];
        const run = async (command, args, opts) => {
          runs.push({ command, args, opts });
          return { code: 0, stdout: 'o', stderr: 'e' };
        };
        const sql = bs.createSql({ run });
        const r = await sql('select 1;\n', { dbUrl: withTimeouts(U) });
        assert.deepStrictEqual(r, { stdout: 'o', stderr: 'e' });
        assert.equal(runs.length, 1);
        assert.equal(runs[0].command, 'psql');
        assert.deepStrictEqual(runs[0].args, ARGS);
        assert.equal(runs[0].opts.input, 'select 1;\n');
        const pg = Object.fromEntries(
          Object.entries(runs[0].opts.env).filter(([k]) => k.startsWith('PG')),
        );
        assert.deepStrictEqual(pg, TIMEOUT_ENV);
        assert.ok(!('BACKUP_SOURCE_DB_URL' in runs[0].opts.env));
        assert.ok(!('GITHUB_TOKEN' in runs[0].opts.env));
        await assert.rejects(
          bs.createSql({ run })('select 1;', { dbUrl: 'mysql://u:S3cret@h/d' }),
          (e) => e.code === 'db_url_invalid',
        );
        assert.equal(runs.length, 1);
      },
    );
  });

  test('EZD-041 T6 real child with a fake psql', async () => {
    const bs = await loadBootstrap();
    const { withTimeouts } = await loadPush();
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd041-'));
    try {
      writeFileSync(
        path.join(dir, 'fake-psql.mjs'),
        `let stdin = '';
process.stdin.setEncoding('utf8');
for await (const c of process.stdin) stdin += c;
const pg = Object.entries(process.env).filter(([k]) => k.startsWith('PG'));
process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), pg: Object.fromEntries(pg), hasSourceUrl: 'BACKUP_SOURCE_DB_URL' in process.env, stdin }));
`,
      );
      const shim = path.join(dir, 'psql');
      writeFileSync(
        shim,
        `#!/bin/sh\nexec "${process.execPath}" "${path.join(dir, 'fake-psql.mjs')}" "$@"\n`,
      );
      chmodSync(shim, 0o755);
      await withEnv(
        {
          PATH: dir + path.delimiter + process.env.PATH,
          PGSERVICE: 'leak',
          BACKUP_SOURCE_DB_URL: U,
        },
        async () => {
          const r = await bs.createSql()('select 1;\n', { dbUrl: withTimeouts(U) });
          const out = JSON.parse(r.stdout);
          assert.deepStrictEqual(out.argv, ARGS);
          const joined = out.argv.join(' ');
          assert.ok(!joined.includes('S3cret') && !joined.includes('postgresql://'));
          assert.deepStrictEqual(out.pg, TIMEOUT_ENV);
          assert.equal(out.hasSourceUrl, false);
          assert.equal(out.stdin, 'select 1;\n');
        },
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
