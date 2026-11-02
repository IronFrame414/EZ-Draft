// The files a plan's Build steps name, and those the write guard denies its builder (EZD-250 D3, D4; kept from grants.mjs
// when the guard grants were removed, REMEDIATION 2.8). A ticket whose plan needs a guarded path is held for Josh: a
// tooling change to those files goes through fix mode.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// D4: the Path cell of each row of the section 1 `### Build steps` table: every backticked token with no space that holds
// `/` or `.`, leading `./` removed. Plan order, no repeats.
export function planPaths(planText) {
  const lines = String(planText).split('\n');
  const start = lines.findIndex((l) => /^###\s+Build steps\s*$/.test(l.trim()));
  if (start < 0) return [];
  const out = [];
  let col = -1;
  for (const line of lines.slice(start + 1)) {
    if (/^#/.test(line)) break;
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (col < 0) {
      col = cells.indexOf('Path');
      if (col < 0) return [];
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    for (const m of (cells[col] ?? '').matchAll(/`([^`]+)`/g)) {
      const tok = m[1];
      if (/\s/.test(tok) || !/[/.]/.test(tok)) continue;
      const p = tok.replace(/^\.\//, '');
      if (!out.includes(p)) out.push(p);
    }
  }
  return out;
}

// D3: ask the real hook. Denied = stdout holds "deny" or the spawn failed (fail closed); any other exit = allowed.
function hookDenies(root, hook, agent, id, rel) {
  const r = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ agent_type: agent, tool_input: { file_path: path.join(root, '.claude/worktrees', id, rel) }, cwd: root }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  if (r.error || r.status === null) return true;
  return (r.stdout || '').includes('"deny"');
}

// D3: the plan paths the guard denies both the builder and the test-author of <id> in its own worktree.
export function guardedPaths({ root, id }) {
  const planFile = path.join(root, 'vault/plans', `${id}.md`);
  const hook = path.join(root, '.claude/hooks/guard-paths.mjs');
  if (!existsSync(planFile) || !existsSync(hook)) return [];
  return planPaths(readFileSync(planFile, 'utf8')).filter(
    (rel) => hookDenies(root, hook, 'builder', id, rel) && hookDenies(root, hook, 'test-author', id, rel),
  );
}
