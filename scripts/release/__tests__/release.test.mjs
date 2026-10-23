// EZD-023b T1, T3, T4 (git cases), T5 (vault/plans/EZD-023b.md section 4). node:test, Node 22 built-ins only.
// Fixture `R` and the `CLEAN` fakes live here so parts c–e can extend them (archived plan "Split proposal").
// `git` is real, against a bare `origin` over file:// (EZD-023a git-fixture.mjs); nothing reaches the network.
// The CLI is started through process.execPath (finding V13). Expected codes, lists and summary lines come from
// the plan's Tests table (Step 1, Step 4, section 6) and the ticket's Done when (AC-EZD-023b-1, -2, -3).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, makeRepo, git, commitFiles, tagAnnotated } from './git-fixture.mjs';

const loadRelease = () => import('../release.mjs');
const loadContext = () => import('../context.mjs');
const RELEASE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'release', 'release.mjs');

// Step 1 lists (the test keeps its own copy so the exported arrays are checked, not trusted).
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
const ENV_REQUIRED_NAMES_EXPECTED = [
  'GITHUB_TOKEN',
  'VERCEL_TOKEN',
  'VERCEL_PROJECT_ID',
  'VERCEL_TEAM_ID',
  'BACKUP_SOURCE_DB_URL',
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_REGION',
  'BACKUP_S3_BUCKET',
  'RELEASE_S3_ACCESS_KEY_ID',
  'RELEASE_S3_SECRET_ACCESS_KEY',
];

// Section 6 wording.
const NOT_CONFIGURED_LINE = 'production not configured — nothing released';
const stoppedLine = (code) => `release stopped: ${code} — nothing changed`;
const missingLine = (names) => `missing in the release environment: ${names.join(', ')}`;

// ---------------------------------------------------------------------------------------------------------------
// Fixture R (section 4): C1, C2 on main, pushed to origin. `tagC1` puts an annotated `phase-0` on C1 (T3).
// ---------------------------------------------------------------------------------------------------------------
const C1_FILES = {
  'supabase/migrations/20261101000000_create_fixture.sql':
    'create table public.fixture_item (id uuid primary key, legacy_note text);\n',
  'supabase/retired.json': '{"retired":[]}\n',
  '.env.example': 'NEXT_PUBLIC_SUPABASE_URL=\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\nSUPABASE_SECRET_KEY=\n',
  'supabase/bootstrap/tenant-1.sql':
    "do $$ declare owner_email text := 'PASTE-YOUR-EMAIL-HERE'; begin raise notice 'ezd_bootstrap_done'; end $$;\n",
};
const C2_FILES = {
  'supabase/migrations/20261102000000_add_note.sql':
    'alter table public.fixture_item add column new_note text;\n',
};
// Not the helper's DROP_NAME, which shares C2's version (finding V2).
const DROP_FILES = {
  'supabase/migrations/20261103000000_drop_legacy_note.sql':
    'alter table public.fixture_item drop column legacy_note;\n',
};

function makeR(t, { tagC1 = false } = {}) {
  const repo = makeRepo();
  t.after(() => repo.cleanup());
  const c1 = commitFiles(repo.work, C1_FILES, 'C1 fixture');
  if (tagC1) tagAnnotated(repo.work, 'phase-0');
  const c2 = commitFiles(repo.work, C2_FILES, 'C2 add note');
  git(repo.work, 'push', '-q', 'origin', 'main');
  if (tagC1) git(repo.work, 'push', '-q', 'origin', 'phase-0');
  return { ...repo, c1, c2, tip: c2 };
}

// ---------------------------------------------------------------------------------------------------------------
// CLEAN fakes (section 4).
// ---------------------------------------------------------------------------------------------------------------
const CLEAN_DB_URL = 'postgresql://postgres.prodref123:S3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres';

function cleanEnv(tip) {
  return {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: tip,
    GITHUB_TOKEN: 'ghs_TEST',
    VERCEL_TOKEN: 'tok_TEST',
    VERCEL_PROJECT_ID: 'prj_TEST',
    VERCEL_TEAM_ID: 'team_TEST',
    BACKUP_SOURCE_DB_URL: CLEAN_DB_URL,
    BACKUP_S3_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
    BACKUP_S3_REGION: 'us-west-004',
    BACKUP_S3_BUCKET: 'ezd-test',
    RELEASE_S3_ACCESS_KEY_ID: 'relkey_TEST',
    RELEASE_S3_SECRET_ACCESS_KEY: 'rel-secret-TEST',
    TENANT1_OWNER_EMAIL: 'owner.test@example.com',
  };
}

const cleanPull = (tip) => ({
  number: 7,
  title: 'Phase 0: Setup',
  merged_at: '2026-10-19T12:00:00Z',
  base: { ref: 'main' },
  merge_commit_sha: tip,
});

// The live `release` rule (plan section 2).
const CLEAN_RULE = () => ({
  deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  can_admins_bypass: false,
  branch_policies: [{ name: 'main', type: 'branch' }],
});

/** A fake whose every method call (or direct call) is recorded under `name`. */
function recorder(name, calls) {
  const fn = function () {};
  return new Proxy(fn, {
    get(_t, prop) {
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      return (...args) => {
        calls.push({ target: `${name}.${prop}`, args });
        return Promise.resolve(undefined);
      };
    },
    apply(_t, _this, args) {
      calls.push({ target: name, args });
      return Promise.resolve(undefined);
    },
  });
}

