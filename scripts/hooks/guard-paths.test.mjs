// Tests for the Q-0128 (a) PA3 builder grant in .claude/hooks/guard-paths.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hook = path.join(root, '.claude/hooks/guard-paths.mjs');

function decide(agent, file) {
  const r = spawnSync('node', [hook], {
    input: JSON.stringify({ agent_type: agent, tool_input: { file_path: path.join(root, file) }, cwd: root }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  return r.stdout.includes('"deny"') ? 'deny' : 'allow';
}

const wt = (t, f) => `.claude/worktrees/${t}/${f}`;

test('Q-0128 grant: builder in EZD-000b..EZD-000i worktrees may edit tooling', () => {
  for (const t of ['EZD-000b', 'EZD-000e', 'EZD-000i']) {
    for (const f of ['.claude/settings.json', '.claude/hooks/guard-reads.mjs', 'CLAUDE.md', 'scripts/statusline.mjs',
      'vault/tools/outline.mjs', 'vault/research/INDEX.md', 'vault/research/pending/.gitkeep', 'vault/cost/usage.json']) {
      assert.equal(decide('builder', wt(t, f)), 'allow', `${t} ${f}`);
    }
  }
});

test('Q-0128 grant: tests, gate, PROCESS.md, spec and other vault files stay denied', () => {
  for (const f of ['scripts/gate.mjs', 'scripts/hooks/guard-paths.test.mjs', '.claude/hooks/__tests__/x.test.mjs',
    'vault/PROCESS.md', 'vault/spec/INDEX.md', 'vault/plans/TEMPLATE.md', 'vault/questions/QUESTIONS.md', 'vault/budget.json']) {
    assert.equal(decide('builder', wt('EZD-000c', f)), 'deny', f);
  }
});

test('Q-0128 grant: no other worktree or agent gets it', () => {
  for (const t of ['EZD-000', 'EZD-000j', 'EZD-001', 'EZD-000ba']) {
    assert.equal(decide('builder', wt(t, '.claude/settings.json')), 'deny', t);
  }
  assert.equal(decide('builder', '.claude/settings.json'), 'deny', 'main checkout');
  assert.equal(decide('test-author', wt('EZD-000b', 'scripts/statusline.mjs')), 'deny', 'test-author');
  assert.equal(decide('builder', wt('EZD-001', 'scripts/conventions/check.mjs')), 'allow', 'Q-0124 unchanged');
});
