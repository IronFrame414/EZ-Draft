// EZD-193 T1-T6: a unit that stops on a plan limit leaves the raw text in vault/handoff/limit-error-<time>.txt, with the
// API key redacted; Josh is told the file name (N1), or told the text is in the launcher log when the file cannot be written
// (N2 and L1); a run with no limit error writes no file and sends no N1/N2 (vault/plans/EZD-193.md sections 3 and 4).
// The launcher runs only as a copy under a temporary root (dry-run.test.mjs pattern) with a fake claude binary that prints the
// fixture texts it is given: never the real scripts/run.mjs, never a real claude, never the real vault/.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, copyFileSync, chmodSync, rmSync, realpathSync, statSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const made = [];
const mkTmp = () => {
  const d = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd193-')));
  made.push(d);
  return d;
};
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

// Fixtures (plan section 4, exact strings).
const OUT_W = '{"type":"result","subtype":"success","is_error":true,"result":"FAKE-LIMIT-193: usage limit reached (test text)","num_turns":1,"total_cost_usd":0}\n';
const OUT_5 = OUT_W.replace('usage limit reached', '5-hour limit reached');
const OUT_OK = '{"type":"result","subtype":"success","is_error":false,"result":"FAKE-OK-193: the report mentions a usage limit reached earlier (test text)","num_turns":1,"total_cost_usd":0}\n';
const OUT_ERR = '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"FAKE-ERROR-193: the unit stopped (test text)","num_turns":1,"total_cost_usd":0}\n';
const ERR_L = 'FAKE-STDERR-193: rate limit (test text)\n';
const ERR_P = 'FAKE-STDERR-193: plain failure (test text)\n';
const KEY = 'sk-ant-test-193-not-a-real-key';
const ERR_K = `FAKE-STDERR-193: key ${KEY} and again ${KEY} (test text)\n`;
const NOTE_W = 'formats not yet confirmed (section 11): treated as weekly';
const HOLD_MSG = 'EZ Draft: plan limit reached during build EZD-999. Hold written; override with budget.mjs or wait for the weekly reset.';
const NAME_RE = /^limit-error-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.txt$/;
const NAME_PARTS = /^limit-error-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.txt$/;

// Round 2 fixtures (plan section 4; all ASCII, so characters = bytes).
const EDGE = 8192;
const OUT_BIG = OUT_W.replace('(test text)', `(test text) ${'o'.repeat(30000)}`); // 30,147 bytes
const ERR_BIG = `${ERR_L}${'e'.repeat(20000)}\nFAKE-STDERR-193: last line (test text)\n`; // 20,080 bytes
const ERR_N = (n) => `FAKE-STDERR-193 ${'e'.repeat(n - 17)}\n`; // exactly n bytes
const ERR_KB = `FAKE-STDERR-193 ${'e'.repeat(8169)}${KEY}${'e'.repeat(20000)}\n`; // KEY starts at byte 8,185

// The section 3 body: unit `build EZD-999`, exit 1.
const body = (kind, out, err) => `unit: build EZD-999\nexit: 1\nclassified: ${kind}\n\n--- stdout ---\n${out}\n--- stderr ---\n${err}\n`;

// The expected cut of a stream (plan section 4): kept whole when it is at most 2 x EDGE bytes.
const cutText = (s) => (s.length <= 2 * EDGE ? s : `${s.slice(0, EDGE)}\n--- cut ${s.length - 2 * EDGE} of ${s.length} bytes ---\n${s.slice(-EDGE)}`);

// Stub L: the names run.mjs and budget.mjs import from the ledger tool, and --next-unit (the nextUnit option).
const stubLedger = (nextUnit) => [
  '// Stub ledger tool for the EZD-193 limit-text tests: the names run.mjs and budget.mjs import, and --next-unit.',
  "export const weekStart = () => new Date('2030-01-07T07:00:00.000Z');",
  "export const weekSpend = () => ({ start: weekStart(), main: 0, fable: 0, runs: 0, ceiling: null, pct: null, text: 'stub' });",
  "export const questionsFingerprint = () => '';",
  'export const assignQuestionIds = () => ({});',
  `if (process.argv.includes('--next-unit')) console.log('${nextUnit}');`,
  '',
].join('\n');

