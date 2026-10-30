#!/usr/bin/env node
// Builder guard grants (EZD-250 D1-D5; EZD-267). The launcher writes .claude/hooks/grants.json (ticket ID → sorted paths) from a
// ticket's approved plan and removes the entry at merge; a plan that is not approved goes to Josh as one patch.
// Usage: node vault/tools/grants.mjs needs <T>              the plan's Build-steps paths the guard denies the builder, one per line
//        node vault/tools/grants.mjs patch <T> <path>...    write vault/handoff/<T>-grant.patch; prints {"path","written"}
//        node vault/tools/grants.mjs apply <T>              grant an approved plan's needs; prints {"id","approved","paths","written","reason"}
//        node vault/tools/grants.mjs drop <T>               remove the ticket's entry; prints {"removed"}
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, realpathSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintPlan } from './plan_lint.mjs';

const GRANTS_REL = '.claude/hooks/grants.json';
const ID_RE = /^EZD-\d+[a-z]?$/;
export const APPROVED_STATUSES = ['ready', 'in-progress', 'review'];
export const JOSH_ONLY_PATHS = ['.claude/hooks/grants.json', 'scripts/gate.mjs'];

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

// D3: the plan paths the guard denies the builder of <id> in its own worktree, test files (allowed to test-author) left out.
export function grantNeeds({ root, id }) {
  const planFile = path.join(root, 'vault/plans', `${id}.md`);
  const hook = path.join(root, '.claude/hooks/guard-paths.mjs');
  if (!existsSync(planFile) || !existsSync(hook)) return [];
  return planPaths(readFileSync(planFile, 'utf8')).filter(
    (rel) => hookDenies(root, hook, 'builder', id, rel) && hookDenies(root, hook, 'test-author', id, rel),
  );
}

// D5: grants.json as an object; absent = {}; anything else throws `grants.json unreadable: <reason>`.
function readGrants(root) {
  const file = path.join(root, GRANTS_REL);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { text: null, obj: {} };
    throw new Error(`grants.json unreadable: ${e.code || e.message}`);
  }
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('grants.json unreadable: invalid JSON');
  }
  if (obj === null || typeof obj !== 'object' || Object.getPrototypeOf(obj) !== Object.prototype) throw new Error('grants.json unreadable: not an object');
  for (const [k, v] of Object.entries(obj)) {
    if (!Array.isArray(v) || !v.every((p) => typeof p === 'string')) throw new Error(`grants.json unreadable: value of ${k} is not a list of paths`);
  }
  return { text, obj };
}

function doneIds(root) {
  const done = new Set();
  let text = '';
  try {
    text = readFileSync(path.join(root, 'vault/tickets/STATUS.md'), 'utf8');
  } catch {
    return done;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\| (EZD-\w+) \|/);
    if (m && line.split('|')[4]?.trim() === 'done') done.add(m[1]);
  }
  return done;
}

// EZD-267: the status cell of the ticket's STATUS.md row (the doneIds parse); null = no row.
function statusOf(root, id) {
  let text = '';
  try {
    text = readFileSync(path.join(root, 'vault/tickets/STATUS.md'), 'utf8');
  } catch {
    return null;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\| (EZD-\w+) \|/);
    if (m && m[1] === id) return line.split('|')[4]?.trim() ?? '';
  }
  return null;
}

// EZD-267: approved = status ready, in-progress or review, the plan exists and the strict plan_lint finds no problem.
export function planApproval({ root, id }) {
  const status = statusOf(root, id);
  if (status === null) return { approved: false, reason: 'status none' };
  if (!APPROVED_STATUSES.includes(status)) return { approved: false, reason: `status ${status}` };
  const planFile = path.join(root, 'vault/plans', `${id}.md`);
  if (!existsSync(planFile)) return { approved: false, reason: 'no plan' };
  const problems = lintPlan(readFileSync(planFile, 'utf8'));
  if (problems.length) return { approved: false, reason: `plan_lint: ${problems[0]}` };
  return { approved: true, reason: null };
}

// EZD-267 (Q-0457 (a)): the first path whose normalized lower-case form is Josh-only; none → null.
export function joshOnlyPath(paths) {
  return paths.find((p) => JOSH_ONLY_PATHS.includes(path.posix.normalize(p).toLowerCase())) ?? null;
}

const grantsText = (obj) => JSON.stringify(Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]])), null, 2) + '\n';

