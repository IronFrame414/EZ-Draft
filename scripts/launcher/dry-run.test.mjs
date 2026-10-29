// EZD-155 T7-T9, T12-T17: `scripts/run.mjs --dry-run` never pauses, writes no pause, hold or warning-marker file and sends no
// notification; applyGates takes a dryRun option (vault/plans/EZD-155.md sections 1, 3 and 4; Q-0291 (a); Q-0308 (a)).
// The launcher runs only as a copy under a temporary root (scripts/budget/cli.test.mjs pattern) with a stub ledger tool and a fake
// claude binary: never the real scripts/run.mjs, never a real claude, never the real vault/.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, copyFileSync, chmodSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGates } from '../budget.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const made = [];
const mkTmp = () => {
  const d = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd155-')));
  made.push(d);
  return d;
};
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

// Stub L: the names run.mjs and budget.mjs import from the ledger tool, and --next-unit.
const stubLedger = (nextUnit) => [
  '// Stub ledger tool for the EZD-155 dry-run tests: the names run.mjs and budget.mjs import, and --next-unit.',
  "export const weekStart = () => new Date('2030-01-07T07:00:00.000Z');",
  "export const weekSpend = () => ({ start: weekStart(), main: 0, fable: 0, runs: 0, ceiling: null, pct: null, text: 'stub' });",
  "export const questionsFingerprint = () => '';",
  'export const assignQuestionIds = () => ({});',
  `if (process.argv.includes('--next-unit')) console.log('${nextUnit}');`,
  '',
].join('\n');

const BOOST_EXPIRED = '{"until":"2020-01-01T00:00:00.000Z"}\n';
const BOOST_ACTIVE = '{"until":"2099-01-01T00:00:00.000Z"}\n';

// A temporary root holding copies of the launcher and the files its import set needs. Returns the root and the texts it wrote.
function makeRoot({ fivePct, sevenPct = 10, pauseFile = false, nextUnit = 'plan EZD-999', boostExpired = false, boostActive = false }) {
  const tmp = mkTmp();
  const at = (...p) => path.join(tmp, ...p);
  for (const d of ['scripts', 'vault/tools', 'vault/tickets', 'vault/cost', 'vault/handoff']) mkdirSync(at(d), { recursive: true });
  for (const f of ['run.mjs', 'budget.mjs', 'oauth-usage.mjs', 'cost-log.mjs', 'launcher-idle.mjs', 'ledger.mjs']) copyFileSync(path.join(repo, 'scripts', f), at('scripts', f));
  copyFileSync(path.join(repo, 'vault/tools/boost.mjs'), at('vault/tools/boost.mjs'));
  writeFileSync(at('vault/tools/next_ticket.mjs'), stubLedger(nextUnit));
  writeFileSync(at('vault/tickets/STATUS.md'), 'stub\n');
  writeFileSync(at('vault/budget.json'), JSON.stringify({ meter_source: 'statusline', weekly_ceiling_usd_est: 1000 }));
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const fiveHourResetsAt = iso(now + 7_200_000);
  writeFileSync(at('vault/cost/usage.json'), JSON.stringify({
    five_hour: { pct: fivePct, resets_at: fiveHourResetsAt },
    seven_day: { pct: sevenPct, resets_at: iso(now + 3 * 86_400_000) },
    fable_seven_day: null,
    read_at: iso(now),
    source: 'statusline',
  }));
  // Fake C: answers `--help` with the flags run.mjs looks for.
  writeFileSync(at('fake-claude'), '#!/bin/sh\necho "--max-turns --session-id --permission-prompts"\n', { mode: 0o755 });
  chmodSync(at('fake-claude'), 0o755);
  writeFileSync(at('scripts/launcher.config.json'), JSON.stringify({
    claude_bin: at('fake-claude'),
    log_dir: at('logs'),
    notify_cmd: `printf '%s\\n' "$MSG" >> "${at('notified.txt')}"`,
  }));
  const pauseText = `# Five-hour window pause\n\n- Resume at: ${iso(now + 7_200_000)}\n`;
  if (pauseFile) writeFileSync(at('vault/handoff/WINDOW_PAUSE.md'), pauseText);
  if (boostExpired) writeFileSync(at('vault/handoff/BOOST.json'), BOOST_EXPIRED);
  if (boostActive) writeFileSync(at('vault/handoff/BOOST.json'), BOOST_ACTIVE);
  return { tmp, fiveHourResetsAt, pauseText, handoff: at('vault/handoff'), notified: at('notified.txt'), pauseFile: at('vault/handoff/WINDOW_PAUSE.md'), boostFile: at('vault/handoff/BOOST.json') };
}