// A temporary root holding copies of the launcher and the files its import set needs, a fake claude that prints the given
// stdout and stderr fixtures and exits with the given code, and a config that notifies into notified.txt.
// fivePct 50 is below the five-hour pause (dry-run.test.mjs T9); the weekly meter is 10 (below the hold).
function makeRoot({ out, err, exit, nextUnit = 'build EZD-999', fivePct = 50, sevenPct = 10, confirmed = false, handoffIsFile = false, apiKey = null, gitRepo = false }) {
  const tmp = mkTmp();
  const at = (...p) => path.join(tmp, ...p);
  for (const d of ['scripts', 'vault/tools', 'vault/tickets', 'vault/cost', 'fixtures']) mkdirSync(at(d), { recursive: true });
  // handoffIsFile: vault/handoff is a plain file, so no limit file can be written under it (T6).
  if (handoffIsFile) writeFileSync(at('vault/handoff'), 'not a folder\n');
  else mkdirSync(at('vault/handoff'), { recursive: true });
  for (const f of ['run.mjs', 'budget.mjs', 'oauth-usage.mjs', 'cost-log.mjs', 'launcher-idle.mjs', 'ledger.mjs']) copyFileSync(path.join(repo, 'scripts', f), at('scripts', f));
  copyFileSync(path.join(repo, 'vault/tools/boost.mjs'), at('vault/tools/boost.mjs'));
  writeFileSync(at('vault/tools/next_ticket.mjs'), stubLedger(nextUnit));
  writeFileSync(at('vault/tickets/STATUS.md'), 'stub\n');
  writeFileSync(at('vault/budget.json'), JSON.stringify({ meter_source: 'statusline', weekly_ceiling_usd_est: 1000 }));
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  writeFileSync(at('vault/cost/usage.json'), JSON.stringify({
    five_hour: { pct: fivePct, resets_at: iso(now + 7_200_000) },
    seven_day: { pct: sevenPct, resets_at: iso(now + 3 * 86_400_000) },
    fable_seven_day: null,
    read_at: iso(now),
    source: 'statusline',
  }));
  // The fixture texts the fake claude prints. Written to files so their quotes need no shell escaping.
  writeFileSync(at('fixtures/out.txt'), out);
  writeFileSync(at('fixtures/err.txt'), err);
  // Fake claude: answers `--help` with the flags run.mjs looks for; any other call prints the fixtures and exits with `exit`.
  writeFileSync(at('fake-claude'), [
    '#!/bin/sh',
    'if [ "$1" = "--help" ]; then echo "--max-turns --session-id --permission-prompts"; exit 0; fi',
    `cat "${at('fixtures/out.txt')}"`,
    `cat "${at('fixtures/err.txt')}" >&2`,
    `exit ${exit}`,
    '',
  ].join('\n'), { mode: 0o755 });
  chmodSync(at('fake-claude'), 0o755);
  const config = {
    claude_bin: at('fake-claude'),
    log_dir: at('logs'),
    notify_cmd: `printf '%s\\n' "$MSG" >> "${at('notified.txt')}"`,
  };
  if (confirmed) config.limit_formats_confirmed = true;
  if (apiKey) { config.api_key = apiKey; config.auth_mode = 'api'; }
  writeFileSync(at('scripts/launcher.config.json'), JSON.stringify(config));
  // Every root is a temp git repository on develop holding every file written above (plan C9). gitRepo (T12, plan section 4) also copies the ignore rule.
  {
    const git = (...args) => {
      const r = spawnSync('git', ['-C', tmp, ...args], { encoding: 'utf8' });
      assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
      return r.stdout;
    };
    git('init', '-q', '-b', 'develop');
    git('config', 'user.name', 'EZD-193 test');
    git('config', 'user.email', 'ezd193@example.test');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.hooksPath', at('no-hooks'));
    if (gitRepo) copyFileSync(path.join(repo, '.gitignore'), at('.gitignore'));
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
  }
  return { tmp, handoff: at('vault/handoff'), notified: at('notified.txt'), holdFile: at('vault/handoff/BUDGET_HOLD.md') };
}

