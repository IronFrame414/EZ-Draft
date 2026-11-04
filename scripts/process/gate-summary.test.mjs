// EZD-155 T1-T6: the gate's failure summary (scripts/gate-summary.mjs, used by scripts/gate.mjs): failing test lines, the error
// after each, the console caps and the log entries. Pure functions on fixed strings; nothing runs the gate (vault/plans/EZD-155.md
// sections 3 and 4; PROCESS v2.4 Change 7; Q-0268 sweep item 24; Q-0313).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFailing, isError, summarizeStep, FAILING_MAX, ERROR_WINDOW, TAIL_LINES } from '../gate-summary.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// node:test TAP as the gate's spawnSync pipes it: one passing result, one passing result, one failure with a YAML block scalar.
const F1 = [
  'TAP version 13',
  '# Subtest: EZD-000i T6 the hook answers with the error text',
  'ok 1 - EZD-000i T6 the hook answers with the error text',
  '  ---',
  '  duration_ms: 0.199',
  "  type: 'test'",
  '  ...',
  '# Subtest: Z',
  'ok 2 - Z',
  '  ---',
  '  duration_ms: 0.1',
  "  type: 'test'",
  '  ...',
  '# Subtest: X',
  'not ok 3 - X',
  '  ---',
  '  duration_ms: 0.244959',
  "  type: 'test'",
  "  location: '/repo/scripts/x.test.mjs:4:1'",
  "  failureType: 'testCodeFailure'",
  '  error: |-',
  '    Expected values to be strictly equal:',
  '    1 !== 2',
  "  code: 'ERR_ASSERTION'",
  "  name: 'AssertionError'",
  '  ...',
  '1..3',
  '# tests 3',
  '# pass 2',
  '# fail 1',
].join('\n');

// A nested failure, its failing parent, a to-do failure, a skipped result and a second file whose failure repeats a title.
const F2 = [
  '# Subtest: parent',
  '    # Subtest: inner',
  '    not ok 1 - inner',
  '      ---',
  "      failureType: 'testCodeFailure'",
  "      error: 'boom'",
  '      ...',
  '    1..1',
  'not ok 1 - parent',
  '  ---',
  "  failureType: 'subtestsFailed'",
  "  error: '1 subtest failed'",
  '  ...',
  'not ok 2 - later # TODO',
  '  ---',
  "  error: 'nope'",
  '  ...',
  'ok 3 - skipped one # SKIP',
  'not ok 1 - inner',
  '  ---',
  "  error: 'second file'",
  '  ...',
].join('\n');

// No failing line: titles that hold "error", a `>` line, "0 errors", then the one real error line.
const F3 = [
  '> tsc --noEmit # error check',
  '# Subtest: EZD-000i T6 the hook answers with the error text',
  'ok 1 - EZD-000i T6 the hook answers with the error text',
  'Found 0 errors in 0 files.',
  "src/a.ts(3,7): error TS2322: Type 'number' is not assignable to type 'string'.",
].join('\n');

// Vitest output: each FAIL and Test Files line starts with one space.
const F4 = [
  ' FAIL  src/a.test.ts > EZD-001 a > b',
  'AssertionError: expected 1 to be 2 // Object.is equality',
  ' Test Files  1 failed (1)',
].join('\n');

const F5 = 'one\n\ntwo\n';

// 13 failing results, each followed by its own error line.
const F6 = Array.from({ length: 13 }, (_, k) => [`not ok ${k + 1} - t${k + 1}`, `  error: 'e${k + 1}'`]).flat().join('\n');

// Q-0313: the passing result whose title holds FAIL, then a real failure.
const F7 = [
  'ok 316 - the CLI prints PLAN LINT OK or FAIL with exit 0 or 1',
  'not ok 280 - X',
  "  error: 'boom'",
].join('\n');

test('EZD-155 T1 node:test failure is named and its error follows it (AC-EZD-155-1)', () => {
  const r = summarizeStep('test', F1);
  assert.deepEqual(r, {
    failing: ['not ok 3 - X'],
    firstError: 'error: Expected values to be strictly equal:',
    consoleLines: ['not ok 3 - X', 'first error: error: Expected values to be strictly equal:'],
    entries: ['=== test ===', 'not ok 3 - X', '  error: Expected values to be strictly equal:'],
  });
  assert.ok(r.consoleLines.every((l) => !l.includes('T6')), r.consoleLines.join('\n'));
});

