#!/usr/bin/env node
// The build unit's mechanical steps (optimize plan C5; token diet, Josh 2026-10-22). The build-ticket orchestrator calls
// these instead of running git and ledger edits turn by turn, so its session stays a thin dispatcher. Each step prints
// 5 lines or fewer. Exit 0 = go on, 1 = failed (red gate), 3 = stop the unit (reason printed), 4 = merge clash left open for the builder (EZD-175), 2 = usage.
//
//   node scripts/unit-steps.mjs preflight <T>          step 0: develop clean outside vault/, ledger valid, ticket startable, no hold
//   node scripts/unit-steps.mjs worktree <T>           step 2: create or resume .claude/worktrees/<T> on t/<T>; STATUS → in-progress;
//                                                     `RESUME merged=yes` when an interrupted unit already squashed it (go to step 10)
//   node scripts/unit-steps.mjs merge <T>              step 10: squash, commit, clean up; STATUS → done (hash, tests); runs no gate:
//                                                     first merges develop into t/<T> (exit 5 MERGE GATE when that changed anything)
//                                                     and needs the worktree's passing gate.log on its last commit (exit 5 otherwise);
//                                                     resumes after an interrupted unit (feat commit already on develop)
//   node scripts/unit-steps.mjs finish <T> <outcome> [<vault path>...]
//                                                     step 11: ledger check, report, push develop
//
// Records (REMEDIATION-PLAN 2.12; D1 (a), D2 (a)): rows are read from the records database and every STATUS change goes
// through records.mjs record(), which queues it in the unit's results file for the launcher. No step commits records;
// the only develop commit of a ticket is its feat commit, which also carries the ticket's plan.
//
// Merges queue behind the merge lock (scripts/ledger.mjs). Env (tests only): EZD_ROOT (checkout), EZD_NO_PUSH=1,
// EZD_INFLIGHT_DIR (in-flight records). EZD_UNIT_ID is set by scripts/run.mjs for the unit's session.
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withLedgerLock, withMergeLock, tryLock, readLock } from './ledger.mjs';
import { openRecords, dbPath, record, planRecord } from './records.mjs';

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

// Ticket rows from the records database (tickets table).
function readRows() {
  const db = openRecords(dbPath());
  try {
    const rows = new Map();
    for (const t of db.prepare('select * from tickets').all()) {
      rows.set(t.id, { phase: t.phase, title: t.title, status: t.status, complexity: t.complexity, commit: t.commit_hash, tests: t.tests, notes: t.notes });
    }
    return { rows };
  } finally { db.close(); }
}
function rowOf(id) {
  const r = readRows().rows.get(id);
  if (!r) stop(`STOP: ${id} has no row in the records database`);
  return r;
}
const setStatus = (changes) => record({ op: 'status', ticket, changes }, { root });

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
  const open = deps.filter((d) => rows.get(d)?.status !== 'done');
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

// A planned ticket's tickets.json entry goes on develop before its worktree gate reads it (Q-0544): the commit holds this entry alone; other tickets still uncommitted in the checkout's file stay so.
const TICKETS_REL = 'vault/tickets/tickets.json';
const withEntry = (text, entry) => {
  const d = JSON.parse(text);
  d.tickets = d.tickets.map((x) => (x.id === ticket ? entry : x));
  return JSON.stringify(d, null, 1) + '\n';
};
function stageEntry(text, entry) {
  const blob = sh('git', ['hash-object', '-w', '--stdin'], { input: withEntry(text, entry) });
  if (blob.status) stop(`STOP: tickets.json entry failed: ${firstLine(blob)}`);
  const staged = git('update-index', '--cacheinfo', `100644,${blob.stdout.trim()},${TICKETS_REL}`);
  if (staged.status) stop(`STOP: tickets.json entry failed: ${firstLine(staged)}`);
  writeFileSync(path.join(root, TICKETS_REL), withEntry(readFileSync(path.join(root, TICKETS_REL), 'utf8'), entry));
}
function commitHeldEntry() {
  const db = openRecords(dbPath());
  let held;
  try { held = planRecord(db, ticket); } finally { db.close(); }
  if (!held?.entry) return false;
  const text = git('show', `HEAD:${TICKETS_REL}`).stdout;
  const now = JSON.parse(text).tickets.find((x) => x.id === ticket);
  if (!now || JSON.stringify(now) === JSON.stringify(held.entry)) return false;
  stageEntry(text, held.entry);
  // A plan already on develop goes with its entry, or develop's ledger check sees the two differ.
  if (git('ls-files', '--error-unmatch', '--', planRel()).status === 0) git('add', '--', planRel());
  const c = git('commit', '-q', '-m', `docs(vault): ${ticket} tickets.json entry from its plan`);
  if (c.status) stop(`WORKTREE STOP: entry commit failed: ${firstLine(c)}`);
  console.log(`ENTRY ${ticket} committed on develop`);
  return true;
}

