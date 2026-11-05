// Tests for .claude/hooks/guard-paths.mjs: the PA3 builder grant is gone (EZD-154), and fix mode is for the interactive orchestrator only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hook = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), '.claude/hooks/guard-paths.mjs');
// The hook sees a fixed root outside any worktree, so the result does not depend on where the tests run or on fix mode in
// the real checkout.
const root = '/ezd-guard-paths-test-root';

function decide(agent, file) {
  const r = spawnSync('node', [hook], {
    input: JSON.stringify({ agent_type: agent, tool_input: { file_path: path.join(root, file) }, cwd: root }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  return r.stdout.includes('"deny"') ? 'deny' : 'allow';
}

const wt = (t, f) => `.claude/worktrees/${t}/${f}`;

const pa3Trees = ['EZD-000b', 'EZD-000c', 'EZD-000e', 'EZD-000i', 'EZD-000j', 'ezd-000c'];
const oldGrant = ['.claude/settings.json', '.claude/hooks/guard-reads.mjs', 'CLAUDE.md', 'scripts/statusline.mjs',
  'vault/tools/outline.mjs', 'vault/research/INDEX.md', 'vault/research/pending/.gitkeep', 'vault/cost/usage.json',
  'vault/cost/usage-raw-sample.json'];
const stillDenied = ['scripts/gate.mjs', 'scripts/hooks/guard-paths.test.mjs', 'vault/PROCESS.md', 'vault/spec/INDEX.md',
  'vault/plans/TEMPLATE.md', 'vault/budget.json'];

test('EZD-154 T1: a builder in an EZD-000b..EZD-000j worktree is denied tooling and vault writes like any worktree (AC-EZD-154-1)', () => {
  for (const t of [...pa3Trees, 'EZD-001']) {
    for (const f of [...oldGrant, ...stillDenied]) {
      assert.equal(decide('builder', wt(t, f)), 'deny', `${t} ${f}`);
    }
  }
});

test('EZD-154 T2: a normal builder write still passes in those worktrees (AC-EZD-154-2)', () => {
  for (const t of [...pa3Trees, 'EZD-001']) {
    for (const f of ['app/src/x.ts', 'scripts/conventions/check.mjs', '.github/workflows/new.yml']) {
      assert.equal(decide('builder', wt(t, f)), 'allow', `${t} ${f}`);
    }
  }
});

test('EZD-154 T3: guard-paths.mjs no longer holds the grant (AC-EZD-154-3)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(hook, 'utf8');
  for (const name of ['pa3Worktree', 'pa3Vault', 'pa3Grant', 'PA3 builder grant', 'realKey']) {
    assert.ok(!src.includes(name), name);
  }
});

// Fix mode is for the interactive orchestrator only; a launcher unit (EZD_UNIT_ID) never gets it (Josh 2026-11-02).
test('fix mode lets the interactive orchestrator edit scripts/, never a launcher unit', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const fixRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'guard-paths-fix-'));
  fs.mkdirSync(path.join(fixRoot, 'vault/handoff'), { recursive: true });
  fs.writeFileSync(path.join(fixRoot, 'vault/handoff/LAUNCHER_FIX.md'), '# test\n');
  const run = (extra) => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: fixRoot, ...extra };
    if (!('EZD_UNIT_ID' in extra)) delete env.EZD_UNIT_ID;
    const r = spawnSync('node', [hook], { input: JSON.stringify({ tool_input: { file_path: path.join(fixRoot, 'scripts/x.mjs') }, cwd: fixRoot }), env, encoding: 'utf8' });
    return r.stdout.includes('"deny"') ? 'deny' : 'allow';
  };
  assert.equal(run({}), 'allow', 'interactive orchestrator in fix mode');
  assert.equal(run({ EZD_UNIT_ID: 'build-EZD-259' }), 'deny', 'launcher unit in fix mode');
});
