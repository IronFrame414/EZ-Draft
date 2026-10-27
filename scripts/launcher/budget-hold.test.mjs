// EZD-100 T1-T3: a real --once pass above the 80% weekly hold writes BUDGET_HOLD.md and sends one budget hold message,
// and budget.mjs --hold-at above the meter releases it (vault/plans/EZD-100.md sections 1, 3 and 4; Q-0268; Q-0359 (a)).
// The launcher runs only as a copy under a temporary root (weekly-warning.test.mjs pattern) with a stub ledger tool,
// a fake claude binary, a PATH shim for claude and a stub notify command: never the real scripts/run.mjs, never a real
// claude, never the real vault/ or launcher log.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  copyFileSync,
  chmodSync,
  rmSync,
  realpathSync,
  openSync,
  closeSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const made = [];
const mkTmp = () => {
  const d = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd100-')));
  made.push(d);
  return d;
};
after(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

// Stub ledger tool: the names run.mjs and budget.mjs import from the ledger tool, and --next-unit (weekly-warning.test.mjs).
const stubLedger = (nextUnit) =>
  [
    '// Stub ledger tool for the EZD-100 budget hold test: the names run.mjs and budget.mjs import, and --next-unit.',
    "export const weekStart = () => new Date('2030-01-07T07:00:00.000Z');",
    "export const weekSpend = () => ({ start: weekStart(), main: 0, fable: 0, runs: 0, ceiling: null, pct: null, text: 'stub' });",
    "export const questionsFingerprint = () => '';",
    'export const assignQuestionIds = () => ({});',
    `if (process.argv.includes('--next-unit')) console.log('${nextUnit}');`,
    '',
  ].join('\n');

// Fake claude (Block F of vault/plans/EZD-100.md section 1): records every call, answers --help with the flags run.mjs
// looks for, and a unit with a result line, so a regression that started a unit still ends cleanly.
const fakeClaude = (callsFile) =>
  [
    '#!/bin/sh',
    `printf '%s\\n' "$*" >> "${callsFile}"`,
    'if [ "$1" = "--help" ]; then echo "--max-turns --session-id --permission-prompts"; exit 0; fi',
    "printf '%s\\n' '{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"result\":\"fake unit done\",\"session_id\":\"ezd100-fake-session\",\"num_turns\":1,\"duration_ms\":5,\"total_cost_usd\":0,\"modelUsage\":{}}'",
    '',
  ].join('\n');

// PATH shim for claude (Block P of vault/plans/EZD-100.md section 1): records a call and fails.
const pathShim = (callsFile) => ['#!/bin/sh', `printf '%s\\n' "$*" >> "${callsFile}"`, 'exit 1', ''].join('\n');

// Shared constants (vault/plans/EZD-100.md section 3). Taken once in before(); both runs use the same RESETS_AT.
let RESETS_AT;
let MARKER;
let WARNED_AT;
let HOLD_MSG;
let ROOT;
let CHILD_ENV;

// A temporary root holding copies of the launcher and the files its import set needs (section 1 Decided).
function makeRoot() {
  const tmp = mkTmp();
  const at = (...p) => path.join(tmp, ...p);
  for (const d of ['scripts', 'vault/tools', 'vault/tickets', 'vault/cost', 'vault/handoff', 'logs', 'bin']) {
    mkdirSync(at(d), { recursive: true });
  }
  for (const f of ['run.mjs', 'budget.mjs', 'oauth-usage.mjs', 'cost-log.mjs', 'launcher-idle.mjs']) {
    copyFileSync(path.join(repo, 'scripts', f), at('scripts', f));
  }
  copyFileSync(path.join(repo, 'vault/tools/boost.mjs'), at('vault/tools/boost.mjs'));
  writeFileSync(at('vault/tools/next_ticket.mjs'), stubLedger('build EZD-999'));
  writeFileSync(at('vault/tickets/STATUS.md'), 'stub\n');
  writeFileSync(at('vault/budget.json'), JSON.stringify({ meter_source: 'statusline', weekly_ceiling_usd_est: 1000 }));
  writeFileSync(at('fake-claude'), fakeClaude(at('claude-calls.txt')), { mode: 0o755 });
  chmodSync(at('fake-claude'), 0o755);
  writeFileSync(at('bin/claude'), pathShim(at('path-claude-calls.txt')), { mode: 0o755 });
  chmodSync(at('bin/claude'), 0o755);
  writeFileSync(
    at('scripts/launcher.config.json'),
    JSON.stringify({
      claude_bin: at('fake-claude'),
      log_dir: at('logs'),
      notify_cmd: `printf '%s\\n' "$MSG" >> "${at('notified.txt')}"`,
    }),
  );
  return { tmp, at };
}

// Writes vault/cost/usage.json just before a run (section 1 Decided, Meters). five_hour at 10% is under the 90% pause.
function writeUsage(root, sevenPct) {
  const now = Date.now();
  writeFileSync(
    root.at('vault/cost/usage.json'),
    JSON.stringify({
      five_hour: { pct: 10, resets_at: new Date(now + 7_200_000).toISOString() },
      seven_day: { pct: sevenPct, resets_at: RESETS_AT },
      fable_seven_day: null,
      read_at: new Date(now).toISOString(),
      source: 'statusline',
    }),
  );
}

// One real `--once` run, with stdout and stderr appended to logs/launcher.log as launchd does (install.mjs:45-46, 60).
function runOnce(root) {
  const fd = openSync(root.at('logs/launcher.log'), 'a');
  const t0 = Date.now();
  let r;
  try {
    r = spawnSync(process.execPath, [root.at('scripts/run.mjs'), '--once'], {
      stdio: ['ignore', fd, fd],
      env: CHILD_ENV,
      timeout: 20000,
    });
  } finally {
    closeSync(fd);
  }
  const t1 = Date.now();
  return { status: r.status, signal: r.signal, t0, t1 };
}

const readIfExists = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);
const why = (r, logText) => `exit ${r.status}, signal ${r.signal}\n${logText}`;

