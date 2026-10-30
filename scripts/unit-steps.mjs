#!/usr/bin/env node
// The build unit's mechanical steps (optimize plan C5; token diet, Josh 2026-10-22). The build-ticket orchestrator calls
// these instead of running git and ledger edits turn by turn, so its session stays a thin dispatcher. Each step prints
// 5 lines or fewer. Exit 0 = go on, 1 = failed (red gate), 3 = stop the unit (reason printed), 4 = merge clash left open for the builder (EZD-175), 2 = usage.
//
//   node scripts/unit-steps.mjs preflight <T>          step 0: develop clean outside vault/, ledger valid, ticket startable, no hold
//   node scripts/unit-steps.mjs worktree <T>           step 2: create or resume .claude/worktrees/<T> on t/<T>; STATUS → in-progress;
//                                                     `RESUME merged=yes` when an interrupted unit already squashed it (go to step 10)
//   node scripts/unit-steps.mjs merge <T>              step 10: squash, commit, develop gate, clean up; STATUS → done (hash, tests);
//                                                     first merges develop into t/<T> and re-runs the ticket gate when that changed anything;
//                                                     resumes after an interrupted unit (feat commit already on develop)
//   node scripts/unit-steps.mjs finish <T> <outcome> [<vault path>...]
//                                                     step 11: ledger check, report, commit vault/ (or only this unit's own
//                                                     paths while another unit is in flight), push develop
//
// Units may run side by side (EZD-173): ledger writes and commits hold the ledger lock, and merges queue behind the merge
// lock (scripts/ledger.mjs). Env (tests only): EZD_ROOT (checkout), EZD_GATE_CMD (gate command), EZD_NO_PUSH=1,
// EZD_INFLIGHT_DIR (in-flight records). EZD_UNIT_ID is set by scripts/run.mjs for the unit's session.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withLedgerLock, withMergeLock, tryLock, readLock, updateStatusRow, commitPaths, commitOrRestore, closeUnit, inflightDir, LockError } from './ledger.mjs';
import { dropGrant } from '../vault/tools/grants.mjs';

const root = process.env.EZD_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statusPath = path.join(root, 'vault/tickets/STATUS.md');
const [step, ticket, outcome, ...extraPaths] = process.argv.slice(2);

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
const git = (...args) => sh('git', args);
const out = (r) => `${r.stdout || ''}${r.stderr || ''}`.trim();
// A stop is thrown, not exited, so the locks a step holds are released on the way out.
class Stop extends Error {}
const stop = (msg) => { throw new Stop(msg); };
const owner = () => `unit-steps ${step} ${ticket}`;

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
function rowOf(id) {
  const r = readRows().rows.get(id);
  if (!r) stop(`STOP: ${id} has no row in vault/tickets/STATUS.md`);
  return Object.fromEntries(Object.entries(COL).map(([k, i]) => [k, r.cells[i]]));
}
// A STATUS change and its commit, inside the caller's ledger hold.
function setStatus(changes) {
  const { paths } = updateStatusRow(root, ticket, changes);
  commitPaths(root, paths, `docs(vault): ${ticket} status`);
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
  // Other lanes' uncommitted vault/ edits are not this unit's (EZD-173).
  const dirty = out(git('status', '--porcelain', '--untracked-files=no', '--', '.', ':(exclude)vault'));
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
  withLedgerLock(root, { owner: owner() }, () => {
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
      // While a merge is in progress develop's tip is an ungated feat commit; branch from the commit under it instead.
      const merge = readLock(root, 'merge');
      if (merge?.alive && merge.base) {
        const r = git('worktree', 'add', rel, '-b', `t/${ticket}`, merge.base);
        if (r.status) stop(`WORKTREE STOP: ${out(r)}`);
        console.log(`WORKTREE NEW path=${wt} base=${out(git('rev-parse', '--short', merge.base))} (merge in progress)`);
      } else {
        const r = git('worktree', 'add', rel, '-b', `t/${ticket}`, 'develop');
        if (r.status) stop(`WORKTREE STOP: ${out(r)}`);
        console.log(`WORKTREE NEW path=${wt}`);
      }
    }
    if (rowOf(ticket).status === 'ready') setStatus({ status: 'in-progress' });
    console.log(`STATUS ${ticket} → ${rowOf(ticket).status}`);
  });
  return 0;
}

