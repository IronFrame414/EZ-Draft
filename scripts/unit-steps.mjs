#!/usr/bin/env node
// The build unit's mechanical steps (optimize plan C5; token diet, Josh 2026-10-22). The build-ticket orchestrator calls
// these instead of running git and ledger edits turn by turn, so its session stays a thin dispatcher. Each step prints
// 5 lines or fewer. Exit 0 = go on, 1 = failed (red gate), 3 = stop the unit (reason printed), 2 = usage.
//
//   node scripts/unit-steps.mjs preflight <T>          step 0: develop clean, ledger valid, ticket startable, no hold
//   node scripts/unit-steps.mjs worktree <T>           step 2: create or resume .claude/worktrees/<T> on t/<T>; STATUS → in-progress;
//                                                     `RESUME merged=yes` when an interrupted unit already squashed it (go to step 10)
//   node scripts/unit-steps.mjs merge <T>              step 10: squash, commit, develop gate, clean up; STATUS → done (hash, tests);
//                                                     resumes after an interrupted unit (feat commit already on develop)
//   node scripts/unit-steps.mjs finish <T> <outcome>   step 11: ledger check, report, commit vault/, push develop
//
// Env (tests only): EZD_ROOT (checkout), EZD_GATE_CMD (gate command), EZD_NO_PUSH=1.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.EZD_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statusPath = path.join(root, 'vault/tickets/STATUS.md');
const [step, ticket, outcome] = process.argv.slice(2);

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
const git = (...args) => sh('git', args);
const out = (r) => `${r.stdout || ''}${r.stderr || ''}`.trim();
const stop = (msg) => { console.log(msg); process.exit(3); };

// STATUS.md columns: Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes
const COL = { phase: 1, title: 2, status: 3, complexity: 4, commit: 6, tests: 7, notes: 8 };
function readRows() {
  const lines = readFileSync(statusPath, 'utf8').split('\n');
  const rows = new Map();
  lines.forEach((l, i) => {
    const m = /^\| (EZD-[0-9A-Za-z]+) \|/.exec(l);
    if (m) rows.set(m[1], { i, cells: l.split('|').slice(1, -1).map((c) => c.trim()) });
  });
  return { lines, rows };
}
function setRow(id, changes) {
  const { lines, rows } = readRows();
  const r = rows.get(id);
  if (!r) throw new Error(`${id} has no STATUS row`);
  for (const [k, v] of Object.entries(changes)) r.cells[COL[k]] = String(v);
  lines[r.i] = `| ${r.cells.join(' | ')} |`;
  writeFileSync(statusPath, lines.join('\n'));
}
function rowOf(id) {
  const r = readRows().rows.get(id);
  if (!r) stop(`STOP: ${id} has no row in vault/tickets/STATUS.md`);
  return Object.fromEntries(Object.entries(COL).map(([k, i]) => [k, r.cells[i]]));
}