// EZD-267 "Write": an exclusive temp file in .claude/hooks renamed onto grants.json; any failure throws `grants.json not written: <code>`.
function writeGrants(root, text) {
  const file = path.join(root, GRANTS_REL);
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.grants.json.${process.pid}.${randomUUID()}.tmp`);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(tmp, text, { flag: 'wx' });
    renameSync(tmp, file);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw new Error(`grants.json not written: ${e.code || e.message}`);
  }
}

// EZD-267: grant <id> the paths its approved plan needs; needs and approval are computed here, never taken from the caller.
export function applyGrant({ root, id }) {
  const a = planApproval({ root, id });
  const needs = grantNeeds({ root, id });
  if (!needs.length) return { id, approved: a.approved, paths: [], written: false, reason: a.reason };
  if (!a.approved) return { id, approved: false, paths: needs, written: false, reason: a.reason };
  const p = joshOnlyPath(needs);
  if (p !== null) return { id, approved: false, paths: needs, written: false, reason: `josh-only path ${p}` };
  const { text: oldText, obj } = readGrants(root);
  const done = doneIds(root);
  const next = {};
  for (const k of Object.keys(obj)) if (k !== id && !done.has(k)) next[k] = obj[k];
  const listed = planPaths(readFileSync(path.join(root, 'vault/plans', `${id}.md`), 'utf8'));
  const entry = [...new Set([...(obj[id] ?? []).filter((p) => listed.includes(p)), ...needs])].sort();
  next[id] = entry;
  const text = grantsText(next);
  const written = text !== oldText;
  if (written) writeGrants(root, text);
  return { id, approved: true, paths: entry, written, reason: null };
}

// EZD-267: remove <id>'s entry; no entry (or no file) writes nothing.
export function dropGrant({ root, id }) {
  const { obj } = readGrants(root);
  if (!Object.prototype.hasOwnProperty.call(obj, id)) return { removed: false };
  delete obj[id];
  writeGrants(root, grantsText(obj));
  return { removed: true };
}

// D5: one patch to grants.json that adds <id> with its sorted paths and drops done tickets, at vault/handoff/<id>-grant.patch.
export function writeGrantPatch({ root, id, paths }) {
  const { text: oldText, obj } = readGrants(root);
  const done = doneIds(root);
  const next = {};
  for (const k of Object.keys(obj)) if (!done.has(k)) next[k] = obj[k];
  next[id] = [...new Set(paths)].sort();
  const sorted = Object.fromEntries(Object.keys(next).sort().map((k) => [k, next[k]]));
  const newText = JSON.stringify(sorted, null, 2) + '\n';
  const rel = `vault/handoff/${id}-grant.patch`;
  const patchFile = path.join(root, rel);

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-grant-'));
  let diff;
  try {
    mkdirSync(path.join(tmp, 'old'));
    mkdirSync(path.join(tmp, 'new'));
    writeFileSync(path.join(tmp, 'new/grants.json'), newText);
    if (oldText !== null) writeFileSync(path.join(tmp, 'old/grants.json'), oldText);
    diff = spawnSync('git', ['diff', '--no-index', '--no-color', oldText === null ? '/dev/null' : 'old/grants.json', 'new/grants.json'], { cwd: tmp, encoding: 'utf8' });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  if (diff.error) throw new Error(`git diff failed: ${diff.error.code || diff.error.message}`);
  if (diff.status === 0) {
    if (existsSync(patchFile)) unlinkSync(patchFile);
    return { path: rel, written: false };
  }
  if (diff.status !== 1) throw new Error(`git diff failed: ${(diff.stderr || '').trim().split('\n')[0] || `exit ${diff.status}`}`);
  const patch = diff.stdout
    .split('\n')
    .map((l) => {
      if (l.startsWith('diff --git ')) return `diff --git a/${GRANTS_REL} b/${GRANTS_REL}`;
      if (l.startsWith('--- ') && l !== '--- /dev/null') return `--- a/${GRANTS_REL}`;
      if (l.startsWith('+++ ') && l !== '+++ /dev/null') return `+++ b/${GRANTS_REL}`;
      return l;
    })
    .join('\n');
  const same = existsSync(patchFile) && readFileSync(patchFile, 'utf8') === patch;
  if (!same) {
    mkdirSync(path.dirname(patchFile), { recursive: true });
    writeFileSync(patchFile, patch);
  }
  return { path: rel, written: !same };
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
  const [cmd, id, ...rest] = process.argv.slice(2);
  const usage = () => {
    process.stderr.write('usage: node vault/tools/grants.mjs needs <T> | patch <T> <path>... | apply <T> | drop <T>\n');
    process.exit(2);
  };
  if (!ID_RE.test(id || '')) usage();
  if (cmd === 'needs' && rest.length === 0) {
    const needs = grantNeeds({ root, id });
    if (needs.length) process.stdout.write(needs.join('\n') + '\n');
  } else if (cmd === 'patch' && rest.length > 0) {
    try {
      process.stdout.write(JSON.stringify(writeGrantPatch({ root, id, paths: rest })) + '\n');
    } catch (e) {
      process.stderr.write(`${e.message}\n`);
      process.exit(1);
    }
  } else if ((cmd === 'apply' || cmd === 'drop') && rest.length === 0) {
    try {
      const out = cmd === 'apply' ? applyGrant({ root, id }) : dropGrant({ root, id });
      process.stdout.write(JSON.stringify(out) + '\n');
    } catch (e) {
      process.stderr.write(`${e.message}\n`);
      process.exit(1);
    }
  } else usage();
}
