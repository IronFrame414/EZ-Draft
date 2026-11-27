// EZD-2005: the type-check lock is per build lane. Each lane has its own local stack (scripts/db/lane.mjs), so
// the EZD-200 lock ("checks take turns on the one stack") is one per stack: lane 0 keeps `ezd-gen-types.lock`,
// lanes 1-4 use `ezd-gen-types-lane<N>.lock` in the same shared supabase/.temp. Expected names:
// docs/architecture.md Local database. The module is loaded in a child driver, as in types-check.test.mjs; the
// fake CLI holds the lock while a second lane's check runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sharedTempDir } from '../stack-config.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const genTypesScript = path.join(repo, 'scripts', 'db', 'gen-types.mjs');
const genTypesUrl = pathToFileURL(genTypesScript).href;

test('EZD-2005 lock names: lane 0 keeps the EZD-200 name, lanes 1-4 each have their own', () => {
  const r = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(genTypesUrl)});
       process.stdout.write(JSON.stringify([0, 1, 2, 3, 4].map((l) => m.genTypesLockName(l))));`,
      'driver',
      '--check',
    ],
    { cwd: repo, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [
    'ezd-gen-types.lock',
    'ezd-gen-types-lane1.lock',
    'ezd-gen-types-lane2.lock',
    'ezd-gen-types-lane3.lock',
    'ezd-gen-types-lane4.lock',
  ]);
});

test('EZD-2005 a check in one lane takes that lane\'s lock and no other lane\'s', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-2005-lane-'));
  const lockRoot = sharedTempDir(repo);
  try {
    // A fake CLI that reports which lock dirs exist while it holds the lock, then prints the "types".
    const bin = path.join(tmp, 'supabase');
    writeFileSync(
      bin,
      `#!/usr/bin/env node
const fs = require('node:fs');
const held = fs.readdirSync(${JSON.stringify(lockRoot)}).filter((n) => /^ezd-gen-types.*\\.lock$/.test(n));
fs.writeFileSync(${JSON.stringify(path.join(tmp, 'held.json'))}, JSON.stringify(held));
process.stdout.write('x\\n');
`,
    );
    chmodSync(bin, 0o755);
    const file = path.join(tmp, 'database.types.ts');
    writeFileSync(file, 'x\n');
    const driver = `
const m = await import(${JSON.stringify(genTypesUrl)});
const err = [];
const code = await m.runGenTypes({ check: true, bin: ${JSON.stringify(bin)}, file: ${JSON.stringify(file)}, out: () => {}, err: (s) => err.push(s) });
process.stdout.write(JSON.stringify({ code, err: err.join('') }));
`;
    const run = (lane) =>
      new Promise((resolve) => {
        const env = { ...process.env, EZD_LANE: String(lane) };
        const c = spawn(process.execPath, ['--input-type=module', '-e', driver, 'driver', '--check'], { cwd: repo, env });
        let stdout = '';
        let stderr = '';
        c.stdout.on('data', (d) => (stdout += d));
        c.stderr.on('data', (d) => (stderr += d));
        c.on('close', (code) => resolve({ code, stdout, stderr }));
      });
    const r = await run(4);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), { code: 0, err: '' });
    const held = JSON.parse(readFileSync(path.join(tmp, 'held.json'), 'utf8'));
    assert.ok(held.includes('ezd-gen-types-lane4.lock'), `lane 4 held its own lock: ${held}`);
    // Lane 0's lock is not taken by a lane 4 check (another checkout may hold it; this run must not need it).
    assert.equal(r.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
