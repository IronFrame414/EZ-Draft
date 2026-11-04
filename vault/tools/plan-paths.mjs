// The files a plan's Build steps name, and those the write guard denies its builder (EZD-250 D3, D4; kept from grants.mjs
// when the guard grants were removed, REMEDIATION 2.8). A ticket whose plan needs a guarded path is held for Josh: a
// tooling change to those files goes through fix mode.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// D4: the Path cell of each row of the section 1 `### Build steps` table: every backticked token with no space that holds
// `/` or `.`, leading `./` removed. Plan order, no repeats.
export function planPaths(planText) {
  const out = [];
  for (const { paths } of planRows(planText)) for (const p of paths) if (!out.includes(p)) out.push(p);
  return out;
}

// One entry per Build steps row: its paths, and whether the Path cell gives the step to the orchestrator (a parenthesis
// opening with "orchestrator", any case, e.g. "(orchestrator writes; Josh applies)"; EZD-300 hold, Josh 2026-11-03).
function planRows(planText) {
  const lines = String(planText).split('\n');
  const start = lines.findIndex((l) => /^###\s+Build steps\s*$/.test(l.trim()));
  if (start < 0) return [];
  const rows = [];
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
    const cell = cells[col] ?? '';
    const paths = [];
    for (const m of cell.matchAll(/`([^`]+)`/g)) {
      const tok = m[1];
      if (/\s/.test(tok) || !/[/.]/.test(tok)) continue;
      paths.push(tok.replace(/^\.\//, ''));
    }
    rows.push({ paths, orchestrator: /\(\s*orchestrator\b/i.test(cell.replace(/`[^`]*`/g, '')) });
  }
  return rows;
}

// D3: ask the real hook. Denied = stdout holds "deny" or the spawn failed (fail closed); any other exit = allowed.
// The orchestrator is asked as the unit session (no agent_type, EZD_UNIT_ID set, so no fix mode).
function hookDenies(root, hook, agent, id, rel) {
  const unit = agent === 'orchestrator';
  const r = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ ...(unit ? {} : { agent_type: agent }), tool_input: { file_path: path.join(root, '.claude/worktrees', id, rel) }, cwd: root }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...(unit ? { EZD_UNIT_ID: id } : {}) },
    encoding: 'utf8',
  });
  if (r.error || r.status === null) return true;
  return (r.stdout || '').includes('"deny"');
}

// D3: the plan paths the guard denies both the builder and the test-author of <id> in its own worktree; for a step the
// plan gives the orchestrator, the paths the guard denies the orchestrator in a unit.
export function guardedPaths({ root, id }) {
  const planFile = path.join(root, 'vault/plans', `${id}.md`);
  const hook = path.join(root, '.claude/hooks/guard-paths.mjs');
  if (!existsSync(planFile) || !existsSync(hook)) return [];
  const out = [];
  for (const { paths, orchestrator } of planRows(readFileSync(planFile, 'utf8'))) {
    for (const rel of paths) {
      if (out.includes(rel)) continue;
      const held = orchestrator
        ? hookDenies(root, hook, 'orchestrator', id, rel)
        : hookDenies(root, hook, 'builder', id, rel) && hookDenies(root, hook, 'test-author', id, rel);
      if (held) out.push(rel);
    }
  }
  return out;
}
