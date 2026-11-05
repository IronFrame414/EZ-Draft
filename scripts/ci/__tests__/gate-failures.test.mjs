// EZD-192: the gate's failure list names failing tests only, never a Playwright expected failure (the ✘ progress mark).
// Each test runs the real scripts/gate.mjs on a throw-away fixture package (full scope, no install, no network).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'gate.mjs');
const T7 =
  '  ✘   1 [desktop] › e2e/net-guard.spec.ts:40:7 › EZD-159 net guard blocks page WebSockets › EZD-159 T7 a page WebSocket to a live host fails the test (135ms)';
const SAMPLE_PROGRESS =
  '  ✘   2 [desktop] › e2e/sign-in.spec.ts:10:7 › EZD-007f sign-in › EZD-007f sample (2.0s)';
const SAMPLE_HEADING =
  '  1) [desktop] › e2e/sign-in.spec.ts:10:7 › EZD-007f sign-in › EZD-007f sample ───';

let root;
before(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'gate-fixture-'));
});
after(() => {
  rmSync(root, { recursive: true, force: true });
});

// Builds a fixture package; `e2eOut` is what test:e2e prints, `e2eCode` its exit code; `testOut`/`testCode` the same for test.
function makeFixture(name, { e2eOut, e2eCode, testOut = '', testCode = 0 }) {
  const dir = path.join(root, name);
  mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  writeFileSync(path.join(dir, 'e2e-out.txt'), e2eOut);
  writeFileSync(path.join(dir, 'test-out.txt'), testOut);
  writeFileSync(
    path.join(dir, 'emit.mjs'),
    "import { readFileSync } from 'node:fs';\nprocess.stdout.write(readFileSync(process.argv[2], 'utf8'));\nprocess.exit(Number(process.argv[3]));\n",
  );
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: name,
      private: true,
      scripts: {
        typecheck: 'node -e "0"',
        lint: 'node -e "0"',
        build: 'node -e "0"',
        test: `node emit.mjs test-out.txt ${testCode}`,
        'test:e2e': `node emit.mjs e2e-out.txt ${e2eCode}`,
      },
    }),
  );
  return dir;
}

// The outer gate holds its lock in os.tmpdir() and sets the scope variables; the fixture gate gets its own tmp dir and a clean scope.
function runGate(dir, extra = {}) {
  const tmp = path.join(dir, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const env = { ...process.env, TMP: tmp, TEMP: tmp, TMPDIR: tmp };
  const keys = ['EZD_TEST_GREP', 'EZD_PHASE', 'EZD_TEST_SCOPE', 'NODE_TEST_CONTEXT', 'EZD_LANE', 'SUPABASE_WORKDIR'];
  for (const k of keys) delete env[k];
  Object.assign(env, extra);
  const r = spawnSync(process.execPath, [GATE, dir], { encoding: 'utf8', env });
  return { status: r.status, failures: readFileSync(path.join(dir, 'gate-failures.log'), 'utf8') };
}

describe('EZD-192 gate failure list', () => {
  it('G1 an expected failure (✘) is not listed, the real failure is', () => {
    const e2eOut = [
      'Running 2 tests using 1 worker',
      '',
      T7,
      SAMPLE_PROGRESS,
      '',
      SAMPLE_HEADING,
      '',
      '    Error: expect(received).toBe(expected)',
      '',
      '  1 failed',
      '    [desktop] › e2e/sign-in.spec.ts:10:7 › EZD-007f sign-in › EZD-007f sample',
      '  1 passed (3.0s)',
      '',
    ].join('\n');
    const dir = makeFixture('g1', { e2eOut, e2eCode: 1 });
    const { status, failures } = runGate(dir);
    assert.equal(status, 1);
    const lines = failures.split('\n');
    const at = lines.indexOf(SAMPLE_HEADING.trim());
    assert.ok(at >= 0, `heading line missing in:\n${failures}`);
    assert.equal(lines[at + 1], '  Error: expect(received).toBe(expected)');
    assert.ok(!failures.includes('EZD-159 T7'), `T7 listed:\n${failures}`);
  });

  it('G2 a green step lists nothing', () => {
    const e2eOut = ['Running 1 test using 1 worker', '', T7, '', '  1 passed (135ms)', ''].join('\n');
    const dir = makeFixture('g2', { e2eOut, e2eCode: 0 });
    const { status, failures } = runGate(dir);
    assert.equal(status, 0);
    assert.equal(failures, '');
  });

  it('G3 FAIL, × and ✖ lines of other runners are still listed', () => {
    const testOut = [' FAIL  src/a.test.ts > EZD-1 a', '   × EZD-1 b 3ms', '✖ EZD-1 c (2ms)', ''].join('\n');
    const dir = makeFixture('g3', { e2eOut: '  1 passed (1ms)\n', e2eCode: 0, testOut, testCode: 1 });
    const { status, failures } = runGate(dir);
    assert.equal(status, 1);
    const lines = failures.split('\n');
    for (const want of ['FAIL  src/a.test.ts > EZD-1 a', '× EZD-1 b 3ms', '✖ EZD-1 c (2ms)']) {
      assert.ok(lines.includes(want), `missing "${want}" in:\n${failures}`);
    }
  });

  it('G4 a step that cannot start or is killed names why (EZD-331) AC-EZD-331-1', () => {
    const afterTypecheck = (failures) => {
      const lines = failures.split('\n');
      const at = lines.indexOf('=== typecheck ===');
      assert.ok(at >= 0, `typecheck heading missing in:\n${failures}`);
      return lines[at + 1];
    };
    const base = { e2eOut: '  1 passed (1ms)\n', e2eCode: 0 };
    const a = makeFixture('g4a', base);
    mkdirSync(path.join(a, 'empty-bin'));
    const ra = runGate(a, { PATH: path.join(a, 'empty-bin') });
    assert.equal(ra.status, 1);
    assert.equal(afterTypecheck(ra.failures), 'spawnSync npm ENOENT');
    const b = makeFixture('g4b', base);
    mkdirSync(path.join(b, 'kill-bin'));
    writeFileSync(path.join(b, 'kill-bin', 'npm'), '#!/bin/sh\nkill -9 $$\n');
    chmodSync(path.join(b, 'kill-bin', 'npm'), 0o755);
    const rb = runGate(b, { PATH: `${path.join(b, 'kill-bin')}${path.delimiter}${process.env.PATH}` });
    assert.equal(rb.status, 1);
    assert.equal(afterTypecheck(rb.failures), 'signal SIGKILL');
  });
});