test('EZD-155 T2 nested, to-do, skipped and repeated failures (AC-EZD-155-1)', () => {
  const r = summarizeStep('test', F2);
  assert.deepEqual(r.failing, ['    not ok 1 - inner', 'not ok 1 - parent', 'not ok 1 - inner']);
  assert.equal(r.firstError, "error: 'boom'");
  assert.deepEqual(r.entries, [
    '=== test ===',
    'not ok 1 - inner',
    "  error: 'boom'",
    'not ok 1 - parent',
    "  error: '1 subtest failed'",
    'not ok 1 - inner',
    "  error: 'second file'",
  ]);
  assert.equal(isFailing('not ok 2 - later # TODO'), false);
  assert.equal(isFailing('ok 3 - skipped one # SKIP'), false);
});

test('EZD-155 T3 titles are never failing or the first error; `>` lines and 0 errors are never the first error (AC-EZD-155-1)', () => {
  const tsError = "src/a.ts(3,7): error TS2322: Type 'number' is not assignable to type 'string'.";
  assert.deepEqual(summarizeStep('typecheck', F3), {
    failing: [],
    firstError: tsError,
    consoleLines: [`first error: ${tsError}`],
    entries: ['=== typecheck ===', `first error: ${tsError}`],
  });
  for (const s of ['ok 5 - error text', 'not ok 6 - error text', '# Subtest: error text', '> eslint error']) {
    assert.equal(isError(s), false, s);
  }
  assert.equal(isError('Error: boom'), true);
  for (const s of ['ok 316 - the CLI prints PLAN LINT OK or FAIL with exit 0 or 1', '    ok 2 - nested ✗ mark']) {
    assert.equal(isFailing(s), false, s);
  }
  assert.equal(isFailing('not ok 280 - X'), true);
  assert.deepEqual(summarizeStep('test', F7), {
    failing: ['not ok 280 - X'],
    firstError: "error: 'boom'",
    consoleLines: ['not ok 280 - X', "first error: error: 'boom'"],
    entries: ['=== test ===', 'not ok 280 - X', "  error: 'boom'"],
  });
});

test('EZD-155 T4 vitest lines and the tail fallback are unchanged (AC-EZD-155-1)', () => {
  const v = summarizeStep('test', F4);
  assert.deepEqual(v.failing, [' FAIL  src/a.test.ts > EZD-001 a > b']);
  assert.equal(v.firstError, 'AssertionError: expected 1 to be 2 // Object.is equality');
  assert.deepEqual(v.entries, [
    '=== test ===',
    'FAIL  src/a.test.ts > EZD-001 a > b',
    '  AssertionError: expected 1 to be 2 // Object.is equality',
  ]);
  assert.deepEqual(summarizeStep('build', F5), {
    failing: [],
    firstError: null,
    consoleLines: ['one\ntwo'],
    entries: ['=== build ===', 'one\ntwo'],
  });
});

test('EZD-155 T5 console caps failing lines, the log keeps all (AC-EZD-155-1)', () => {
  const r = summarizeStep('test', F6);
  assert.equal(r.failing.length, 12);
  assert.equal(r.consoleLines.length, 13);
  assert.equal(r.entries.length, 27);
  assert.equal(r.entries[26], "  error: 'e13'");
  assert.equal(r.firstError, "error: 'e1'");
  assert.equal(FAILING_MAX, 12);
  assert.equal(ERROR_WINDOW, 30);
  assert.equal(TAIL_LINES, 8);
});

test('EZD-155 T6 gate.mjs uses the module (AC-EZD-155-1)', () => {
  const text = readFileSync(path.join(repo, 'scripts/gate.mjs'), 'utf8');
  assert.ok(text.includes("import { summarizeStep } from './gate-summary.mjs';"));
  assert.ok(text.includes('summarizeStep(label, out)'));
  assert.ok(!text.includes('const isFailing ='));
  assert.ok(!text.includes('const isError ='));
});
