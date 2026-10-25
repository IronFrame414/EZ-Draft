// EZD-156 T1-T3 (vault/plans/EZD-156.md sections 1, 3, 4; EZD-017 K1, K3, K4). node:test.
// T1 and T2: an empty --only list is a usage error. T3: the perf check's own app server starts without the
// five Supabase names. Matches exit codes, files and env names, never wording.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { UsageError, runCheck, startAppServer } from '../check.mjs';
import { REPO_ROOT, hasLatest, runCli, tmpDir, writeConfig } from './helpers.mjs';

// Written out here, never read from STRIPPED_ENV, so removing a name from the code fails T3 (plan section 1).
const SUPABASE_NAMES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_API_GATE_SECRET',
  'EZD_TEST_DB_URL',
];
const KEPT_NAME = 'EZD156_KEPT';

const MEASUREMENTS = [{ id: 'js-size:fixture-small', budget: 'download.client-link', url: '/small.html' }];

// The fake `next` binary (CommonJS): answers every request with the sorted names of its own env, never values.
const FAKE_NEXT = `const http = require('node:http');
const a = process.argv;
const port = Number(a[a.indexOf('-p') + 1]);
const host = a[a.indexOf('-H') + 1];
http
  .createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(Object.keys(process.env).sort()));
  })
  .listen(port, host);
`;

/** The three paths startAppServer reads (check.mjs): .next/BUILD_ID and the next binary with its package.json. */
function makeFakeRepo() {
  const root = tmpDir();
  const nextDir = path.join(root, 'app', 'node_modules', 'next');
  mkdirSync(path.join(root, 'app', '.next'), { recursive: true });
  mkdirSync(path.join(nextDir, 'dist', 'bin'), { recursive: true });
  writeFileSync(path.join(root, 'app', '.next', 'BUILD_ID'), 'fake\n');
  writeFileSync(path.join(nextDir, 'package.json'), '{"name":"next","type":"commonjs"}');
  writeFileSync(path.join(nextDir, 'dist', 'bin', 'next'), FAKE_NEXT);
  return root;
}

describe('EZD-156 perf check guards', () => {
  test('EZD-156 T1 An empty --only list is a usage error', { timeout: 120000 }, async () => {
    const dir = tmpDir();
    const cfg = writeConfig(dir, MEASUREMENTS);
    for (const [name, only] of [
      ['comma', ','],
      ['empty string', ''],
    ]) {
      const out = path.join(tmpDir(), 'out');
      const r = await runCli([
        '--config',
        cfg,
        '--base-url',
        'http://127.0.0.1:1',
        '--out',
        out,
        '--only',
        only,
      ]);
      assert.equal(r.status, 2, `${name}: exit ${r.status} ${r.stdout}${r.stderr}`);
      assert.equal(hasLatest(out), false, `${name}: no latest.json`);
      assert.ok(!r.stdout.includes('PERF PASS'), `${name}: stdout must not say PERF PASS`);
    }
  });

  test('EZD-156 T2 runCheck refuses an empty only list', { timeout: 30000 }, async () => {
    const dir = tmpDir();
    const cfg = writeConfig(dir, MEASUREMENTS);
    const outDir = path.join(dir, 'out');
    await assert.rejects(
      runCheck({
        repoRoot: REPO_ROOT,
        cwd: dir,
        configPath: cfg,
        baseUrl: 'http://127.0.0.1:1',
        only: [],
        outDir,
      }),
      UsageError,
    );
    assert.equal(hasLatest(outDir), false, 'no latest.json');
  });

  test('EZD-156 T3 The perf server starts without the Supabase names', { timeout: 30000 }, async () => {
    const root = makeFakeRepo();
    const names = [...SUPABASE_NAMES, KEPT_NAME];
    const saved = new Map(names.map((n) => [n, process.env[n]]));
    for (const n of SUPABASE_NAMES) process.env[n] = 'ezd-156-probe';
    process.env[KEPT_NAME] = '1';
    let server;
    try {
      server = await startAppServer(root);
      assert.equal(server.baseUrl, 'http://127.0.0.1:3200');
      const r = await fetch(`${server.baseUrl}/dev/shell`);
      const keys = await r.json();
      assert.ok(Array.isArray(keys), 'the fake next answers a JSON array of env names');
      assert.ok(keys.includes(KEPT_NAME), `${KEPT_NAME} reaches the server (positive control)`);
      for (const n of SUPABASE_NAMES) assert.ok(!keys.includes(n), n);
    } finally {
      await server?.stop();
      for (const [n, v] of saved) {
        if (v === undefined) delete process.env[n];
        else process.env[n] = v;
      }
    }
  });
});
