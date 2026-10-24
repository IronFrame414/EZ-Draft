// Tests for the EZD-000i token guard (Q-0135 a) in .claude/hooks/guard-bash.mjs and .claude/settings.json.
// Commands are only passed to the hook as text; nothing is run and no real secret is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
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
    'Bash(claude *)',
  ]) assert.ok(deny.includes(e), e);
});
