// EZD-333 R1-R3 (vault/plans/EZD-333.md section 4): a repair unit gets fix mode only for the paths LAUNCHER_FIX.md lists,
// never for the hard-limit paths. Paths are only passed to the hook as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const guardPaths = path.join(repo, '.claude/hooks/guard-paths.mjs');

const FIX = [
  '# Fix mode · test',
  '',
  '## Paths',
  '- scripts/perf/budgets.mjs',
  '- `scripts/x/`',
  '- .claude/hooks/guard-bash.mjs',
  '- .claude/hooks/guard-reads.mjs',
  '- .claude/hooks/secret-paths.mjs',
  '- .claude/hooks/guard-paths.mjs',
  '- .claude/hooks/lib.mjs',
  '- .claude/settings.json',
  '- .claude/settings.local.json',
  '- .claude/skills/repair/SKILL.md',
  '- .claude/agents/code-reviewer.md',
  '- .claude/agents/security-reviewer.md',
  '- scripts/unit-sandbox.json',
  '- scripts/gate.mjs',
  '- scripts/gate-summary.mjs',
  '- scripts/launcher-idle.mjs',
  '- .github/workflows/ci.yml',
  '- package.json',
  '- scripts/launcher/repair.test.mjs',
  '- scripts/x/y.test.mjs',
  '- vault/budget.json',
  '',
  '## Notes',
  '- scripts/run.mjs',
  '',
].join('\n');

function makeRoot(fixText) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ezd333-fix-'));
  fs.mkdirSync(path.join(root, 'vault/handoff'), { recursive: true });
  if (fixText !== null) fs.writeFileSync(path.join(root, 'vault/handoff/LAUNCHER_FIX.md'), fixText);
  return root;
}

function decide(root, rel, unitId) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
  if (unitId) env.EZD_UNIT_ID = unitId;
  else delete env.EZD_UNIT_ID;
  const r = spawnSync('node', [guardPaths], { input: JSON.stringify({ tool_input: { file_path: path.join(root, rel) }, cwd: root }), env, encoding: 'utf8' });
  return r.stdout.includes('"deny"') ? 'deny' : 'allow';
}

const FORBIDDEN = [
  '.claude/hooks/guard-bash.mjs', '.claude/hooks/guard-reads.mjs', '.claude/hooks/secret-paths.mjs', '.claude/hooks/guard-paths.mjs',
  '.claude/hooks/lib.mjs', '.claude/settings.json', '.claude/settings.local.json', '.claude/skills/repair/SKILL.md',
  '.claude/agents/code-reviewer.md', '.claude/agents/security-reviewer.md', 'scripts/unit-sandbox.json', 'scripts/gate.mjs',
  'scripts/gate-summary.mjs', 'scripts/launcher-idle.mjs', '.github/workflows/ci.yml', 'package.json',
  'scripts/launcher/repair.test.mjs', 'scripts/x/y.test.mjs', 'vault/budget.json',
];

test('EZD-333 R1: a repair unit writes a guarded path only while LAUNCHER_FIX.md lists it (AC-EZD-333-1)', () => {
  const root = makeRoot(FIX);
  for (const id of ['repair-check', 'repair-waiting', 'repair-ci', 'repair-probe']) {
    assert.equal(decide(root, 'scripts/perf/budgets.mjs', id), 'allow', `${id} listed file`);
    assert.equal(decide(root, 'scripts/x/z.mjs', id), 'allow', `${id} file in a listed folder`);
    assert.equal(decide(root, 'scripts/run.mjs', id), 'deny', `${id} path only under another heading`);
    assert.equal(decide(root, 'scripts/perf/other.mjs', id), 'deny', `${id} unlisted file`);
    // A path is relative to the checkout or worktree it is in (lib.mjs repoRelative), as for every other rule of the hook.
    assert.equal(decide(root, '.claude/worktrees/EZD-1/scripts/perf/other.mjs', id), 'deny', `${id} unlisted file in a worktree`);
    assert.equal(decide(root, '.claude/worktrees/EZD-1/scripts/gate.mjs', id), 'deny', `${id} hard limit in a worktree`);
  }
  for (const id of ['build-EZD-259', 'plan-EZD-1', 'repair-checkx', 'xrepair-ci', 'gate-phase-2']) {
    assert.equal(decide(root, 'scripts/perf/budgets.mjs', id), 'deny', `${id} gets no fix mode`);
  }
  const closed = makeRoot(null);
  assert.equal(decide(closed, 'scripts/perf/budgets.mjs', 'repair-waiting'), 'deny', 'no fix file');
  const noList = makeRoot('# Fix mode · test\n\nscripts/perf/budgets.mjs\n');
  assert.equal(decide(noList, 'scripts/perf/budgets.mjs', 'repair-waiting'), 'deny', 'no Paths list');
});

test('EZD-333 R2: a repair unit never writes the guards, settings, sandbox, gate, CI, package files or tests, even when listed (AC-EZD-333-2)', () => {
  const root = makeRoot(FIX);
  for (const rel of FORBIDDEN) {
    assert.equal(decide(root, rel, 'repair-waiting'), 'deny', rel);
  }
});

test('EZD-333 R3: only interactive sessions and repair units write LAUNCHER_FIX.md; interactive fix mode is unchanged (AC-EZD-333-1)', () => {
  const root = makeRoot(null);
  const fix = 'vault/handoff/LAUNCHER_FIX.md';
  assert.equal(decide(root, fix, 'build-EZD-259'), 'deny', 'build unit');
  assert.equal(decide(root, fix, 'questions-3'), 'deny', 'questions unit');
  assert.equal(decide(root, fix, 'repair-waiting'), 'allow', 'repair unit');
  assert.equal(decide(root, fix, null), 'allow', 'interactive');
  const open = makeRoot('# test\n');
  assert.equal(decide(open, 'scripts/x.mjs', null), 'allow', 'interactive fix mode needs no Paths list');
  assert.equal(decide(open, '.claude/hooks/guard-bash.mjs', null), 'allow', 'interactive fix mode keeps its reach');
});