let shown = 0;

const listPaths = (paths) => paths.slice(0, 3).join(', ') + (paths.length > 3 ? ` and ${paths.length - 3} more` : '');
const firstLine = (r) => out(r).split('\n')[0];
const gateSummary = (r) => out(r).split('\n').filter((l) => /^(GATE|typecheck|lint|test|build|perf|first error)/.test(l)).slice(-3);
const printSummary = (summary) => {
  const n = Math.max(0, Math.min(3, 4 - shown));
  for (const l of summary.slice(summary.length - n)) console.log(l);
};

// True when guard-paths.mjs would let a builder edit <rel> in the ticket's worktree (asks the hook itself; fails closed).
function builderMayWrite(t, rel) {
  const gp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.claude/hooks/guard-paths.mjs');
  const wt = path.join(root, '.claude/worktrees', t);
  const r = spawnSync(process.execPath, [gp], {
    input: JSON.stringify({ agent_type: 'builder', tool_name: 'Edit', tool_input: { file_path: path.join(wt, rel) }, cwd: wt }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root }, cwd: root, encoding: 'utf8',
  });
  return r.status === 0 && !(r.stdout || '').includes('"permissionDecision":"deny"');
}

function ticketGate(t) {
  const gateCmd = process.env.EZD_GATE_CMD;
  const wtArg = `.claude/worktrees/${t}`;
  return gateCmd
    ? sh(gateCmd.split(' ')[0], [...gateCmd.split(' ').slice(1), wtArg])
    : sh(process.execPath, ['scripts/gate.mjs', wtArg]);
}