const launcher = (root) => path.join(root.tmp, 'scripts/run.mjs');
const why = (r) => `exit ${r.status}, signal ${r.signal}\n${r.stdout}\n${r.stderr}`;
function runOnce(root, env = process.env) {
  return spawnSync(process.execPath, [launcher(root), '--once'], { encoding: 'utf8', timeout: 20000, env });
}
// Starts the launcher without --once and stops it once `marker` is on stdout (the five-hour path then sleeps for half an hour).
function runUntil(root, marker) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [launcher(root)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let settled = false;
    const finish = (saw) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      resolve({ saw, out });
    };
    const timer = setTimeout(() => finish(false), 20000);
    child.stdout.on('data', (d) => { out += d; if (out.includes(marker)) finish(true); });
    child.stderr.on('data', () => {});
    child.on('close', () => finish(false));
  });
}
const limitFilesOf = (root) => readdirSync(root.handoff).filter((n) => n.startsWith('limit-error-')).sort();
const notifiedLines = (root) => readFileSync(root.notified, 'utf8').trimEnd().split('\n');
const nameTime = (name) => {
  const m = name.match(NAME_PARTS);
  return Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
};

test('EZD-193 T1 a weekly-classified limit error saves the raw text (AC-EZD-193-1)', () => {
  const root = makeRoot({ out: OUT_W, err: ERR_L, exit: 1 });
  const t0 = Date.now();
  const r = runOnce(root);
  const t1 = Date.now();
  assert.equal(r.status, 0, why(r));
  const files = limitFilesOf(root);
  assert.equal(files.length, 1, `limit files in vault/handoff: ${JSON.stringify(files)}\n${why(r)}`);
  assert.match(files[0], NAME_RE);
  const t = nameTime(files[0]);
  assert.ok(t >= t0 && t <= t1, `file time ${new Date(t).toISOString()} is outside the run`);
  assert.equal(readFileSync(path.join(root.handoff, files[0]), 'utf8'), body(`weekly (${NOTE_W})`, OUT_W, ERR_L));
  assert.equal(existsSync(root.holdFile), true, 'the weekly hold is still written');
});

test('EZD-193 T2 the notification names the saved file (AC-EZD-193-2)', () => {
  const root = makeRoot({ out: OUT_W, err: ERR_L, exit: 1 });
  const r = runOnce(root);
  assert.equal(r.status, 0, why(r));
  const files = limitFilesOf(root);
  assert.equal(files.length, 1, `limit files in vault/handoff: ${JSON.stringify(files)}\n${why(r)}`);
  const saved = `raw text saved to vault/handoff/${files[0]}`;
  assert.deepEqual(notifiedLines(root), [`EZ Draft: limit error during build EZD-999: ${saved}`, HOLD_MSG]);
  assert.ok(r.stdout.includes(`NOTIFY: limit error during build EZD-999: ${saved}`), why(r));
});

test('EZD-193 T3 a five-hour limit error is saved and named too (AC-EZD-193-1, AC-EZD-193-2)', async () => {
  const root = makeRoot({ out: OUT_5, err: ERR_L, exit: 1, confirmed: true });
  const u = await runUntil(root, 'five-hour limit; waiting until');
  assert.equal(u.saw, true, `the five-hour wait was not reached\n${u.out}`);
  const files = limitFilesOf(root);
  assert.equal(files.length, 1, `limit files in vault/handoff: ${JSON.stringify(files)}\n${u.out}`);
  assert.match(files[0], NAME_RE);
  assert.equal(readFileSync(path.join(root.handoff, files[0]), 'utf8'), body('five-hour', OUT_5, ERR_L));
  assert.deepEqual(notifiedLines(root), [`EZ Draft: limit error during build EZD-999: raw text saved to vault/handoff/${files[0]}`]);
  assert.equal(existsSync(root.holdFile), false, 'the five-hour path writes no hold');
});

test('EZD-193 T4 no limit error, no file (AC-EZD-193-3)', () => {
  // (a) a successful run whose report mentions a limit: not a limit error.
  const a = makeRoot({ out: OUT_OK, err: '', exit: 0 });
  const ra = runOnce(a);
  assert.equal(ra.status, 0, why(ra));
  assert.deepEqual(limitFilesOf(a), []);
  assert.equal(ra.stdout.includes('raw text'), false, why(ra));
  assert.equal(existsSync(a.notified), false, 'no notification was sent');
  // (b) a failed run that is not a limit error: no file, the failed-run path still ran.
  const b = makeRoot({ out: OUT_ERR, err: ERR_P, exit: 1 });
  const rb = runOnce(b);
  assert.equal(rb.status, 0, why(rb));
  assert.deepEqual(limitFilesOf(b), []);
  assert.equal(rb.stdout.includes('raw text'), false, why(rb));
  assert.equal(existsSync(b.notified), false, 'no notification was sent');
  assert.equal(existsSync(path.join(b.handoff, 'last-failure.json')), true, 'the failed-run record is still written');
});