const runLauncher = (root, flag) => spawnSync(process.execPath, [path.join(root.tmp, 'scripts/run.mjs'), flag], { encoding: 'utf8', timeout: 20000 });
const why = (r) => `exit ${r.status}, signal ${r.signal}\n${r.stdout}\n${r.stderr}`;
const has = (r, s) => assert.ok(r.stdout.includes(s), `stdout lacks "${s}"\n${why(r)}`);
const lacks = (r, s) => assert.ok(!r.stdout.includes(s), `stdout holds "${s}"\n${why(r)}`);

test('EZD-155 T7 dry run at 95% exits without a pause file (AC-EZD-155-2)', () => {
  const root = makeRoot({ fivePct: 95 });
  const r = runLauncher(root, '--dry-run');
  assert.equal(r.status, 0, why(r));
  assert.equal(existsSync(root.pauseFile), false);
  const resumeAt = new Date(Date.parse(root.fiveHourResetsAt) + 120000).toISOString();
  has(r, `dry run: five-hour window at 95%; a real run would pause until ${resumeAt} and write vault/handoff/WINDOW_PAUSE.md`);
  lacks(r, 'plan EZD-999:');
});

test('EZD-155 T8 dry run with a pause in place neither waits nor removes it (AC-EZD-155-2)', () => {
  const root = makeRoot({ fivePct: 50, pauseFile: true });
  const r = runLauncher(root, '--dry-run');
  assert.equal(r.status, 0, why(r));
  assert.equal(readFileSync(root.pauseFile, 'utf8'), root.pauseText);
  has(r, 'dry run: vault/handoff/WINDOW_PAUSE.md is in place; a real run would wait until its resume time');
});

test('EZD-155 T9 dry run below the pause still prints the unit (control, AC-EZD-155-2)', () => {
  const root = makeRoot({ fivePct: 50 });
  const r = runLauncher(root, '--dry-run');
  assert.equal(r.status, 0, why(r));
  assert.equal(existsSync(root.pauseFile), false);
  has(r, 'plan EZD-999: ');
  has(r, '"/plan-ticket EZD-999"');
});

test('EZD-155 T12 applyGates with dryRun writes nothing and notifies nobody (AC-EZD-155-2)', async () => {
  const NOW = new Date('2026-10-19T12:00:00Z');
  const iso = (mins) => new Date(NOW.getTime() + mins * 60000).toISOString();
  const W = (pct, mins) => ({ pct, resets_at: iso(mins) });
  const meters = (over = {}) => ({ source: 'statusline', read_at: NOW.toISOString(), five_hour: W(0, 60), seven_day: W(0, 3000), fable_seven_day: W(0, 3000), warning: null, ...over });
  const tmpRoot = () => {
    const r = mkTmp();
    mkdirSync(path.join(r, 'vault/handoff'), { recursive: true });
    mkdirSync(path.join(r, 'vault/cost'), { recursive: true });
    return r;
  };
  // A fresh root and its own notification list per scenario; (a), (b) and (d) share one root and one list.
  const scenario = (sevenPct, extra = {}) => {
    const sent = [];
    const root = tmpRoot();
    const opts = { root, now: NOW, budget: { weekly_ceiling_usd_est: 300 }, meters: meters({ seven_day: W(sevenPct, 3000) }), nextUnit: 'build EZD-999', inProgressBuild: false, notify: async (m) => { sent.push(m); }, dryRun: true, ...extra };
    return { sent, opts, files: () => readdirSync(path.join(root, 'vault/handoff')) };
  };

  const s = scenario(85);
  // (a) a dry run twice: the same result both times, nothing written, nobody told
  const a1 = await applyGates(s.opts);
  const a2 = await applyGates(s.opts);
  for (const r of [a1, a2]) {
    assert.equal(r.start, false);
    assert.equal(r.reason, 'budget hold');
    assert.equal(r.decision.warn, true);
    assert.equal(r.decision.hold, true);
  }
  assert.deepEqual(a1, a2);
  assert.deepEqual(s.files(), []);
  assert.deepEqual(s.sent, []);
  // (b) a real pass writes the marker and the hold and sends two messages
  const b = await applyGates({ ...s.opts, dryRun: false });
  assert.equal(b.start, false);
  assert.deepEqual(s.files().sort(), ['.budget-warned-2026-10-21', 'BUDGET_HOLD.md']);
  assert.equal(s.sent.length, 2);
  // (d) a dry run after the hold exists: the hold's own early return, no new message
  const d = await applyGates(s.opts);
  assert.equal(d.reason, 'budget hold in place; nothing new starts.');
  assert.equal(s.sent.length, 2);
  // (c) below the hold: warn only, still nothing written
  const c = scenario(75);
  const rc = await applyGates(c.opts);
  assert.equal(rc.start, true);
  assert.equal(rc.reason, null);
  assert.equal(rc.decision.warn, true);
  assert.equal(rc.decision.hold, false);
  assert.deepEqual(c.files(), []);
  assert.deepEqual(c.sent, []);
  // (e) at the hold with a build in progress: it may finish, still nothing written
  const e = scenario(85, { inProgressBuild: true });
  const re = await applyGates(e.opts);
  assert.equal(re.start, true);
  assert.equal(re.reason, null);
  assert.deepEqual(e.files(), []);
  assert.deepEqual(e.sent, []);
});