// EZD-175: bring t/<T> up to date with develop before the squash. Returns 0 go on, 1 red ticket gate, 3 stop, 4 clash left open.
function updateBranch(t) {
  const wt = path.join(root, '.claude/worktrees', t);
  const br = `t/${t}`;
  if (!out(git('branch', '--list', br))) { console.log(`MERGE STOP ${t}: no branch ${br}`); return 3; }
  if (!existsSync(wt)) {
    const add = git('worktree', 'add', wt, br);
    if (add.status) { console.log(`MERGE STOP ${t}: cannot add .claude/worktrees/${t}: ${firstLine(add)}`); return 3; }
  }
  if (sh('git', ['-C', wt, 'rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0) {
    console.log(`MERGE STOP ${t}: .claude/worktrees/${t} has an unfinished merge; develop untouched`); return 3;
  }
  if (out(sh('git', ['-C', wt, 'status', '--porcelain', '--untracked-files=no']))) {
    console.log(`MERGE STOP ${t}: .claude/worktrees/${t} has uncommitted changes; develop untouched`); return 3;
  }
  for (let k = 1; k <= 3; k++) {
    const dev = out(git('rev-parse', 'develop'));
    const short = out(git('rev-parse', '--short', dev));
    if (git('merge-base', '--is-ancestor', dev, br).status === 0) {
      if (k === 1) { console.log(`MERGE UPDATE ${t}: ${br} already contains develop ${short}`); shown += 1; }
      return 0;
    }
    const mg = sh('git', ['-C', wt, 'merge', '--no-ff', '--no-edit', '-m', `chore(${t}): update from develop ${short}`, dev]);
    if (mg.status) {
      const u = out(sh('git', ['-C', wt, 'diff', '--name-only', '--diff-filter=U'])).split('\n').filter(Boolean);
      const inMerge = () => sh('git', ['-C', wt, 'rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0;
      if (u.length) {
        const denied = u.filter((f) => !builderMayWrite(t, f));
        if (!denied.length) {
          console.log(`MERGE CLASH ${t}: merging develop ${short} into ${br} conflicts in ${listPaths(u)}; merge left open in .claude/worktrees/${t} for the builder; develop untouched.`);
          return 4;
        }
        sh('git', ['-C', wt, 'merge', '--abort']);
        console.log(`MERGE STOP ${t}: merging develop ${short} into ${br} conflicts in ${listPaths(u)}; ${denied[0]} is not the builder's to write; merge aborted, develop untouched, worktree kept.`);
        return 3;
      }
      if (inMerge()) sh('git', ['-C', wt, 'merge', '--abort']);
      console.log(`MERGE STOP ${t}: merging develop ${short} into ${br} failed: ${firstLine(mg)}; develop untouched`);
      return 3;
    }
    const gate = ticketGate(t);
    if (gate.status !== 0) {
      console.log(`MERGE RED ${t}: ticket gate failed after merging develop ${short} into ${br}; develop untouched, worktree kept. Treat as a review FAIL.`);
      printSummary(gateSummary(gate));
      return 1;
    }
    console.log(`MERGE UPDATE ${t} pass ${k}: merged develop ${short} into ${br}; ticket gate green`);
    shown += 1;
    if (git('diff', '--quiet', dev, 'develop', '--', '.', ':(exclude)vault').status === 0) return 0;
  }
  console.log(`MERGE STOP ${t}: develop changed outside vault/ during each of 3 ticket gates; develop untouched`);
  return 3;
}

function merge() {
  return withMergeLock(root, {
    owner: owner(),
    onWait: (rec) => { console.log(`MERGE WAIT ${ticket}: merge lock held by pid ${rec.pid} (${rec.owner})`); shown += 1; },
  }, (mergeLock) => {
    if (!mergedCommit()) { const code = updateBranch(ticket); if (code !== 0) return code; }
    // Ledger hold 1: record the base, squash and commit.
    const { row, resumed, feat } = withLedgerLock(root, { owner: owner() }, () => {
      const row = rowOf(ticket);
      const resumed = mergedCommit();
      mergeLock.update({ base: out(git('rev-parse', resumed ? `${resumed}^` : 'HEAD')) });
      if (resumed) { console.log(`MERGE RESUME ${ticket}: feat commit ${resumed.slice(0, 7)} already on develop; running the develop gate`); shown += 1; }
      else {
        const sq = git('merge', '--squash', `t/${ticket}`);
        if (sq.status) { git('merge', '--abort'); git('reset', '--merge'); stop(`MERGE STOP: squash failed: ${out(sq).split('\n')[0]}`); }
        const c = git('commit', '-q', '-m', `feat(${ticket}): ${row.title}`);
        if (c.status) stop(`MERGE STOP: commit failed: ${out(c).split('\n')[0]}`);
      }
      return { row, resumed, feat: resumed || out(git('rev-parse', 'HEAD')) };
    });
    // The develop gate runs under the merge lock only, so other lanes keep writing the ledger meanwhile.
    const gateCmd = process.env.EZD_GATE_CMD;
    const gate = gateCmd
      ? sh(gateCmd.split(' ')[0], [...gateCmd.split(' ').slice(1), '.', '--phase', row.phase])
      : sh(process.execPath, ['scripts/gate.mjs', '.', '--phase', row.phase]);
    const gateLog = existsSync(path.join(root, 'gate.log')) ? readFileSync(path.join(root, 'gate.log'), 'utf8') : '';
    const summary = gateSummary(gate);
    // Ledger hold 2: restore develop or close the ticket.
    return withLedgerLock(root, { owner: owner() }, () => {
      if (gate.status !== 0) {
        // Commits on top of the feat commit (a resumed merge, or other lanes during the gate) are kept: revert, not reset.
        if (!resumed && out(git('rev-parse', 'HEAD')) === feat) git('reset', '--keep', 'HEAD~1');
        else git('revert', '--no-edit', feat);
        console.log(`MERGE RED ${ticket}: develop gate failed; develop restored, worktree kept. Treat as a review FAIL.`);
        printSummary(summary);
        return 1;
      }
      const hash = out(git('rev-parse', '--short', feat));
      const tests = testCount(`${out(gate)}\n${gateLog}`);
      git('worktree', 'remove', `.claude/worktrees/${ticket}`);
      git('branch', '-D', `t/${ticket}`);
      setStatus({ status: 'done', commit: hash, tests });
      // EZD-267: the ticket's guard grant goes with the merge; a failure is a note, not a stop.
      try {
        const grantsRel = '.claude/hooks/grants.json';
        const before = existsSync(path.join(root, grantsRel)) ? readFileSync(path.join(root, grantsRel), 'utf8') : null;
        if (dropGrant({ root, id: ticket }).removed) commitOrRestore(root, grantsRel, before, `chore(guard): remove grant ${ticket}`);
      } catch (e) {
        console.log(`MERGE NOTE ${ticket}: guard grant not removed: ${e.message}`);
      }
      console.log(`MERGE OK ${ticket} commit=${hash} tests=${tests || '?'} (STATUS → done; add Notes, DONE.md line and lessons)`);
      return 0;
    });
  });
}

function finish() {
  if (!['done', 'blocked'].includes(outcome) || extraPaths.some((p) => !p.startsWith('vault/'))) {
    console.log('usage: finish <T> done|blocked [<vault path>...]');
    return 2;
  }
  withLedgerLock(root, { owner: owner() }, () => {
    const check = sh(process.execPath, ['vault/tools/next_ticket.mjs', '--check']);
    if (check.status !== 0) stop(`FINISH STOP: next_ticket.mjs --check failed\n${out(check).split('\n').slice(0, 3).join('\n')}`);
    sh(process.execPath, ['vault/tools/next_ticket.mjs', '--report']);
    const ownPaths = ['vault/PROGRESS.md', 'vault/tickets/TRACE.md', `vault/plans/${ticket}.md`, `vault/plans/shots/${ticket}`, `vault/spikes/${ticket}.md`, ...extraPaths];
    try {
      closeUnit(root, { dir: inflightDir({ root }), ownId: process.env.EZD_UNIT_ID, ownPaths, msg: `docs(vault): ${ticket} ${outcome}` });
    } catch (e) {
      if (e instanceof LockError) throw e;
      stop(`FINISH STOP: ${e.message}`);
    }
  });
  let deferred = '';
  if (!process.env.EZD_NO_PUSH) {
    // A merge in progress has an ungated feat commit on develop; its own finish pushes later.
    const pushLock = tryLock(root, 'merge', { owner: owner() });
    if (!pushLock) deferred = ' push deferred: merge in progress';
    else {
      try {
        const p = git('push', '-q', 'origin', 'develop');
        if (p.status) stop(`FINISH STOP: push failed: ${out(p).split('\n')[0]}`);
      } finally { pushLock.release(); }
    }
  }
  console.log(`FINISH OK ${ticket} ${outcome} (${out(git('rev-parse', '--short', 'HEAD'))})${deferred}`);
  return 0;
}

// The launcher tables a build that ends twice without progress (Josh 2026-10-27: "override so it keeps moving
// forward"): the ticket becomes blocked with a note, so --next-unit moves on to the next ready ticket. Its worktree
// and branch stay; the orchestrator sets it back to ready when Josh answers.
function table() {
  // The row is read, changed and committed in one ledger hold (EZD-173), committing only STATUS.md.
  withLedgerLock(root, { owner: owner() }, () => {
    const r = rowOf(ticket);
    if (!['in-progress', 'review'].includes(r.status)) stop(`TABLE STOP: ${ticket} is ${r.status}, not in-progress or review`);
    const note = `${new Date().toISOString().slice(0, 10)}: tabled by the launcher (build ended twice without progress, most likely waiting on Josh; see vault/handoff/CURRENT.md). Worktree kept; back to ready when Josh answers.`;
    const { paths } = updateStatusRow(root, ticket, { status: 'blocked', notes: r.notes ? `${r.notes} · ${note}` : note });
    try {
      commitPaths(root, paths, `docs(vault): ${ticket} tabled by the launcher`);
    } catch (e) {
      if (e instanceof LockError) throw e;
      stop(`TABLE STOP: ${e.message}`);
    }
  });
  console.log(`TABLE OK ${ticket} (STATUS → blocked)`);
}

const steps = { preflight, worktree, merge, finish, table };
if (!steps[step] || !/^EZD-[0-9A-Za-z]+$/.test(ticket || '')) {
  console.log('usage: node scripts/unit-steps.mjs preflight|worktree|merge|finish|table <EZD-xxx> [done|blocked [<vault path>...]]');
  process.exit(2);
}
try {
  process.exitCode = steps[step]() ?? 0;
} catch (e) {
  if (e instanceof Stop) console.log(e.message);
  else console.log(`${step.toUpperCase()} STOP: ${e.message}`);
  process.exitCode = 3;
}
