// Shared helpers for EZ Draft hooks. Node 22, no dependencies.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function readInput() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}
export const norm = (p) => (p || '').replace(/\\/g, '/');
export const projectDir = () => norm(process.env.CLAUDE_PROJECT_DIR || process.cwd());

// Path relative to the repo root, whether the file is in the main checkout or a ticket worktree.
export function repoRelative(filePath, cwd) {
  let p = norm(path.resolve(norm(cwd) || projectDir(), norm(filePath)));
  const root = projectDir().replace(/\/$/, '');
  const wt = p.match(/\/\.claude\/worktrees\/[^/]+\/(.*)$/);
  if (wt) return wt[1];
  if (p.toLowerCase().startsWith(root.toLowerCase() + '/')) return p.slice(root.length + 1);
  return null; // outside the repo
}
export function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
  process.exit(0);
}
