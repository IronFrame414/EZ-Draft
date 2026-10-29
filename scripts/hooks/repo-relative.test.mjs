// EZD-250 T33: repoRelative in .claude/hooks/lib.mjs strips only the project dir's own .claude/worktrees/<x>/ prefix, never a
// .claude/worktrees/ segment found anywhere in the path (vault/plans/EZD-250.md D1a, T33; Q-0404 (a)).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const libUrl = pathToFileURL(path.join(repo, '.claude/hooks/lib.mjs')).href;

test('EZD-250 T33 repo path: the repo-relative path strips only the project dir prefix (AC-EZD-250-4)', async () => {
  const { repoRelative } = await import(libUrl);
  // [project dir (CLAUDE_PROJECT_DIR), file, expected repoRelative(file, '/r')]
  const cases = [
    // Project dir /r (the main checkout).
    ['/r', '/r/app/x.ts', 'app/x.ts'],
    ['/r', '/r/.claude/worktrees/EZD-1/app/x.ts', 'app/x.ts'],
    ['/r', '/r/.claude/worktrees/EZD-1/.claude/worktrees/EZD-2/app/x.ts', '.claude/worktrees/EZD-2/app/x.ts'],
    ['/r', '/R/.claude/worktrees/EZD-1/app/x.ts', 'app/x.ts'],
    ['/r', '/tmp/.claude/worktrees/EZD-1/app/x.ts', null],
    ['/r', '/r2/app/x.ts', null],
    // Project dir /r/.claude/worktrees/EZD-1 (a worktree).
    ['/r/.claude/worktrees/EZD-1', '/r/.claude/worktrees/EZD-1/.claude/worktrees/EZD-2/app/x.ts', 'app/x.ts'],
    ['/r/.claude/worktrees/EZD-1', '/r/.claude/worktrees/EZD-1/app/x.ts', 'app/x.ts'],
    ['/r/.claude/worktrees/EZD-1', '/r/.claude/worktrees/EZD-3/app/x.ts', null],
  ];
  const saved = process.env.CLAUDE_PROJECT_DIR;
  const got = [];
  try {
    for (const [dir, f] of cases) {
      process.env.CLAUDE_PROJECT_DIR = dir;
      got.push([dir, f, repoRelative(f, '/r')]);
    }
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = saved;
  }

  // The write guard spawned as EZD-250 T18 (scripts/launcher/grants.test.mjs), dir /r: a builder write outside the repo is denied.
  const r = spawnSync(process.execPath, [path.join(repo, '.claude/hooks/guard-paths.mjs')], {
    input: JSON.stringify({ agent_type: 'builder', tool_input: { file_path: '/tmp/.claude/worktrees/EZD-1/app/x.ts' }, cwd: '/r' }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: '/r' },
    encoding: 'utf8',
  });
  const gp = ['guard-paths builder', '/tmp/.claude/worktrees/EZD-1/app/x.ts', r.stdout.includes('"deny"') ? 'deny' : 'allow'];

  assert.deepEqual([...got, gp], [...cases, ['guard-paths builder', '/tmp/.claude/worktrees/EZD-1/app/x.ts', 'deny']]);
});
