// Shared helpers for EZ Draft hooks. Node 22, no dependencies.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function readInput() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}
export const norm = (p) => (p || '').replace(/\\/g, '/');
export const projectDir = () => norm(process.env.CLAUDE_PROJECT_DIR || process.cwd());

// Path relative to the repo root, whether the file is in the main checkout or a ticket worktree (EZD-250 D1a): a prefix
// match on the project dir only, never a search for .claude/worktrees/ anywhere in the path. <root>/.claude/worktrees/<x>/
// is stripped first (one non-empty segment <x>), then <root>/; anything else is outside the repo (null, fail closed). So a
// path outside the repo that contains /.claude/worktrees/<x>/ is null, a worktree project dir strips only its own nested
// .claude/worktrees/<y>/, and a sibling worktree's path from a worktree project dir is null.
export function repoRelative(filePath, cwd) {
  const p = norm(path.resolve(norm(cwd) || projectDir(), norm(filePath)));
  const root = projectDir().replace(/\/$/, '');
  const lower = p.toLowerCase();
  const worktrees = `${root.toLowerCase()}/.claude/worktrees/`;
  if (lower.startsWith(worktrees)) {
    const rest = p.slice(worktrees.length);
    const slash = rest.indexOf('/');
    if (slash > 0) return rest.slice(slash + 1);
  }
  if (lower.startsWith(`${root.toLowerCase()}/`)) return p.slice(root.length + 1);
  return null; // outside the repo
}
export function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
  process.exit(0);
}