/** `processEnv` as a Proxy recording every key read (T1 (a)–(e)). */
function recordingEnv(obj) {
  const keys = new Set();
  const state = { ownKeysCalled: false };
  const proxy = new Proxy(obj, {
    get(t, k) {
      if (typeof k === 'string') keys.add(k);
      return t[k];
    },
    has(t, k) {
      if (typeof k === 'string') keys.add(k);
      return k in t;
    },
    getOwnPropertyDescriptor(t, k) {
      if (typeof k === 'string') keys.add(k);
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    ownKeys(t) {
      state.ownKeysCalled = true;
      return Reflect.ownKeys(t);
    },
  });
  return { proxy, keys, state };
}

/**
 * Builds CLEAN deps for fixture `R`. `env` replaces the whole processEnv when given as an object; `pulls` and
 * `rule` override the GitHub fake's answers (a function to throw/reject); `recordEnv` wraps processEnv in the
 * recording Proxy.
 */
function makeClean(mod, repo, { env, pulls, rule, recordEnv = false, vercel, sleep, now, createTag } = {}) {
  const tip = repo.tip;
  const journal = []; // { kind: 'log' | 'summary' | 'mask', value }
  const external = []; // vercel, supabase, sql, offsite, checkLive, fetch, github.createTag
  const gitCalls = [];
  const githubCalls = [];
  const baseEnv = env ?? cleanEnv(tip);
  const envRec = recordEnv ? recordingEnv(baseEnv) : null;
  const realGit = mod.createGit(repo.work);
  const pullsAnswer = pulls ?? (() => [cleanPull(tip)]);
  const ruleAnswer = rule ?? CLEAN_RULE;
  const github = {
    async mergedPullsFor(sha) {
      githubCalls.push({ target: 'github.mergedPullsFor', args: [sha] });
      return typeof pullsAnswer === 'function' ? pullsAnswer(sha) : pullsAnswer;
    },
    async environmentBranchRule(name) {
      githubCalls.push({ target: 'github.environmentBranchRule', args: [name] });
      return typeof ruleAnswer === 'function' ? ruleAnswer(name) : ruleAnswer;
    },
    async createTag(...args) {
      githubCalls.push({ target: 'github.createTag', args });
      external.push({ target: 'github.createTag', args });
      if (createTag) return createTag(...args);
      return undefined;
    },
  };
  const deps = {
    processEnv: envRec ? envRec.proxy : baseEnv,
    git: (args) => {
      gitCalls.push(args);
      return realGit(args);
    },
    github,
    log: (line) => journal.push({ kind: 'log', value: String(line) }),
    summary: (line) => journal.push({ kind: 'summary', value: String(line) }),
    mask: (value) => journal.push({ kind: 'mask', value: String(value) }),
    vercel: vercel ?? recorder('vercel', external),
    supabase: recorder('supabase', external),
    sql: recorder('sql', external),
    offsite: recorder('offsite', external),
    checkLive: recorder('checkLive', external),
    fetch: recorder('fetch', external),
    sleep: sleep ?? recorder('sleep', external),
    now: now ?? (() => new Date('2026-10-19T12:00:00Z')),
  };
  const h = {
    deps,
    journal,
    external,
    gitCalls,
    githubCalls,
    envKeys: envRec ? envRec.keys : null,
    envState: envRec ? envRec.state : null,
    logs: () => journal.filter((e) => e.kind === 'log').map((e) => e.value),
    summaries: () => journal.filter((e) => e.kind === 'summary').map((e) => e.value),
    masks: () => journal.filter((e) => e.kind === 'mask').map((e) => e.value),
    output: () => journal.filter((e) => e.kind !== 'mask').map((e) => e.value),
    run: () => mod.runRelease({ root: repo.work }, deps),
  };
  return h;
}

function assertNoExternalEffect(h) {
  assert.deepEqual(
    h.external.map((c) => c.target),
    [],
    'no call to vercel, supabase, sql, offsite, checkLive, fetch or github.createTag',
  );
}
function assertRefused(result, code, h) {
  assert.equal(result.ok, false, `ok is false for ${code}`);
  assert.equal(result.code, code);
  assertNoExternalEffect(h);
}
function assertNoGitGithubMask(h) {
  assert.equal(h.gitCalls.length, 0, '0 git calls');
  assert.equal(h.githubCalls.length, 0, '0 github calls');
  assert.equal(h.masks().length, 0, '0 mask calls');
}

/** Spawns the CLI with `cwd`; env = process.env minus GITHUB_*, CI, CLAUDECODE and the 10 release names, plus `env`. */
function runCli(cwd, env = {}) {
  const base = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' };
  for (const k of Object.keys(base)) if (k.startsWith('GITHUB_')) delete base[k];
  delete base.CI;
  delete base.CLAUDECODE;
  for (const k of RELEASE_SECRET_NAMES_EXPECTED) delete base[k];
  const r = spawnSync(process.execPath, [RELEASE_SCRIPT], {
    cwd,
    encoding: 'utf8',
    env: { ...base, ...env },
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
const lastLine = (s) => s.trimEnd().split(/\r?\n/).at(-1);

// ---------------------------------------------------------------------------------------------------------------
describe('EZD-023b release guards and naming', () => {
  // T1 ---------------------------------------------------------------------------------------------------------
  test('EZD-023b done when: the release refuses anything but the newest merged pull request on main', async (t) => {
    const mod = await loadRelease();
    const R = makeR(t);

    // (a)–(e): context guards; processEnv is a recording Proxy; no secret name may be read (AC-EZD-023b-2).
    const contextCases = [
      ['a', (e) => ({ ...e, GITHUB_REF: 'refs/heads/develop' }), 'not_main'],
      ['b', (e) => ({ ...e, GITHUB_EVENT_NAME: 'workflow_dispatch' }), 'wrong_event'],
      ['c', (e) => ({ ...e, GITHUB_EVENT_NAME: 'pull_request' }), 'wrong_event'],
      [
        'd',
        (e) => {
          const c = { ...e };
          delete c.GITHUB_ACTIONS;
          return c;
        },
        'not_in_actions',
      ],
      ['e', (e) => ({ ...e, CLAUDECODE: '1' }), 'agent_refused'],
    ];
    for (const [id, change, code] of contextCases) {
      const h = makeClean(mod, R, { env: change(cleanEnv(R.tip)), recordEnv: true });
      const result = await h.run();
      assertRefused(result, code, h);
      assertNoGitGithubMask(h);
      assert.equal(h.envState.ownKeysCalled, false, `(${id}) ownKeys never called`);
      const read = [...h.envKeys];
      for (const name of [...RELEASE_SECRET_NAMES_EXPECTED, 'GITHUB_TOKEN']) {
        assert.ok(!read.includes(name), `(${id}) ${name} was not read; read: ${read.join(', ')}`);
      }
      if (id === 'a') {
        assert.deepEqual(h.summaries(), [stoppedLine('not_main')], '(a) summary holds exactly the stopped line');
      }
    }

    // (f): GITHUB_SHA = C1 while the tip is C2.
    {
      const h = makeClean(mod, R, { env: { ...cleanEnv(R.tip), GITHUB_SHA: R.c1 } });
      const result = await h.run();
      assertRefused(result, 'not_latest', h);
      assert.equal(h.githubCalls.length, 0, '(f) 0 github calls');
    }

    // (g)–(j): no merged pull request for the tip.
    const prCases = [
      ['g', () => []],
      ['h', () => [{ ...cleanPull(R.tip), merged_at: null }]],
      ['i', () => [{ ...cleanPull(R.tip), base: { ref: 'develop' } }]],
      [
        'j',
        () => {
          throw new Error('GET /commits/x/pulls failed: 502');
        },
      ],
    ];
    for (const [id, pulls] of prCases) {
      const h = makeClean(mod, R, { pulls });
      const result = await h.run();
      assertRefused(result, 'no_merged_pr', h);
      assert.ok(id);
    }

    // (k): origin points at a missing file:// path, so the fetch fails: fail closed.
    {
      const R2 = makeR(t);
      git(R2.work, 'remote', 'set-url', 'origin', 'file:///nonexistent/ezd-023b/missing-origin.git');
      const h = makeClean(mod, R2);
      const result = await h.run();
      assertRefused(result, 'not_latest', h);
      assert.equal(h.githubCalls.length, 0, '(k) 0 github calls');
    }

    // CLI outside GitHub Actions.
    {
      const r = runCli(R.work);
      assert.equal(r.status, 1, `CLI exit 1\n${r.stdout}${r.stderr}`);
      assert.equal(lastLine(r.stdout), 'release not_in_actions');
    }
  });

  // T3 ---------------------------------------------------------------------------------------------------------
  test('EZD-023b T3 unsafe migration: a drop the released tag still reads is refused', async (t) => {
    const mod = await loadRelease();
    const R = makeR(t, { tagC1: true });
    const c3 = commitFiles(R.work, DROP_FILES, 'C3 drop legacy note');
    git(R.work, 'push', '-q', 'origin', 'main');
    R.tip = c3;
    const h = makeClean(mod, R, { pulls: () => [{ ...cleanPull(c3), title: 'Phase 1: x' }] });
    const result = await h.run();
    assertRefused(result, 'migration_check_failed', h);
    const logs = h.logs();
    assert.ok(
      logs.some((l) => l.startsWith('[M1]')),
      `a log line starts with [M1]; logs: ${JSON.stringify(logs)}`,
    );
    assert.ok(
      logs.includes('migration check failed against phase-0: 1 violation(s)'),
      `the summary line of check-migrations is logged; logs: ${JSON.stringify(logs)}`,
    );
  });

  // T4 (git cases) ---------------------------------------------------------------------------------------------
  test('EZD-023b T4 environment rule: anything but main-only without admin bypass is refused', async (t) => {
    const mod = await loadRelease();
    const R = makeR(t);
    const selected = { protected_branches: false, custom_branch_policies: true };
    const MAIN = { name: 'main', type: 'branch' };
    const rules = [
      ['a', { deployment_branch_policy: null, can_admins_bypass: false, branch_policies: [] }],
      [
        'b',
        {
          deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
          can_admins_bypass: false,
          branch_policies: [],
        },
      ],
      [
        'c',
        {
          deployment_branch_policy: selected,
          can_admins_bypass: false,
          branch_policies: [MAIN, { name: 'develop', type: 'branch' }],
        },
      ],
      [
        'd',
        {
          deployment_branch_policy: selected,
          can_admins_bypass: false,
          branch_policies: [MAIN, { name: 'phase-*', type: 'tag' }],
        },
      ],
      ['e', { deployment_branch_policy: selected, can_admins_bypass: true, branch_policies: [MAIN] }],
      ['f', { deployment_branch_policy: selected, branch_policies: [MAIN] }],
      [
        'g',
        () => {
          throw new Error('GET /environments/release failed: 500');
        },
      ],
    ];
    for (const [id, rule] of rules) {
      const h = makeClean(mod, R, { rule });
      const result = await h.run();
      assert.equal(result.code, 'environment_unprotected', `(${id}) code`);
      assertRefused(result, 'environment_unprotected', h);
    }
  });

  // T5 ---------------------------------------------------------------------------------------------------------
  test('EZD-023b T5 not configured, missing secrets and masking', async (t) => {
    const mod = await loadRelease();
    const ctx = await loadContext();
    const R = makeR(t);

    assert.deepEqual([...ctx.RELEASE_SECRET_NAMES], RELEASE_SECRET_NAMES_EXPECTED);
    assert.deepEqual([...ctx.ENV_REQUIRED_NAMES], ENV_REQUIRED_NAMES_EXPECTED);
    assert.ok(Object.isFrozen(ctx.RELEASE_SECRET_NAMES), 'RELEASE_SECRET_NAMES is frozen');
    assert.ok(Object.isFrozen(ctx.ENV_REQUIRED_NAMES), 'ENV_REQUIRED_NAMES is frozen');

    const withoutRelease = (env, { blank = false, keep = [] } = {}) => {
      const e = { ...env };
      for (const n of RELEASE_SECRET_NAMES_EXPECTED) {
        if (keep.includes(n)) continue;
        if (blank) e[n] = '';
        else delete e[n];
      }
      return e;
    };

    // (a), (b): not configured.
    for (const [id, env] of [
      ['a', withoutRelease(cleanEnv(R.tip))],
      ['b', withoutRelease(cleanEnv(R.tip), { blank: true })],
    ]) {
      assert.equal(env.GITHUB_TOKEN, 'ghs_TEST', `(${id}) GITHUB_TOKEN kept`);
      const h = makeClean(mod, R, { env });
      const result = await h.run();
      assert.equal(result.ok, true, `(${id}) ok`);
      assert.equal(result.code, 'not_configured', `(${id}) code`);
      assert.deepEqual(h.summaries(), [NOT_CONFIGURED_LINE], `(${id}) summary`);
      assertNoGitGithubMask(h);
      assertNoExternalEffect(h);
    }

    // (c)–(e): partly configured fails loudly, before any value is used.
    const missingCases = [
      ['c', { ...cleanEnv(R.tip), VERCEL_TEAM_ID: '' }, ['VERCEL_TEAM_ID']],
      [
        'd',
        withoutRelease(cleanEnv(R.tip), { keep: ['TENANT1_OWNER_EMAIL'] }),
        ENV_REQUIRED_NAMES_EXPECTED.slice(1),
      ],
      [
        'e',
        (() => {
          const e = { ...cleanEnv(R.tip) };
          delete e.RELEASE_S3_ACCESS_KEY_ID;
          delete e.RELEASE_S3_SECRET_ACCESS_KEY;
          e.BACKUP_S3_ACCESS_KEY_ID = 'key_TEST';
          e.BACKUP_S3_SECRET_ACCESS_KEY = 'b2-secret-TEST';
          return e;
        })(),
        ['RELEASE_S3_ACCESS_KEY_ID', 'RELEASE_S3_SECRET_ACCESS_KEY'],
      ],
    ];
    for (const [id, env, missing] of missingCases) {
      const h = makeClean(mod, R, { env });
      const result = await h.run();
      assert.equal(result.ok, false, `(${id}) ok is false`);
      assert.equal(result.code, 'env_missing', `(${id}) code`);
      assert.deepEqual(result.missing, missing, `(${id}) missing list`);
      assertNoGitGithubMask(h);
      assertNoExternalEffect(h);
      if (id === 'c') {
        assert.ok(h.summaries().includes(missingLine(['VERCEL_TEAM_ID'])), '(c) summary names the missing name');
      }
    }

    // (f): case (a) through the CLI with a job summary file.
    {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-023b-summary-'));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      const summaryFile = path.join(dir, 'summary.md');
      const r = runCli(R.work, {
        GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'push',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: R.tip,
        GITHUB_TOKEN: 'ghs_TEST',
        GITHUB_STEP_SUMMARY: summaryFile,
      });
      assert.equal(r.status, 0, `(f) CLI exit 0\n${r.stdout}${r.stderr}`);
      assert.equal(lastLine(r.stdout), 'release not_configured');
      const summary = readFileSync(summaryFile, 'utf8');
      assert.ok(summary.includes(NOT_CONFIGURED_LINE), `(f) summary file: ${JSON.stringify(summary)}`);
    }

    // (g): derived values are masked before the first log line, and never printed.
    {
      const encodedUrl =
        'postgresql://postgres.prodref123:p%40ss%2Fx@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
      const h = makeClean(mod, R, {
        env: { ...cleanEnv(R.tip), BACKUP_SOURCE_DB_URL: encodedUrl },
        rule: { deployment_branch_policy: null, can_admins_bypass: false, branch_policies: [] },
      });
      const result = await h.run();
      assertRefused(result, 'environment_unprotected', h);
      const expected = ['p%40ss%2Fx', 'p@ss/x', 'owner.test@example.com'];
      assert.deepEqual(new Set(h.masks()), new Set(expected), '(g) mask set');
      assert.equal(h.masks().length, expected.length, '(g) each value masked once');
      const firstLog = h.journal.findIndex((e) => e.kind === 'log');
      const lastMask = h.journal.map((e) => e.kind).lastIndexOf('mask');
      assert.ok(firstLog === -1 || lastMask < firstLog, '(g) every mask call precedes the first log line');
      for (const line of h.output()) {
        for (const v of expected) assert.ok(!line.includes(v), `(g) output ${JSON.stringify(line)} holds ${v}`);
      }
    }

    // (h): pure mask commands, one per non-empty line.
    assert.deepEqual(ctx.maskCommands('a@b.com\nselect 1'), ['::add-mask::a@b.com', '::add-mask::select 1']);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// EZD-023c (vault/plans/EZD-023c.md section 4): T6, T24, T25.
// ---------------------------------------------------------------------------------------------------------------
const T0 = Date.UTC(2026, 9, 19, 12, 0, 0);
const DAY = 86_400_000;
const CLEAN_PROJECT = () => ({
  autoAssignCustomDomains: false,
  ssoProtection: { deploymentType: 'prod_deployment_urls_and_all_previews' },
  gitForkProtection: true,
});
const ENV_LIST = () => [
  { id: 'env_P_URL', key: 'NEXT_PUBLIC_SUPABASE_URL', target: ['production'], gitBranch: null },
  { id: 'env_V_URL', key: 'NEXT_PUBLIC_SUPABASE_URL', target: ['preview'], gitBranch: null },
  { id: 'env_KEY', key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', target: ['production', 'preview'], gitBranch: null },
  { id: 'env_P_SECRET', key: 'SUPABASE_SECRET_KEY', target: ['production'], gitBranch: null },
  { id: 'env_V_SECRET', key: 'SUPABASE_SECRET_KEY', target: ['preview'], gitBranch: null },
  { id: 'env_V_EMAIL', key: 'EMAIL_TRANSPORT', target: ['preview'], gitBranch: null },
  { id: 'env_V_FROM', key: 'EMAIL_FROM', target: ['preview'], gitBranch: null },
];
const ENV_VALUES = () => ({
  env_P_URL: 'https://prodref123.supabase.co',
  env_V_URL: 'https://devref456.supabase.co',
  env_V_EMAIL: 'stub',
});

/** The passing recording `vercel` fake plus the fake clock. `o` overrides single methods or values. */
function makeVercelFake(external, o = {}) {
  const calls = [];
  const sleeps = [];
  const clock = { t: T0 };
  const rec =
    (name, fn) =>
    async (...args) => {
      calls.push({ name, args });
      return fn(...args);
    };
  const values = { ...ENV_VALUES(), ...(o.values ?? {}) };
  const vercel = {
    getProject: rec('getProject', o.getProject ?? (() => ({ ...CLEAN_PROJECT(), ...(o.project ?? {}) }))),
    tokenInfo: rec('tokenInfo', o.tokenInfo ?? (() => ({ expiresAt: T0 + 60 * DAY, ...(o.token ?? {}) }))),
    findProductionDeployment: rec('findProductionDeployment', o.find ?? (() => ({ id: 'dpl_NEW', state: 'READY' }))),
    currentProductionDeployment: rec('currentProductionDeployment', o.current ?? (() => null)),
    listEnv: rec('listEnv', o.listEnv ?? (() => ENV_LIST().filter((e) => !(o.omitEnv ?? []).includes(e.id)))),
    readEnvValue: rec('readEnvValue', (id) => (id in values ? values[id] : 'NOT-TO-BE-READ')),
    promote: async (...args) => {
      calls.push({ name: 'promote', args });
      external.push({ target: 'vercel.promote', args });
      if (o.promote) return o.promote(...args);
    },
  };
  return {
    vercel,
    calls,
    sleeps,
    now: () => clock.t,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.t += ms;
    },
    count: (name) => calls.filter((c) => c.name === name).length,
  };
}

/** CLEAN extended with the fakes. `o` goes to makeVercelFake; `o.realVercel` replaces the fake `vercel`. */
function makeC(mod, R, o = {}) {
  const h = makeClean(mod, R, { pulls: o.pulls, createTag: o.createTag });
  const f = makeVercelFake(h.external, o);
  h.deps.vercel = o.realVercel ?? f.vercel;
  h.deps.sleep = f.sleep;
  h.deps.now = f.now;
  return { h, f };
}

/** A fake fetch over the real createVercelApi (T6 (d), (e)). */
function vercelFetch({ deployments }) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method ?? 'GET' });
    let body = {};
    if (u.includes('/v7/deployments')) body = { deployments };
    else if (u.includes('/v5/user/tokens/current')) body = { token: { expiresAt: T0 + 60 * DAY } };
    else if (u.includes('/v9/projects/')) body = CLEAN_PROJECT();
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, calls };
}

function assertNoText(h, texts, id) {
  for (const line of h.output()) {
    for (const v of texts) assert.ok(!line.includes(v), `(${id}) output ${JSON.stringify(line)} holds ${v}`);
  }
}

describe('EZD-023c Vercel build and environment checks', () => {
  test("EZD-023c done when: the release accepts only this commit's READY production build with auto-assign off and protection on", async (t) => {
    const mod = await loadRelease();
    const vapi = await import('../vercel-api.mjs');
    const R = makeR(t);
    const SECRETS = ['tok_TEST', 'prj_TEST', 'team_TEST'];

    const refused = (result, code, h, id) => {
      assert.equal(result.ok, false, `(${id}) ok false`);
      assert.equal(result.code, code, `(${id}) code`);
      assertNoExternalEffect(h);
      assertNoText(h, SECRETS, id);
    };

    // (a), (f), (g), (h): refused at the project, before any wait.
    for (const [id, o, code] of [
      ['a', { project: { autoAssignCustomDomains: true } }, 'vercel_auto_assign_on'],
      ['f', { project: { ssoProtection: null } }, 'deployment_protection_off'],
      ['g', { project: { gitForkProtection: false } }, 'deployment_protection_off'],
      [
        'h',
        {
          getProject: () => {
            throw new Error('Vercel GET /v9/projects/{project} failed: 500');
          },
        },
        'vercel_api_failed',
      ],
    ]) {
      const { h, f } = makeC(mod, R, o);
      const result = await h.run();
      refused(result, code, h, id);
      assert.equal(f.count('findProductionDeployment'), 0, `(${id}) 0 find calls`);
      assert.equal(f.count('tokenInfo'), 0, `(${id}) 0 tokenInfo calls`);
      assert.equal(f.count('listEnv'), 0, `(${id}) 0 listEnv calls`);
    }

    // (b): no build ever: 91 calls, 90 sleeps of 10 s.
    {
      const { h, f } = makeC(mod, R, { find: () => null });
      const result = await h.run();
      refused(result, 'no_build', h, 'b');
      assert.equal(f.count('findProductionDeployment'), 91, '(b) 91 find calls');
      assert.deepEqual(f.sleeps, Array(90).fill(10_000), '(b) 90 sleeps of 10000');
      assert.equal(f.count('listEnv'), 0, '(b) 0 listEnv');
    }

    // (c): the tip's build failed.
    {
      const { h, f } = makeC(mod, R, { find: () => ({ id: 'dpl_NEW', state: 'ERROR' }) });
      const result = await h.run();
      refused(result, 'build_failed', h, 'c');
      assert.equal(f.count('findProductionDeployment'), 1, '(c) 1 find call');
      assert.equal(f.count('listEnv'), 0, '(c) 0 listEnv');
    }

    // (d), (e): the real client over a fake fetch; only a production build of this commit counts.
    for (const [id, deployments] of [
      ['d', [{ uid: 'dpl_PREV', target: null, readyState: 'READY', meta: { githubCommitSha: R.tip } }]],
      ['e', [{ uid: 'dpl_C1', target: 'production', readyState: 'READY', meta: { githubCommitSha: R.c1 } }]],
    ]) {
      const ff = vercelFetch({ deployments });
      const api = vapi.createVercelApi({
        token: 'tok_TEST',
        projectId: 'prj_TEST',
        teamId: 'team_TEST',
        fetch: ff.fetch,
      });
      const { h, f } = makeC(mod, R, { realVercel: api });
      const result = await h.run();
      refused(result, 'no_build', h, id);
      const n = ff.calls.filter((c) => c.url.includes('/v7/deployments')).length;
      assert.equal(n, 91, `(${id}) 91 /v7/deployments fetches`);
      assert.ok(
        ff.calls.every((c) => c.method === 'GET'),
        `(${id}) every call is a GET`,
      );
      assert.ok(
        !ff.calls.some((c) => /\/v10\/projects\/[^/]+\/env/.test(c.url)),
        `(${id}) 0 env list calls`,
      );
      assert.ok(!ff.calls.some((c) => c.url.includes('/promote/')), `(${id}) 0 promote calls`);
      assert.equal(f.sleeps.length, 90, `(${id}) 90 sleeps`);
    }
  });

  test('EZD-023c done when: the release refuses Preview values on the production database or without an email mode', async (t) => {
    const mod = await loadRelease();
    const R = makeR(t);
    const PREVIEW_PROD = { values: { env_V_URL: 'https://prodref123.supabase.co' } };
    const prodProblem = [{ code: 'preview_uses_prod', name: 'NEXT_PUBLIC_SUPABASE_URL', target: 'preview' }];
    const emailProblem = [{ code: 'preview_email', name: 'EMAIL_TRANSPORT', target: 'preview' }];
    const NO_VALUES = ['prodref123.supabase.co', 'devref456', 'NOT-TO-BE-READ', 'tok_TEST'];
    const failing = (message) => () => {
      throw new Error(message);
    };

    const cases = [
      ['a', PREVIEW_PROD, prodProblem, []],
      ['b', { omitEnv: ['env_V_EMAIL'] }, emailProblem, []],
      ['c', { values: { env_V_EMAIL: null } }, emailProblem, []],
      ['d', PREVIEW_PROD, prodProblem, [], true],
      ['e', { ...PREVIEW_PROD, token: { expiresAt: T0 + 13 * DAY } }, prodProblem, ['vercel_token_expiring']],
      ['f', { ...PREVIEW_PROD, token: { expiresAt: T0 + 15 * DAY } }, prodProblem, []],
      ['g', { ...PREVIEW_PROD, token: { expiresAt: null } }, prodProblem, ['vercel_token_no_expiry']],
      [
        'h',
        { ...PREVIEW_PROD, tokenInfo: failing('Vercel GET /v5/user/tokens/current failed: 500') },
        prodProblem,
        ['vercel_token_expiry_unknown'],
      ],
    ];
    for (const [id, o, problems, notices, dirty] of cases) {
      if (dirty) appendFileSync(path.join(R.work, '.env.example'), 'EXTRA_NAME=\n');
      const { h, f } = makeC(mod, R, o);
      const result = await h.run();
      assert.equal(result.ok, false, `(${id}) ok false`);
      assert.equal(result.code, 'env_mismatch', `(${id}) code`);
      assert.deepEqual(result.problems, problems, `(${id}) problems`);
      assert.deepEqual(result.notices, notices, `(${id}) notices`);
      assertNoExternalEffect(h);
      assertNoText(h, NO_VALUES, id);
      if (id === 'a') {
        assert.ok(
          h.summaries().includes('Vercel value problem: preview_uses_prod NEXT_PUBLIC_SUPABASE_URL (preview)'),
          '(a) summary line',
        );
        const names = f.calls.map((c) => c.name);
        assert.deepEqual(names, [
          'getProject',
          'tokenInfo',
          'findProductionDeployment',
          'currentProductionDeployment',
          'listEnv',
          'readEnvValue',
          'readEnvValue',
          'readEnvValue',
        ]);
        const reads = f.calls.filter((c) => c.name === 'readEnvValue').map((c) => c.args[0]);
        assert.deepEqual(reads, ['env_P_URL', 'env_V_URL', 'env_V_EMAIL'], '(a) readEnvValue ids in order');
        assert.equal(result.deploymentId, 'dpl_NEW');
        assert.equal(result.previousDeploymentId, null);
        assert.equal(result.alreadyLive, false);
      }
      if (id === 'e') {
        assert.ok(
          h.summaries().some((l) => l.includes('vercel_token_expiring') && l.includes('2026-11-01')),
          '(e) notice summary line with the date',
        );
      }
    }

    // (i): listEnv rejects.
    {
      const { h, f } = makeC(mod, R, { listEnv: failing('Vercel GET /v10/projects/{project}/env failed: 500') });
      const result = await h.run();
      assert.equal(result.ok, false);
      assert.equal(result.code, 'vercel_api_failed');
      assert.equal(f.count('readEnvValue'), 0, '(i) 0 readEnvValue');
      assertNoExternalEffect(h);
      assertNoText(h, NO_VALUES, 'i');
    }
  });

  test('EZD-023c T25 maskCommands escapes percent signs', async () => {
    const ctx = await loadContext();
    assert.deepEqual(ctx.maskCommands('p%40ss%2Fx'), ['::add-mask::p%2540ss%252Fx']);
    assert.deepEqual(ctx.maskCommands('100%\nx%25'), ['::add-mask::100%25', '::add-mask::x%2525']);
    assert.deepEqual(ctx.maskCommands('a@b.com\nselect 1'), ['::add-mask::a@b.com', '::add-mask::select 1']);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// EZD-023d (vault/plans/EZD-023d.md section 4): T25, T10, T11, T9, T27. The part d fakes replace part b's
// recording Proxies for `supabase`, `sql` and `offsite` and push into `h.external`. Expected values come from
// the plan's Tests table (Steps 1–5, section 6), the ticket's Done when (AC-EZD-023d-1, -2, -3) and part c's
// fake clock T0 (prefix `releases/phase-0-20261019T120000Z/`).
// ---------------------------------------------------------------------------------------------------------------
const loadBootstrap = () => import('../bootstrap.mjs');
const DUMP_PREFIX = 'releases/phase-0-20261019T120000Z/';
const OPTIONS_QUERY = 'options=-c%20lock_timeout%3D5s%20-c%20statement_timeout%3D300s';
const AUTH_DATA_EXCLUDES_EXPECTED = [
  'auth.sessions',
  'auth.refresh_tokens',
  'auth.one_time_tokens',
  'auth.flow_state',
];
const DRY_RUN_TEXT =
  'Would push these migrations:\n • 20261101000000_create_fixture.sql\n • 20261102000000_add_note.sql\n';
const FIXTURE_MIGRATIONS = ['20261101000000_create_fixture.sql', '20261102000000_add_note.sql'];
const NO_PLACEHOLDER_BOOTSTRAP = "do $$ begin raise notice 'ezd_bootstrap_done'; end $$;\n";
const BOOTSTRAP_REL = path.join('supabase', 'bootstrap', 'tenant-1.sql');
const sha256Hex = (text) => createHash('sha256').update(text).digest('hex');
const sqlFile = (kind) => `-- ${kind}\n`;

// Section 6 wording.
const DUMP_SAVED_LINE = (prefix) => `database dump saved: ${prefix}`;
const UPLOAD_FAILED_LINE = (prefix) =>
  `release stopped: dump_upload_failed — the database and the live site are unchanged; an incomplete dump may be in ${prefix}`;
const MIGRATE_FAILED_LINE = (prefix) =>
  `release stopped: migrate_failed — the live site is unchanged; the database may be partly updated; the dump from before this release is in ${prefix}`;
const BOOTSTRAP_FAILED_LINE = (prefix) =>
  `release stopped: bootstrap_failed — the live site is unchanged; the database may be partly updated; the dump from before this release is in ${prefix}`;
const OWNER_EMAIL_UNUSED_LINE =
  'notice owner_email_secret_unused: tenant 1 already exists; delete TENANT1_OWNER_EMAIL from the release environment';

/** A rejection shaped like the CLI and psql wrappers' (Step 1, Step 4). */
const childError = (message, stderr, extra = {}) =>
  Object.assign(new Error(message), { exitCode: 1, stdout: '', stderr, ...extra });

/**
 * CLEAN (makeC) plus the part d fakes. `o.tenantCheck`, `o.bootstrap`, `o.pushDryRun`, `o.push`, `o.putFile`,
 * `o.putJson` and `o.dump.<kind>` replace one fake's behaviour (a function; throwing rejects).
 */
function makeD(mod, bs, R, o = {}) {
  const { h, f } = makeC(mod, R, o);
  const ext = h.external;
  const sql = async (text, opts) => {
    ext.push({ target: 'sql', args: [text, opts] });
    if (text === bs.TENANT_CHECK_SQL) {
      return o.tenantCheck ? o.tenantCheck() : { stdout: '0 5000 300000\n', stderr: '' };
    }
    return o.bootstrap ? o.bootstrap() : { stdout: '', stderr: 'NOTICE:  ezd_bootstrap_done\n' };
  };
  const migrationsIn = (workdir) => {
    const dir = path.join(String(workdir), 'supabase', 'migrations');
    return existsSync(dir) ? readdirSync(dir).sort() : null;
  };
  const supabase = {
    async dump(kind, opts) {
      ext.push({ target: 'supabase.dump', args: [kind, { ...opts }] });
      const custom = o.dump?.[kind];
      if (custom) return custom(opts);
      mkdirSync(path.dirname(opts.file), { recursive: true });
      writeFileSync(opts.file, sqlFile(kind));
    },
    async pushDryRun(opts) {
      ext.push({ target: 'supabase.pushDryRun', args: [{ ...opts }, migrationsIn(opts.workdir)] });
      return o.pushDryRun ? o.pushDryRun(opts) : DRY_RUN_TEXT;
    },
    async push(opts) {
      ext.push({ target: 'supabase.push', args: [{ ...opts }, migrationsIn(opts.workdir)] });
      return o.push ? o.push(opts) : '';
    },
  };
  const offsite = (cfg) => {
    ext.push({ target: 'offsite', args: [{ ...cfg }] });
    return {
      async putFile(key, p, opts) {
        const bytes = existsSync(p) ? readFileSync(p) : null;
        ext.push({ target: 'offsite.putFile', args: [key, p, { ...opts }, bytes] });
        if (o.putFile) return o.putFile(key, p, opts);
      },
      async putJson(key, value) {
        ext.push({ target: 'offsite.putJson', args: [key, structuredClone(value)] });
        if (o.putJson) return o.putJson(key, value);
      },
    };
  };
  h.deps.sql = sql;
  h.deps.supabase = supabase;
  h.deps.offsite = offsite;
  h.calls = (target) => ext.filter((c) => c.target === target);
  h.bootstrapCalls = () => h.calls('sql').filter((c) => c.args[0] !== bs.TENANT_CHECK_SQL);
  h.dumpCalls = (kind) => h.calls('supabase.dump').filter((c) => kind === undefined || c.args[0] === kind);
  h.puts = () => ext.filter((c) => c.target === 'offsite.putFile' || c.target === 'offsite.putJson');
  return { h, f };
}

/** The ordered targets of `sql`, `supabase.*` and the off-site puts (the factory call is checked apart). */
const journalOrder = (h) =>
  h.external
    .filter((c) => c.target === 'sql' || c.target.startsWith('supabase.') || c.target.startsWith('offsite.'))
    .map((c) => (c.target === 'supabase.dump' ? `supabase.dump(${c.args[0]})` : c.target));

function assertNothingLive(h, id) {
  const live = h.external
    .map((c) => c.target)
    .filter((tg) => tg === 'github.createTag' || tg === 'vercel.promote' || tg.startsWith('checkLive'));
  assert.deepEqual(live, [], `(${id}) nothing live: no createTag, promote or checkLive`);
}

/** The dump folder(s) the fake was asked to write into no longer exist. */
function assertDumpFolderGone(h, id) {
  const dirs = new Set(h.dumpCalls().map((c) => path.dirname(c.args[1].file)));
  assert.ok(dirs.size > 0, `(${id}) at least one dump call records a file`);
  for (const d of dirs) assert.ok(!existsSync(d), `(${id}) dump folder ${d} no longer exists`);
}

const worktreeCount = (R) =>
  git(R.work, 'worktree', 'list', '--porcelain')
    .split(/\r?\n/)
    .filter((l) => l.startsWith('worktree ')).length;

// ---------------------------------------------------------------------------------------------------------------
// EZD-023e builder (vault/plans/EZD-023e.md section 4): makeD plus the `fetch` and `checkLive` fakes.
// `o.fetch(n)` (n = 1-based call number) and `o.checkLive()` replace the default answers; a throw rejects.
// ---------------------------------------------------------------------------------------------------------------
const LIVE_IDS = ['dns', 'tls', 'status', 'host', 'vercel', 'title', 'hsts', 'redirect'];
const HEALTH_OK = (version = '20261102000000') => ({
  status: 200,
  json: async () => ({ status: 'ok', schema_version: version }),
});

function makeE(mod, bs, R, o = {}) {
  const { h, f } = makeD(mod, bs, R, o);
  let n = 0;
  h.deps.fetch = async (url, init) => {
    n += 1;
    h.external.push({ target: 'fetch', args: [url, init] });
    return o.fetch ? o.fetch(n) : HEALTH_OK();
  };
  h.deps.checkLive = async () => {
    h.external.push({ target: 'checkLive', args: [] });
    if (o.checkLive) return o.checkLive();
    return { ok: true, results: LIVE_IDS.map((id) => ({ id, pass: true, detail: 'ok' })) };
  };
  return { h, f };
}

describe('EZD-023d dump, migrations and tenant 1', () => {
  // T25 --------------------------------------------------------------------------------------------------------
  test('EZD-023d done when: the release writes the dump off-site under releases/ with the release key before any migration', async (t) => {
    const mod = await loadRelease();
    const bs = await loadBootstrap();
    const R = makeR(t);
    // An uncommitted migration in R's working tree must never reach the release (archived step 11).
    writeFileSync(path.join(R.work, 'supabase', 'migrations', '20261201000000_wip.sql'), 'select 1;\n');

    const { h } = makeE(mod, bs, R);
    h.deps.processEnv.BACKUP_S3_ACCESS_KEY_ID = 'key_TEST';
    h.deps.processEnv.BACKUP_S3_SECRET_ACCESS_KEY = 'b2-secret-TEST';
    const result = await h.run();

    assert.deepEqual(
      journalOrder(h),
      [
        'sql',
        'supabase.pushDryRun',
        'supabase.dump(roles)',
        'supabase.dump(schema)',
        'supabase.dump(data)',
        'offsite.putFile',
        'offsite.putFile',
        'offsite.putFile',
        'offsite.putJson',
        'supabase.push',
        'sql',
        'offsite.putJson',
      ],
      `journal order; logs: ${JSON.stringify(h.logs())}`,
    );
    assert.equal(h.calls('sql')[0].args[0], bs.TENANT_CHECK_SQL, 'the first sql call is the tenant check');

    // The release key only, never BACKUP_S3_*_KEY*.
    const factory = h.calls('offsite');
    assert.equal(factory.length, 1, 'offsite called once');
    assert.deepEqual(factory[0].args[0], {
      endpoint: 'https://s3.us-west-004.backblazeb2.com',
      region: 'us-west-004',
      bucket: 'ezd-test',
      accessKeyId: 'relkey_TEST',
      secretAccessKey: 'rel-secret-TEST',
    });

    // Keys, content types, prefix.
    const puts = h.puts();
    assert.deepEqual(
      puts.map((c) => c.args[0]),
      ['roles.sql', 'schema.sql', 'data.sql', 'manifest.json', 'release.json'].map((n) => DUMP_PREFIX + n),
      'the 5 keys',
    );
    for (const c of puts.slice(0, 3)) {
      assert.deepEqual(c.args[2], { contentType: 'application/sql' }, `${c.args[0]} content type`);
    }
    assert.equal(result.dumpPrefix, DUMP_PREFIX, 'result.dumpPrefix');

    // Manifest (EZD-025 format), uploaded last.
    const files = [
      { name: 'roles.sql', size: 9, sha256: sha256Hex(sqlFile('roles')) },
      { name: 'schema.sql', size: 10, sha256: sha256Hex(sqlFile('schema')) },
      { name: 'data.sql', size: 8, sha256: sha256Hex(sqlFile('data')) },
    ];
    assert.deepEqual(
      puts[3].args[1],
      {
        format: 1,
        created_at: '2026-10-19T12:00:00.000Z',
        source_ref: 'prodref123',
        newest_migration: '20261102000000',
        files,
      },
      'manifest',
    );
    assert.deepEqual(result.dumpFiles, files, 'result.dumpFiles');
    for (const [i, kind] of ['roles', 'schema', 'data'].entries()) {
      assert.deepEqual(puts[i].args[3], Buffer.from(sqlFile(kind)), `${kind}.sql bytes uploaded`);
    }

    // Dump options: the auth exclusions on data only; CLEAN's URL unchanged.
    const dumps = h.dumpCalls();
    assert.deepEqual(dumps[2].args[1].exclude, AUTH_DATA_EXCLUDES_EXPECTED, 'data exclude');
    assert.equal(dumps[0].args[1].exclude, undefined, 'roles has no exclude');
    assert.equal(dumps[1].args[1].exclude, undefined, 'schema has no exclude');
    for (const c of dumps) assert.equal(c.args[1].dbUrl, CLEAN_DB_URL, `${c.args[0]} dump dbUrl unchanged`);

    // URLs and timeouts.
    const [tenantCheck, bootstrap] = h.calls('sql');
    assert.equal(tenantCheck.args[1].dbUrl, `${CLEAN_DB_URL}?${OPTIONS_QUERY}`, 'tenant check URL carries the timeouts');
    assert.equal(bootstrap.args[1].dbUrl, CLEAN_DB_URL, 'bootstrap dbUrl unchanged');
    const [dry] = h.calls('supabase.pushDryRun');
    const [push] = h.calls('supabase.push');
    assert.equal(dry.args[0].dbUrl, CLEAN_DB_URL, 'pushDryRun dbUrl unchanged');
    assert.equal(push.args[0].dbUrl, CLEAN_DB_URL, 'push dbUrl unchanged');
    assert.equal(push.args[0].lockTimeout, '5s', 'push lockTimeout');
    assert.equal(push.args[0].statementTimeout, '300s', 'push statementTimeout');

    // One workdir from the commit: the committed migrations only, never the uncommitted one.
    assert.equal(typeof dry.args[0].workdir, 'string', 'pushDryRun has a workdir');
    assert.equal(push.args[0].workdir, dry.args[0].workdir, 'pushDryRun and push share one workdir');
    assert.deepEqual(dry.args[1], FIXTURE_MIGRATIONS, 'workdir migrations at the dry run');
    assert.deepEqual(push.args[1], FIXTURE_MIGRATIONS, 'workdir migrations at the push');

    // Log and summary lines.
    const logs = h.logs();
    for (const name of FIXTURE_MIGRATIONS) {
      assert.ok(logs.includes(`pending migration: ${name}`), `log holds pending migration: ${name}`);
    }
    assert.ok(h.summaries().includes(DUMP_SAVED_LINE(DUMP_PREFIX)), `summary holds the dump saved line: ${JSON.stringify(h.summaries())}`);

    // The bootstrap text.
    const text = bootstrap.args[0];
    assert.equal(text.split('owner.test@example.com').length - 1, 1, 'bootstrap text holds the email once');
    assert.ok(!text.includes('PASTE-YOUR-EMAIL-HERE'), 'bootstrap text holds no placeholder');

    {
      const targets = h.external.map((c) => c.target);
      const firstLive = targets.findIndex(
        (tg) => tg === 'github.createTag' || tg === 'vercel.promote' || tg === 'checkLive',
      );
      assert.ok(firstLive > targets.indexOf('supabase.push'), 'T25: nothing live before supabase.push');
      assert.ok(firstLive > targets.lastIndexOf('sql'), 'T25: nothing live before the last sql call');
    }
    assert.deepEqual(result.notices, [], 'notices');

    // Cleanup: the worktree and the dump folder are gone; R lists one worktree.
    assert.ok(!existsSync(dry.args[0].workdir), 'the workdir no longer exists');
    assertDumpFolderGone(h, 'T25');
    assert.equal(worktreeCount(R), 1, 'git worktree list shows one worktree');

    assertNoText(
      h,
      ['S3cret', 'rel-secret-TEST', 'relkey_TEST', 'b2-secret-TEST', 'key_TEST', 'owner.test@example.com'],
      'T25',
    );
  });

  // T10 --------------------------------------------------------------------------------------------------------
  test('EZD-023d done when: a failed dump or upload stops the release before anything goes live', async (t) => {
    const mod = await loadRelease();
    const bs = await loadBootstrap();
    const R = makeR(t);
    const writes = (text) => (opts) => {
      mkdirSync(path.dirname(opts.file), { recursive: true });
      writeFileSync(opts.file, text);
    };
    const cases = [
      ['a', { dump: { schema: writes('') } }, 'dump_failed', 'schema_empty'],
      [
        'b',
        {
          dump: {
            data: () => {
              throw childError('supabase db dump exited 1', 'pg_dump: error: x');
            },
          },
        },
        'dump_failed',
        'data_failed',
      ],
      [
        'c',
        {
          putFile: (key) => {
            if (key.endsWith('data.sql')) throw new Error(`offsite put failed: ${key} (403)`);
          },
        },
        'dump_upload_failed',
        null,
      ],
      [
        'd',
        { dump: { roles: writes('ALTER ROLE "x" WITH LOGIN PASSWORD \'SCRAM-SHA-256$4096:abc\';\n') } },
        'dump_failed',
        'role_passwords',
      ],
      ['e', { dump: { roles: () => {} } }, 'dump_failed', 'roles_empty'],
    ];
    for (const [id, o, code, detail] of cases) {
      const { h } = makeD(mod, bs, R, o);
      const result = await h.run();
      assert.equal(result.ok, false, `(${id}) ok false`);
      assert.equal(result.code, code, `(${id}) code; logs: ${JSON.stringify(h.logs())}`);
      if (code === 'dump_failed') {
        assert.ok(h.logs().includes(`dump_failed: ${detail}`), `(${id}) log dump_failed: ${detail}`);
        assert.ok(h.summaries().includes(stoppedLine('dump_failed')), `(${id}) summary stopped line`);
      } else {
        assert.ok(
          h.summaries().includes(UPLOAD_FAILED_LINE(DUMP_PREFIX)),
          `(${id}) summary: ${JSON.stringify(h.summaries())}`,
        );
      }
      if (id === 'd' || id === 'e') {
        assert.equal(h.dumpCalls('schema').length, 0, `(${id}) 0 schema dumps after the roles guard`);
        assert.equal(h.puts().length, 0, `(${id}) 0 offsite puts`);
      }
      assert.equal(h.calls('offsite.putJson').length, 0, `(${id}) 0 putJson`);
      assert.equal(h.calls('supabase.push').length, 0, `(${id}) 0 push`);
      assert.equal(h.bootstrapCalls().length, 0, `(${id}) 0 bootstrap sql calls`);
      assertNothingLive(h, id);
      assertDumpFolderGone(h, id);
    }
  });

  // T11 --------------------------------------------------------------------------------------------------------
  test('EZD-023d done when: a failed migration or tenant 1 setup stops the release before anything goes live', async (t) => {
    const mod = await loadRelease();
    const bs = await loadBootstrap();
    const R = makeR(t);
    const pushRejects = (stderr) => () => {
      throw childError('supabase db push exited 1', stderr);
    };
    const cases = [
      ['a', { push: pushRejects('ERROR: x') }, 'migrate_failed'],
      ['b', { bootstrap: () => ({ stdout: '', stderr: 'ERROR:  ezd_bootstrap_email_missing' }) }, 'bootstrap_failed'],
      ['e', { push: pushRejects('ERROR: canceling statement due to lock timeout') }, 'migrate_failed'],
      ['g', { bootstrap: () => ({ stdout: '', stderr: '' }) }, 'bootstrap_failed'],
    ];
    for (const [id, o, code] of cases) {
      const { h } = makeD(mod, bs, R, o);
      const result = await h.run();
      assert.equal(result.ok, false, `(${id}) ok false`);
      assert.equal(result.code, code, `(${id}) code; logs: ${JSON.stringify(h.logs())}`);
      const line = code === 'migrate_failed' ? MIGRATE_FAILED_LINE(DUMP_PREFIX) : BOOTSTRAP_FAILED_LINE(DUMP_PREFIX);
      assert.ok(h.summaries().includes(line), `(${id}) summary: ${JSON.stringify(h.summaries())}`);
      if (code === 'migrate_failed') {
        assert.equal(h.bootstrapCalls().length, 0, `(${id}) 0 bootstrap sql calls`);
      }
      if (id === 'e') {
        assert.ok(
          h.logs().some((l) => l.includes('canceling statement due to lock timeout')),
          `(e) a log line names the lock timeout: ${JSON.stringify(h.logs())}`,
        );
      }
      assertNothingLive(h, id);
    }

    // (h) already done counts as done (finding V6).
    {
      const { h } = makeE(mod, bs, R, {
        bootstrap: () => {
          throw childError('psql exited 3', 'ERROR:  ezd_bootstrap_already_done');
        },
      });
      const result = await h.run();
      assert.notEqual(result.code, 'bootstrap_failed', '(h) not bootstrap_failed');
      assert.ok(
        !h.summaries().some((l) => l.startsWith('release stopped: bootstrap_failed')),
        '(h) no bootstrap_failed summary line',
      );
      assert.equal(h.calls('github.createTag').length, 1, '(h) exactly 1 createTag');
      assert.equal(h.calls('vercel.promote').length, 1, '(h) exactly 1 promote');
    }
  });

  // T9 ---------------------------------------------------------------------------------------------------------
  test('EZD-023d done when: no secret or owner email appears in the output', async (t) => {
    const mod = await loadRelease();
    const bs = await loadBootstrap();
    const R = makeR(t);

    // (a)–(d): tenant missing and no usable owner email: stopped before the dry run and the dump.
    const emailCases = [
      ['a', null],
      ['b', "josh'@example.com"],
      ['c', 'not-an-email'],
      ['d', 'a@b.com\nselect 1'],
    ];
    for (const [id, email] of emailCases) {
      const { h } = makeD(mod, bs, R);
      if (email === null) delete h.deps.processEnv.TENANT1_OWNER_EMAIL;
      else h.deps.processEnv.TENANT1_OWNER_EMAIL = email;
      const result = await h.run();
      assert.equal(result.ok, false, `(${id}) ok false`);
      assert.equal(result.code, 'owner_email_missing', `(${id}) code; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(h.calls('supabase.pushDryRun').length, 0, `(${id}) 0 pushDryRun`);
      assert.equal(h.dumpCalls().length, 0, `(${id}) 0 dump`);
      assert.equal(h.calls('supabase.push').length, 0, `(${id}) 0 push`);
      assertNothingLive(h, id);
    }

    const LEAK = `ERROR: duplicate key for owner.test@example.com at ${CLEAN_DB_URL}`;
    const NO_TEXT = ['owner.test@example.com', 'S3cret', 'p%40ss%2Fx', 'p@ss/x'];
    const masksBeforeFirstLog = (h, values, id) => {
      const masks = h.masks();
      for (const v of values) assert.ok(masks.includes(v), `(${id}) mask received ${JSON.stringify(v)}`);
      const firstLog = h.journal.findIndex((e) => e.kind === 'log');
      for (const v of values) {
        const at = h.journal.findIndex((e) => e.kind === 'mask' && e.value === v);
        assert.ok(firstLog === -1 || at < firstLog, `(${id}) ${JSON.stringify(v)} masked before the first log line`);
      }
    };

    // (e) the bootstrap fails with a message naming the email and the URL.
    {
      const { h } = makeD(mod, bs, R, {
        bootstrap: () => {
          throw childError(LEAK, LEAK, { exitCode: 3 });
        },
      });
      h.deps.processEnv.TENANT1_OWNER_EMAIL = ' owner.test@example.com ';
      const result = await h.run();
      assert.equal(result.code, 'bootstrap_failed', `(e) code; logs: ${JSON.stringify(h.logs())}`);
      masksBeforeFirstLog(h, ['owner.test@example.com', 'S3cret'], 'e');
      const [call] = h.bootstrapCalls();
      assert.ok(call, '(e) one bootstrap sql call');
      assert.equal(call.args[0].split('owner.test@example.com').length - 1, 1, '(e) email once in the SQL');
      assertNoText(h, NO_TEXT, 'e');
    }

    // (f) the push fails with that same text.
    {
      const { h } = makeD(mod, bs, R, {
        push: () => {
          throw childError(LEAK, LEAK);
        },
      });
      const result = await h.run();
      assert.equal(result.code, 'migrate_failed', `(f) code; logs: ${JSON.stringify(h.logs())}`);
      assertNoText(h, NO_TEXT, 'f');
    }

    // (g) an encoded password: both forms masked, the safe line still logged.
    {
      const encodedUrl =
        'postgresql://postgres.prodref123:p%40ss%2Fx@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
      const { h } = makeD(mod, bs, R, {
        push: () => {
          throw childError('supabase db push exited 1', 'auth p%40ss%2Fx\nauth p@ss/x\nERROR: y');
        },
      });
      h.deps.processEnv.BACKUP_SOURCE_DB_URL = encodedUrl;
      const result = await h.run();
      assert.equal(result.code, 'migrate_failed', `(g) code; logs: ${JSON.stringify(h.logs())}`);
      masksBeforeFirstLog(h, ['p%40ss%2Fx', 'p@ss/x'], 'g');
      assert.ok(h.logs().includes('  | ERROR: y'), `(g) log holds "  | ERROR: y": ${JSON.stringify(h.logs())}`);
      assertNoText(h, NO_TEXT, 'g');
    }
  });

  // T27 --------------------------------------------------------------------------------------------------------
  test('EZD-023d T27 checks before the dump: worktree, tenant check, timeouts, pending list, bootstrap file', async (t) => {
    const mod = await loadRelease();
    const bs = await loadBootstrap();
    const R = makeR(t);

    const refusedBeforeDump = (h, result, code, id) => {
      assert.equal(result.ok, false, `(${id}) ok false`);
      assert.equal(result.code, code, `(${id}) code; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(h.dumpCalls().length, 0, `(${id}) 0 dump calls`);
      assert.equal(h.calls('supabase.push').length, 0, `(${id}) 0 push calls`);
      assert.ok(h.summaries().includes(stoppedLine(code)), `(${id}) summary: ${JSON.stringify(h.summaries())}`);
      assertNothingLive(h, id);
    };

    // (a) the worktree cannot be added.
    {
      const { h } = makeD(mod, bs, R);
      const inner = h.deps.git;
      h.deps.git = (args) => {
        if (args[0] === 'worktree' && args[1] === 'add') throw new Error('git worktree add exited 128');
        return inner(args);
      };
      const result = await h.run();
      refusedBeforeDump(h, result, 'pending_check_failed', 'a');
      assert.equal(h.calls('sql').length, 0, '(a) 0 sql calls');
    }

    // (b), (c) the tenant check fails or answers in another form; (d) the timeouts are not applied.
    for (const [id, tenantCheck, code] of [
      [
        'b',
        () => {
          throw childError('psql exited 2', 'psql: error: connection refused');
        },
        'tenant_check_failed',
      ],
      ['c', () => ({ stdout: 'tenant ok', stderr: '' }), 'tenant_check_failed'],
      ['d', () => ({ stdout: '0 0 0', stderr: '' }), 'migrate_timeouts_not_applied'],
    ]) {
      const { h } = makeD(mod, bs, R, { tenantCheck });
      const result = await h.run();
      refusedBeforeDump(h, result, code, id);
    }

    // (e) tenant present with the secret still set: notice, no bootstrap, migrations still run.
    {
      const { h } = makeD(mod, bs, R, { tenantCheck: () => ({ stdout: '1 5000 300000', stderr: '' }) });
      const result = await h.run();
      assert.deepEqual(result.notices, ['owner_email_secret_unused'], `(e) notices; logs: ${JSON.stringify(h.logs())}`);
      assert.deepEqual(
        h.summaries().filter((l) => l.startsWith('notice ')),
        [OWNER_EMAIL_UNUSED_LINE],
        '(e) exactly the notice line',
      );
      assert.equal(h.bootstrapCalls().length, 0, '(e) 0 bootstrap sql calls');
      assert.equal(h.calls('supabase.push').length, 1, '(e) 1 push call');
    }

    // (f) tenant present and the secret already deleted: no notice.
    {
      const { h } = makeD(mod, bs, R, { tenantCheck: () => ({ stdout: '1 5000 300000', stderr: '' }) });
      delete h.deps.processEnv.TENANT1_OWNER_EMAIL;
      const result = await h.run();
      assert.deepEqual(result.notices, [], `(f) notices; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(h.bootstrapCalls().length, 0, '(f) 0 bootstrap sql calls');
      assert.equal(h.calls('supabase.push').length, 1, '(f) 1 push call');
    }

    // (g) the dry run fails with the URL in its stderr: redacted, never raw.
    {
      const { h } = makeD(mod, bs, R, {
        pushDryRun: () => {
          throw childError('supabase db push exited 1', `at ${CLEAN_DB_URL}`);
        },
      });
      const result = await h.run();
      refusedBeforeDump(h, result, 'pending_check_failed', 'g');
      assert.ok(
        h.logs().includes('  | at postgresql://postgres.prodref123:***@aws-0-us-east-1.pooler.supabase.com:5432/postgres'),
        `(g) redacted child line logged: ${JSON.stringify(h.logs())}`,
      );
      assertNoText(h, ['S3cret'], 'g');
    }

    // (h) the committed bootstrap file has no placeholder: refused before the dump.
    {
      const R2 = makeR(t);
      const c3 = commitFiles(R2.work, { 'supabase/bootstrap/tenant-1.sql': NO_PLACEHOLDER_BOOTSTRAP }, 'C3 bootstrap');
      git(R2.work, 'push', '-q', 'origin', 'main');
      R2.tip = c3;
      const { h } = makeD(mod, bs, R2);
      const result = await h.run();
      refusedBeforeDump(h, result, 'bootstrap_file_invalid', 'h');
    }

    // (i) the same change uncommitted in the working tree changes nothing: the commit's file is used.
    {
      const R3 = makeR(t);
      writeFileSync(path.join(R3.work, BOOTSTRAP_REL), NO_PLACEHOLDER_BOOTSTRAP);
      const { h } = makeD(mod, bs, R3);
      await h.run();
      const calls = h.bootstrapCalls();
      assert.equal(calls.length, 1, `(i) 1 bootstrap sql call; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(calls[0].args[0].split('owner.test@example.com').length - 1, 1, '(i) email once');
      assert.ok(!calls[0].args[0].includes('PASTE-YOUR-EMAIL-HERE'), '(i) no placeholder');
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// EZD-023e (vault/plans/EZD-023e.md section 4): T7, T8, T11 (c) (d) (f), T12, T13, T20, T21, T22. Expected values
// come from the plan's Tests table (Step 1 G-I, section 6), the ticket's Done when (AC-EZD-023e-1, -2) and part c's
// fake clock T0 (prefix `releases/phase-0-20261019T120000Z/`).
// ---------------------------------------------------------------------------------------------------------------
const HEALTH_URL_EXPECTED = 'https://ezdraft.ezcontractorbinder.com/api/health';
const RELEASED_LINE = (tag, n) => `released ${tag} from pull request #${n}`;
const TAG_FAILED_LINE = (prefix) =>
  `release stopped: tag_failed — the live site is unchanged; the database has this release's migrations; the dump from before this release is in ${prefix}`;
const PROMOTE_FAILED_LINE = (tag) =>
  `release stopped: promote_failed — the live site is unchanged; the database has this release's migrations and the tag ${tag} was made; press Re-run jobs to try again`;
const VERIFY_ROLLED_BACK_LINE =
  "release failed: verify_failed — the checks after going live failed, so the previous build was put back; the database keeps this release's migrations; to go back further, use Instant Rollback (docs/runbook.md, Rollback)";
const VERIFY_NO_EARLIER_LINE =
  'release failed: verify_failed — the checks after going live failed and there was no earlier build to put back, so this build stays live; see docs/runbook.md, Rollback';
const VERIFY_ROLLBACK_FAILED_LINE =
  'release failed: verify_failed — the checks after going live failed and putting the previous build back also failed; use Instant Rollback in Vercel now (docs/runbook.md, Rollback)';
const PREVIOUS_UNKNOWN_LINE =
  'notice previous_deployment_unknown: Vercel did not report the build that was live before this release, so an automatic rollback would have nothing to put back; tell the orchestrator, and use Instant Rollback by hand if this release has a problem';
const VERCEL_PROMOTE_500 = 'Vercel POST /v10/projects/{project}/promote/{deployment} failed: 500';
const sha256Of = (text) => createHash('sha256').update(String(text)).digest('hex');

/** True when some output line holds any of `texts` (hex runs of 40+ characters removed first when `stripHex`). */
function outputHolds(h, texts, { stripHex = false } = {}) {
  const rec = releaseJson(h);
  const lines = rec ? [...h.output(), JSON.stringify(rec.args[1])] : h.output();
  return lines.some((line) => {
    const l = stripHex ? line.replace(/[0-9a-f]{40,}/g, '') : line;
    return texts.some((v) => l.includes(v));
  });
}
const SECRET_TEXTS = [
  'S3cret',
  'tok_TEST',
  'rel-secret-TEST',
  'relkey_TEST',
  'ghs_TEST',
  'owner.test@example.com',
  'postgresql://',
  'prj_TEST',
];
const releaseJson = (h) => {
  const puts = h.calls('offsite.putJson').filter((c) => c.args[0].endsWith('release.json'));
  return puts.length === 1 ? puts[0] : null;
};
const promoteIds = (f) => f.calls.filter((c) => c.name === 'promote').map((c) => c.args[0]);
const notNull = (v, msg) => {
  assert.ok(v !== null && v !== undefined, msg);
  return v;
};

/** Setup `LATER` (archived T8): `phase-0` on C1, a Phase 1 pull request, a live build dpl_OLD, tenant 1 present. */
function makeLater(mod, bs, t, o = {}) {
  const R = makeR(t, { tagC1: true });
  const { h, f } = makeE(mod, bs, R, {
    pulls: () => [{ ...cleanPull(R.tip), title: 'Phase 1: Projects' }],
    current: () => ({ id: 'dpl_OLD' }),
    tenantCheck: () => ({ stdout: '1 5000 300000\n', stderr: '' }),
    ...o,
  });
  delete h.deps.processEnv.TENANT1_OWNER_EMAIL;
  return { R, h, f };
}

describe('EZD-023e go live, verify, rollback and record', () => {
  // T7 ---------------------------------------------------------------------------------------------------------
  test('EZD-023e done when: the release makes live only the build of the commit it tags, after the dump and the migrations', async (t) => {
    const mod = await loadRelease();
    const bs = await loadBootstrap();
    const R = makeR(t);
    writeFileSync(path.join(R.work, 'supabase', 'migrations', '20261201000000_wip.sql'), 'select 1;\n');
    const { h, f } = makeE(mod, bs, R);
    const result = await h.run();

    assert.equal(result.ok, true, `ok; logs: ${JSON.stringify(h.logs())}`);
    assert.equal(result.code, 'released');
    assert.equal(result.tag, 'phase-0');
    assert.equal(result.rolledBack, false);
    assert.deepEqual(result.notices, []);

    assert.deepEqual(
      h.githubCalls.map((c) => c.target),
      ['github.mergedPullsFor', 'github.environmentBranchRule', 'github.createTag'],
    );
    assert.deepEqual(h.githubCalls[1].args, ['release']);
    assert.deepEqual(h.githubCalls[2].args, ['phase-0', R.tip, 'Release phase-0 (#7)']);
    assert.deepEqual(
      f.calls.map((c) => c.name).filter((n) => n !== 'readEnvValue'),
      ['getProject', 'tokenInfo', 'findProductionDeployment', 'currentProductionDeployment', 'listEnv', 'promote'],
    );
    assert.deepEqual(
      h.external.map((c) => (c.target === 'supabase.dump' ? `supabase.dump(${c.args[0]})` : c.target)),
      [
        'sql',
        'supabase.pushDryRun',
        'supabase.dump(roles)',
        'supabase.dump(schema)',
        'supabase.dump(data)',
        'offsite',
        'offsite.putFile',
        'offsite.putFile',
        'offsite.putFile',
        'offsite.putJson',
        'supabase.push',
        'sql',
        'github.createTag',
        'vercel.promote',
        'fetch',
        'checkLive',
        'offsite.putJson',
      ],
      `order; logs: ${JSON.stringify(h.logs())}`,
    );
    const keys = h.puts().map((c) => c.args[0]);
    assert.ok(
      keys[0].endsWith('roles.sql') && keys[1].endsWith('schema.sql') && keys[2].endsWith('data.sql'),
      'dump keys',
    );
    assert.ok(keys[3].endsWith('manifest.json'), 'manifest key');
    assert.ok(keys[4].endsWith('release.json'), 'release.json key');
    assert.deepEqual(promoteIds(f), ['dpl_NEW']);
    assert.equal(h.calls('vercel.promote').length, 1, '1 promote call');
    const fetches = h.calls('fetch');
    assert.equal(fetches.length, 1, '1 fetch call');
    assert.equal(fetches[0].args[0], HEALTH_URL_EXPECTED);
    assert.equal(fetches[0].args[1].method, 'GET');
    assert.ok(fetches[0].args[1].signal instanceof AbortSignal, 'fetch gets an AbortSignal');
    assert.equal(h.calls('checkLive').length, 1, '1 checkLive call');
    assert.equal(h.calls('offsite').length, 1, 'offsite factory called once');
    for (const c of h.external.filter((e) => e.target.startsWith('offsite.put'))) {
      assert.ok(c.args[0].startsWith(DUMP_PREFIX), 'every offsite key starts with the run prefix');
    }
    const rec = notNull(releaseJson(h), 'release.json put once');
    assert.equal(rec.args[0], `${DUMP_PREFIX}release.json`);
    const manifest = h.calls('offsite.putJson').find((c) => c.args[0].endsWith('manifest.json'));
    assert.deepEqual(rec.args[1], {
      tag: 'phase-0',
      sha: R.tip,
      previous_tag: null,
      pr_number: 7,
      deployment_id: 'dpl_NEW',
      previous_deployment_id: null,
      started_at: '2026-10-19T12:00:00.000Z',
      finished_at: '2026-10-19T12:00:00.000Z',
      result: 'released',
      rolled_back: false,
      dump_files: manifest.args[1].files,
    });
    assert.ok(h.logs().includes('no release tag yet: nothing is released'), 'log: no release tag yet');
    assert.ok(h.logs().includes('health ok'), 'log: health ok');
    assert.ok(h.summaries().includes(DUMP_SAVED_LINE(DUMP_PREFIX)), 'summary: dump saved');
    assert.ok(h.summaries().includes(RELEASED_LINE('phase-0', 7)), `summary: released; ${JSON.stringify(h.summaries())}`);
    assert.ok(!h.summaries().some((l) => l.startsWith('release stopped:')), 'no release stopped line');

    // Masks: exactly the two derived values, all before the first log line (compared by hash, L-018).
    const maskSet = [...new Set(h.masks())].sort();
    assert.equal(
      sha256Of(JSON.stringify(maskSet)),
      sha256Of(JSON.stringify(['S3cret', 'owner.test@example.com'].sort())),
      'mask set',
    );
    const firstLog = h.journal.findIndex((e) => e.kind === 'log');
    const lastMask = h.journal.map((e) => e.kind).lastIndexOf('mask');
    assert.ok(lastMask < firstLog, 'all masks before the first log line');
    assert.ok(!outputHolds(h, SECRET_TEXTS), 'no secret in the output');
    assert.equal(worktreeCount(R), 1, 'git worktree list shows one worktree');
  });

  // T8 ---------------------------------------------------------------------------------------------------------
  test('EZD-023e T8 a later release names its previous tag and build', async (t) => {
    const mod = await loadRelease();
    const bs = await loadBootstrap();
    const cases = [
      { id: 'a' },
      { id: 'b', email: 'owner.test@example.com' },
      {
        id: 'c',
        o: {
          putJson: (key) => {
            if (key.endsWith('release.json')) throw new Error('offsite put failed: x (403)');
          },
        },
      },
      { id: 'd', o: { current: () => null } },
    ];
    for (const { id, email, o } of cases) {
      const { h, f } = makeLater(mod, bs, t, o ?? {});
      if (email) h.deps.processEnv.TENANT1_OWNER_EMAIL = email;
      const result = await h.run();
      assert.equal(result.ok, true, `(${id}) ok; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(result.code, 'released', `(${id}) code`);
      assert.equal(result.tag, 'phase-1', `(${id}) tag`);
      assert.equal(h.bootstrapCalls().length, 0, `(${id}) 0 bootstrap sql calls`);
      assert.ok(h.logs().includes('migration check passed against phase-0'), `(${id}) migration check log`);
      assert.equal(h.calls('github.createTag').length, 1, `(${id}) 1 createTag`);
      assert.equal(h.calls('github.createTag')[0].args[0], 'phase-1', `(${id}) createTag name`);
      assert.deepEqual(promoteIds(f), ['dpl_NEW'], `(${id}) promote once with dpl_NEW`);
      const rec = notNull(releaseJson(h), `(${id}) release.json recorded`).args[1];
      if (id !== 'd') {
        assert.equal(rec.previous_tag, 'phase-0', `(${id}) previous_tag`);
        assert.equal(rec.previous_deployment_id, 'dpl_OLD', `(${id}) previous_deployment_id`);
      }
      if (id === 'a') assert.deepEqual(result.notices, [], '(a) notices');
      if (id === 'b') assert.deepEqual(result.notices, ['owner_email_secret_unused'], '(b) notices');
      if (id === 'c') {
        assert.ok(h.logs().includes('record_failed'), `(c) record_failed logged: ${JSON.stringify(h.logs())}`);
        assert.ok(!outputHolds(h, ['403']), '(c) no 403 in the output');
      }
      if (id === 'd') {
        assert.deepEqual(result.notices, ['previous_deployment_unknown'], '(d) notices');
        assert.ok(h.summaries().includes(PREVIOUS_UNKNOWN_LINE), `(d) summary notice: ${JSON.stringify(h.summaries())}`);
        assert.equal(rec.previous_deployment_id, null, '(d) previous_deployment_id null');
      }
    }
  });

  // T11 (c), (d), (f) ------------------------------------------------------------------------------------------
  test('EZD-023e T11 go-live failures keep the old build live', async (t) => {
    const mod = await loadRelease();
    const bs = await loadBootstrap();
    const R = makeR(t);
    const stoppedLines = (h) => h.summaries().filter((l) => l.startsWith('release stopped:'));

    // (c) the tag cannot be made.
    {
      const { h, f } = makeE(mod, bs, R, {
        createTag: () => {
          throw new Error('POST /git/tags failed: 422');
        },
      });
      const result = await h.run();
      assert.equal(result.ok, false, '(c) ok false');
      assert.equal(result.code, 'tag_failed', `(c) code; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(promoteIds(f).length, 0, '(c) 0 promote');
      assert.equal(h.calls('fetch').length, 0, '(c) 0 fetch');
      assert.equal(h.calls('checkLive').length, 0, '(c) 0 checkLive');
      assert.deepEqual(stoppedLines(h), [TAG_FAILED_LINE(DUMP_PREFIX)], '(c) summary');
      assert.equal(notNull(releaseJson(h), '(c) release.json').args[1].result, 'tag_failed');
      assert.ok(!outputHolds(h, ['422', '500', '/git/tags'], { stripHex: true }), '(c) no raw error text');
    }

    // (d) the promote fails.
    {
      const { h, f } = makeE(mod, bs, R, {
        promote: () => {
          throw new Error(VERCEL_PROMOTE_500);
        },
      });
      const result = await h.run();
      assert.equal(result.ok, false, '(d) ok false');
      assert.equal(result.code, 'promote_failed', `(d) code; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(promoteIds(f).length, 1, '(d) exactly 1 promote');
      assert.equal(h.calls('fetch').length, 0, '(d) 0 fetch');
      assert.equal(h.calls('checkLive').length, 0, '(d) 0 checkLive');
      assert.deepEqual(stoppedLines(h), [PROMOTE_FAILED_LINE('phase-0')], '(d) summary');
      assert.equal(notNull(releaseJson(h), '(d) release.json').args[1].result, 'promote_failed');
      assert.ok(!outputHolds(h, ['422', '500', '/git/tags'], { stripHex: true }), '(d) no raw error text');
    }

    // (f) tenant 1 already set up counts as done.
    {
      const { h, f } = makeE(mod, bs, R, {
        bootstrap: () => {
          throw childError('psql exited 3', 'ERROR:  ezd_bootstrap_already_done');
        },
      });
      const result = await h.run();
      assert.equal(result.ok, true, `(f) ok; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(result.code, 'released', '(f) code');
      assert.equal(h.calls('github.createTag').length, 1, '(f) 1 createTag');
      assert.equal(promoteIds(f).length, 1, '(f) 1 promote');
    }
  });

  // T12 --------------------------------------------------------------------------------------------------------
  test('EZD-023e done when: the release puts the previous build back when the checks after going live fail', async (t) => {
    const mod = await loadRelease();
    const bs = await loadBootstrap();
    const FAIL_500 = () => ({ status: 500, json: async () => ({}) });

    // (a) wrong schema_version for the whole limit: 25 polls, then the previous build goes back.
    {
      const { h, f } = makeLater(mod, bs, t, { fetch: () => HEALTH_OK('20261101000000') });
      const result = await h.run();
      assert.equal(result.ok, false, '(a) ok false');
      assert.equal(result.code, 'verify_failed', `(a) code; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(result.rolledBack, true, '(a) rolledBack');
      const targets = h.external.map((c) => c.target);
      const promotes = targets.map((tg, i) => (tg === 'vercel.promote' ? i : -1)).filter((i) => i >= 0);
      assert.equal(promotes.length, 2, '(a) 2 promote calls');
      assert.equal(
        targets.slice(0, promotes[1]).filter((tg) => tg === 'fetch').length,
        25,
        '(a) 25 fetches before the rollback',
      );
      assert.equal(f.sleeps.filter((ms) => ms === 5000).length, 24, '(a) 24 sleeps of 5000');
      assert.deepEqual(promoteIds(f), ['dpl_NEW', 'dpl_OLD'], '(a) promote order');
      assert.equal(targets.slice(promotes[1]).filter((tg) => tg === 'fetch').length, 1, '(a) 1 rollback poll');
      assert.equal(h.calls('checkLive').length, 0, '(a) 0 checkLive');
      assert.ok(h.logs().includes('health not ok after 25 tries'), `(a) log: ${JSON.stringify(h.logs())}`);
      assert.ok(h.logs().includes('rollback health ok'), '(a) rollback health ok');
      const rec = notNull(releaseJson(h), '(a) release.json').args[1];
      assert.equal(rec.result, 'verify_failed');
      assert.equal(rec.rolled_back, true);
      assert.ok(h.summaries().includes(VERIFY_ROLLED_BACK_LINE), `(a) summary: ${JSON.stringify(h.summaries())}`);
    }

    // (b) first release, health down: no earlier build, nothing put back.
    {
      const R = makeR(t);
      const { h, f } = makeE(mod, bs, R, { fetch: FAIL_500 });
      const result = await h.run();
      assert.equal(result.code, 'verify_failed', `(b) code; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(result.rolledBack, false, '(b) rolledBack');
      assert.equal(h.calls('fetch').length, 25, '(b) 25 fetches');
      assert.equal(promoteIds(f).length, 1, '(b) exactly 1 promote');
      assert.ok(h.summaries().includes(VERIFY_NO_EARLIER_LINE), `(b) summary: ${JSON.stringify(h.summaries())}`);
      assert.equal(notNull(releaseJson(h), '(b) release.json').args[1].rolled_back, false);
    }

    // (c) health passes, the live check fails.
    {
      const { h, f } = makeLater(mod, bs, t, {
        checkLive: () => ({
          ok: false,
          results: LIVE_IDS.map((id) =>
            id === 'dns'
              ? { id, pass: false, detail: 'DNS lookup failed (ENOTFOUND)' }
              : { id, pass: true, detail: 'ok' },
          ),
        }),
      });
      const result = await h.run();
      assert.equal(result.code, 'verify_failed', `(c) code; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(result.rolledBack, true, '(c) rolledBack');
      assert.deepEqual(promoteIds(f), ['dpl_NEW', 'dpl_OLD'], '(c) promote order');
      assert.ok(h.logs().includes('live check failed: dns'), `(c) log: ${JSON.stringify(h.logs())}`);
      assert.ok(!outputHolds(h, ['ENOTFOUND']), '(c) no raw detail in the output');
    }

    // (d) the rollback promote fails too.
    {
      const { h, f } = makeLater(mod, bs, t, {
        fetch: () => HEALTH_OK('20261101000000'),
        promote: (id) => {
          if (id === 'dpl_OLD') throw new Error(VERCEL_PROMOTE_500);
        },
      });
      const result = await h.run();
      assert.equal(result.code, 'verify_failed', `(d) code; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(result.rolledBack, false, '(d) rolledBack');
      assert.equal(promoteIds(f).length, 2, '(d) 2 promote calls');
      assert.ok(h.summaries().includes(VERIFY_ROLLBACK_FAILED_LINE), `(d) summary: ${JSON.stringify(h.summaries())}`);
    }

    // (e) two thrown polls, then health passes.
    {
      const R = makeR(t);
      const { h, f } = makeE(mod, bs, R, {
        fetch: (n) => {
          if (n <= 2) throw new Error('fetch failed');
          return HEALTH_OK();
        },
      });
      const result = await h.run();
      assert.equal(result.code, 'released', `(e) code; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(h.calls('fetch').length, 3, '(e) 3 fetches');
      assert.equal(f.sleeps.filter((ms) => ms === 5000).length, 2, '(e) 2 sleeps of 5000');
      assert.equal(h.calls('checkLive').length, 1, '(e) 1 checkLive');
    }

    // (f) health passes, the live check throws.
    {
      const { h, f } = makeLater(mod, bs, t, {
        checkLive: () => {
          throw new Error('observe failed');
        },
      });
      const result = await h.run();
      assert.equal(result.code, 'verify_failed', `(f) code; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(result.rolledBack, true, '(f) rolledBack');
      assert.deepEqual(promoteIds(f), ['dpl_NEW', 'dpl_OLD'], '(f) promote order');
    }
  });

  // T13 --------------------------------------------------------------------------------------------------------
  test('EZD-023e T13 a re-run is safe', async (t) => {
    const mod = await loadRelease();
    const bs = await loadBootstrap();
    const tagTip = (R) => {
      tagAnnotated(R.work, 'phase-0');
      git(R.work, 'push', '-q', 'origin', 'phase-0');
    };
    const touched = (h) =>
      h.external
        .map((c) => c.target)
        .filter(
          (tg) =>
            tg === 'sql' ||
            tg.startsWith('supabase.') ||
            tg.startsWith('offsite') ||
            tg === 'github.createTag' ||
            tg === 'vercel.promote',
        );

    // (a) the tagged build is already live: only the verify runs.
    {
      const R = makeR(t);
      tagTip(R);
      const { h } = makeE(mod, bs, R, { current: () => ({ id: 'dpl_NEW' }) });
      const result = await h.run();
      assert.equal(result.ok, true, `(a) ok; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(result.code, 'released', '(a) code');
      assert.equal(result.resume, true, '(a) resume');
      assert.equal(result.alreadyLive, true, '(a) alreadyLive');
      assert.deepEqual(touched(h), [], '(a) no sql, supabase, offsite, createTag or promote');
      assert.equal(h.calls('fetch').length, 1, '(a) 1 fetch');
      assert.equal(h.calls('checkLive').length, 1, '(a) 1 checkLive');
      assert.ok(h.logs().includes('record skipped: no dump in this run'), `(a) log: ${JSON.stringify(h.logs())}`);
    }

    // (b) tagged, not live: no new tag; promote, dump and push as usual.
    {
      const R = makeR(t);
      tagTip(R);
      const { h, f } = makeE(mod, bs, R, {
        current: () => null,
        tenantCheck: () => ({ stdout: '1 5000 300000\n', stderr: '' }),
      });
      delete h.deps.processEnv.TENANT1_OWNER_EMAIL;
      const result = await h.run();
      assert.equal(result.ok, true, `(b) ok; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(result.tag, 'phase-0', '(b) tag');
      assert.equal(result.resume, true, '(b) resume');
      assert.equal(h.calls('github.createTag').length, 0, '(b) 0 createTag');
      assert.deepEqual(promoteIds(f), ['dpl_NEW'], '(b) promote dpl_NEW once');
      assert.equal(h.dumpCalls().length, 3, '(b) 3 dump calls');
      assert.equal(h.calls('supabase.push').length, 1, '(b) 1 push');
      assert.equal(h.bootstrapCalls().length, 0, '(b) 0 bootstrap sql calls');
    }

    // (c) already live and the checks fail: nothing to put back.
    {
      const R = makeR(t);
      tagTip(R);
      const { h, f } = makeE(mod, bs, R, {
        current: () => ({ id: 'dpl_NEW' }),
        fetch: () => ({ status: 500, json: async () => ({}) }),
      });
      const result = await h.run();
      assert.equal(result.code, 'verify_failed', `(c) code; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(result.rolledBack, false, '(c) rolledBack');
      assert.equal(promoteIds(f).length, 0, '(c) 0 promote');
      assert.ok(h.summaries().includes(VERIFY_NO_EARLIER_LINE), `(c) summary: ${JSON.stringify(h.summaries())}`);
    }
  });

  // T20 --------------------------------------------------------------------------------------------------------
  test('EZD-023e T20 token expiry notices on a released run', async (t) => {
    const mod = await loadRelease();
    const bs = await loadBootstrap();
    const cases = [
      ['a', () => ({ expiresAt: T0 + 13 * DAY }), ['vercel_token_expiring']],
      ['b', () => ({ expiresAt: T0 + 15 * DAY }), []],
      ['c', () => ({ expiresAt: null }), ['vercel_token_no_expiry']],
      [
        'd',
        () => {
          throw new Error('tokens failed: tok_TEST');
        },
        ['vercel_token_expiry_unknown'],
      ],
    ];
    for (const [id, tokenInfo, notices] of cases) {
      const R = makeR(t);
      const { h } = makeE(mod, bs, R, { tokenInfo });
      const result = await h.run();
      assert.equal(result.ok, true, `(${id}) ok; logs: ${JSON.stringify(h.logs())}`);
      assert.equal(result.code, 'released', `(${id}) code`);
      assert.deepEqual(result.notices, notices, `(${id}) notices`);
      if (id === 'a') {
        assert.ok(
          h.summaries().some((l) => l.includes('vercel_token_expiring') && l.includes('2026-11-01')),
          `(a) summary notice with the date: ${JSON.stringify(h.summaries())}`,
        );
      }
      assert.ok(!outputHolds(h, ['tok_TEST']), `(${id}) no token in the output`);
    }
  });

  // T21 --------------------------------------------------------------------------------------------------------
  test('EZD-023e T21 a pull request title is printed escaped', async (t) => {
    const mod = await loadRelease();
    const bs = await loadBootstrap();
    const R = makeR(t);
    const { h } = makeE(mod, bs, R, {
      pulls: () => [{ ...cleanPull(R.tip), title: 'Release notes\n::warning::x' }],
    });
    const result = await h.run();
    assert.equal(result.ok, false, 'ok false');
    assert.equal(result.code, 'no_release_name', `code; logs: ${JSON.stringify(h.logs())}`);
    const named = h.logs().filter((l) => l.startsWith('no_release_name'));
    assert.deepEqual(named, ['no_release_name: pull request #7 "Release notes\\n::warning::x" gives no release name']);
    assert.ok(!h.logs().some((l) => l.startsWith('::')), 'no log line starts with ::');
    assert.deepEqual(
      h.external.map((c) => c.target),
      [],
      'nothing live and nothing else called',
    );
  });

  // T22 --------------------------------------------------------------------------------------------------------
  test('EZD-023e T22 the build state is printed only in the safe form', async (t) => {
    const mod = await loadRelease();
    const bs = await loadBootstrap();
    const R = makeR(t);

    {
      const { h } = makeE(mod, bs, R, { find: () => ({ id: 'dpl_NEW', state: 'ERROR\n::warning::x' }) });
      const result = await h.run();
      assert.equal(result.code, 'build_failed', `(a) code; logs: ${JSON.stringify(h.logs())}`);
      const lines = h.logs().filter((l) => l.startsWith('build_failed'));
      assert.deepEqual(lines, [`build_failed: the build of ${R.tip} ended unknown`], '(a) log line');
      assert.ok(!h.logs().some((l) => l.startsWith('::')), '(a) no log line starts with ::');
      assert.equal(h.calls('sql').length, 0, '(a) 0 sql');
      assertNothingLive(h, 'a');
    }
    {
      const { h } = makeE(mod, bs, R, { find: () => ({ id: 'dpl_NEW', state: 'ERROR' }) });
      const result = await h.run();
      assert.equal(result.code, 'build_failed', `(b) code; logs: ${JSON.stringify(h.logs())}`);
      const lines = h.logs().filter((l) => l.startsWith('build_failed'));
      assert.equal(lines.length, 1, '(b) one build_failed line');
      assert.ok(lines[0].endsWith('ended ERROR'), '(b) the line ends ended ERROR');
    }
  });
});
