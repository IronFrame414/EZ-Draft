// EZD-1939 (audit 2026-11-23 Area 2 triage, W5): a red check's loop.log `detail:` line names the failed stage and up to
// 5 failing tests from check-failures.log, never blank and never cut mid-line; a CLAUDE DIED line names the signal and
// the other lanes' events in the same second. The fixtures are shaped like the check-failures.log check.mjs writes; the
// Playwright one holds the EZD-219 B4 and EZD-1419 lines from loop.log (2026-11-23), the node:test one real TAP output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_LINE, createEvents, failedStage, failingTests, failureSummary, msToSecondEnd, oneLine, sameSecondEvents } from '../failure-lines.mjs';
import { describeExit, signalOfCode } from '../claude-exit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const fx = (n) => readFileSync(path.join(HERE, 'fixtures/check-failures', n), 'utf8');
const wholeLine = (l) => { assert.ok(l.trim().length > 0); assert.doesNotMatch(l, /\n/); assert.ok(l.length <= MAX_LINE); };

test('Playwright: the failed test is named with spec file:line and title; the flaky one is not', () => {
  const f = fx('e2e-playwright.txt');
  assert.deepEqual(failingTests(f), ['e2e/status-bar.spec.ts:264 EZD-219 B4 the live cursor readout makes no React commit [desktop]']);
  const line = failureSummary({ failures: f, out: 'CHECK FAIL at e2e after 1312s; details: x' });
  assert.equal(line, 'stage e2e; 1 failing test: e2e/status-bar.spec.ts:264 EZD-219 B4 the live cursor readout makes no React commit [desktop]');
  wholeLine(line);
});

test('Playwright without the summary block: the numbered headers name the tests', () => {
  const f = [
    'step: e2e',
    '  1) [desktop] › e2e/conflict-list.spec.ts:356:7 › EZD-299 conflicts › EZD-299 B6 a project you can no longer open ──────',
    '  2) [ipad] › e2e/settings-users.spec.ts:310:7 › EZD-104 users › EZD-104 B8 touch targets @ipad ──────',
  ].join('\n');
  assert.deepEqual(failingTests(f), [
    'e2e/conflict-list.spec.ts:356 EZD-299 B6 a project you can no longer open [desktop]',
    'e2e/settings-users.spec.ts:310 EZD-104 B8 touch targets @ipad [ipad]',
  ]);
});

test('node:test: "not ok" with its location, relative to the worktree; the failed file itself is not a test', () => {
  const f = fx('scripts-node-test.txt');
  assert.deepEqual(failingTests(f), ['scripts/loop/__tests__/lanes.test.mjs:88 a retried ticket is picked before three fresh ones']);
  assert.equal(failureSummary({ failures: f }), 'stage scripts tests; 1 failing test: scripts/loop/__tests__/lanes.test.mjs:88 a retried ticket is picked before three fresh ones');
});

test('vitest: FAIL lines with the line from the ❯ location, each test once', () => {
  const f = fx('unit-vitest.txt');
  assert.deepEqual(failingTests(f), [
    'src/server/db/permissions.test.ts:458 T11 every preset has a row for every key',
    'src/lib/review/sources.test.ts:31 lists field measure',
  ]);
  assert.equal(failureSummary({ failures: f }),
    'stage unit and database tests; 2 failing tests: src/server/db/permissions.test.ts:458 T11 every preset has a row for every key; src/lib/review/sources.test.ts:31 lists field measure');
});

test('at most 5 tests are named, then a count of the rest', () => {
  const f = ['step: scripts tests', ...Array.from({ length: 7 }, (_, i) => `not ok ${i + 1} - case ${i + 1}\n  location: '/r/scripts/a.test.mjs:${10 + i}:1'`)].join('\n');
  assert.equal(failureSummary({ failures: f, root: '/r' }),
    'stage scripts tests; 7 failing tests: scripts/a.test.mjs:10 case 1; scripts/a.test.mjs:11 case 2; scripts/a.test.mjs:12 case 3; scripts/a.test.mjs:13 case 4; scripts/a.test.mjs:14 case 5; +2 more');
});