test('EZD-193 T5 the API key never reaches the file (AC-EZD-193-1)', () => {
  const root = makeRoot({ out: OUT_W, err: ERR_K, exit: 1, apiKey: KEY });
  const r = runOnce(root);
  // Exit status only: the launcher echoes the child's stderr, so a failure message must not print the output.
  assert.equal(r.status, 0, `exit ${r.status}`);
  const files = limitFilesOf(root);
  assert.equal(files.length, 1, `limit files in vault/handoff: ${JSON.stringify(files)}`);
  const content = readFileSync(path.join(root.handoff, files[0]), 'utf8');
  const expected = body(`weekly (${NOTE_W})`, OUT_W, ERR_K.split(KEY).join('<api_key>'));
  // Booleans only (L-018): the key is never a matcher value.
  assert.equal(content === expected, true, 'the file is not the expected body with the key replaced by <api_key>');
  assert.equal(content.includes(KEY), false, 'the file holds the API key');
});

test('EZD-193 T6 a file that cannot be written goes to the log and Josh is told (AC-EZD-193-1, AC-EZD-193-2)', async () => {
  const root = makeRoot({ out: OUT_5, err: ERR_L, exit: 1, confirmed: true, handoffIsFile: true });
  const u = await runUntil(root, 'five-hour limit; waiting until');
  assert.equal(u.saw, true, `the five-hour wait was not reached\n${u.out}`);
  const mark = 'could not save the limit error text to vault/handoff/limit-error-';
  const at = u.out.indexOf(mark);
  assert.ok(at >= 0, `stdout lacks the L1 line\n${u.out}`);
  assert.ok(u.out.slice(at).includes(body('five-hour', OUT_5, ERR_L)), `the file body does not follow the L1 line\n${u.out}`);
  assert.deepEqual(notifiedLines(root), ['EZ Draft: limit error during build EZD-999: raw text could not be saved; it is in the launcher log']);
  // vault/handoff is still the file it was (the save could not replace it).
  assert.equal(statSync(root.handoff).isFile(), true, 'vault/handoff is no longer a file');
  assert.equal(readFileSync(root.handoff, 'utf8'), 'not a folder\n');
});

test('EZD-193 T7 a long stream keeps its first and last 8,192 bytes (AC-EZD-193-1)', () => {
  const root = makeRoot({ out: OUT_BIG, err: ERR_BIG, exit: 1 });
  const r = runOnce(root);
  assert.equal(r.status, 0, why(r));
  const files = limitFilesOf(root);
  assert.equal(files.length, 1, `limit files in vault/handoff: ${JSON.stringify(files)}\n${why(r)}`);
  const content = readFileSync(path.join(root.handoff, files[0]), 'utf8');
  assert.equal(content, body(`weekly (${NOTE_W})`, cutText(OUT_BIG), cutText(ERR_BIG)));
  assert.equal(content.includes('--- cut 13763 of 30147 bytes ---'), true, 'the stdout cut marker is missing');
  assert.equal(content.includes('--- cut 3696 of 20080 bytes ---'), true, 'the stderr cut marker is missing');
  // Absolute bound (plan section 4): the header, 16,418 cut stdout bytes, the separator and 16,418 cut stderr bytes.
  assert.equal(Buffer.byteLength(content), 32975);
});

test('EZD-193 T8 the cap starts above 16,384 bytes (AC-EZD-193-1)', () => {
  // (a) a stream of exactly 16,384 bytes is kept whole.
  const a = makeRoot({ out: OUT_W, err: ERR_N(16384), exit: 1 });
  const ra = runOnce(a);
  assert.equal(ra.status, 0, why(ra));
  const fa = limitFilesOf(a);
  assert.equal(fa.length, 1, `limit files in vault/handoff: ${JSON.stringify(fa)}\n${why(ra)}`);
  const ca = readFileSync(path.join(a.handoff, fa[0]), 'utf8');
  assert.equal(ca, body(`weekly (${NOTE_W})`, OUT_W, ERR_N(16384)));
  assert.equal(ca.includes('--- cut'), false, 'a 16,384-byte stream was cut');
  // (b) a stream of 16,385 bytes is cut to its first and last 8,192 bytes.
  const b = makeRoot({ out: OUT_W, err: ERR_N(16385), exit: 1 });
  const rb = runOnce(b);
  assert.equal(rb.status, 0, why(rb));
  const fb = limitFilesOf(b);
  assert.equal(fb.length, 1, `limit files in vault/handoff: ${JSON.stringify(fb)}\n${why(rb)}`);
  const cb = readFileSync(path.join(b.handoff, fb[0]), 'utf8');
  assert.equal(
    cb,
    body(`weekly (${NOTE_W})`, OUT_W, `${ERR_N(16385).slice(0, 8192)}\n--- cut 1 of 16385 bytes ---\n${ERR_N(16385).slice(-8192)}`),
  );
});

