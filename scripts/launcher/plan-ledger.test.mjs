// EZD-244 L1-L2 (vault/plans/EZD-244.md section 4): after a plan unit the launcher calls the ledger tool's
// setArchitecture(id); a failed call leaves the STATUS row at `todo` and logs the message. Same harness as
// budget-hold.test.mjs: the launcher runs as a copy under a temporary root with a stub ledger tool and a fake claude.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, chmodSync, rmSync, realpathSync, openSync, closeSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

const stubLedger = (callsFile, result) =>
  [
    '// Stub ledger tool for the EZD-244 plan-ledger test.',
    "import { appendFileSync } from 'node:fs';",
    "export const weekStart = () => new Date('2030-01-07T07:00:00.000Z');",
    "export const weekSpend = () => ({ start: weekStart(), main: 0, fable: 0, runs: 0, ceiling: null, pct: null, text: 'stub' });",
    "export const questionsFingerprint = () => '';",
    'export const assignQuestionIds = () => ({});',
    `export const setArchitecture = (id) => { appendFileSync(${JSON.stringify(callsFile)}, id + '\\n'); return ${JSON.stringify(result)}; };`,
    "if (process.argv.includes('--next-unit')) console.log('plan EZD-999');",
    '',
  ].join('\n');

const fakeClaude = (callsFile) =>
  [
    '#!/bin/sh',
    `printf '%s\\n' "$*" >> "${callsFile}"`,
    'if [ "$1" = "--help" ]; then echo "--max-turns --session-id --permission-prompts"; exit 0; fi',
    "printf '%s\\n' '{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"result\":\"fake unit done\",\"session_id\":\"ezd244-fake-session\",\"num_turns\":1,\"duration_ms\":5,\"total_cost_usd\":0,\"modelUsage\":{}}'",
    '',
  ].join('\n');

function makeRoot(result) {
  const tmp = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd244-')));
  made.push(tmp);
  const at = (...p) => path.join(tmp, ...p);
  for (const d of ['scripts', 'vault/tools', 'vault/tickets', 'vault/cost', 'vault/handoff', 'vault/plans', 'logs', 'bin']) mkdirSync(at(d), { recursive: true });
  for (const f of ['run.mjs', 'budget.mjs', 'oauth-usage.mjs', 'cost-log.mjs', 'launcher-idle.mjs']) copyFileSync(path.join(repo, 'scripts', f), at('scripts', f));
  copyFileSync(path.join(repo, 'vault/tools/boost.mjs'), at('vault/tools/boost.mjs'));
  writeFileSync(at('vault/tools/next_ticket.mjs'), stubLedger(at('arch-calls.txt'), result));
  writeFileSync(at('vault/tickets/STATUS.md'), '| EZD-999 | 1 | t | todo | | | | | |\n');
  writeFileSync(at('vault/plans/EZD-999.md'), '# EZD-999 · Sample\n\n- **Complexity:** low\n\n## 1. What to build\nx\n');
  writeFileSync(at('vault/budget.json'), JSON.stringify({ meter_source: 'statusline', weekly_ceiling_usd_est: 1000 }));
  writeFileSync(at('fake-claude'), fakeClaude(at('claude-calls.txt')), { mode: 0o755 });
  chmodSync(at('fake-claude'), 0o755);
  writeFileSync(at('bin/claude'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  chmodSync(at('bin/claude'), 0o755);
  writeFileSync(
    at('scripts/launcher.config.json'),
    JSON.stringify({ claude_bin: at('fake-claude'), log_dir: at('logs'), notify_cmd: `printf '%s\\n' "$MSG" >> "${at('notified.txt')}"` }),
  );
  const now = Date.now();
  writeFileSync(
    at('vault/cost/usage.json'),
    JSON.stringify({
      five_hour: { pct: 10, resets_at: new Date(now + 7_200_000).toISOString() },
      seven_day: { pct: 10, resets_at: new Date(now + 3 * 86_400_000).toISOString() },
      fable_seven_day: null,
      read_at: new Date(now).toISOString(),
      source: 'statusline',
    }),
  );
  return { tmp, at };
}

function runOnce(root) {
  const fd = openSync(root.at('logs/launcher.log'), 'a');
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
    GIT_CEILING_DIRECTORIES: path.dirname(root.tmp),
    PATH: `${root.at('bin')}${path.delimiter}${process.env.PATH ?? ''}`,
  };
  try {
    return spawnSync(process.execPath, [root.at('scripts/run.mjs'), '--once'], { stdio: ['ignore', fd, fd], env, timeout: 20000 });
  } finally {
    closeSync(fd);
  }
}

const statusRow = (root) => readFileSync(root.at('vault/tickets/STATUS.md'), 'utf8').split('\n').find((l) => l.startsWith('| EZD-999 |')).split('|').map((c) => c.trim());
const readIf = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);

test('EZD-244 L1: a plan unit calls setArchitecture once, then marks the row planned', () => {
  const root = makeRoot({ ok: true, message: 'ARCHITECTURE SET EZD-999: 0 section(s)' });
  runOnce(root);
  const log = readIf(root.at('logs/launcher.log'));
  assert.equal(readIf(root.at('arch-calls.txt')), 'EZD-999\n', log);
  const row = statusRow(root);
  assert.equal(row[4], 'planned', log);
  assert.equal(row[5], 'low', log);
});

test('EZD-244 L2: a failed setArchitecture leaves the row todo and logs its message', () => {
  const message = 'EZD-999: no Architecture line in section 2 of vault/plans/EZD-999.md';
  const root = makeRoot({ ok: false, message });
  runOnce(root);
  const log = readIf(root.at('logs/launcher.log'));
  assert.equal(statusRow(root)[4], 'todo', log);
  assert.ok(log.includes(message), log);
});
