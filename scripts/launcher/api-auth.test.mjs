// EZD-194 T1-T5: the budget override `--api-until-reset` makes scripts/run.mjs pass the configured API key to claude and log the
// run as auth api; without it no key is passed and the run is logged as auth plan (vault/plans/EZD-194.md sections 1, 3 and 4;
// AC-EZD-194-1, AC-EZD-194-2, AC-EZD-194-3; Q-0298 (b)). The launcher runs only as a copy under a temporary root with a fake claude
// binary: never the real scripts/run.mjs, never a real claude, never the real vault/ or the real launcher log folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FAKE_KEY = 'sk-ant-api03-ezd194-fake-key-not-real';
const STRAY_KEY = 'sk-ant-api03-ezd194-stray-shell-key';
const WEEK_START = '2030-01-07T07:00:00.000Z';
const EARLIER_WEEK = '2029-12-31T07:00:00.000Z';
const made = [];
const mkTmp = () => {
  const d = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd194-')));
  made.push(d);
  return d;
};
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

// Stub L: the names run.mjs and budget.mjs import from the ledger tool, and --next-unit (the dry-run tests' stub, unchanged).
const stubLedger = (nextUnit) => [
  '// Stub ledger tool for the EZD-194 tests: the names run.mjs and budget.mjs import, and --next-unit.',
  "export const weekStart = () => new Date('2030-01-07T07:00:00.000Z');",
  "export const weekSpend = () => ({ start: weekStart(), main: 0, fable: 0, runs: 0, ceiling: null, pct: null, text: 'stub' });",
  "export const questionsFingerprint = () => '';",
  'export const assignQuestionIds = () => ({});',
  `if (process.argv.includes('--next-unit')) console.log('${nextUnit}');`,
  '',
].join('\n');

// Block F: the fake claude. It answers --help with the flags run.mjs looks for, writes the key and the scrub variable it sees
// to claude-env.txt, copies the in-flight record it sees to inflight-seen.json, and prints one successful result.
const RESULT_JSON = '{"type":"result","subtype":"success","is_error":false,"result":"fake unit done","session_id":"ezd194-fake-session","num_turns":1,"duration_ms":5,"total_cost_usd":0,"modelUsage":{}}';
const fakeClaude = (root) => [
  '#!/bin/sh',
  'if [ "$1" = "--help" ]; then echo "--max-turns --session-id --permission-prompts"; exit 0; fi',
  '{',
  '  if [ "${ANTHROPIC_API_KEY+set}" = set ]; then printf \'key=%s\\n\' "$ANTHROPIC_API_KEY"; else printf \'key=unset\\n\'; fi',
  '  printf \'scrub=%s\\n\' "${CLAUDE_CODE_SUBPROCESS_ENV_SCRUB-unset}"',
  "} > '" + root + "/claude-env.txt'",
  "cp '" + root + "/logs/inflight/build-EZD-999.json' '" + root + "/inflight-seen.json'",
  "printf '%s\\n' '" + RESULT_JSON + "'",
  '',
].join('\n');

// One temporary root: copies of the launcher and the files its import set needs, a stub ledger, a statusline meter reading
// under the 90% pause and 70% warning, a budget file, and a launcher config whose claude_bin, log_dir and api_key are set.
function makeRoot() {
  const tmp = mkTmp();
  const at = (...p) => path.join(tmp, ...p);
  for (const d of ['scripts', 'vault/tools', 'vault/tickets', 'vault/cost', 'vault/handoff', 'logs']) mkdirSync(at(d), { recursive: true });
  for (const f of ['run.mjs', 'budget.mjs', 'oauth-usage.mjs', 'cost-log.mjs', 'launcher-idle.mjs', 'ledger.mjs']) copyFileSync(path.join(repo, 'scripts', f), at('scripts', f));
  copyFileSync(path.join(repo, 'vault/tools/boost.mjs'), at('vault/tools/boost.mjs'));
  writeFileSync(at('vault/tools/next_ticket.mjs'), stubLedger('build EZD-999'));
  writeFileSync(at('vault/tickets/STATUS.md'), 'stub\n');
  writeFileSync(at('vault/budget.json'), JSON.stringify({ meter_source: 'statusline', weekly_ceiling_usd_est: 1000 }));
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  writeFileSync(at('vault/cost/usage.json'), JSON.stringify({
    five_hour: { pct: 10, resets_at: iso(now + 7_200_000) },
    seven_day: { pct: 10, resets_at: iso(now + 3 * 86_400_000) },
    fable_seven_day: null,
    read_at: iso(now),
    source: 'statusline',
  }));
  writeFileSync(at('fake-claude'), fakeClaude(tmp), { mode: 0o755 });
  chmodSync(at('fake-claude'), 0o755);
  writeFileSync(at('scripts/launcher.config.json'), JSON.stringify({
    claude_bin: at('fake-claude'),
    log_dir: at('logs'),
    api_key: FAKE_KEY,
  }));
  initRepo(tmp);
  return { tmp, at };
}