// Test count: node:test `# pass N` / `ℹ pass N` plus Vitest `Tests  N passed` lines from the gate's output and its gate.log.
function testCount(text) {
  let n = 0;
  let seen = false;
  for (const re of [/^(?:#|ℹ) pass (\d+)/gm, /Tests\s+(\d+) passed/g, /tests: (\d+) passed/g]) {
    for (const m of text.matchAll(re)) { n += Number(m[1]); seen = true; }
  }
  return seen ? n : '';
}

function preflight() {
  const branch = out(git('rev-parse', '--abbrev-ref', 'HEAD'));
  if (branch !== 'develop') stop(`PREFLIGHT STOP: main checkout is on ${branch}, not develop`);
  const dirty = out(git('status', '--porcelain', '--untracked-files=no'));
  if (dirty) stop(`PREFLIGHT STOP: develop has uncommitted changes:\n${dirty.split('\n').slice(0, 3).join('\n')}`);
  const check = sh(process.execPath, ['vault/tools/next_ticket.mjs', '--check']);
  if (check.status !== 0) stop(`PREFLIGHT STOP: next_ticket.mjs --check failed\n${out(check).split('\n').slice(0, 3).join('\n')}`);
  const row = rowOf(ticket);
  if (!['ready', 'in-progress', 'review'].includes(row.status)) stop(`PREFLIGHT STOP: ${ticket} is ${row.status}, not ready/in-progress/review`);
  const data = JSON.parse(readFileSync(path.join(root, 'vault/tickets/tickets.json'), 'utf8'));
  const deps = data.tickets.find((t) => t.id === ticket)?.depends_on || [];
  const { rows } = readRows();
  const open = deps.filter((d) => rows.get(d)?.cells[COL.status] !== 'done');
  if (open.length) stop(`PREFLIGHT STOP: dependencies not done: ${open.join(', ')}`);
  if (row.status === 'ready' && existsSync(path.join(root, 'vault/handoff/BUDGET_HOLD.md'))) stop('PREFLIGHT STOP: vault/handoff/BUDGET_HOLD.md exists; nothing new starts under a hold');
  console.log(`PREFLIGHT OK ${ticket} status=${row.status} complexity=${row.complexity} phase=${row.phase}`);
}

// A unit killed after the squash commit (EZD-020, 2026-10-23: a Claude app restart) leaves `feat(<T>): …` on develop
// with the branch still present. Returns that commit's hash when its code (everything outside vault/) equals the
// branch tip, else null, so the next unit finishes the merge instead of building or squashing again.
function mergedCommit() {
  if (out(git('branch', '--list', `t/${ticket}`)) === '') return null;
  const base = out(git('merge-base', 'develop', `t/${ticket}`));
  const sha = out(git('log', '-F', `--grep=feat(${ticket}): `, '-n', '1', '--format=%H', `${base}..develop`));
  if (!sha) return null;
  return git('diff', '--quiet', sha, `t/${ticket}`, '--', '.', ':(exclude)vault').status === 0 ? sha : null;
}

function worktree() {
  const rel = `.claude/worktrees/${ticket}`;
  const wt = path.join(root, rel);
  const branchExists = out(git('branch', '--list', `t/${ticket}`)) !== '';
  const merged = mergedCommit();
  if (merged) {
    console.log(`WORKTREE RESUME merged=yes commit=${merged.slice(0, 7)}: go to step 10 (merge resumes: develop gate, clean up, done)`);
    return;
  }
  if (existsSync(wt) || branchExists) {
    if (!existsSync(wt)) { const r = git('worktree', 'add', rel, `t/${ticket}`); if (r.status) stop(`WORKTREE STOP: ${out(r)}`); }
    const log = out(sh('git', ['-C', wt, 'log', '--format=%s', `develop..HEAD`]));
    const subjects = log ? log.split('\n') : [];
    const tests = subjects.some((s) => s.startsWith(`test(${ticket})`)) ? 'yes' : 'no';
    const wip = subjects.filter((s) => s.startsWith(`wip(${ticket})`)).length;
    console.log(`WORKTREE RESUME tests=${tests} wip=${wip} path=${wt}`);
  } else {
    const r = git('worktree', 'add', rel, '-b', `t/${ticket}`, 'develop');
    if (r.status) stop(`WORKTREE STOP: ${out(r)}`);
    console.log(`WORKTREE NEW path=${wt}`);
  }
  if (rowOf(ticket).status === 'ready') setRow(ticket, { status: 'in-progress' });
  console.log(`STATUS ${ticket} → ${rowOf(ticket).status}`);
}

function merge() {
  const row = rowOf(ticket);
  const resumed = mergedCommit();
  if (resumed) console.log(`MERGE RESUME ${ticket}: feat commit ${resumed.slice(0, 7)} already on develop; running the develop gate`);
  else {
    const sq = git('merge', '--squash', `t/${ticket}`);
    if (sq.status) { git('merge', '--abort'); git('reset', '--merge'); stop(`MERGE STOP: squash failed: ${out(sq).split('\n')[0]}`); }
    const c = git('commit', '-q', '-m', `feat(${ticket}): ${row.title}`);
    if (c.status) stop(`MERGE STOP: commit failed: ${out(c).split('\n')[0]}`);
  }
  const gateCmd = process.env.EZD_GATE_CMD;
  const gate = gateCmd
    ? sh(gateCmd.split(' ')[0], [...gateCmd.split(' ').slice(1), '.', '--phase', row.phase])
    : sh(process.execPath, ['scripts/gate.mjs', '.', '--phase', row.phase]);
  const gateLog = existsSync(path.join(root, 'gate.log')) ? readFileSync(path.join(root, 'gate.log'), 'utf8') : '';
  const summary = out(gate).split('\n').filter((l) => /^(GATE|typecheck|lint|test|build|perf|first error)/.test(l)).slice(-3);
  if (gate.status !== 0) {
    // A resumed merge may have vault commits on top of the feat commit, so it is reverted rather than reset away.
    if (resumed) git('revert', '--no-edit', resumed);
    else git('reset', '--keep', 'HEAD~1');
    console.log(`MERGE RED ${ticket}: develop gate failed; develop restored, worktree kept. Treat as a review FAIL.`);
    for (const l of summary) console.log(l);
    process.exit(1);
  }
  const hash = resumed ? resumed.slice(0, 7) : out(git('rev-parse', '--short', 'HEAD'));
  const tests = testCount(`${out(gate)}\n${gateLog}`);
  git('worktree', 'remove', `.claude/worktrees/${ticket}`);
  git('branch', '-D', `t/${ticket}`);
  setRow(ticket, { status: 'done', commit: hash, tests });
  console.log(`MERGE OK ${ticket} commit=${hash} tests=${tests || '?'} (STATUS → done; add Notes, DONE.md line and lessons)`);
}

function finish() {
  if (!['done', 'blocked'].includes(outcome)) { console.log('usage: finish <T> done|blocked'); process.exit(2); }
  const check = sh(process.execPath, ['vault/tools/next_ticket.mjs', '--check']);
  if (check.status !== 0) stop(`FINISH STOP: next_ticket.mjs --check failed\n${out(check).split('\n').slice(0, 3).join('\n')}`);
  sh(process.execPath, ['vault/tools/next_ticket.mjs', '--report']);
  git('add', 'vault/');
  const c = git('commit', '-q', '-m', `docs(vault): ${ticket} ${outcome}`);
  if (c.status && !/nothing to commit/.test(out(c))) stop(`FINISH STOP: commit failed: ${out(c).split('\n')[0]}`);
  if (!process.env.EZD_NO_PUSH) {
    const p = git('push', '-q', 'origin', 'develop');
    if (p.status) stop(`FINISH STOP: push failed: ${out(p).split('\n')[0]}`);
  }
  console.log(`FINISH OK ${ticket} ${outcome} (${out(git('rev-parse', '--short', 'HEAD'))})`);
}

// The launcher tables a build that ends twice without progress (Josh 2026-10-27: "override so it keeps moving
// forward"): the ticket becomes blocked with a note, so --next-unit moves on to the next ready ticket. Its worktree
// and branch stay; the orchestrator sets it back to ready when Josh answers.
function table() {
  const r = rowOf(ticket);
  if (!['in-progress', 'review'].includes(r.status)) stop(`TABLE STOP: ${ticket} is ${r.status}, not in-progress or review`);
  const note = `${new Date().toISOString().slice(0, 10)}: tabled by the launcher (build ended twice without progress, most likely waiting on Josh; see vault/handoff/CURRENT.md). Worktree kept; back to ready when Josh answers.`;
  setRow(ticket, { status: 'blocked', notes: r.notes ? `${r.notes} · ${note}` : note });
  git('add', 'vault/tickets/STATUS.md');
  const c = git('commit', '-q', '-m', `docs(vault): ${ticket} tabled by the launcher`);
  if (c.status) stop(`TABLE STOP: commit failed: ${out(c).split('\n')[0]}`);
  console.log(`TABLE OK ${ticket} (STATUS → blocked)`);
}

const steps = { preflight, worktree, merge, finish, table };
if (!steps[step] || !/^EZD-[0-9A-Za-z]+$/.test(ticket || '')) {
  console.log('usage: node scripts/unit-steps.mjs preflight|worktree|merge|finish|table <EZD-xxx> [done|blocked]');
  process.exit(2);
}
steps[step]();