test('long titles: whole titles are dropped to fit, never cut', () => {
  const long = 'x'.repeat(200);
  const f = ['step: e2e', '  3 failed', ...[1, 2, 3].map((n) => `    [desktop] › e2e/a.spec.ts:${n}:1 › S › ${n}${long}`)].join('\n');
  const line = failureSummary({ failures: f });
  assert.equal(line, `stage e2e; 3 failing tests: e2e/a.spec.ts:1 1${long} [desktop]; e2e/a.spec.ts:2 2${long} [desktop]; +1 more`);
  wholeLine(line);
});

test('no test named: the stage and the last real line, never blank (the EZD-1418 database failure)', () => {
  const line = failureSummary({ failures: fx('database-no-tests.txt') });
  assert.equal(line, 'stage database; no failing test named; last line: supabase start failed: port 55422 is already allocated');
});

test('no check-failures.log: the stage and last line come from stdout', () => {
  const out = 'ok   install (3s)\nFAIL typecheck (40s)\nCHECK FAIL at typecheck after 41s; details: /w/check-failures.log\n';
  assert.equal(failedStage('', out), 'typecheck');
  assert.equal(failureSummary({ failures: '', out }), 'stage typecheck; no failing test named; last line: CHECK FAIL at typecheck after 41s; details: /w/check-failures.log');
});

test('a check stopped at its time limit with nothing to read still gives a line', () => {
  assert.equal(failureSummary({ failures: '', out: '', timedOut: true }), 'check stopped at its time limit (stage unknown); no failing test named; see check.log');
  assert.equal(failureSummary({}), 'stage unknown; no failing test named; see check.log');
});

test('the Docker step line is found after the Docker line', () => {
  assert.equal(failedStage('Docker did not come back within 10 min\nstep: database (Docker check before it)\nfull log: x\n', ''), 'database (Docker check before it)');
});

test('oneLine keeps whole words and marks a cut', () => {
  assert.equal(oneLine('a  b\n c'), 'a b c');
  assert.equal(oneLine('alpha beta gamma', 11), 'alpha beta …');
  assert.equal(oneLine(''), '');
});

// W5: EZD-414 died at 2026-11-21T02:05:38Z, the second EZD-403 was REQUEUED.
test('a death names the other lanes\' events of the same second, not its own or other seconds', () => {
  const ev = createEvents();
  ev.note('START EZD-414 · lane 1 · Something', new Date('2026-11-21T02:00:00.100Z'));
  ev.note('REQUEUED EZD-403 (first failure: check still red)\n  detail: stage e2e; 1 failing test: x', new Date('2026-11-21T02:05:38.020Z'));
  ev.note('claude EZD-414 build ended (exit code 143)', new Date('2026-11-21T02:05:38.400Z'), 'EZD-414');
  ev.note('lane 2 check ended (EZD-403): red', new Date('2026-11-21T02:05:38.900Z'), 'EZD-403');
  ev.note('MERGED EZD-500', new Date('2026-11-21T02:05:39.000Z'));
  assert.equal(sameSecondEvents(ev.list(), '2026-11-21T02:05:38Z', 'EZD-414'),
    'same-second events: REQUEUED EZD-403 (first failure: check still red) | lane 2 check ended (EZD-403): red');
  assert.equal(sameSecondEvents(ev.list(), '2026-11-21T04:47:14Z', 'EZD-701'), 'same-second events: none');
});

test('the death line waits for its second to end', () => {
  assert.equal(msToSecondEnd(new Date('2026-11-21T02:05:38.250Z')), 850);
  assert.equal(msToSecondEnd(new Date('2026-11-21T02:05:38.000Z')), 1100);
});

