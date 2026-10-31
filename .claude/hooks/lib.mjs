// Shared helpers for EZ Draft hooks. Node 22, no dependencies.
import { readFileSync, lstatSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export function readInput() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}
export const norm = (p) => (p || '').replace(/\\/g, '/');
export const projectDir = () => norm(process.env.CLAUDE_PROJECT_DIR || process.cwd());

// canonicalPath: the absolute path the OS would open, every existing segment resolved with realpathSync.native (links
// followed, on-disk case), missing segments re-appended; null (fail closed) for a dangling or looping link, a file used as a
// folder, any other lstat error, or a '..' that climbs out of a link (EZD-260). repoRelative: that path relative to the
// canonical project dir (EZD-250 D1a prefix rule: <root>/.claude/worktrees/<x>/ stripped first, then <root>/); null outside
// the repo or when either path is unresolvable.
function walk(abs) {
  const segs = abs.split('/');
  let cur = '/';
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s === '' || s === '.') continue;
    if (s === '..') { cur = path.posix.dirname(cur); continue; }
    const next = cur === '/' ? `/${s}` : `${cur}/${s}`;
    try {
      lstatSync(next);
    } catch (e) {
      if (e?.code !== 'ENOENT') return null;
      const rest = segs.slice(i).filter((r) => r !== '' && r !== '.');
      if (rest.includes('..')) return null;
      return `${cur === '/' ? '' : cur}/${rest.join('/')}`;
    }
    try {
      cur = norm(realpathSync.native(next));
    } catch {
      return null;
    }
  }
  return cur;
}
export function canonicalPath(filePath, cwd) {
  let f = norm(filePath);
  if (!f.startsWith('/')) f = `${norm(cwd) || projectDir()}/${f}`;
  if (!f.startsWith('/')) f = `${norm(process.cwd())}/${f}`;
  const a = walk(f);
  const b = walk(path.posix.normalize(f));
  return a !== null && a === b ? a : null;
}
export function repoRoot() {
  const r = canonicalPath(projectDir(), process.cwd());
  return r === null ? null : r.replace(/\/$/, '');
}
export function repoRelative(filePath, cwd) {
  const p = canonicalPath(filePath, cwd);
  const root = repoRoot();
  if (p === null || root === null) return null;
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
// Letter case (EZD-277): on a disk that ignores case, a compare that denies uses pathKey(…, true), which folds wider than the disk; a compare that allows (pathIn, grants) folds only printable ASCII, which the disk folds too, so no look-alike letter (ı, ſ, K, ﬁ) is ever allowed. The probe fails closed to folding. Grant keys and paths outside printable ASCII grant nothing.
export function caseInsensitiveDisk(dir) {
  if (typeof dir !== 'string' || dir === '') return true;
  const flipped = dir.replace(/[A-Za-z]/g, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
  if (flipped === dir) return true;
  let a;
  try {
    a = statSync(dir);
  } catch {
    return true;
  }
  let b;
  try {
    b = statSync(flipped);
  } catch {
    return false;
  }
  return a.dev === b.dev && a.ino === b.ino;
}
export function pathKey(p, fold) {
  if (!fold) return p;
  return p.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC');
}
export function pathIn(list, p, fold) {
  return list.some((e) => e === p || (fold && printableAscii(e) && printableAscii(p) && pathKey(e, true) === pathKey(p, true)));
}
const ASCII = /^[\x20-\x7e]+$/;
export function printableAscii(s) {
  return typeof s === 'string' && ASCII.test(s);
}
export function grantFor(grants, ticket, fold) {
  if (!(grants !== null && typeof grants === 'object' && Object.getPrototypeOf(grants) === Object.prototype)) return null;
  const keys = Object.keys(grants).filter((k) => ASCII.test(k) && pathKey(k, fold) === pathKey(ticket, fold));
  if (keys.length !== 1) return null;
  const v = grants[keys[0]];
  return Array.isArray(v) && v.every((e) => typeof e === 'string' && ASCII.test(e)) ? v : null;
}
export function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
  process.exit(0);
}