function worktree() {
  withLedgerLock(root, { owner: owner() }, () => {
    const rel = `.claude/worktrees/${ticket}`;
    const wt = path.join(root, rel);
    const branchExists = out(git('branch', '--list', `t/${ticket}`)) !== '';
    const merged = mergedCommit();
    if (merged) {
      console.log(`WORKTREE RESUME merged=yes commit=${merged.slice(0, 7)}: go to step 10 (merge resumes: clean up, done)`);
      return;
    }
    const entryCommitted = commitHeldEntry();
    if (existsSync(wt) || branchExists) {
      if (!existsSync(wt)) { const r = git('worktree', 'add', rel, `t/${ticket}`); if (r.status) stop(`WORKTREE STOP: ${out(r)}`); }
      const log = out(sh('git', ['-C', wt, 'log', '--format=%s', `develop..HEAD`]));
      const subjects = log ? log.split('\n') : [];
      const tests = subjects.some((s) => s.startsWith(`test(${ticket})`)) ? 'yes' : 'no';
      const wip = subjects.filter((s) => s.startsWith(`wip(${ticket})`)).length;
      if (entryCommitted) {
        sh('git', ['-C', wt, 'checkout', '--', planRel()]); // the plan copy comes back below (copyPlan)
        const up = sh('git', ['-C', wt, 'merge', '-q', '--no-edit', 'develop']);
        if (up.status) { sh('git', ['-C', wt, 'merge', '--abort']); console.log(`WORKTREE NOTE: merge develop into ${rel} before the gate (${firstLine(up)})`); }
      }
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
    copyPlan(wt);
    if (rowOf(ticket).status === 'ready') { setStatus({ status: 'in-progress' }); console.log(`STATUS ${ticket} → in-progress`); }
    else console.log(`STATUS ${ticket} → ${rowOf(ticket).status}`);
  });
  return 0;
}

// The plan travels with its ticket (AUDIT-REPORT 3.2): agents in the worktree read develop's copy of vault/plans/<T>.md.
const planRel = () => `vault/plans/${ticket}.md`;
function copyPlan(wt) {
  const src = path.join(root, planRel());
  if (!existsSync(src) || !existsSync(wt)) return;
  mkdirSync(path.join(wt, 'vault/plans'), { recursive: true });
  writeFileSync(path.join(wt, planRel()), readFileSync(src));
}

const listPaths = (paths) => paths.slice(0, 3).join(', ') + (paths.length > 3 ? ` and ${paths.length - 3} more` : '');
const firstLine = (r) => out(r).split('\n')[0];

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

// The merge never runs a gate (Josh 2026-11-02, sandbox option 3): the gate runs only as the unit's own
// `node scripts/gate.mjs .claude/worktrees/<T>`, the one command outside the unit sandbox. The merge takes that run's
// gate.log as proof: it is the worktree's, it ends in GATE PASS, the worktree has no uncommitted change, and no commit
// is newer than the gate's start, so the squash commits exactly the tree that was gated.
function worktreeGate(t) {
  const wt = path.join(root, '.claude/worktrees', t);
  const logFile = path.join(wt, 'gate.log');
  if (!existsSync(logFile)) return { ok: false, why: 'no gate.log in the worktree' };
  const log = readFileSync(logFile, 'utf8');
  const head = /^GATE (\S+) (.+)$/.exec(log.split('\n')[0] || '');
  if (!head || (existsSync(head[2]) ? realpathSync(head[2]) : head[2]) !== realpathSync(wt)) return { ok: false, why: 'gate.log is not from this worktree' };
  const lines = log.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines[lines.length - 1] !== 'GATE PASS') return { ok: false, why: 'the last gate did not pass' };
  if (out(sh('git', ['-C', wt, 'status', '--porcelain', '--untracked-files=no']))) return { ok: false, why: 'uncommitted changes after the gate' };
  // Commit times have one-second resolution: a commit in the gate's own start second fails closed (one more gate run).
  const started = Math.floor(Date.parse(head[1]) / 1000);
  const committed = Number(out(sh('git', ['-C', wt, 'log', '-1', '--format=%ct'])));
  if (!(committed < started)) return { ok: false, why: 'a commit is newer than the last gate' };
  return { ok: true, log };
}