test('exit 143 and 137 name the caught signal; a real signal and code 1 read as before', () => {
  assert.equal(signalOfCode(143), 'SIGTERM');
  assert.equal(signalOfCode(137), 'SIGKILL');
  assert.equal(signalOfCode(1), null);
  assert.equal(describeExit({ code: 143, signal: null, secs: 612 }), 'exit code 143 (SIGTERM) after 612 s');
  assert.equal(describeExit({ code: null, signal: 'SIGKILL', secs: 732 }), 'exit code none, signal SIGKILL after 732 s');
  assert.equal(describeExit({ code: 1, signal: null, secs: 47 }), 'exit code 1 after 47 s');
});

test('the loop logs these lines', () => {
  const loop = readFileSync(path.join(ROOT, 'scripts/loop.mjs'), 'utf8');
  assert.match(loop, /summary = failureSummary\(\{ failures, out, timedOut, root: cwd \}\)/);
  assert.match(loop, /statSync\(fp\)\.mtimeMs >= started/);
  assert.match(loop, /log\(`CLAUDE DIED \$\{opts\.name\}: \$\{describeExit\(r\)\}; session \$\{sid\}; \$\{near\}/);
  assert.match(loop, /CLAUDE DIED again[^\n]*sameSecond\(again, opts\.ticket\)/);
  assert.match(loop, /check red \(round \$\{i \+ 1\}\); builder fixing\\n {2}detail: \$\{ck\.summary\}/);
  assert.equal((loop.match(/wt, \[\], ck\.summary\)/g) || []).length, 3);
  assert.match(loop, /log\(`SET ASIDE \$\{t\.id\}: \$\{reason\}\$\{shown \?/);
  assert.doesNotMatch(loop, /slice\(-600\)/);
});

// From EZD-1939's own e2e run of 2026-11-24, which stopped before Playwright's summary.
test('Playwright stopped before its summary: the ✘ progress lines name the tests', () => {
  const f = [
    'step: e2e',
    '== failure lines ==',
    '  ✘    3 [desktop] › e2e/assistant-panel.spec.ts:184:7 › EZD-5603a assistant panel › EZD-5603a B1 the rail button opens the panel in the inspector place; a selection keeps it open; × closes it (1.0m)',
    '== last lines ==',
    '  ✘    1 [desktop] › e2e/ai-key.spec.ts:55:7 › EZD-5601 AI key in My profile › T22 the AI assistant section shows for an owner and for a member without permissions (1.0m)',
    '  -    5 [desktop] › e2e/ai-key.spec.ts:69:7 › EZD-5601 AI key in My profile › T22 a refused key stores nothing',
    '  ✘    3 [desktop] › e2e/assistant-panel.spec.ts:184:7 › EZD-5603a assistant panel › EZD-5603a B1 the rail button opens the panel in the inspector place; a selection keeps it open; × closes it (1.0m)',
  ].join('\n');
  assert.deepEqual(failingTests(f), [
    'e2e/assistant-panel.spec.ts:184 EZD-5603a B1 the rail button opens the panel in the inspector place; a selection keeps it open; × closes it [desktop]',
    'e2e/ai-key.spec.ts:55 T22 the AI assistant section shows for an owner and for a member without permissions [desktop]',
  ]);
});

// From EZD-1939's own scripts tests run of 2026-11-24: a whole file timed out, no single test failed.
test('node:test: a whole file that timed out is named when no single test is', () => {
  const f = [
    'step: scripts tests',
    '== failure lines ==',
    'not ok 95 - scripts/release/__tests__/scratch-check-local.test.mjs',
    "  location: '/Users/josh/Projects/ezdraft/.claude/worktrees/EZD-1939/scripts/release/__tests__/scratch-check-local.test.mjs:1:1'",
    "  error: 'test timed out after 300000ms'",
    "  code: 'ERR_TEST_FAILURE'",
  ].join('\n');
  assert.equal(failureSummary({ failures: f }), 'stage scripts tests; 1 failing test: scripts/release/__tests__/scratch-check-local.test.mjs (whole file, timed out)');
  assert.deepEqual(failingTests(fx('scripts-node-test.txt')), ['scripts/loop/__tests__/lanes.test.mjs:88 a retried ticket is picked before three fresh ones']);
});
