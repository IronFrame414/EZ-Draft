// EZD-025 T6, T7, T8, T13, T14, T15, T18 (vault/plans/EZD-025.md Tests; Steps 5 and 6; Interface contract):
// pickLatestDump and pickRestoreVersions (pure), and runRestore with fakes for the store, the scratch stack and
// the scratch queries. Expected values come from the plan rows; the dump is a fake in-memory folder whose
// manifest and file bytes the tests build. Tests that need no Docker always run; T14 (a real source on the local
// stack) is in the plan's scope guard.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FIX, FIX_NAME, RETIRED_EMPTY, RETIRED_PATH, commitFiles, makeRepo, migrationPath, tagAnnotated } from '../../release/__tests__/git-fixture.mjs';
import { REPO_ROOT, exec, inScope, newestMigrationVersion, query, stackStatus } from './local-fixture.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const NEWEST = newestMigrationVersion();
const PREFIX = 'db/20261101T080000Z/';
const P = randomUUID();
const OUT = path.join(os.tmpdir(), 'ezd025-secrets', 'restore.env');
const S3_ENV = {
  BACKUP_SOURCE_DB_URL: 'postgresql://postgres:pw@127.0.0.1:5432/postgres',
  BACKUP_SOURCE_SUPABASE_URL: 'http://127.0.0.1:54321',
  BACKUP_SOURCE_SECRET_KEY: 'stub-source-secret',
  BACKUP_S3_ENDPOINT: 'http://127.0.0.1:9',
  BACKUP_S3_REGION: 'us-east-1',
  BACKUP_S3_BUCKET: 'ezd025-offsite',
  BACKUP_S3_ACCESS_KEY_ID: 'stub-key-id',
  BACKUP_S3_SECRET_ACCESS_KEY: 'stub-secret-EZD025',
};
const loadRestore = () => import('../restore.mjs');
const loadPick = () => import('../pick.mjs');

