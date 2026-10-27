// EZD-197 T1-T3: at 70% weekly usage the gates write the week's .budget-warned marker, send one notification and log the NOTIFY line;
// a second pass in the same week sends nothing (vault/plans/EZD-197.md sections 1, 3 and 4; PROCESS.md section 11; Q-0268).
// The launcher runs only as a copy under a temporary root (dry-run.test.mjs pattern) with a stub ledger tool, a fake claude binary
// and a stub notify command: never the real scripts/run.mjs, never a real claude, never the real vault/ or launcher log.
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
  const d = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd197-')));
  made.push(d);
  return d;
};
after(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

// Stub ledger tool: the names run.mjs and budget.mjs import from the ledger tool, and --next-unit (dry-run.test.mjs, unchanged).
const stubLedger = (nextUnit) =>
  [
    '// Stub ledger tool for the EZD-197 weekly warning test: the names run.mjs and budget.mjs import, and --next-unit.',
    "export const weekStart = () => new Date('2030-01-07T07:00:00.000Z');",
    "export const weekSpend = () => ({ start: weekStart(), main: 0, fable: 0, runs: 0, ceiling: null, pct: null, text: 'stub' });",
    "export const questionsFingerprint = () => '';",
    'export const assignQuestionIds = () => ({});',
    `if (process.argv.includes('--next-unit')) console.log('${nextUnit}');`,
    '',
  ].join('\n');

// Fake claude (Block F of vault/plans/EZD-197.md section 1): answers --help with the flags run.mjs looks for, and a unit with a result line.
const FAKE_CLAUDE = [
  '#!/bin/sh',
  'if [ "$1" = "--help" ]; then echo "--max-turns --session-id --permission-prompts"; exit 0; fi',
  "printf '%s\\n' '{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"result\":\"fake unit done\",\"session_id\":\"ezd197-fake-session\",\"num_turns\":1,\"duration_ms\":5,\"total_cost_usd\":0,\"modelUsage\":{}}'",
  '',
].join('\n');

// Shared constants (vault/plans/EZD-197.md section 3). Taken once in before(); both runs use the same RESETS_AT.
let RESETS_AT;
let WEEK_DATE;
let EXPECTED_MSG;
let MARKER;
let ROOT;
let CHILD_ENV_BASE;

// A temporary root holding copies of the launcher and the files its import set needs (section 1 Decided).
function makeRoot() {
  const tmp = mkTmp();
  const at = (...p) => path.join(tmp, ...p);
  for (const d of ['scripts', 'vault/tools', 'vault/tickets', 'vault/cost', 'vault/handoff', 'logs']) {
    mkdirSync(at(d), { recursive: true });
  }
  for (const f of ['run.mjs', 'budget.mjs', 'oauth-usage.mjs', 'cost-log.mjs', 'launcher-idle.mjs']) {
    copyFileSync(path.join(repo, 'scripts', f), at('scripts', f));
  }
  copyFileSync(path.join(repo, 'vault/tools/boost.mjs'), at('vault/tools/boost.mjs'));
  writeFileSync(at('vault/tools/next_ticket.mjs'), stubLedger('build EZD-999'));
  writeFileSync(at('vault/tickets/STATUS.md'), 'stub\n');
  writeFileSync(at('vault/budget.json'), JSON.stringify({ meter_source: 'statusline', weekly_ceiling_usd_est: 1000 }));
  writeFileSync(at('fake-claude'), FAKE_CLAUDE, { mode: 0o755 });
  chmodSync(at('fake-claude'), 0o755);
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
  const env = { ...CHILD_ENV_BASE, GIT_CEILING_DIRECTORIES: path.dirname(root.tmp) };
  const t0 = Date.now();
  let r;
  try {
    r = spawnSync(process.execPath, [root.at('scripts/run.mjs'), '--once'], {
      stdio: ['ignore', fd, fd],
      env,
      timeout: 20000,
    });
  } finally {
    closeSync(fd);
  }
  const t1 = Date.now();
  return { status: r.status, signal: r.signal, t0, t1 };
}

const readIfExists = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);
const markersIn = (root) =>
  readdirSync(root.at('vault/handoff'))
    .filter((n) => n.startsWith('.budget-warned-'))
    .sort();
const why = (r, logText) => `exit ${r.status}, signal ${r.signal}\n${logText}`;

// Snapshots (section 3). T1-T3 assert only on these.
let r1;
let log1;
let notified1;
let markers1;
let markerText1;
let hold1;
let r2;
let log2;
let notified2;
let markers2;
let markerText2;
let hold2;