test('EZD-193 T9 the log copy is cut the same way (AC-EZD-193-1)', async () => {
  const root = makeRoot({ out: OUT_5, err: ERR_BIG, exit: 1, confirmed: true, handoffIsFile: true });
  const u = await runUntil(root, 'five-hour limit; waiting until');
  assert.equal(u.saw, true, `the five-hour wait was not reached\n${u.out}`);
  const mark = 'could not save the limit error text to vault/handoff/limit-error-';
  const at = u.out.indexOf(mark);
  assert.ok(at >= 0, `stdout lacks the L1 line\n${u.out}`);
  assert.ok(u.out.slice(at).includes(body('five-hour', OUT_5, cutText(ERR_BIG))), `the cut log body does not follow the L1 line\n${u.out}`);
  assert.equal(u.out.includes('e'.repeat(8193)), false, 'the log copy holds more than 8,192 bytes of the stream in a row');
});

test('EZD-193 T10 the key is redacted before the cut (AC-EZD-193-1)', () => {
  const root = makeRoot({ out: OUT_W, err: ERR_KB, exit: 1, apiKey: KEY });
  const r = runOnce(root);
  // Exit status only: the launcher echoes the child's stderr, so a failure message must not print the output.
  assert.equal(r.status, 0, `exit ${r.status}`);
  const files = limitFilesOf(root);
  assert.equal(files.length, 1, `limit files in vault/handoff: ${JSON.stringify(files)}`);
  const content = readFileSync(path.join(root.handoff, files[0]), 'utf8');
  // Booleans only (L-018): the key and its redaction are never matcher values.
  assert.equal(content.includes('sk-ant-'), false, 'the file holds part of the API key');
  assert.equal(content.includes('<api_ke'), true, 'the file holds no redaction marker');
});

test('EZD-193 T11 the repository ignores limit files (AC-EZD-193-1)', () => {
  const ignored = (p) => spawnSync('git', ['-C', repo, 'check-ignore', '-q', '--no-index', p], { encoding: 'utf8' }).status;
  assert.equal(ignored('vault/handoff/limit-error-2026-10-26T14-03-07-123Z.txt'), 0, 'a limit error file is not ignored');
  assert.equal(ignored('vault/handoff/CURRENT.md'), 1, 'vault/handoff/CURRENT.md is ignored');
  assert.equal(ignored('vault/handoff/limit-error-notes.md'), 1, 'vault/handoff/limit-error-notes.md is ignored');
});

test('EZD-193 T12 the launcher vault commit leaves the limit file out (AC-EZD-193-1)', () => {
  const root = makeRoot({ out: OUT_W, err: ERR_L, exit: 1, gitRepo: true });
  // Without GIT_* names, so the launcher's git works on the temp repository only.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const r = runOnce(root, env);
  assert.equal(r.status, 0, why(r));
  const files = limitFilesOf(root);
  assert.equal(files.length, 1, `limit files in vault/handoff: ${JSON.stringify(files)}\n${why(r)}`);
  const git = (...args) => {
    const g = spawnSync('git', ['-C', root.tmp, ...args], { encoding: 'utf8' });
    assert.equal(g.status, 0, `git ${args.join(' ')}: ${g.stderr}`);
    return g.stdout;
  };
  assert.ok(git('log', '--format=%s').split('\n').includes('docs(vault): build EZD-999'), 'the launcher made no vault commit');
  const tracked = git('ls-files', '--', 'vault/handoff').split('\n');
  assert.equal(tracked.some((n) => n.includes('limit-error-')), false, `a limit file is tracked: ${JSON.stringify(tracked)}`);
  const status = git('status', '--porcelain', '--ignored', '--untracked-files=all', '--', 'vault/handoff').split('\n');
  assert.ok(status.includes(`!! vault/handoff/${files[0]}`), `the limit file is not ignored: ${JSON.stringify(status)}`);
});
