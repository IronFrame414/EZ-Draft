// Tests for the EZD-000i token guard (Q-0135 a) in .claude/hooks/guard-bash.mjs and .claude/settings.json.
// Commands are only passed to the hook as text; nothing is run and no real secret is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hook = path.join(repo, '.claude/hooks/guard-bash.mjs');

function run(agent, command) {
  const input = { tool_input: { command } };
  if (agent) input.agent_type = agent;
  const r = spawnSync('node', [hook], {
    input: JSON.stringify(input),
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    encoding: 'utf8',
  });
  const denied = r.stdout.includes('"deny"');
  const reason = denied ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason : '';
  return { denied, reason, stdout: r.stdout };
}

const keychain = [
  'security find-generic-password -s "Claude Code-credentials" -w',
  'security find-generic-password -s "Claude Code-credentials" -g',
  'security find-generic-password -gw -s "Claude Code-credentials"',
  'security find-internet-password -s example.com -w',
  'security dump-keychain -d',
];
const credfile = [
  'cat ~/.claude/.credentials.json',
  'cat "$HOME/.claude/.credentials.json"',
  'jq . ~/.claude/.credentials.json',
  'cp ~/.claude/.credentials.json /tmp/x',
  'test -f ~/.claude/.credentials.json && cat ~/.claude/.credentials.json',
];
const allowed = [
  'security find-generic-password -s "Claude Code-credentials"',
  'test -f ~/.claude/.credentials.json',
  '[ -f ~/.claude/.credentials.json ]',
  'test -f "$HOME/.claude/.credentials.json" && echo found',
  'node scripts/oauth-usage.mjs --probe',
  'git status',
];

test('EZD-000i T11 shell guard denies printing a Keychain secret, for every caller', () => {
  for (const agent of [null, 'builder']) {
    for (const cmd of keychain) {
      const r = run(agent, cmd);
      assert.ok(r.denied, `${agent} ${cmd}`);
      assert.ok(r.reason.includes('Keychain') && r.reason.includes('PA3 rule 8'), r.reason);
    }
  }
});

test('EZD-000i T11 shell guard denies naming the sign-in file except test -f, for every caller', () => {
  for (const agent of [null, 'builder']) {
    for (const cmd of credfile) {
      const r = run(agent, cmd);
      assert.ok(r.denied, `${agent} ${cmd}`);
      assert.ok(r.reason.includes('sign-in file') && r.reason.includes('PA3 rule 8'), r.reason);
    }
  }
});

test('EZD-000i T11 shell guard still allows the existence checks and the probe', () => {
  for (const agent of [null, 'builder']) {
    for (const cmd of allowed) {
      const r = run(agent, cmd);
      assert.ok(!r.denied, `${agent} ${cmd}`);
      assert.equal(r.stdout.trim(), '', `${agent} ${cmd}`);
    }
  }
});

test('EZD-000i T11 settings.json deny list gains the five token entries and keeps the old ones', () => {
  const deny = JSON.parse(fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8')).permissions.deny;
  for (const e of [
    'Read(~/.claude/.credentials.json)',
    'Bash(security find-generic-password *-w*)',
    'Bash(security find-generic-password *-g*)',
    'Bash(security find-internet-password *-w*)',
    'Bash(security find-internet-password *-g*)',
    'Read(./.env)',
  ]) assert.ok(deny.includes(e), e);
  // Stage 2 (Josh 2026-11-01): these three move to the hook alone.
  for (const e of ['Bash(claude *)', 'Bash(rm -rf *)', 'Bash(node scripts/run.mjs*)']) assert.ok(!deny.includes(e), e);
});

// Stage 2 exceptions removed (REMEDIATION 2.8): with fix mode open, the orchestrator is denied each of them again.
function runIn(dir, agent, command) {
  const input = { tool_input: { command } };
  if (agent) input.agent_type = agent;
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
  delete env.EZD_UNIT_ID; // the gate may itself run inside a launcher unit
  const r = spawnSync('node', [hook], { input: JSON.stringify(input), env, encoding: 'utf8' });
  return r.stdout.includes('"deny"');
}
// A root with fix mode open, so the test does not depend on the real checkout's vault/handoff.
const fixRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'guard-bash-fix-'));
fs.mkdirSync(path.join(fixRoot, 'vault/handoff'), { recursive: true });
fs.writeFileSync(path.join(fixRoot, 'vault/handoff/LAUNCHER_FIX.md'), '# test\n');

test('Stage 2 exceptions are gone: in fix mode the orchestrator is denied each former exception', () => {
  for (const cmd of [
    'rm -rf .claude/worktrees/EZD-012c',
    'rm -rf .claude/worktrees/EZD-012c/ perf-results',
    'node scripts/run.mjs --dry-run',
    'EZD_SANDBOX_SPIKE=1 claude -p "probe" --settings vault/spikes/sandbox/settings.json',
  ]) assert.ok(runIn(fixRoot, null, cmd), cmd);
});

test('EZD-316 T15 guard-bash allows only the absolute github-ops path, for the orchestrator only', () => {
  const G = 'node /Users/josh/Projects/ezdraft/scripts/release/github-ops.mjs';
  const REASON = "Release scripts are Josh's; agents never run them (EZD-023b).";
  let checks = 0;
  for (const agent of [undefined, 'orchestrator']) {
    for (const cmd of [`${G} push-develop`, `${G} pr-view https://github.com/IronFrame414/EZ-Draft/pull/5`, `${G} run-log 42026026666`]) {
      assert.equal(run(agent, cmd).denied, false, `${agent}: ${cmd}`);
      checks++;
    }
  }
  for (const cmd of [
    'node scripts/release/github-ops.mjs push-develop',
    'node .claude/worktrees/EZD-1/scripts/release/github-ops.mjs push-develop',
    'node /tmp/x/scripts/release/github-ops.mjs push-develop',
    'node /users/josh/projects/ezdraft/scripts/release/github-ops.mjs push-develop',
    'node /Users/josh/Projects/ezdraft/scripts/release/github-ops.mjs.bak x',
    'node /Users/josh/Projects/ezdraft/scripts/release/github-ops.mjs/../promote.mjs',
    'node /Users/josh/Projects/ezdraft/scripts/release/promote.mjs',
    `${G} push-develop; node scripts/release/tag.mjs`,
    'pnpm release:promote',
  ]) {
    const r = run('orchestrator', cmd);
    assert.equal(r.denied, true, cmd);
    assert.equal(r.reason, REASON, cmd);
    checks++;
  }
  for (const agent of ['builder', 'test-author', 'planner', 'code-reviewer']) {
    const r = run(agent, `${G} push-develop`);
    assert.equal(r.denied, true, agent);
    assert.equal(r.reason, REASON, agent);
    checks++;
  }
  assert.equal(checks, 19);
});