before(() => {
  RESETS_AT = new Date(Date.now() + 3 * 86_400_000).toISOString();
  WEEK_DATE = RESETS_AT.slice(0, 10);
  EXPECTED_MSG = `weekly usage at 70% (statusline); hold at 80%. Resets ${RESETS_AT.slice(0, 16).replace('T', ' ')} UTC.`;
  MARKER = `.budget-warned-${WEEK_DATE}`;
  CHILD_ENV_BASE = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

  ROOT = makeRoot();

  // Run 1: 70% weekly usage.
  writeUsage(ROOT, 70);
  r1 = runOnce(ROOT);
  log1 = readFileSync(ROOT.at('logs/launcher.log'), 'utf8');
  notified1 = readIfExists(ROOT.at('notified.txt')) ?? '';
  markers1 = markersIn(ROOT);
  markerText1 = readIfExists(ROOT.at('vault/handoff', MARKER));
  hold1 = existsSync(ROOT.at('vault/handoff/BUDGET_HOLD.md'));

  // Run 2, same week: 75% weekly usage, same RESETS_AT, same root (run 1's marker is still there).
  writeUsage(ROOT, 75);
  r2 = runOnce(ROOT);
  log2 = readFileSync(ROOT.at('logs/launcher.log'), 'utf8');
  notified2 = readIfExists(ROOT.at('notified.txt')) ?? '';
  markers2 = markersIn(ROOT);
  markerText2 = readIfExists(ROOT.at('vault/handoff', MARKER));
  hold2 = existsSync(ROOT.at('vault/handoff/BUDGET_HOLD.md'));
});

test('EZD-197 T1 at 70% the week\'s marker is written and one notification is sent (AC-EZD-197-1)', () => {
  assert.equal(r1.status, 0, why(r1, log1));
  assert.deepEqual(markers1, [MARKER], why(r1, log1));
  assert.match(markerText1 ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, why(r1, log1));
  const stamp = Date.parse(markerText1);
  assert.ok(stamp >= r1.t0 - 1000 && stamp <= r1.t1 + 1000, `marker time ${markerText1} outside the run\n${why(r1, log1)}`);
  assert.equal(notified1, `EZ Draft: ${EXPECTED_MSG}\n`, why(r1, log1));
  assert.ok(notified1.slice('EZ Draft: '.length).startsWith('weekly usage at'), why(r1, log1));
  assert.equal(hold1, false, why(r1, log1));
  assert.ok(log1.includes('build EZD-999 → ok'), `the pass did not go on to start the unit\n${why(r1, log1)}`);
});

test('EZD-197 T2 a second pass in the same week sends nothing (AC-EZD-197-2)', () => {
  assert.equal(r2.status, 0, why(r2, log2));
  assert.equal(notified2, notified1, why(r2, log2));
  assert.deepEqual(markers2, [MARKER], why(r2, log2));
  assert.equal(markerText2, markerText1, why(r2, log2));
  assert.equal(hold2, false, why(r2, log2));
  const newLog = log2.slice(log1.length);
  assert.ok(!newLog.includes('NOTIFY:'), `run 2 logged a NOTIFY line\n${why(r2, log2)}`);
  assert.ok(newLog.includes('build EZD-999 → ok'), `run 2 did not reach the unit\n${why(r2, log2)}`);
});

test('EZD-197 T3 the launcher log of a real run keeps the NOTIFY line (AC-EZD-197-3)', () => {
  assert.ok(log2.startsWith(log1), `the launcher log lost run 1's text (append mode)\n${why(r2, log2)}`);
  const lines = log2.split('\n');
  const notifyLines = lines.filter((l) => l.includes('NOTIFY: weekly usage at'));
  assert.equal(notifyLines.length, 1, `expected one NOTIFY: weekly usage at line, got ${notifyLines.length}\n${why(r2, log2)}`);
  const line = notifyLines[0];
  assert.match(line, /^\[run \d{2}:\d{2}:\d{2}\] NOTIFY: /, why(r2, log2));
  assert.ok(line.endsWith(EXPECTED_MSG), `NOTIFY line does not end with the expected message\n${line}`);
  const resets = /Resets (\d{4}-\d{2}-\d{2}) \d{2}:\d{2} UTC\./.exec(line);
  assert.ok(resets, `NOTIFY line has no Resets date\n${line}`);
  assert.equal(resets[1], WEEK_DATE, why(r2, log2));
  assert.ok(!log2.includes('dry run:'), `a real run logged a dry run line\n${why(r2, log2)}`);
});