test('EZD-155 T13 dry run at the weekly hold writes no file (AC-EZD-155-2)', () => {
  const root = makeRoot({ fivePct: 50, sevenPct: 95 });
  const r = runLauncher(root, '--dry-run');
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(readdirSync(root.handoff), []);
  assert.equal(existsSync(root.notified), false);
  has(r, 'dry run: weekly usage at 95%; a real run would write vault/handoff/BUDGET_HOLD.md and notify');
  has(r, 'budget hold');
  lacks(r, 'NOTIFY:');
  lacks(r, 'plan EZD-999:');
});

test('EZD-155 T14 dry run sends no notification (AC-EZD-155-2)', () => {
  const root = makeRoot({ fivePct: 50, nextUnit: 'none: nothing to run' });
  const r = runLauncher(root, '--dry-run');
  assert.equal(r.status, 0, why(r));
  has(r, 'none: nothing to run');
  has(r, 'dry run: would notify: launcher stopped: nothing to run');
  lacks(r, 'NOTIFY:');
  assert.equal(existsSync(root.notified), false);
  assert.deepEqual(readdirSync(root.handoff), []);
});

test('EZD-155 T15 the notify command fires on a real `--once` stop (control, AC-EZD-155-2)', () => {
  const root = makeRoot({ fivePct: 50, nextUnit: 'none: nothing to run' });
  const r = runLauncher(root, '--once');
  assert.equal(r.status, 0, why(r));
  has(r, 'NOTIFY: launcher stopped: nothing to run');
  assert.equal(readFileSync(root.notified, 'utf8'), 'EZ Draft: launcher stopped: nothing to run\n');
});

test('EZD-155 T16 dry run leaves an expired boost switch in place (AC-EZD-155-2)', async (t) => {
  await t.test('(a) the dry run leaves BOOST.json and sends nothing', () => {
    const a = makeRoot({ fivePct: 50, boostExpired: true });
    const ra = runLauncher(a, '--dry-run');
    assert.equal(ra.status, 0, why(ra));
    assert.equal(readFileSync(a.boostFile, 'utf8'), BOOST_EXPIRED);
    assert.deepEqual(readdirSync(a.handoff), ['BOOST.json']);
    has(ra, 'dry run: boost mode has expired; a real run would remove vault/handoff/BOOST.json');
    has(ra, 'plan EZD-999: ');
    lacks(ra, 'boost mode ended');
    assert.equal(existsSync(a.notified), false);
  });
  await t.test('(b) control: a real `--once` run removes the switch and says so', () => {
    const b = makeRoot({ fivePct: 50, nextUnit: 'none: nothing to run', boostExpired: true });
    const rb = runLauncher(b, '--once');
    assert.equal(rb.status, 0, why(rb));
    assert.equal(existsSync(b.boostFile), false);
    has(rb, 'NOTIFY: boost mode ended (weekly usage reset)');
    assert.equal(
      readFileSync(b.notified, 'utf8'),
      'EZ Draft: boost mode ended (weekly usage reset): weekly hold and normal per-unit cap back\nEZ Draft: launcher stopped: nothing to run\n',
    );
  });
});

test('EZD-155 T17 dry run under boost skips the weekly hold as a real run does (control, AC-EZD-155-2)', () => {
  const root = makeRoot({ fivePct: 50, sevenPct: 95, boostActive: true });
  const r = runLauncher(root, '--dry-run');
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(readdirSync(root.handoff), ['BOOST.json']);
  assert.equal(readFileSync(root.boostFile, 'utf8'), BOOST_ACTIVE);
  assert.equal(existsSync(root.notified), false);
  has(r, 'plan EZD-999: ');
  lacks(r, 'budget hold');
  lacks(r, 'dry run: weekly usage');
  lacks(r, 'NOTIFY:');
});
