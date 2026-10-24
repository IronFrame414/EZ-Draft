// EZD-025 T19 (vault/plans/EZD-025.md Tests; Step 3; Interface contract): the files and db CLIs check the GitHub
// environment rule before any secret is read, any request goes to the bucket or any database connection opens;
// with every name empty they end not_configured without asking GitHub. All dependencies are fakes; the rule
// shapes are the GitHub API's (scripts/release/github-api.mjs evaluateEnvironmentRule). Expected values: plan T19.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const FILES_NAMES = [
  'BACKUP_SOURCE_DB_URL',
  'BACKUP_SOURCE_SUPABASE_URL',
  'BACKUP_SOURCE_SECRET_KEY',
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_REGION',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
];
const DB_NAMES = FILES_NAMES.filter((n) => !['BACKUP_SOURCE_SUPABASE_URL', 'BACKUP_SOURCE_SECRET_KEY'].includes(n));

const ALL_BRANCHES = { deployment_branch_policy: null, can_admins_bypass: false, branch_policies: [] };
const mainOnly = (bypass) => ({
  deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  can_admins_bypass: bypass,
  branch_policies: [{ name: 'main', type: 'branch' }],
});

function harness(rule) {
  const calls = { github: 0, loadConfig: 0, makeStore: 0, makeSource: 0, storeCalls: 0, dump: 0 };
  const store = {
    versioningStatus: async () => {
      calls.storeCalls += 1;
      return null; // never versioned: the run ends versioning_off at the preflight
    },
    objectLockStatus: async () => ({ enabled: false, mode: null, days: null }),
  };
  const source = {
    startRun: async () => 'run-1',
    insertRun: async () => 'run-1',
    lastSucceeded: async () => null,
    finishRun: async () => {},
    close: async () => {},
  };
  const out = [];
  const stdout = Object.assign((s) => out.push(String(s)), { write: (s) => out.push(String(s)) });
  const cfg = {
    sourceDbUrl: 'postgresql://x',
    sourceSupabaseUrl: 'http://127.0.0.1',
    sourceSecretKey: 'k',
    s3: { endpoint: 'http://127.0.0.1:9', region: 'r', bucket: 'b', accessKeyId: 'i', secretAccessKey: 's' },
  };
  return {
    calls,
    out,
    deps: {
      github: {
        environmentBranchRule: async () => {
          calls.github += 1;
          return rule;
        },
      },
      loadConfig: () => {
        calls.loadConfig += 1;
        return cfg;
      },
      makeStore: () => {
        calls.makeStore += 1;
        return store;
      },
      makeSource: () => {
        calls.makeSource += 1;
        return source;
      },
      dump: async () => {
        calls.dump += 1;
        throw new Error('the dumper must not run');
      },
      stdout,
    },
  };
}

const envWith = (names, value) => ({
  GITHUB_ACTIONS: 'true',
  GITHUB_TOKEN: 'ghs_TEST',
  GITHUB_REPOSITORY: 'example/repo',
  ...Object.fromEntries(names.map((n) => [n, value])),
});

const CLIS = [
  ['files', FILES_NAMES, async () => (await import('../files.mjs')).runFilesCli],
  ['db', DB_NAMES, async () => (await import('../db.mjs')).runDbCli],
];

for (const [kind, names, load] of CLIS) {
  describe(`EZD-025 T19 ${kind} CLI checks the environment before any secret`, () => {
    for (const [id, rule] of [
      ['a', ALL_BRANCHES],
      ['b', mainOnly(true)],
    ]) {
      test(`EZD-025 T19 ${kind} (${id}) an unprotected environment is environment_unprotected`, async () => {
        const run = await load();
        const h = harness(rule);
        const { exitCode, result } = await run({ argv: [], processEnv: envWith(names, 'test-value') }, h.deps);
        assert.equal(exitCode, 1, 'exit 1');
        assert.equal(result.code, 'environment_unprotected');
        assert.equal(h.calls.loadConfig, 0, 'loadBackupConfig calls');
        assert.equal(h.calls.makeStore, 0, 'store (bucket requests) created');
        assert.equal(h.calls.storeCalls, 0, 'bucket requests');
        assert.equal(h.calls.makeSource, 0, 'source-database connections');
        assert.equal(h.calls.dump, 0, 'dumper calls');
      });
    }

    test(`EZD-025 T19 ${kind} (c) a main-only environment without admin bypass reaches the preflight`, async () => {
      const run = await load();
      const h = harness(mainOnly(false));
      const { result } = await run({ argv: [], processEnv: envWith(names, 'test-value') }, h.deps);
      assert.notEqual(result.code, 'environment_unprotected');
      assert.equal(h.calls.github, 1, 'github asked once');
      assert.ok(h.calls.storeCalls >= 1, 'the versioning preflight ran');
      assert.equal(result.code, 'versioning_off');
    });

    test(`EZD-025 T19 ${kind} (d) with every name empty the run is not_configured`, async () => {
      const run = await load();
      const h = harness(ALL_BRANCHES);
      const { exitCode, result } = await run({ argv: [], processEnv: envWith(names, '') }, h.deps);
      assert.equal(exitCode, 0, 'exit 0');
      assert.equal(result.code, 'not_configured');
      assert.equal(h.calls.github, 0, 'github calls');
      assert.equal(h.calls.loadConfig, 0, 'loadBackupConfig calls');
    });
  });
}
