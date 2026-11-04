#!/usr/bin/env node
// Queued ledger edits (EZD-250; vault/plans/EZD-250.md D10, D10a). An interactive session edits the ledger on a queue branch
// in its own worktree instead of pausing the launcher; the launcher applies queued branches to develop between units.
// Every command runs from the main checkout.
// Usage: node vault/tools/ledger-queue.mjs start <slug>                  new queue worktree off develop; prints QUEUE WORKTREE <path>
//        node vault/tools/ledger-queue.mjs submit <name> -m <message>    check and commit the worktree's ledger edits; prints QUEUED <branch>
//        node vault/tools/ledger-queue.mjs list                          every queue/* and queue-rejected/* branch
//        node vault/tools/ledger-queue.mjs apply                         apply queued branches to develop; prints the result as JSON
import { existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const QUEUE_FILES = ['vault/tickets/STATUS.md', 'vault/tickets/tickets.json', 'vault/spec/acceptance-criteria.md'];
export const QUEUE_PREFIXES = ['vault/tickets/phases/', 'vault/questions/'];
const NAME_RE = /^\d{8}T\d{6}-[a-z0-9-]{1,40}$/;

export const queueAllowed = (rel) => QUEUE_FILES.includes(rel) || QUEUE_PREFIXES.some((p) => rel.startsWith(p));

const git = (cwd, ...a) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8' });
// A git step D10a does not handle: the caller (CLI `apply`) exits 1 with it.
function must(r, what) {
  if (r.error || r.status !== 0) throw new Error(`git ${what} failed: ${(r.stderr || '').trim() || r.error?.message || `exit ${r.status}`}`);
  return r.stdout;
}
const ledgerCheck = (cwd) => spawnSync(process.execPath, [path.join(cwd, 'vault/tools/next_ticket.mjs'), '--check'], { cwd, encoding: 'utf8' });
const firstLine = (text) => String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';

// Changed paths in a worktree, staged, unstaged and untracked, both sides of a rename.
function changedPaths(wt) {
  const parts = must(git(wt, 'status', '--porcelain=v1', '-z', '--untracked-files=all'), 'status').split('\0').filter(Boolean);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].slice(0, 2);
    out.push(parts[i].slice(3));
    if (/[RC]/.test(code)) out.push(parts[++i]);
  }
  return out;
}

// D10a: apply each queue/* branch to develop, or reject it to queue-rejected/<name>.
export function applyQueue({ root }) {
  const applied = [];
  const rejected = [];
  if (must(git(root, 'rev-parse', '--abbrev-ref', 'HEAD'), 'rev-parse').trim() !== 'develop') return { applied, rejected, deferred: 'not on develop' };
  if (must(git(root, 'status', '--porcelain', '--', 'vault'), 'status').trim()) return { applied, rejected, deferred: 'vault has uncommitted changes' };
  const worktrees = must(git(root, 'worktree', 'list', '--porcelain'), 'worktree list').split('\n');
  const branches = must(git(root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/queue/'), 'for-each-ref').split('\n').filter(Boolean).sort();
  const reject = (name, reason) => {
    const taken = new Set(must(git(root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/queue-rejected/'), 'for-each-ref').split('\n').filter(Boolean));
    let target = `queue-rejected/${name}`;
    for (let n = 2; taken.has(target); n++) target = `queue-rejected/${name}-${n}`;
    must(git(root, 'branch', '-m', `queue/${name}`, target), 'branch -m');
    rejected.push({ name, reason });
  };
  for (const b of branches) {
    const name = b.slice('queue/'.length);
    if (worktrees.includes(`branch refs/heads/${b}`)) continue;
    if (must(git(root, 'rev-list', '--count', `develop..${b}`), 'rev-list').trim() === '0') continue;
    const outside = must(git(root, 'diff', '--name-only', `develop...${b}`), 'diff').split('\n').filter(Boolean).find((p) => !queueAllowed(p));
    if (outside) { reject(name, `touches ${outside}`); continue; }
    const before = must(git(root, 'rev-parse', 'HEAD'), 'rev-parse').trim();
    const base = must(git(root, 'merge-base', 'develop', b), 'merge-base').trim();
    if (git(root, 'cherry-pick', `${base}..${b}`).status !== 0) {
      must(git(root, 'cherry-pick', '--abort'), 'cherry-pick --abort');
      reject(name, 'conflicts with develop');
      continue;
    }
    const chk = ledgerCheck(root);
    if (chk.status !== 0) {
      must(git(root, 'reset', '--keep', before), 'reset --keep');
      reject(name, `ledger check failed: ${firstLine(chk.stdout) || firstLine(chk.stderr)}`);
      continue;
    }
    must(git(root, 'branch', '-D', b), 'branch -D');
    applied.push(name);
  }
  return { applied, rejected, deferred: null };
}

const isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const [cmd, ...rest] = process.argv.slice(2);
  const usage = () => {
    process.stderr.write('usage: node vault/tools/ledger-queue.mjs start <slug> | submit <name> -m <message> | list | apply\n');
    process.exit(2);
  };
  const fail = (text) => {
    process.stderr.write(`${text}\n`);
    process.exit(1);
  };
  if (cmd === 'start') {
    const slug = rest[0] || '';
    if (rest.length !== 1 || !/^[a-z0-9-]{1,40}$/.test(slug)) usage();
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    const name = `${stamp}-${slug}`;
    const rel = `.claude/worktrees/queue-${name}`;
    const r = git(root, 'worktree', 'add', '-b', `queue/${name}`, rel, 'develop');
    if (r.status !== 0) fail((r.stderr || '').trim() || `git worktree add failed (exit ${r.status})`);
    process.stdout.write(`QUEUE WORKTREE ${rel}\n`);
  } else if (cmd === 'submit') {
    const name = rest[0] || '';
    const mi = rest.indexOf('-m');
    const message = mi > 0 ? rest[mi + 1] : undefined;
    if (!name || !message) usage();
    const wt = path.join(root, '.claude/worktrees', `queue-${name}`);
    if (!NAME_RE.test(name) || !existsSync(wt)) fail(`QUEUE REFUSED ${name}: no queue worktree`);
    let changed;
    try {
      changed = changedPaths(wt);
    } catch (e) {
      fail(e.message);
    }
    const outside = changed.find((p) => !queueAllowed(p));
    if (outside) fail(`QUEUE REFUSED ${name}: ${outside} is not a ledger file`);
    if (!changed.length) fail(`QUEUE REFUSED ${name}: no changes`);
    const chk = ledgerCheck(wt);
    if (chk.status !== 0) fail(`QUEUE REFUSED ${name}: ledger check failed\n${(chk.stdout || '') + (chk.stderr || '')}`.trimEnd());
    try {
      must(git(wt, 'add', '-A'), 'add');
      must(git(wt, 'commit', '-q', '-m', message), 'commit');
      must(git(root, 'worktree', 'remove', wt), 'worktree remove');
    } catch (e) {
      fail(e.message);
    }
    process.stdout.write(`QUEUED queue/${name}\n`);
  } else if (cmd === 'list') {
    const r = git(root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/queue/', 'refs/heads/queue-rejected/');
    if (r.status !== 0) fail((r.stderr || '').trim());
    process.stdout.write(r.stdout);
  } else if (cmd === 'apply') {
    try {
      process.stdout.write(JSON.stringify(applyQueue({ root })) + '\n');
    } catch (e) {
      fail(e.message);
    }
  } else usage();
}