// The real vault files the hold pass and --hold-at can write or delete (section 1 Decided, Real vault snapshot).
function realSnapshot() {
  const handoff = path.join(repo, 'vault/handoff');
  const warned = readdirSync(handoff)
    .filter((n) => n.startsWith('.budget-warned-'))
    .sort()
    .map((n) => `vault/handoff/${n}`);
  const names = [
    'vault/budget.json',
    'vault/handoff/BUDGET_HOLD.md',
    'vault/handoff/WINDOW_PAUSE.md',
    'vault/handoff/BOOST.json',
    'vault/handoff/last-failure.json',
    ...warned,
  ];
  return Object.fromEntries(names.map((n) => [n, readIfExists(path.join(repo, n))]));
}

// Snapshots (section 3). T1-T3 assert only on these.
let rL;
let logL;
let notifiedL;
let holdL;
let markerL;
let rB;
let holdB;
let claudeCalls;
let pathClaudeCalls;
let realBefore;
let realAfter;

before(() => {
  RESETS_AT = new Date(Date.now() + 3 * 86_400_000).toISOString();
  MARKER = `.budget-warned-${RESETS_AT.slice(0, 10)}`;
  WARNED_AT = new Date(Date.now() - 86_400_000).toISOString();
  HOLD_MSG = `budget hold: weekly usage at 85% (hold at 80%). In-progress ticket finishes; nothing new starts. See vault/handoff/BUDGET_HOLD.md.`;

  ROOT = makeRoot();
  CHILD_ENV = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
    GIT_CEILING_DIRECTORIES: path.dirname(ROOT.tmp),
    PATH: `${ROOT.at('bin')}${path.delimiter}${process.env.PATH ?? ''}`,
  };

  // The week's warning was already sent earlier this week, so the only notification of run L is the hold.
  writeFileSync(ROOT.at('vault/handoff', MARKER), WARNED_AT);

  realBefore = realSnapshot();

  // Run L: 85% weekly usage, at or above the 80% hold.
  writeUsage(ROOT, 85);
  rL = runOnce(ROOT);
  logL = readFileSync(ROOT.at('logs/launcher.log'), 'utf8');
  notifiedL = readIfExists(ROOT.at('notified.txt')) ?? '';
  holdL = readIfExists(ROOT.at('vault/handoff/BUDGET_HOLD.md'));
  markerL = readIfExists(ROOT.at('vault/handoff', MARKER));

  // Run B: budget.mjs --hold-at 90 on the root run L left (90 is above the 85% meter).
  rB = spawnSync(process.execPath, [ROOT.at('scripts/budget.mjs'), '--hold-at', '90'], {
    env: CHILD_ENV,
    encoding: 'utf8',
    timeout: 20000,
  });
  holdB = existsSync(ROOT.at('vault/handoff/BUDGET_HOLD.md'));

  claudeCalls = readIfExists(ROOT.at('claude-calls.txt'));
  pathClaudeCalls = readIfExists(ROOT.at('path-claude-calls.txt'));
  realAfter = realSnapshot();
});

