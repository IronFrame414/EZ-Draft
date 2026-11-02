// EZD-286 T1-T5 (vault/plans/EZD-286.md sections 3 and 4). node:test, Node 22 built-ins plus the root dev
// dependency postgres (through db-lock.mjs). T1-T3 take real advisory locks on the local stack (D1); T4
// spawns `node --test` with the reporter flags F on a temporary file (D3); T5 reads source text (D2).
// Expected values: plan section 4 and decisions D1-D3, never from a run.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inScope } from '../backup/__tests__/local-fixture.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const importLock = () => import('./db-lock.mjs');

// F, verbatim from plan section 1 (Decided for the builder).
const F = [
  '--test-reporter=tap',
  '--test-reporter-destination=stdout',
  '--test-reporter=./scripts/test-harness/hook-fail-reporter.mjs',
  '--test-reporter-destination=stderr',
];

const PENDING_MS = 500;

// Resolves 'pending' when the promise has not settled after PENDING_MS, else 'settled'.
async function state(promise) {
  const timer = new Promise((resolve) => setTimeout(() => resolve('pending'), PENDING_MS));
  return Promise.race([promise.then(() => 'settled'), timer]);
}

// Holds `first`, asks for `second`, checks it waits, releases `first`, checks `second` resolves.
async function blocks(first, second) {
  const releases = [];
  try {
    releases.push(await first());
    const asked = second();
    assert.equal(await state(asked), 'pending', 'the second hold waits while the first is held');
    await releases.pop()();
    releases.push(await asked);
    assert.ok(true);
  } finally {
    for (const release of releases) await release();
  }
}

describe('EZD-286 T1-T3 root database lock', { skip: !inScope('EZD-286') }, () => {
  test('EZD-286 T1 shared held: exclusive waits, then resolves after release (AC-EZD-286-1)', async () => {
    const { holdRootDbShared, holdRootDbExclusive } = await importLock();
    await blocks(holdRootDbShared, holdRootDbExclusive);
  });

  test('EZD-286 T2 exclusive held: shared waits, then resolves after release (AC-EZD-286-1)', async () => {
    const { holdRootDbShared, holdRootDbExclusive } = await importLock();
    await blocks(holdRootDbExclusive, holdRootDbShared);
  });

  test('EZD-286 T3 two shared holds both resolve (AC-EZD-286-1)', async () => {
    const { holdRootDbShared, ROOT_DB_TEST_LOCK_KEY } = await importLock();
    assert.equal(ROOT_DB_TEST_LOCK_KEY, 286);
    const a = await holdRootDbShared();
    try {
      const second = holdRootDbShared();
      assert.equal(await state(second), 'settled', 'a second shared hold does not wait');
      await (await second)();
    } finally {
      await a();
    }
  });
});

function runNodeTest(file) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', ...F, file], { cwd: repo, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe('EZD-286 T4 hook failure reporter', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-286-'));
  const failing = path.join(dir, 'failing.test.mjs');
  const control = path.join(dir, 'control.test.mjs');
  writeFileSync(
    failing,
    [
      "import { describe, test, after } from 'node:test';",
      "describe('suite with a failing after', () => {",
      "  test('inner passes', () => {});",
      "  after(() => { throw new Error('cleanup boom'); });",
      '});',
    ].join('\n') + '\n',
  );
  writeFileSync(
    control,
    [
      "import { describe, test, after } from 'node:test';",
      "describe('suite with a passing after', () => {",
      "  test('inner passes', () => {});",
      '  after(() => {});',
      '});',
    ].join('\n') + '\n',
  );

  test('EZD-286 T4 a failing describe after exits 1 with the hook line on stderr; the control exits 0 (AC-EZD-286-2)', async () => {
    try {
      const bad = await runNodeTest(failing);
      assert.equal(bad.status, 1, `exit code\n${bad.stdout}\n${bad.stderr}`);
      assert.ok(
        bad.stderr.includes(`hook failure: ${realpathSync(failing)} > `) && bad.stderr.includes('cleanup boom'),
        `stderr names the file and the cause\n${bad.stderr}`,
      );
      const ok = await runNodeTest(control);
      assert.equal(ok.status, 0, `control exit code\n${ok.stdout}\n${ok.stderr}`);
      assert.ok(!ok.stderr.includes('hook failure'), `control stderr\n${ok.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const L = [
  'backup/__tests__/check.test.mjs',
  'backup/__tests__/db.test.mjs',
  'backup/__tests__/files.test.mjs',
  'backup/__tests__/psql-terse-local.test.mjs',
  'backup/__tests__/restore.test.mjs',
  'backup/__tests__/restore-drill.test.mjs',
  'backup/__tests__/soft-delete.test.mjs',
  'db/__tests__/api-gate-ready.test.mjs',
  'db/__tests__/realtime-warmup.test.mjs',
  'db/__tests__/types-check.test.mjs',
  'release/__tests__/cli-push-local.test.mjs',
  'release/__tests__/release-guard-local.test.mjs',
];

describe('EZD-286 T5 lock holders', () => {
  const here = path.join(repo, 'scripts');
  test('EZD-286 T5 each L file names holdRootDbShared; tenancy-bootstrap names holdRootDbExclusive (AC-EZD-286-1)', () => {
    for (const rel of L) {
      assert.match(readFileSync(path.join(here, rel), 'utf8'), /holdRootDbShared/, rel);
    }
    const tb = readFileSync(path.join(here, 'db/__tests__/tenancy-bootstrap.test.mjs'), 'utf8');
    assert.match(tb, /holdRootDbExclusive/);
    assert.doesNotMatch(tb, /holdRootDbShared/);
  });
});
