// EZD-1704 U1-U6, C1-C13, S1, L1, L2 (vault/plans/EZD-1704.md section 4; Interface contract section 3; section 1 step
// order and D1-D18). The backup check: pure currency rule, the CLI with fake dependencies (no Docker), the
// scripts and docs text, and two rows on the local stack (Docker, only in scope). Expected values come from the
// plan's table (Q-0232: files < 26 h, dump < 8 days; Q-0112 finding 2; Q-0113), never from running code.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DB_DUMP_MAX_AGE_MS,
  FILES_MAX_AGE_MS,
  evaluateBackupCurrency,
  runCheckCli,
} from '../check.mjs';
import { createSource } from '../source.mjs';
import { REPO_ROOT, exec, inScope, query, runCli, stackStatus } from './local-fixture.mjs';

const T0 = new Date('2026-11-10T12:00:00.000Z');
const ago = (ms) => new Date(T0.getTime() - ms);
const SECRET = 'pw-EZD1704';
const DB_URL = `postgres://u:${SECRET}@h/db`;
const read = (...p) => readFileSync(path.join(REPO_ROOT, ...p), 'utf8');

describe('EZD-1704 backup check', () => {
  // ---- U: the currency rule ---------------------------------------------------------------------------------
  test('EZD-1704 U1 constants (Q-0232)', () => {
    assert.equal(FILES_MAX_AGE_MS, 93_600_000);
    assert.equal(DB_DUMP_MAX_AGE_MS, 691_200_000);
  });

  test('EZD-1704 U2 both current', () => {
    assert.deepEqual(
      evaluateBackupCurrency({
        filesSucceededAt: ago(93_599_000),
        dbDumpSucceededAt: ago(691_199_000),
        now: T0,
      }),
      { ok: true, stale: [] },
    );
  });

  test('EZD-1704 U3 files boundary: exactly 26 h and older is stale', () => {
    for (const age of [93_600_000, 93_601_000]) {
      assert.deepEqual(
        evaluateBackupCurrency({
          filesSucceededAt: ago(age),
          dbDumpSucceededAt: ago(1_000),
          now: T0,
        }),
        { ok: false, stale: ['files_stale'] },
        `files age ${age}`,
      );
    }
  });

  test('EZD-1704 U4 dump boundary: exactly 8 days and older is stale', () => {
    for (const age of [691_200_000, 691_201_000]) {
      assert.deepEqual(
        evaluateBackupCurrency({
          filesSucceededAt: ago(1_000),
          dbDumpSucceededAt: ago(age),
          now: T0,
        }),
        { ok: false, stale: ['db_dump_stale'] },
        `dump age ${age}`,
      );
    }
  });

  test('EZD-1704 U5 never ran', () => {
    const cur = ago(1_000);
    assert.deepEqual(
      evaluateBackupCurrency({ filesSucceededAt: null, dbDumpSucceededAt: cur, now: T0 }).stale,
      ['files_stale'],
    );
    assert.deepEqual(
      evaluateBackupCurrency({ filesSucceededAt: cur, dbDumpSucceededAt: null, now: T0 }).stale,
      ['db_dump_stale'],
    );
    assert.deepEqual(
      evaluateBackupCurrency({ filesSucceededAt: null, dbDumpSucceededAt: null, now: T0 }).stale,
      ['files_stale', 'db_dump_stale'],
    );
  });

  test('EZD-1704 U6 a time in the future is current', () => {
    const f = new Date(T0.getTime() + 60_000);
    assert.deepEqual(
      evaluateBackupCurrency({ filesSucceededAt: f, dbDumpSucceededAt: f, now: T0 }),
      { ok: true, stale: [] },
    );
  });

  // ---- C: the CLI with fakes --------------------------------------------------------------------------------
  /** Fake dependencies; `calls` records what the CLI touched. */
  function fakes(over = {}) {
    const calls = { lastSucceededAt: [], close: 0, makeSource: 0, loadEnvFile: 0, loadConfig: [], github: [] };
    const out = [];
    const files = 'files' in over ? over.files : ago(3_600_000);
    const dump = 'dump' in over ? over.dump : ago(86_400_000);
    const deps = {
      loadEnvFile:
        over.loadEnvFile ??
        ((p) => {
          calls.loadEnvFile += 1;
          return { BACKUP_SOURCE_DB_URL: DB_URL };
        }),
      loadConfig:
        over.loadConfig ??
        ((env, opts) => {
          calls.loadConfig.push([env, opts]);
          return { sourceDbUrl: DB_URL };
        }),
      makeSource: () => {
        calls.makeSource += 1;
        return {
          async lastSucceededAt(kind, scope) {
            calls.lastSucceededAt.push([kind, scope]);
            if (over.reject) throw over.reject;
            return kind === 'files' ? files : dump;
          },
          async close() {
            calls.close += 1;
          },
        };
      },
      now: () => T0,
      stdout: (line) => out.push(line),
      github: {
        async environmentBranchRule(name) {
          calls.github.push(name);
          return over.rule ?? null;
        },
      },
      repoRoot: REPO_ROOT,
    };
    if (over.loadEnvFile) {
      const inner = over.loadEnvFile;
      deps.loadEnvFile = (p) => {
        calls.loadEnvFile += 1;
        return inner(p);
      };
    }
    return { deps, calls, out };
  }
  const run = (argv, processEnv, isTTY, f) => runCheckCli({ argv, processEnv, isTTY }, f.deps);
  const lastLine = (f) => JSON.parse(f.out.at(-1));
  const refusal = (code) => ({
    ok: false,
    kind: 'backup_check',
    code,
    stale: [],
    files_succeeded_at: null,
    db_dump_succeeded_at: null,
  });
  const GOOD_RULE = {
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    can_admins_bypass: false,
    branch_policies: [{ name: 'main', type: 'branch' }],
  };
  const ACTIONS = { GITHUB_ACTIONS: 'true', GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' };
  const C1_RESULT = {
    ok: true,
    kind: 'backup_check',
    stale: [],
    files_succeeded_at: '2026-11-10T11:00:00.000Z',
    db_dump_succeeded_at: '2026-11-09T12:00:00.000Z',
  };

  test('EZD-1704 C1 current run', async () => {
    const f = fakes();
    const r = await run(['--local'], {}, false, f);
    assert.equal(r.exitCode, 0);
    assert.equal(f.out.length, 1);
    assert.deepEqual(JSON.parse(f.out[0]), C1_RESULT);
    assert.equal('code' in JSON.parse(f.out[0]), false);
    assert.deepEqual(r.result, C1_RESULT);
    assert.equal(f.calls.close, 1);
  });

  test('EZD-1704 C2 stale run', async () => {
    const f = fakes({ files: ago(100_000_000) });
    const r = await run(['--local'], {}, false, f);
    assert.equal(r.exitCode, 1);
    const line = lastLine(f);
    assert.equal(line.ok, false);
    assert.equal(line.code, 'backup_stale');
    assert.deepEqual(line.stale, ['files_stale']);
    assert.equal(line.files_succeeded_at, ago(100_000_000).toISOString());
  });

  test('EZD-1704 C3 scopes', async () => {
    const f1 = fakes();
    await run(['--local', '--only-bucket', 'b2', '--only-bucket', 'a1'], {}, false, f1);
    assert.deepEqual(f1.calls.lastSucceededAt, [
      ['files', 'buckets:a1,b2'],
      ['db_dump', 'all'],
    ]);
    const f2 = fakes();
    await run(['--local'], {}, false, f2);
    assert.deepEqual(f2.calls.lastSucceededAt, [
      ['files', 'all'],
      ['db_dump', 'all'],
    ]);
  });

  test('EZD-1704 C4 usage', async () => {
    for (const argv of [['--nope'], ['--local', '--env-file', '/abs/x.env'], ['--only-bucket']]) {
      const f = fakes();
      const r = await run(argv, {}, false, f);
      assert.equal(r.exitCode, 1, argv.join(' '));
      assert.deepEqual(lastLine(f), refusal('usage'), argv.join(' '));
      assert.equal(f.calls.makeSource, 0);
      assert.equal(f.calls.loadEnvFile, 0);
    }
  });

  test('EZD-1704 C5 guards', async () => {
    const cases = [
      ['agent_refused', ['--env-file', '/outside/restore.env'], { CLAUDECODE: '1' }, true],
      ['ci_refused', ['--env-file', '/outside/restore.env'], { CI: 'true' }, true],
      ['tty_required', ['--env-file', '/outside/restore.env'], {}, false],
      ['env_file_not_absolute', ['--env-file', 'restore.env'], {}, true],
      ['env_file_in_repo', ['--env-file', path.join(REPO_ROOT, 'x.env')], {}, true],
    ];
    for (const [code, argv, env, tty] of cases) {
      const f = fakes();
      const r = await run(argv, env, tty, f);
      assert.equal(r.exitCode, 1, code);
      assert.equal(lastLine(f).code, code);
      assert.equal(f.calls.loadEnvFile, 0, code);
      assert.equal(f.calls.makeSource, 0, code);
    }
  });

  test('EZD-1704 C6 env file', async () => {
    const f = fakes();
    const r = await run(['--env-file', '/outside/restore.env'], {}, true, f);
    assert.equal(r.exitCode, 0);
    assert.deepEqual(f.calls.loadConfig, [
      [{ BACKUP_SOURCE_DB_URL: DB_URL }, { kind: 'db', local: false }],
    ]);
    const g = fakes({
      loadEnvFile: () => {
        throw new Error('cannot read');
      },
    });
    const r2 = await run(['--env-file', '/outside/restore.env'], {}, true, g);
    assert.equal(r2.exitCode, 1);
    assert.equal(lastLine(g).code, 'env_file_unreadable');
    assert.equal(g.calls.makeSource, 0);
  });

  test('EZD-1704 C7 env missing', async () => {
    for (const env of [{}, { BACKUP_SOURCE_DB_URL: '  ' }]) {
      const f = fakes();
      const r = await run([], env, false, f);
      assert.equal(r.exitCode, 1);
      assert.equal(lastLine(f).code, 'env_missing');
      assert.equal(f.calls.makeSource, 0);
    }
  });

  test('EZD-1704 C8 source error', async () => {
    const f = fakes({ reject: new Error(`connect ECONNREFUSED ${DB_URL}`) });
    const r = await run(['--local'], {}, false, f);
    assert.equal(r.exitCode, 1);
    assert.equal(lastLine(f).code, 'source_unavailable');
    assert.equal(f.calls.close, 1);
    const text = f.out.join('\n');
    assert.equal(text.includes(SECRET), false);
    assert.equal(text.includes('postgres://'), false);
  });

  test('EZD-1704 C10 unexpected error', async () => {
    const f = fakes({
      loadConfig: () => {
        throw new Error('boom');
      },
    });
    const r = await run(['--local'], {}, false, f);
    assert.equal(r.exitCode, 1);
    assert.equal(f.out.length, 1);
    assert.equal(lastLine(f).code, 'internal_error');
    assert.equal(f.calls.makeSource, 0);
  });

  test('EZD-1704 C11 not configured in Actions', async () => {
    const f = fakes({ rule: GOOD_RULE });
    const r = await run([], { ...ACTIONS }, false, f);
    assert.equal(r.exitCode, 0);
    assert.equal(f.out.length, 1);
    assert.deepEqual(JSON.parse(f.out[0]), refusal('not_configured'));
    assert.equal(f.calls.github.length, 0);
    assert.equal(f.calls.makeSource, 0);
    assert.equal(f.calls.loadEnvFile, 0);
  });

  test('EZD-1704 C12 environment unprotected', async () => {
    const rules = [
      null,
      { deployment_branch_policy: null, can_admins_bypass: false, branch_policies: [] },
      {
        deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
        can_admins_bypass: true,
        branch_policies: [{ name: 'main', type: 'branch' }],
      },
    ];
    for (const rule of rules) {
      const f = fakes({ rule });
      const r = await run([], { ...ACTIONS, BACKUP_SOURCE_DB_URL: DB_URL }, false, f);
      assert.equal(r.exitCode, 1);
      assert.equal(lastLine(f).code, 'environment_unprotected');
      assert.equal(f.calls.makeSource, 0);
      assert.deepEqual(f.calls.github, ['release']);
      assert.equal(f.out.join('\n').includes(SECRET), false);
    }
  });

  test('EZD-1704 C13 Actions with the rule in place', async () => {
    const f = fakes({ rule: GOOD_RULE });
    const r = await run([], { ...ACTIONS, BACKUP_SOURCE_DB_URL: DB_URL }, false, f);
    assert.equal(r.exitCode, 0);
    assert.deepEqual(JSON.parse(f.out[0]), C1_RESULT);
    assert.deepEqual(f.calls.github, ['release']);
    const g = fakes({ rule: GOOD_RULE });
    await run(['--local'], {}, false, g);
    assert.equal(g.calls.github.length, 0);
  });

  test('EZD-1704 C9 one line, no secret', async () => {
    const scenarios = [
      [['--local'], {}, false, {}],
      [['--local'], {}, false, { files: ago(100_000_000) }],
      [['--local'], {}, false, { reject: new Error(`x ${DB_URL}`) }],
      [[], { ...ACTIONS }, false, { rule: GOOD_RULE }],
      [[], { ...ACTIONS, BACKUP_SOURCE_DB_URL: DB_URL }, false, { rule: null }],
    ];
    for (const [argv, env, tty, over] of scenarios) {
      const f = fakes(over);
      await run(argv, env, tty, f);
      assert.equal(f.out.length, 1, 'exactly one line');
      assert.equal(f.out[0].includes(SECRET), false);
    }
  });

  // ---- S1: script and docs ----------------------------------------------------------------------------------
  const section = (text, heading) => {
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex((l) => l.trim() === heading);
    if (start < 0) return null;
    const level = heading.match(/^#+/)[0].length;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      const m = /^(#+)\s/.exec(lines[i]);
      if (m && m[1].length <= level) {
        end = i;
        break;
      }
    }
    return lines.slice(start, end).join('\n');
  };

  test('EZD-1704 S1 script and docs', () => {
    assert.equal(JSON.parse(read('package.json')).scripts['backup:check'], 'node scripts/backup/check.mjs');
    const arch = read('docs', 'architecture.md');
    const off = section(arch, '### Off-site backups and restore (EZD-025)');
    assert.ok(off, 'architecture off-site section');
    for (const s of ['backup:check', '26 hours', '8 days', 'backup-check.yml', '0 10 * * *']) {
      assert.ok(off.includes(s), `architecture off-site section names ${s}`);
    }
    const ci = section(arch, '### CI');
    assert.ok(ci, 'architecture CI section');
    const at = ci.indexOf('may name `release`');
    assert.ok(at > 0, 'CI section has the may-name sentence');
    const sentenceStart = Math.max(ci.lastIndexOf('. ', at), ci.lastIndexOf('- ', at));
    assert.ok(ci.slice(sentenceStart, at).includes('backup-check.yml'), 'backup-check.yml in the sentence');

    const rb = read('docs', 'runbook.md');
    const drill = section(rb, '### 3. The drill');
    assert.ok(drill, 'runbook drill section');
    assert.ok(
      drill.split(/\r?\n/).some((l) => l.startsWith('4. **Check the backups are current.**')),
      'drill step 4',
    );
    for (const s of ['pnpm backup:check --env-file', 'files_stale', 'db_dump_stale', '26 hours', '8 days']) {
      assert.ok(drill.includes(s), `drill section names ${s}`);
    }
    const notes = section(rb, '### 5. Notes');
    assert.ok(notes, 'runbook notes section');
    assert.ok(notes.includes('Off-site backup: check'), 'notes name the workflow');
  });
});

// ---- L: the local stack (Docker) ------------------------------------------------------------------------------
describe(
  'EZD-1704 backup check on the local stack',
  { skip: !inScope('EZD-1704') },
  () => {
    const hex = () => randomUUID().replace(/-/g, '').slice(0, 8);
    const insertRow = (scope, status, interval, kind = 'files') =>
      exec(
        `insert into public.backup_run (kind, scope, status, started_at, finished_at)
         values ('${kind}', '${scope}', '${status}',
           date_trunc('milliseconds', now() - interval '${interval}'),
           date_trunc('milliseconds', now() - interval '${interval}'));`,
      );
    const iso = (sql) =>
      query(
        `select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as v from (${sql}) s(t)`,
      )[0].v;

    after(() => {
      exec("delete from public.backup_run where scope like 'buckets:ezd1704-%';");
    });

    test('EZD-1704 L1 stale on the local stack', async () => {
      const id = `ezd1704-${hex()}`;
      const scope = `buckets:${id}`;
      insertRow(scope, 'succeeded', '27 hours');
      const r = await runCli('scripts/backup/check.mjs', ['--local', '--only-bucket', id], {
        GITHUB_ACTIONS: '',
      });
      assert.equal(r.code, 1);
      assert.equal(r.last?.code, 'backup_stale');
      assert.ok(r.last.stale.includes('files_stale'));
      const expected = iso(
        `select finished_at from public.backup_run where scope = '${scope}' and kind = 'files'`,
      );
      assert.equal(r.last.files_succeeded_at, expected);
    });

    test('EZD-1704 L2 newest succeeded', async () => {
      const id = `ezd1704-${hex()}`;
      const scope = `buckets:${id}`;
      insertRow(scope, 'succeeded', '3 hours');
      insertRow(scope, 'succeeded', '30 hours');
      insertRow(scope, 'failed', '1 hour');
      const source = createSource({ dbUrl: stackStatus().dbUrl });
      try {
        const got = await source.lastSucceededAt('files', scope);
        const expected = iso(
          `select finished_at from public.backup_run where scope = '${scope}' and status = 'succeeded'
           order by started_at desc limit 1`,
        );
        assert.ok(got instanceof Date);
        assert.equal(got.toISOString(), expected);
        assert.equal(await source.lastSucceededAt('files', 'buckets:ezd1704-none'), null);
      } finally {
        await source.close();
      }
    });
  },
);
