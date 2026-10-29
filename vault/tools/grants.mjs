#!/usr/bin/env node
// Builder guard grants (EZD-250; vault/plans/EZD-250.md D1-D5). A ticket whose plan writes files the builder may not
// write is held until Josh applies one patch to .claude/hooks/grants.json (ticket ID → sorted paths).
// Usage: node vault/tools/grants.mjs needs <T>              the plan's Build-steps paths the guard denies the builder, one per line
//        node vault/tools/grants.mjs patch <T> <path>...    write vault/handoff/<T>-grant.patch; prints {"path","written"}
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GRANTS_REL = '.claude/hooks/grants.json';
const ID_RE = /^EZD-\d+[a-z]?$/;

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
    process.stderr.write('usage: node vault/tools/grants.mjs needs <T> | patch <T> <path>...\n');
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
  } else usage();
}