// EZD-173 Decided "Launcher test roots": run.mjs takes the ledger lock, which needs a git repo on develop.
function initRepo(tmp) {
  for (const args of [['init', '-q', '-b', 'develop'], ['config', 'user.name', 'EZ Draft Test'], ['config', 'user.email', 'test@example.test'], ['config', 'commit.gpgsign', 'false'], ['add', '-A'], ['commit', '-qm', 'init']]) {
    const r = spawnSync('git', args, { cwd: tmp, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  }
}

const setBudget = (root, obj) => writeFileSync(root.at('vault/budget.json'), JSON.stringify(obj));
const readBudget = (root) => JSON.parse(readFileSync(root.at('vault/budget.json'), 'utf8'));
const budgetCli = (root, ...args) => spawnSync(process.execPath, [root.at('scripts/budget.mjs'), ...args], { encoding: 'utf8', timeout: 20000 });
const runOnce = (root, env) => spawnSync(process.execPath, [root.at('scripts/run.mjs'), '--once'], { encoding: 'utf8', timeout: 20000, env });
const why = (r) => `exit ${r.status}, signal ${r.signal}\n${r.stdout}\n${r.stderr}`;

// What the run left behind: the fake's environment record, the in-flight record as the fake saw it, the cost rows and the raw log.
function readRun(root) {
  const costPath = root.at('vault/cost/log.jsonl');
  const logText = existsSync(costPath) ? readFileSync(costPath, 'utf8') : '';
  return {
    env: readFileSync(root.at('claude-env.txt'), 'utf8'),
    inflight: JSON.parse(readFileSync(root.at('inflight-seen.json'), 'utf8')),
    rows: logText.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l)),
    logText,
  };
}

// The env of a run in api mode (T1, T2): the shell holds a stray key that the launcher must not pass on.
const apiEnv = { ...process.env, ANTHROPIC_API_KEY: STRAY_KEY };
// The env of a run in plan mode (T3-T5): a stray key and the scrub variable are both set; the launcher must remove both.
const planEnv = { ...process.env, ANTHROPIC_API_KEY: STRAY_KEY, CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1' };

test('EZD-194 T1 key passed under the override (AC-EZD-194-1)', () => {
  const root = makeRoot();
  const cli = budgetCli(root, '--api-until-reset');
  assert.equal(cli.status, 0, why(cli));
  const budget = readBudget(root);
  assert.equal(budget.override.type, 'api-until-reset');
  assert.equal(budget.override.week_start, WEEK_START);
  const r = runOnce(root, apiEnv);
  assert.equal(r.status, 0, why(r));
  assert.equal(readRun(root).env, `key=${FAKE_KEY}\nscrub=1\n`, why(r));
});

test('EZD-194 T2 cost row says api (AC-EZD-194-2)', () => {
  const root = makeRoot();
  const cli = budgetCli(root, '--api-until-reset');
  assert.equal(cli.status, 0, why(cli));
  const r = runOnce(root, apiEnv);
  assert.equal(r.status, 0, why(r));
  const run = readRun(root);
  assert.equal(run.rows.length, 1, why(r));
  assert.equal(run.rows[0].auth, 'api');
  assert.equal(run.rows[0].unit, 'build');
  assert.equal(run.rows[0].ticket, 'EZD-999');
  assert.equal(run.rows[0].outcome, 'ok');
  assert.equal(run.inflight.auth, 'api');
  const inflightText = JSON.stringify(run.inflight);
  assert.ok(!r.stdout.includes(FAKE_KEY), `stdout holds the key\n${why(r)}`);
  assert.ok(!r.stderr.includes(FAKE_KEY), `stderr holds the key\n${why(r)}`);
  assert.ok(!run.logText.includes(FAKE_KEY), 'cost log holds the key');
  assert.ok(!inflightText.includes(FAKE_KEY), 'in-flight record holds the key');
});

test('EZD-194 T3 no override: no key, plan (AC-EZD-194-3)', () => {
  const root = makeRoot();
  const r = runOnce(root, planEnv);
  assert.equal(r.status, 0, why(r));
  const run = readRun(root);
  assert.equal(run.env, 'key=unset\nscrub=unset\n', why(r));
  assert.equal(run.rows.length, 1, why(r));
  assert.equal(run.rows[0].auth, 'plan');
  assert.equal(run.rows[0].outcome, 'ok');
  assert.equal(run.inflight.auth, 'plan');
});

test('EZD-194 T4 cleared override: no key, plan (AC-EZD-194-3)', () => {
  const root = makeRoot();
  const on = budgetCli(root, '--api-until-reset');
  assert.equal(on.status, 0, why(on));
  const off = budgetCli(root, '--clear-override');
  assert.equal(off.status, 0, why(off));
  assert.equal(readBudget(root).override, '');
  const r = runOnce(root, planEnv);
  assert.equal(r.status, 0, why(r));
  const run = readRun(root);
  assert.equal(run.env, 'key=unset\nscrub=unset\n', why(r));
  assert.equal(run.rows.length, 1, why(r));
  assert.equal(run.rows[0].auth, 'plan');
  assert.equal(run.rows[0].outcome, 'ok');
  assert.equal(run.inflight.auth, 'plan');
});

test('EZD-194 T5 earlier-week override: no key, plan (AC-EZD-194-3)', () => {
  const root = makeRoot();
  setBudget(root, {
    meter_source: 'statusline',
    weekly_ceiling_usd_est: 1000,
    override: { type: 'api-until-reset', week_start: EARLIER_WEEK, set_on: '2029-12-31' },
  });
  const r = runOnce(root, planEnv);
  assert.equal(r.status, 0, why(r));
  const run = readRun(root);
  assert.equal(run.env, 'key=unset\nscrub=unset\n', why(r));
  assert.equal(run.rows.length, 1, why(r));
  assert.equal(run.rows[0].auth, 'plan');
  assert.equal(run.rows[0].outcome, 'ok');
  assert.equal(run.inflight.auth, 'plan');
});