// EZD-175: bring t/<T> up to date with develop before the squash. Returns 0 go on, 3 stop, 4 clash left open, 5 develop merged in (gate again).
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
  {
    const dev = out(git('rev-parse', 'develop'));
    const short = out(git('rev-parse', '--short', dev));
    if (git('merge-base', '--is-ancestor', dev, br).status === 0) {
      console.log(`MERGE UPDATE ${t}: ${br} already contains develop ${short}`);
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
    console.log(`MERGE GATE ${t}: merged develop ${short} into ${br}; run node scripts/gate.mjs .claude/worktrees/${t}, then merge again; develop untouched.`);
    return 5;
  }
}

function merge() {
  return withMergeLock(root, {
    owner: owner(),
    onWait: (rec) => { console.log(`MERGE WAIT ${ticket}: merge lock held by pid ${rec.pid} (${rec.owner})`); },
  }, (mergeLock) => {
    let gateLog = '';
    if (!mergedCommit()) {
      const code = updateBranch(ticket);
      if (code !== 0) return code;
      const g = worktreeGate(ticket);
      if (!g.ok) { console.log(`MERGE GATE ${ticket}: ${g.why}; run node scripts/gate.mjs .claude/worktrees/${ticket}, then merge again; develop untouched.`); return 5; }
      gateLog = g.log;
    }
    // Ledger hold 1: record the base, squash and commit.
    const { feat } = withLedgerLock(root, { owner: owner() }, () => {
      const row = rowOf(ticket);
      const resumed = mergedCommit();
      mergeLock.update({ base: out(git('rev-parse', resumed ? `${resumed}^` : 'HEAD')) });
      if (resumed) { console.log(`MERGE RESUME ${ticket}: feat commit ${resumed.slice(0, 7)} already on develop; closing the ticket`); }
      else {
        // develop's plan (untracked until now) goes into the feat commit; set aside so the squash cannot clash with it.
        const planFile = path.join(root, planRel());
        const tracked = git('ls-files', '--error-unmatch', '--', planRel()).status === 0;
        const plan = existsSync(planFile) ? readFileSync(planFile) : null;
        if (plan !== null && !tracked) unlinkSync(planFile);
        const sq = git('merge', '--squash', `t/${ticket}`);
        if (plan !== null) { mkdirSync(path.dirname(planFile), { recursive: true }); writeFileSync(planFile, plan); }
        if (sq.status) { git('merge', '--abort'); git('reset', '--merge'); stop(`MERGE STOP: squash failed: ${out(sq).split('\n')[0]}`); }
        if (plan !== null) git('add', '--', planRel());
        // Research reports adopted during the build (ledger.mjs research) travel with the ticket too.
        git('add', '--', 'vault/research', ':(exclude)vault/research/pending');
        // The ticket's tickets.json entry (its Architecture line) waits in the records database until now (D9 (a)).
        const db = openRecords(dbPath());
        let held;
        try { held = planRecord(db, ticket); } finally { db.close(); }
        if (held?.entry) {
          // Commit this ticket's entry on the squash's own copy: another ticket still uncommitted in the checkout's file has no phase row yet on develop (Q-0544).
          stageEntry(git('show', `:${TICKETS_REL}`).stdout, held.entry);
        }
        const c = git('commit', '-q', '-m', `feat(${ticket}): ${row.title}`);
        if (c.status) stop(`MERGE STOP: commit failed: ${out(c).split('\n')[0]}`);
      }
      return { row, resumed, feat: resumed || out(git('rev-parse', 'HEAD')) };
    });
    // Ledger hold 2: close the ticket.
    return withLedgerLock(root, { owner: owner() }, () => {
      const hash = out(git('rev-parse', '--short', feat));
      // A resumed merge reads the worktree's last gate.log for the test count.
      const wtLog = path.join(root, '.claude/worktrees', ticket, 'gate.log');
      const tests = testCount(gateLog || (existsSync(wtLog) ? readFileSync(wtLog, 'utf8') : ''));
      // The plan copy (copyPlan) is untracked in the worktree and its text is in the feat commit; left there, it stops the removal.
      const wtDir = path.join(root, '.claude/worktrees', ticket);
      const wtPlan = path.join(wtDir, planRel());
      if (existsSync(wtPlan) && sh('git', ['-C', wtDir, 'ls-files', '--error-unmatch', '--', planRel()]).status !== 0) unlinkSync(wtPlan);
      const removed = git('worktree', 'remove', `.claude/worktrees/${ticket}`);
      if (removed.status === 0) git('branch', '-D', `t/${ticket}`);
      setStatus({ status: 'done', commit: hash, tests });
      console.log(`MERGE OK ${ticket} commit=${hash} tests=${tests || '?'} (STATUS → done; add Notes, DONE.md line and lessons)`);
      if (removed.status) console.log(`MERGE NOTE ${ticket}: worktree and branch kept: ${firstLine(removed)}`);
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
// and branch stay; the orchestrator sets it back to ready when Josh answers. A ready ticket is tabled too (Josh
// 2026-11-02: three launcher stops were ready tickets that never started); one with no plan goes back to todo, so
// --next-unit plans it.
function table() {
  let status;
  withLedgerLock(root, { owner: owner() }, () => {
    const r = rowOf(ticket);
    if (!['ready', 'in-progress', 'review'].includes(r.status)) stop(`TABLE STOP: ${ticket} is ${r.status}, not ready, in-progress or review`);
    const date = new Date().toISOString().slice(0, 10);
    const unplanned = r.status === 'ready' && !existsSync(path.join(root, 'vault/plans', `${ticket}.md`));
    status = unplanned ? 'todo' : 'blocked';
    const note = unplanned
      ? `${date}: set back to todo by the launcher (ready with no plan; build ended twice without progress).`
      : `${date}: tabled by the launcher (build ended twice without progress, most likely waiting on Josh; see vault/handoff/CURRENT.md). Worktree, if any, kept; back to ready when Josh answers.`;
    setStatus({ status, notes: r.notes ? `${r.notes} · ${note}` : note });
  });
  console.log(`TABLE OK ${ticket} (STATUS → ${status})`);
}

const steps = { preflight, worktree, merge, finish, table };
if (!steps[step] || !/^EZD-[0-9A-Za-z]+$/.test(ticket || '')) {
  console.log('usage: node scripts/unit-steps.mjs preflight|worktree|merge|finish|table <EZD-xxx> [done|blocked [<vault path>...]]');
  process.exit(2);
}
// The worktree and merge steps write a worktree's .claude/ files, which the unit sandbox always protects; they run outside it
// only as a Bash call of their own (scripts/unit-sandbox.json excludedCommands). Fail before git touches anything (D-008).
function sandboxCheck() {
  const probe = path.join(root, '.claude/agents', `.unit-steps-probe-${process.pid}`);
  try {
    mkdirSync(path.dirname(probe), { recursive: true });
    writeFileSync(probe, '');
    unlinkSync(probe);
  } catch (e) {
    if (e.code !== 'EPERM' && e.code !== 'EACCES') throw e;
    stop(`SANDBOX STOP: ${step} cannot write .claude/ here (the unit sandbox protects it); nothing changed. Run \`node scripts/unit-steps.mjs ${step} ${ticket}\` again as its own Bash call, exactly so written: no cd, no &&, no ;, no pipe, no redirect.`);
  }
}
try {
  if (step === 'worktree' || step === 'merge') sandboxCheck();
  process.exitCode = steps[step]() ?? 0;
} catch (e) {
  if (e instanceof Stop) console.log(e.message);
  else console.log(`${step.toUpperCase()} STOP: ${e.message}`);
  process.exitCode = 3;
}