test('EZD-100 T1 a real pass above the hold writes BUDGET_HOLD.md and notifies once (AC-EZD-100-1)', () => {
  assert.equal(rL.status, 0, why(rL, logL));

  assert.notEqual(holdL, null, `BUDGET_HOLD.md was not written\n${why(rL, logL)}`);
  const holdLines = holdL.split('\n');
  for (const line of [
    '- Reason: weekly usage reached the hold (85%)',
    `- Weekly window: 85% used (hold at 80%), resets ${RESETS_AT}; source: statusline`,
    '- Next unit when released: build EZD-999',
    '- `node scripts/budget.mjs --hold-at <pct>`',
    '- `node scripts/budget.mjs --until-reset`',
    '- `node scripts/budget.mjs --api-until-reset`',
  ]) {
    assert.ok(holdLines.includes(line), `BUDGET_HOLD.md lacks the line ${line}\n${holdL}`);
  }
  const written = /^Written by scripts\/run\.mjs on (\S+)\.$/m.exec(holdL);
  assert.ok(written, `BUDGET_HOLD.md has no "Written by scripts/run.mjs on" line\n${holdL}`);
  const stamp = Date.parse(written[1]);
  assert.ok(
    stamp >= rL.t0 - 1000 && stamp <= rL.t1 + 1000,
    `hold time ${written[1]} outside the run\n${why(rL, logL)}`,
  );

  assert.equal(notifiedL, `EZ Draft: ${HOLD_MSG}\n`, why(rL, logL));
  assert.ok(
    notifiedL.slice('EZ Draft: '.length).startsWith('budget hold: weekly usage at'),
    why(rL, logL),
  );

  const notifyLines = logL.split('\n').filter((l) => l.includes('NOTIFY: '));
  assert.equal(notifyLines.length, 1, `expected one NOTIFY: line, got ${notifyLines.length}\n${why(rL, logL)}`);
  assert.match(notifyLines[0], /^\[run \d{2}:\d{2}:\d{2}\] NOTIFY: /, why(rL, logL));
  assert.ok(notifyLines[0].endsWith(HOLD_MSG), `NOTIFY line does not end with the hold message\n${notifyLines[0]}`);

  assert.ok(
    logL.split('\n').some((l) => /^\[run \d{2}:\d{2}:\d{2}\] budget hold$/.test(l)),
    `the launcher log has no "budget hold" reason line\n${why(rL, logL)}`,
  );
  assert.ok(!logL.includes('dry run:'), `a real run logged a dry run line\n${why(rL, logL)}`);
  assert.ok(!logL.includes('build EZD-999:'), `the pass started the unit\n${why(rL, logL)}`);

  assert.equal(markerL, WARNED_AT, why(rL, logL));
});

test('EZD-100 T2 --hold-at above the meter releases the hold (AC-EZD-100-2)', () => {
  const whyB = `exit ${rB.status}, signal ${rB.signal}\n${rB.stdout}\n${rB.stderr}`;
  assert.equal(rB.status, 0, whyB);
  assert.equal(rB.stderr, '', whyB);
  const lines = rB.stdout.split('\n');
  const i = lines.findIndex((l) => l.includes('hold set at 90% (was 80%)'));
  assert.ok(i >= 0, `no "hold set at 90% (was 80%)" line\n${whyB}`);
  assert.ok(
    lines.slice(i + 1).includes('hold released (BUDGET_HOLD.md removed)'),
    `no "hold released (BUDGET_HOLD.md removed)" line after it\n${whyB}`,
  );
  assert.equal(holdB, false, whyB);
});

test('EZD-100 T3 a fake claude stands in and the real vault is untouched (AC-EZD-100-3)', () => {
  assert.equal(claudeCalls, null, `the fake claude was called\n${why(rL, logL)}`);
  assert.equal(pathClaudeCalls, null, `a claude on PATH was called\n${why(rL, logL)}`);
  assert.deepEqual(realAfter, realBefore, 'the real vault/ changed during the test');
  const cfg = JSON.parse(readFileSync(ROOT.at('scripts/launcher.config.json'), 'utf8'));
  assert.equal(cfg.claude_bin, ROOT.at('fake-claude'), 'the launcher config does not name the fake claude');
});