// ---- fakes -------------------------------------------------------------------------------------------------------
const tmpRoots = [];
const tmp = () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'ezd025-restore-'));
  tmpRoots.push(d);
  return d;
};
after(() => tmpRoots.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** The three dump files as bytes, plus a manifest that matches them (override pieces per case). */
function dumpBytes() {
  return {
    'roles.sql': Buffer.from('-- roles\n'),
    'schema.sql': Buffer.from('-- schema\n'),
    'data.sql': Buffer.from('-- data\n'),
  };
}
function manifestFor(bytes, over = {}) {
  return {
    format: 1,
    created_at: '2026-11-01T08:00:00.000Z',
    source_ref: 'local',
    newest_migration: NEWEST,
    files: Object.entries(bytes).map(([name, b]) => ({ name, size: b.length, sha256: sha(b) })),
    ...over,
  };
}

/** A store over an in-memory key -> bytes map. `served` can differ from what the manifest says (T7 b). */
function fakeStore(objects) {
  const calls = { getToFile: [], list: [] };
  return {
    calls,
    list: async (prefix) => {
      calls.list.push(prefix);
      return Object.keys(objects).filter((k) => k.startsWith(prefix)).sort();
    },
    getToFile: async (key, to) => {
      calls.getToFile.push(key);
      if (!(key in objects)) throw new Error('no such key');
      mkdirSync(path.dirname(to), { recursive: true });
      writeFileSync(to, objects[key]);
    },
    head: async (key) => (key in objects ? { size: objects[key].length, meta: {} } : null),
    listVersions: async () => [],
  };
}
const dumpObjects = (bytes, manifest) => ({
  ...Object.fromEntries(Object.entries(bytes).map(([n, b]) => [`${PREFIX}${n}`, b])),
  [`${PREFIX}manifest.json`]: Buffer.from(JSON.stringify(manifest)),
});

/** Fake scratch module; every function records its calls. */
function fakeScratch(over = {}) {
  const calls = { prepareWorkdir: [], startScratch: [], loadData: [], uploadFiles: [], stopScratch: [] };
  const q = {
    maxMigration: async () => NEWEST,
    triggerEnabled: async () => true,
    projectExists: async () => true,
    objectsFor: async () => [
      { bucket: 'b1', name: `t/${P}/a.bin` },
      { bucket: 'b1', name: `t/${P}/b.txt` },
    ],
    sha256Of: async (_b, n) => `sha-${n}`,
    offsiteSha256: async (_b, n) => `sha-${n}`,
    ...(over.queries ?? {}),
  };
  const scratch = {
    prepareWorkdir: async (a) => {
      calls.prepareWorkdir.push(a);
      return '/tmp/ezd025-fake-workdir';
    },
    startScratch: async (w) => {
      calls.startScratch.push(w);
      return { apiUrl: 'http://127.0.0.1:55321', dbUrl: 'postgresql://x@127.0.0.1:55322/postgres', secretKey: 'k', dbContainer: 'c' };
    },
    loadData: async (...a) => void calls.loadData.push(a),
    uploadFiles: async (...a) => {
      calls.uploadFiles.push(a);
      return { filesRestored: 2 };
    },
    stopScratch: async (w) => void calls.stopScratch.push(w),
    queries: () => q,
    ...(over.scratch ?? {}),
  };
  return { scratch, calls };
}

function makeDeps({ objects, scratch, loadEnvFile, source, git } = {}) {
  const bytes = dumpBytes();
  const store = fakeStore(objects ?? dumpObjects(bytes, manifestFor(bytes)));
  const loader = { calls: [] };
  const fs = fakeScratch(scratch);
  const fakeSource = source ?? {
    insertRun: async () => {},
    close: async () => {},
  };
  return {
    deps: {
      loadEnvFile:
        loadEnvFile ??
        ((p) => {
          loader.calls.push(p);
          return { ...S3_ENV };
        }),
      makeStore: () => store,
      makeSource: () => fakeSource,
      scratch: fs.scratch,
      git: git ?? { migrationsAt: async () => [] },
      tmpDir: tmp(),
    },
    store,
    loader,
    calls: fs.calls,
  };
}
const baseOpts = (over = {}) => ({
  projects: [P],
  processEnv: { ...S3_ENV },
  isTTY: true,
  repoRoot: REPO_ROOT,
  ...over,
});
// The loader wrapper above records only when the default is used; tests that need the loader pass their own.
const recordingLoader = () => {
  const calls = [];
  return { calls, fn: (p) => (calls.push(p), { ...S3_ENV }) };
};

// ---- T6 and T18: pure ----------------------------------------------------------------------------------------------
describe('EZD-025 T6 and T18 picking', () => {
  test('EZD-025 T6 the latest complete dump is the newest folder that has a manifest', async () => {
    const { pickLatestDump } = await loadPick();
    assert.equal(
      pickLatestDump([
        'db/20261025T080000Z/manifest.json',
        'db/20261025T080000Z/data.sql',
        'db/20261101T080000Z/data.sql',
        'files/x/y',
      ]),
      'db/20261025T080000Z/',
    );
    assert.equal(pickLatestDump([]), null);
  });

  test('EZD-025 T18 the restore picks the version to load', async () => {
    const { pickRestoreVersions } = await loadPick();
    const e = (key, versionId, isDeleteMarker, minute) => ({
      key,
      versionId,
      isDeleteMarker,
      lastModified: `2026-11-01T08:${String(minute).padStart(2, '0')}:00.000Z`,
      size: isDeleteMarker ? null : 5,
    });
    const k1v1 = e('k1', 'k1v1', false, 1);
    const k1v2 = e('k1', 'k1v2', false, 2);
    const k2v1 = e('k2', 'k2v1', false, 1);
    const k2m = e('k2', 'k2m', true, 2);
    const k3m = e('k3', 'k3m', true, 1);
    const k4v1 = e('k4', 'k4v1', false, 1);
    const k4v2 = e('k4', 'k4v2', false, 2);
    const k4m = e('k4', 'k4m', true, 3);
    // Listed out of time order on purpose: the pick sorts by lastModified itself.
    const picked = pickRestoreVersions([k4m, k1v2, k3m, k2m, k4v1, k1v1, k2v1, k4v2]);
    assert.deepEqual(Object.keys(picked).sort(), ['k1', 'k2', 'k4'], 'k3 is absent');
    assert.equal(picked.k1, k1v2, 'k1 is v2');
    assert.equal(picked.k2, k2v1, 'k2 is v1');
    assert.equal(picked.k4, k4v2, 'k4 is v2');
  });
});

// ---- T7 ------------------------------------------------------------------------------------------------------------
describe('EZD-025 T7 restore preconditions', () => {
  test('EZD-025 T7 (a) a dump newer than the repo is repo_older_than_dump', async () => {
    const { runRestore } = await loadRestore();
    const { prepareWorkdir } = await import('../scratch.mjs');
    const bytes = dumpBytes();
    const h = makeDeps({
      objects: dumpObjects(bytes, manifestFor(bytes, { newest_migration: '29991231235959' })),
      scratch: { scratch: { prepareWorkdir } },
    });
    const { exitCode, result } = await runRestore(baseOpts({ local: false }), h.deps);
    assert.equal(result.code, 'repo_older_than_dump');
    assert.equal(exitCode, 1);
    assert.equal(h.calls.startScratch.length, 0, 'startScratch calls');
  });

  test('EZD-025 T7 (b) a data.sql that differs from the manifest is dump_corrupt', async () => {
    const { runRestore } = await loadRestore();
    const bytes = dumpBytes();
    const objects = dumpObjects(bytes, manifestFor(bytes));
    objects[`${PREFIX}data.sql`] = Buffer.from('-- tampered\n');
    const h = makeDeps({ objects });
    const { exitCode, result } = await runRestore(baseOpts(), h.deps);
    assert.equal(result.code, 'dump_corrupt');
    assert.equal(exitCode, 1);
    assert.equal(h.calls.startScratch.length, 0, 'startScratch calls');
  });

  test('EZD-025 T7 (c) no dump is no_dump', async () => {
    const { runRestore } = await loadRestore();
    const h = makeDeps({ objects: { 'files/x/y': Buffer.from('1') } });
    const { exitCode, result } = await runRestore(baseOpts(), h.deps);
    assert.equal(result.code, 'no_dump');
    assert.equal(exitCode, 1);
    assert.equal(h.calls.startScratch.length, 0, 'startScratch calls');
  });

  test('EZD-025 T7 (d) a project that is not a UUID is usage', async () => {
    const { runRestore } = await loadRestore();
    const h = makeDeps();
    const { exitCode, result } = await runRestore(baseOpts({ projects: ['not-a-uuid'] }), h.deps);
    assert.equal(result.code, 'usage');
    assert.equal(exitCode, 1);
    assert.equal(h.calls.startScratch.length, 0, 'startScratch calls');
  });
});

// ---- T8 ------------------------------------------------------------------------------------------------------------
describe('EZD-025 T8 restore checks', () => {
  const cases = [
    ['a', 'project_missing', { projectExists: async () => false }],
    ['b', 'file_mismatch', { sha256Of: async (_b, n) => (n.endsWith('b.txt') ? 'different' : `sha-${n}`) }],
    ['c', 'file_missing', { sha256Of: async (_b, n) => (n.endsWith('b.txt') ? null : `sha-${n}`) }],
    ['d', 'migrations_mismatch', { maxMigration: async () => '19990101000000' }],
    ['e', 'trigger_disabled', { triggerEnabled: async () => false }],
  ];
  for (const [id, code, queries] of cases) {
    test(`EZD-025 T8 (${id}) ${code}`, async () => {
      const { runRestore } = await loadRestore();
      const h = makeDeps({ scratch: { queries } });
      const { exitCode, result } = await runRestore(baseOpts(), h.deps);
      assert.equal(result.ok, false, 'ok false');
      assert.ok(result.problems.map((p) => p.code).includes(code), `problem ${code}`);
      assert.equal(h.calls.stopScratch.length, 1, 'stopScratch calls');
      assert.equal(exitCode, 1, 'exit code');
    });
  }

  test('EZD-025 T8 (f) a clean restore with keep leaves the scratch stack running', async () => {
    const { runRestore } = await loadRestore();
    const h = makeDeps();
    const { exitCode, result } = await runRestore(baseOpts({ keep: true }), h.deps);
    assert.equal(result.ok, true, 'ok true');
    assert.deepEqual(result.problems, [], 'no problems');
    assert.equal(exitCode, 0);
    assert.equal(h.calls.stopScratch.length, 0, 'stopScratch calls');
  });
});

// ---- T13 -----------------------------------------------------------------------------------------------------------
describe('EZD-025 T13 restore guards', () => {
  const refused = [
    ['a', { processEnv: { CLAUDECODE: '1' } }, 'agent_refused'],
    ['b', { processEnv: { CI: '1' } }, 'ci_refused'],
    ['c', { processEnv: { GITHUB_ACTIONS: 'true' } }, 'ci_refused'],
    ['d', { processEnv: {}, isTTY: false }, 'tty_required'],
    ['f', { processEnv: {}, envFile: '.env.restore.local' }, 'env_file_not_absolute'],
    ['g', { processEnv: {}, envFile: path.join(REPO_ROOT, 'restore.env') }, 'env_file_in_repo'],
  ];
  for (const [id, over, code] of refused) {
    test(`EZD-025 T13 (${id}) ${code}`, async () => {
      const { runRestore } = await loadRestore();
      const loader = recordingLoader();
      const h = makeDeps({ loadEnvFile: loader.fn });
      const opts = baseOpts({ envFile: OUT, ...over });
      const { exitCode, result } = await runRestore(opts, h.deps);
      assert.equal(result.code, code);
      assert.equal(exitCode, 1);
      assert.equal(loader.calls.length, 0, 'env loader calls');
      assert.equal(h.calls.startScratch.length, 0, 'startScratch calls');
    });
  }

  test('EZD-025 T13 (e) with no env file the guards do not apply', async () => {
    const { runRestore } = await loadRestore();
    const loader = recordingLoader();
    const h = makeDeps({ loadEnvFile: loader.fn });
    await runRestore(baseOpts({ processEnv: { CI: '1', ...S3_ENV }, envFile: undefined }), h.deps);
    assert.equal(loader.calls.length, 0, 'env loader calls');
    assert.ok(h.calls.startScratch.length >= 1, 'startScratch reached');
  });

  test('EZD-025 T13 (h) an absolute file outside the repo is read once', async () => {
    const { runRestore } = await loadRestore();
    const loader = recordingLoader();
    const h = makeDeps({ loadEnvFile: loader.fn });
    await runRestore(baseOpts({ processEnv: {}, envFile: OUT }), h.deps);
    assert.deepEqual(loader.calls, [OUT], 'loader called once with OUT');
  });
});

// ---- T15 -----------------------------------------------------------------------------------------------------------
describe('EZD-025 T15 release dump folder on disk', () => {
  test('EZD-025 T15 a folder with release.json takes its newest migration from the tag', async () => {
    const { runRestore } = await loadRestore();
    const repo = makeRepo();
    try {
      commitFiles(repo.work, { [migrationPath(FIX_NAME)]: FIX, [RETIRED_PATH]: RETIRED_EMPTY }, 'C1');
      tagAnnotated(repo.work, 'phase-0');
      const dir = tmp();
      const bytes = dumpBytes();
      for (const [n, b] of Object.entries(bytes)) writeFileSync(path.join(dir, n), b);
      writeFileSync(
        path.join(dir, 'release.json'),
        JSON.stringify({
          tag: 'phase-0',
          dump_files: Object.entries(bytes).map(([name, b]) => ({ name, size: b.length, sha256: sha(b) })),
        }),
      );
      const h = makeDeps({
        scratch: { queries: { maxMigration: async () => '20261101000000' } },
        git: {
          migrationsAt: async (tag) =>
            spawnSync('git', ['-C', repo.work, 'ls-tree', '-r', '--name-only', tag, 'supabase/migrations'], {
              encoding: 'utf8',
            })
              .stdout.split('\n')
              .filter(Boolean),
        },
      });
      const { exitCode, result } = await runRestore(
        baseOpts({ projects: [], fromDir: dir, repoRoot: repo.work }),
        h.deps,
      );
      assert.equal(h.calls.prepareWorkdir.length, 1, 'prepareWorkdir calls');
      assert.equal(h.calls.prepareWorkdir[0].newestMigration, '20261101000000', 'newestMigration');
      assert.equal(h.calls.uploadFiles.length, 0, 'uploadFiles calls');
      assert.equal(result.ok, true, 'ok');
      assert.equal(exitCode, 0);
    } finally {
      repo.cleanup();
    }
  });
});

// ---- T14 -----------------------------------------------------------------------------------------------------------
describe('EZD-025 T14 --record', { skip: !inScope('EZD-025') }, () => {
  const rows = () =>
    query(`select count(*)::int as n from public.backup_run where kind = 'restore_drill'`)[0].n;
  after(() => exec("delete from public.backup_run where kind = 'restore_drill' and location = '" + PREFIX + "';"));

  const run = async (over, queries) => {
    const { runRestore } = await loadRestore();
    const { createSource } = await import('../source.mjs');
    const local = stackStatus();
    const source = createSource({ dbUrl: local.dbUrl, supabaseUrl: local.apiUrl, secretKey: local.secretKey });
    const h = makeDeps({ scratch: { queries }, source });
    try {
      return await runRestore(baseOpts({ local: true, ...over }), h.deps);
    } finally {
      await source.close();
    }
  };

  test('EZD-025 T14 (a) a clean restore with record writes a succeeded restore_drill row', async () => {
    const before = rows();
    const { result } = await run({ record: true });
    assert.equal(result.ok, true);
    assert.equal(rows(), before + 1, 'one new row');
    const row = query(
      `select status, location, error from public.backup_run where kind = 'restore_drill'
       order by started_at desc limit 1`,
    )[0];
    assert.deepEqual(row, { status: 'succeeded', location: PREFIX, error: null });
  });

  test('EZD-025 T14 (b) a failed restore with record writes a failed row with the first problem code', async () => {
    const before = rows();
    const { result } = await run({ record: true }, { projectExists: async () => false });
    assert.equal(result.ok, false);
    assert.equal(rows(), before + 1, 'one new row');
    const row = query(
      `select status, error from public.backup_run where kind = 'restore_drill' order by started_at desc limit 1`,
    )[0];
    assert.deepEqual(row, { status: 'failed', error: 'project_missing' });
  });

  test('EZD-025 T14 (c) without record no row is written', async () => {
    const before = rows();
    await run({ record: false });
    assert.equal(rows(), before, 'no new row');
  });
});
