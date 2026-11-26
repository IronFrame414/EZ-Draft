#!/usr/bin/env node
// Build v3 loop (2026-11-13, Josh): one Opus builder per ticket, one fresh reviewer (Fable), scripts/check.mjs as the
// gate, squash merge to develop, push. Runs unattended as the launchd agent com.ezdraft.build (scripts/launchd/build.mjs).
// A ticket that does not finish for any reason is set aside (vault/build/set-aside.md) and the loop moves on.
// Pause: touch vault/build/STOP (running tickets finish first). State: vault/build/state.json.
// Self-restart (EZD-1967): a merge that changes the loop's own code drains like STOP, dry-runs the new code and exits 75
// so launchd relaunches it (scripts/loop/self-restart.mjs).
// Build order (EZD-1940): security fixes, the config.json `priority` list, retried tickets, then phase, build position
// and id (scripts/loop/order.mjs). A ticket that failed once is requeued at the front, so the priority list is no longer
// needed to bring a retry forward.
// Lanes (Josh 2026-11-16): up to config `lanes` tickets build at once, each with its own database lane. No two running
// tickets may edit the same file: each ticket first predicts the files it will change (its footprint, cached in
// vault/build/footprints.json), starts only when no running ticket holds any of them, claims files it finds it needs
// later with scripts/loop/claim.mjs, and is checked for unclaimed changes before it merges (scripts/loop/lanes.mjs).
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize, reportMarkdown } from './usage-report.mjs';
import { BUILDER_TEST_STEP, FIX_TEST_RULE, fixPromptBody as fixBody } from './loop/test-scope.mjs';
import { RESUME_PROMPT, describeExit, died, readLastEntry, signalOfCode, startClaude } from './loop/claude-exit.mjs';
import { noteSignal, pgidOf, senderOf } from './loop/signal-log.mjs';
import { randomUUID } from 'node:crypto';
import { lastBeat, resetReason, sample, startNote, writeBeat } from './loop/heartbeat.mjs';
import { TRACK as SECURITY_TRACK, readSeen, recordFixTicket, runAudit, unseen } from './loop/advisories.mjs';
import { effectiveStatuses } from './loop/holds.mjs';
import { BUILD_FILES } from './loop/build-files.mjs';
import { runCheck } from './loop/check-run.mjs';
import { createEvents, failureSummary, msToSecondEnd, oneLine, sameSecondEvents, secondOf } from './loop/failure-lines.mjs';
import { withImportingTests } from './loop/import-graph.mjs';
import { changedFiles, createSelfRestart, runDryRun } from './loop/self-restart.mjs';
import { buildOrder, phaseRank } from './loop/order.mjs';
import { rebuild as rebuildAssumptions } from '../vault/tools/assumptions-index.mjs';
import { drift, impliedFiles, overlaps, ownAssumptions, parseFootprint, readClaims, schedule, sharedSet, withClaims } from './loop/lanes.mjs';
import { TYPES_FILE, orderMigrations, regenerateTypes, settleGeneratedConflicts, touchesSchema } from './loop/merge-files.mjs';
import { PERF_TREND_ID, perfDue, runPerfTrend } from './loop/perf-trend.mjs';
import { retryCli, setAsideMarkdown, takeInRetries } from './loop/retry.mjs';
import { createWorktreeGuard } from './loop/worktree-config.mjs';
import { acReviewLines, traceTicket } from './loop/ac-review.mjs';
import { checkBackups } from './loop/backup-status.mjs';
import { traceDone } from './conventions/ac-trace.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = path.join(ROOT, 'vault/build');
const P = {
  config: path.join(B, 'config.json'),
  state: path.join(B, 'state.json'),
  usage: path.join(B, 'usage.jsonl'),
  log: path.join(B, 'loop.log'),
  setAside: path.join(B, 'set-aside.md'),
  stop: path.join(B, 'STOP'),
  attention: path.join(B, 'ATTENTION.md'),
  report: path.join(B, 'trial-report.md'),
  footprints: path.join(B, 'footprints.json'),
  heartbeat: path.join(B, 'heartbeat.jsonl'),
};
const DEFAULTS = {
  builder_model: 'claude-opus-5-5', builder_effort: 'medium',
  reviewer_model: 'claude-fable-5-2', reviewer_fallback: 'claude-opus-5-5', reviewer_effort: 'medium',
  builder_timeout_min: 90, reviewer_timeout_min: 30, fix_rounds: 2, review_rounds: 2,
  trial_size: 20, lanes: [0, 1, 2], footprint_effort: 'low', footprint_timeout_min: 15, footprint_lookahead: 6,
  merge_rounds: 3, holder_wait_min: 240, idle_minutes: 30, limit_sleep_minutes: 30, limit_probe_minutes: 5, red_streak_guard: 3,
  skip_tracks: ['tooling'], skip_statuses: ['blocked'],
  // Tickets built first when eligible (after security fixes). Not needed for retries: a retried ticket already goes
  // before every fresh ticket of the same priority rank (EZD-1940, scripts/loop/order.mjs).
  priority: [],
  // Josh 2026-11-14: a ticket in this phase rank or higher starts only when every ticket in every lower phase rank is
  // complete (done, a skipped track or a skipped status). A set-aside ticket is not complete and holds the gate.
  gate_from_phase: 13,
  // Josh 2026-11-16: only phases that are ready build. A ticket in a phase rank above max_phase never starts.
  max_phase: 999,
  // Josh 2026-11-19: security is handled as the app is built. pnpm audit runs this often; a new advisory becomes a fix
  // ticket at the front of the line (scripts/loop/advisories.mjs).
  advisory_check_hours: 6,
  // Josh 2026-11-20: "All fixes should use the next model up." Every fix round (check, review, merge) and every fix
  // ticket (a title starting "Fix:" or the security track) is built with fix_model; a fix_model run that gives no
  // result at all falls back to builder_model once.
  fix_model: 'claude-fable-5-2',
};
const SECURITY_PATHS = /(supabase\/migrations|\/server\/|rls|auth|permission|share|price|money|cost|webhook|invite|role)/i;

mkdirSync(B, { recursive: true });
const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } };
const cfg = () => ({ ...DEFAULTS, ...readJson(P.config, {}) });
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Every logged line (and each check end and claude run end) is kept a while in `events`, so a CLAUDE DIED line can name
// the other lanes' events in the same second (EZD-1939, audit 2026-11-23 W5).
const events = createEvents();
function log(msg) { const at = new Date(); const line = `[${secondOf(at)}] ${msg}`; events.note(msg, at); console.log(line); appendFileSync(P.log, line + '\n'); }
// EZD-1945: while extensions.worktreeConfig is on in the shared .git/config, trusted-git refuses every git call. The
// loop then logs WORKTREE CONFIG ON once, starts no gate and no builder, and waits; it never unsets the setting.
const WTC = createWorktreeGuard({ root: ROOT, log });
// Another process (a claude session's `git status`, a builder) can hold a checkout's index.lock for a moment; a git
// call that fails only on that lock is retried, so a commit never stops halfway with its files staged.
function git(args, cwd = ROOT, opts = {}) {
  for (let i = 0; ; i++) {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', ...opts });
    const res = { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
    if (res.ok || !/index\.lock/.test(res.err) || i >= 20) return res;
    spawnSync('sleep', ['0.25']);
  }
}
// Build files the loop writes and commits itself. A merge in the main checkout needs them unstaged.
// The list is in scripts/loop/build-files.mjs; loop.log is not on it (gitignored, audit 2026-11-23 W8).
// A read-only checkout of develop for the footprint calls, so a claude session's git calls never touch the main
// checkout's index while the loop commits there.
function footprintTree() {
  const dir = path.join(ROOT, '.claude/worktrees/_footprint');
  if (!existsSync(dir)) git(['worktree', 'add', '-q', '--detach', dir, 'develop']);
  else git(['checkout', '-q', '--detach', '--force', 'develop'], dir);
  return existsSync(dir) ? dir : ROOT;
}

// ---------- state ----------
function seedDone() {
  const done = [];
  for (const line of readFileSync(path.join(ROOT, 'vault/tickets/STATUS.md'), 'utf8').split('\n')) {
    const c = line.split('|').map((s) => s.trim());
    if (/^EZD-/.test(c[1] || '') && c[4] === 'done') done.push(c[1]);
  }
  return done;
}
// STATUS.md statuses with every hold in the tracked vault/build/holds.json forced to `blocked` (scripts/loop/holds.mjs), so a
// regenerated STATUS.md can never release a held ticket.
function seedStatuses() { return effectiveStatuses(ROOT); }
// One state object in memory for every lane; saveState writes it. A change made to the file from outside (`--retry <T>`,
// EZD-1944, or a hand edit of set_aside or retries) is taken in at the next scheduling pass (adoptHandEdits).
let STATE = null;
let savedMtime = 0;
function loadState() {
  if (STATE) return STATE;
  const s = readJson(P.state, null);
  if (s) { STATE = s; } else {
    STATE = { started: now(), done: seedDone(), seeded_done: 0, merged: [], set_aside: {}, running: {},
      red_streak: 0, push_pending: false, trial_report_written: false, idle_logged: false };
    STATE.seeded_done = STATE.done.length;
  }
  STATE.running ||= {};
  saveState(STATE);
  return STATE;
}
function saveState(s) {
  // EZD-1944: a `--retry` written since our last save would be lost under this write; take its rows in first.
  try {
    if (statSync(P.state).mtimeMs !== savedMtime) for (const h of takeInRetries(s, readJson(P.state, null))) log(`RETRY ${h.ticket} by ${h.by} (set aside ${h.set_aside_ts}: ${h.reason})`);
  } catch {}
  const tmp = `${P.state}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n');
  renameSync(tmp, P.state);
  try { savedMtime = statSync(P.state).mtimeMs; } catch {}
  writeSetAside(s);
}
function adoptHandEdits(s) {
  let m = 0;
  try { m = statSync(P.state).mtimeMs; } catch { return; }
  if (m === savedMtime) return;
  const disk = readJson(P.state, null);
  if (!disk) return;
  const before = (s.set_aside_history || []).length;
  s.set_aside = disk.set_aside || {};
  s.retries = disk.retries || {};
  // EZD-1944: `--retry <T>` writes the file too; its history rows are taken in and named in the log.
  s.set_aside_history = disk.set_aside_history || s.set_aside_history || [];
  const added = s.set_aside_history.slice(before);
  if (added.length) for (const h of added) log(`RETRY ${h.ticket} by ${h.by} (set aside ${h.set_aside_ts}: ${h.reason})`);
  else log('state.json was edited by hand; took in its set_aside and retries');
  saveState(s);
}
// Footprints: { "<ticket>": { files: [...], notes, ts } }. Kept apart from state so `--plan --footprints` can add to it.
const readFootprints = () => readJson(P.footprints, {});
function saveFootprint(id, fp) {
  const all = readFootprints();
  if (fp) all[id] = fp; else delete all[id];
  const tmp = `${P.footprints}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(all, null, 2) + '\n');
  renameSync(tmp, P.footprints);
}
// EZD-1944: the open set-asides and the last 20 retries (scripts/loop/retry.mjs).
function writeSetAside(s) { writeFileSync(P.setAside, setAsideMarkdown(s)); }

// ---------- tickets ----------
function tickets() { const t = readJson(path.join(ROOT, 'vault/tickets/tickets.json'), {}); return Array.isArray(t) ? t : t.tickets || []; }
// Lower-rank tickets that keep a ticket of rank r from starting under the phase gate (empty when r is below the gate).
function gateBlockers(t, s, c = cfg(), statuses = seedStatuses()) {
  const r = phaseRank(t.phase);
  // A security fix ticket is never held by the phase gate and never holds it (advisories.mjs).
  if (t.track === SECURITY_TRACK || !(r >= c.gate_from_phase)) return [];
  const done = new Set(s.done);
  return tickets().filter((x) => phaseRank(x.phase) < r && !done.has(x.id) && x.track !== SECURITY_TRACK
    && !c.skip_tracks.includes(x.track) && !c.skip_statuses.includes(statuses[x.id]));
}
// candidates(): eligible apart from the phase gate. pickNext: the first candidate the gate lets through.
function candidates(s, c, statuses) {
  const done = new Set(s.done);
  const aside = new Set(Object.keys(s.set_aside));
  const running = s.running || {};
  // A ticket that stopped because a file it needs was held waits until that holder is no longer building.
  const holding = (t) => (s.hold?.[t.id]?.holders || []).some((h) => running[h]);
  const list = tickets().filter((t) => !done.has(t.id) && !aside.has(t.id) && !running[t.id] && !holding(t)
    && !(phaseRank(t.phase) > Number(c.max_phase ?? 999))
    && !c.skip_tracks.includes(t.track) && !c.skip_statuses.includes(statuses[t.id])
    && (t.depends_on || []).every((d) => done.has(d)));
  // Security, priority list, retried first, phase, build position, id (scripts/loop/order.mjs, EZD-1940).
  return buildOrder(list, { retries: s.retries, priority: c.priority });
}
// Every candidate the phase gate lets through, in build order. A running ticket counts as not done for the gate.
function eligible(s) {
  const c = cfg();
  const statuses = seedStatuses();
  return candidates(s, c, statuses).filter((t) => !gateBlockers(t, s, c, statuses).length);
}
function pickNext(s) { return eligible(s)[0] || null; }
// When nothing is eligible only because of the phase gate: one line naming the lower-phase tickets it waits on.
function gateNote(s) {
  const c = cfg();
  const statuses = seedStatuses();
  const held = candidates(s, c, statuses);
  if (!held.length) return '';
  const waits = gateBlockers(held[0], s, c, statuses);
  const aside = new Set(Object.keys(s.set_aside));
  const ids = waits.map((x) => `${x.id}${aside.has(x.id) ? ' (set aside)' : ''}`);
  return `phase gate (gate_from_phase ${c.gate_from_phase}): ${held.length} ticket(s) from phase ${held[0].phase} up wait on ${waits.length} lower-phase ticket(s): ${ids.slice(0, 25).join(', ')}${ids.length > 25 ? `, +${ids.length - 25} more` : ''}`;
}
// Fix tickets (Josh 2026-11-20) are built with fix_model: a title starting "Fix:" or the security track.
function isFixTicket(t) { return t?.track === SECURITY_TRACK || /^Fix:/i.test(String(t?.title || '')); }
function readingList(id) {
  const r = spawnSync('node', ['vault/tools/next_ticket.mjs', '--reads', id, 'builder'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

// ---------- claude ----------
// The environment of a lane: its database lane and, for claim.mjs, the ticket and the main checkout.
function laneEnv(lane, cwd, ticket) {
  const env = { ...process.env, EZD_LANE: String(lane ?? 0), EZD_BUILD_ROOT: ROOT };
  if (ticket) env.EZD_TICKET = ticket; else delete env.EZD_TICKET;
  if (String(lane ?? 0) !== '0') env.SUPABASE_WORKDIR = path.join(cwd, '.lanes', `lane${lane}`); else delete env.SUPABASE_WORKDIR;
  return env;
}
// A run that dies (no result, no timeout, no limit) is logged with its exit code, signal and last transcript entry,
// and a writing run is resumed once in the same session, so its work goes on (2026-11-18).
async function runClaude(opts) {
  const sessionId = opts.resume ? null : randomUUID();
  const r = await runClaudeOnce({ ...opts, sessionId });
  if (!died(r)) return r;
  const sid = opts.resume || sessionId;
  const last = readLastEntry(opts.cwd, sid);
  const near = await sameSecond(r, opts.ticket);
  log(`CLAUDE DIED ${opts.name}: ${describeExit(r)}; session ${sid}; ${near}${sender(r)}; last entry: ${last || 'no transcript'}${r.text.trim() ? `; output: ${r.text.trim().slice(-300).replace(/\s+/g, ' ')}` : ''}`);
  const left = opts.timeoutMin - r.secs / 60;
  if (opts.readOnly || !last || left < 10) return { ...r, died: [describeExit(r)] };
  log(`${opts.name}: resuming session ${sid} once (${Math.round(left)} min left)`);
  const again = await runClaudeOnce({ ...opts, prompt: RESUME_PROMPT, resume: sid, sessionId: null, timeoutMin: left });
  if (died(again)) log(`CLAUDE DIED again ${opts.name}: ${describeExit(again)}; ${await sameSecond(again, opts.ticket)}${sender(again)}; last entry: ${readLastEntry(opts.cwd, sid) || 'no transcript'}`);
  return { ...again, secs: r.secs + again.secs, died: [describeExit(r), ...(died(again) ? [describeExit(again)] : [])], recovered: !died(again) };
}
// The other tickets' events in the second the run ended. Waits for that second to be over first, so an event that lands
// just after the exit (another lane's check ending, a REQUEUED) is counted too.
async function sameSecond(r, ticket) {
  const at = r.endedAt || new Date();
  const wait = msToSecondEnd(at) - (Date.now() - at.getTime());
  if (wait > 0) await sleep(wait);
  return sameSecondEvents(events.list(), secondOf(at), ticket);
}
// EZD-1988: which loop code path, if any, signalled a run that died of a signal (scripts/loop/signal-log.mjs). claude
// is spawned in the loop's own process group, so a signal to that group counts as reaching it.
const LOOP_PGID = pgidOf(process.pid);
function sender(r) {
  if (!r.signal && !signalOfCode(r.code)) return '';
  return `; ${senderOf({ pid: r.pid, pgid: LOOP_PGID, endedAt: r.endedAt || new Date() })}`;
}
// The claude timer's signal, recorded first; a run that has already ended is not signalled.
function timerKill(p, signal) {
  if (p.exitCode !== null || p.signalCode !== null) return;
  noteSignal({ by: 'loop claude timer (scripts/loop.mjs runClaudeOnce)', target: p.pid, signal });
  p.kill(signal);
}
function runClaudeOnce({ cwd, prompt, model, effort, name, resume, sessionId, timeoutMin, readOnly, lane = 0, ticket }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = startClaude({ prompt, cwd, env: laneEnv(lane, cwd, ticket), model, effort, name, resume, sessionId, readOnly });
    let out = ''; let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    // SIGTERM at the limit, SIGKILL 10 s later if it is still running.
    const timer = setTimeout(() => { timerKill(p, 'SIGTERM'); setTimeout(() => timerKill(p, 'SIGKILL'), 10000); }, timeoutMin * 60000);
    p.on('close', (code, signal) => {
      clearTimeout(timer);
      const endedAt = new Date();
      events.note(`claude ${name} ended (exit code ${code ?? 'none'}${signal ? `, signal ${signal}` : ''})`, endedAt, ticket);
      const res = parseResult(out);
      const text = String(res?.result ?? '') + '\n' + err.slice(-2000) + (res ? '' : out.slice(-1000));
      resolve({ code, signal, pid: p.pid, res, text, endedAt, secs: Math.round((Date.now() - started) / 1000),
        timedOut: Date.now() - started >= timeoutMin * 60000 - 1000,
        limited: /(hit your|usage limit|weekly limit|rate limit|limit reached|resets \d)/i.test(text) && (res?.is_error || code !== 0) });
    });
    p.on('error', (e) => { clearTimeout(timer); resolve({ code: 1, res: null, text: String(e), secs: 0, limited: false }); });
  });
}
function parseResult(stdout) {
  const i = stdout.indexOf('{');
  if (i < 0) return null;
  try { return JSON.parse(stdout.slice(i)); } catch {}
  for (const l of stdout.trim().split('\n').reverse()) { try { const o = JSON.parse(l); if (o && typeof o === 'object') return o; } catch {} }
  return null;
}
function recordUsage(ticket, role, requested, r) {
  const mu = r.res?.modelUsage || {};
  const row = { ts: now(), ticket, role, requested_model: requested, models: Object.keys(mu),
    cost_usd: Number(r.res?.total_cost_usd ?? 0) || 0, fable_usd: 0, opus_usd: 0, sonnet_usd: 0, haiku_usd: 0,
    input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, fable_tokens: 0,
    turns: r.res?.num_turns ?? null, duration_s: r.secs, session_id: r.res?.session_id ?? null,
    exit_code: r.code ?? null, signal: r.signal ?? null, died: r.died ?? undefined, recovered: r.recovered ?? undefined,
    outcome: r.limited ? 'limit' : r.timedOut ? 'timeout' : (r.res?.is_error || r.code !== 0) ? 'error' : 'ok' };
  for (const [m, v] of Object.entries(mu)) {
    const usd = Number(v?.costUSD ?? 0) || 0;
    const tok = (v?.inputTokens || 0) + (v?.outputTokens || 0) + (v?.cacheReadInputTokens || 0) + (v?.cacheCreationInputTokens || 0);
    row.input_tokens += v?.inputTokens || 0; row.output_tokens += v?.outputTokens || 0;
    row.cache_read_tokens += v?.cacheReadInputTokens || 0; row.cache_write_tokens += v?.cacheCreationInputTokens || 0;
    for (const fam of ['fable', 'opus', 'sonnet', 'haiku']) if (m.includes(fam)) row[`${fam}_usd`] += usd;
    if (m.includes('fable')) row.fable_tokens += tok;
  }
  appendFileSync(P.usage, JSON.stringify(row) + '\n');
  return row;
}
// The full gate on the ticket's lane. Asynchronous, so the other lanes keep going while it runs.
// A red check also gets `summary`: one whole line naming the failed stage and up to 5 failing tests, read in full from
// this check's check-failures.log (EZD-1939). A check-failures.log older than this check is an earlier run's, not read.
// The files a branch changes against develop, and an async runner on the lane's database (EZD-1941).
const branchChanges = (wt) => git(['diff', '--name-only', 'develop...HEAD'], wt).out.split('\n').filter(Boolean);
const laneRun = (wt, lane) => (cmd, args) => runCheck({ cmd, args, cwd: wt, env: laneEnv(lane, wt), timeoutMs: 25 * 60000 });

// EZD-1945: every gate waits while worktree config is on, and a red check caused by a TrustedGitError is run again
// after the wait instead of reaching the caller, so it never costs a fix round, a requeue or a set-aside.
function check(cwd, lane = 0) {
  return WTC.guardedCheck(() => checkOnce(cwd, lane), { label: `lane ${lane} check (${path.basename(cwd)})` });
}
function checkOnce(cwd, lane = 0) {
  const started = Date.now();
  // Past 90 min: SIGTERM, then SIGKILL 10 s later if the check is still running (audit 2026-11-23 W6).
  return runCheck({ cmd: 'node', args: [path.join(ROOT, 'scripts/check.mjs'), cwd], cwd, env: laneEnv(lane, cwd), timeoutMs: 90 * 60000 })
    .then(({ code, out, timedOut }) => {
      const pass = code === 0 && /CHECK PASS/.test(out);
      events.note(`lane ${lane} check ended (${path.basename(cwd)}): ${pass ? 'pass' : 'red'}`, new Date(), path.basename(cwd));
      let detail = out.trim();
      let summary = '';
      if (!pass) {
        const fp = path.join(cwd, 'check-failures.log');
        let failures = '';
        try { if (statSync(fp).mtimeMs >= started - 1000) failures = readFileSync(fp, 'utf8'); } catch {}
        if (failures) detail += '\n' + failures.slice(0, 9000);
        summary = failureSummary({ failures, out, timedOut, root: cwd });
      }
      return { pass, detail, summary, timedOut };
    });
}

// ---------- prompts ----------
// EZD-1988: a builder's `pkill -f "scripts/check.mjs"` stopped other lanes' builders and checks three times.
const NO_PATTERN_KILL = 'Other lanes run their own checks, servers and claude sessions on this Mac. Never stop processes by name or pattern (no pkill, killall, or pgrep/ps piped to kill): `pkill -f "scripts/check.mjs"` stops every other lane\'s check and builder. Stop only what you started: a background task through its own controls, or a process by the pid it gave you.';
// The parallel-build rules a builder gets (Josh 2026-11-16: lanes never edit the same file).
function lanesNote(t) {
  const claims = readClaims(ROOT);
  const mine = claims[t.id]?.files || [];
  const others = Object.entries(claims).filter(([id]) => id !== t.id);
  return [
    '', 'Parallel builds: other tickets are being built at the same time in other folders, each on its own database lane (EZD_LANE is set for you; the scripts pick it up).',
    `Files reserved for you: ${mine.length ? mine.join(', ') : '(none predicted)'}, and your assumptions file ${ownAssumptions(t.id)} (no claim needed).`,
    others.length ? `Files other tickets hold now (never edit these): ${others.map(([id, c]) => `${id}: ${(c.files || []).join(', ') || '(none)'}`).join('; ')}.` : 'No other ticket holds files right now, but one may start while you work.',
    NO_PATTERN_KILL,
    'Before you edit or create ANY file that is not in your reserved list, run `node scripts/loop/claim.mjs <file> [<file> ...]` (paths from the repo root). Exit 0 means it is yours. If it prints NOT CLAIMED, do not edit that file: find a way that stays inside your files, or commit what works and end with the BLOCKED line it prints.',
    // EZD-1953: assumptions.md stays in the shared set for old branches' merges, but builders no longer write it.
    `Shared files (${[...sharedSet(ROOT)].filter((f) => f !== 'vault/build/assumptions.md').join(', ')}): any lane may edit these. Keep your change to them small and additive (add your own lines; never reorder, reformat or rewrite what is there), so a parallel change merges cleanly.`,
  ].join('\n');
}
function footprintPrompt(t, plan, reads) {
  return [
    `Predict the files ticket ${t.id} (${t.title}) will create or change. You are planning only: read, do not edit.`,
    'Other tickets will be built at the same time, and no two may edit the same file, so the list must be complete: every source file, test file, migration, generated file (database types), registry, inventory or count test, message file, fixture and doc it will touch. Leaving a file out stalls the build later; a file listed but not changed only costs a little parallelism.',
    'Read CLAUDE.md, the ticket record below, the spec files and decisions it names' + (plan ? `, and vault/plans/${t.id}.md` : '') + ', then look in the code (grep, read) to find the real paths. Look especially for the shared files a change like this must update: route and event registries, RLS and grant harness lists, settings sections, message keys, the e2e inventories.',
    reads ? `Reading list:\n${reads}` : '',
    '', 'Ticket record:', JSON.stringify(t, null, 1),
    '', 'For a new migration write `supabase/migrations/<new>.sql`. For a new file you cannot name yet, give the folder it goes in followed by `/<new>`.',
    'Your last line must be exactly one JSON object and nothing after it:',
    '{"files":["app/src/...","supabase/migrations/<new>.sql"],"notes":"one line"}',
  ].filter(Boolean).join('\n');
}
function builderPrompt(t, plan, reads) {
  return [
    `You are the builder for ticket ${t.id}: ${t.title}`,
    `Work only in the current directory (a git worktree on branch t/${t.id}, cut from develop). Read CLAUDE.md first and follow it.`,
    '', 'Ticket record from vault/tickets/tickets.json:', JSON.stringify(t, null, 1),
    '', `Acceptance criteria: look up each id in "acs" in vault/spec/acceptance-criteria.md (grep the id). They define done.`,
    reads ? `Reading list (spec, decisions, architecture sections):\n${reads}` : 'Read the spec_files and decisions listed in the record.',
    plan ? `An earlier plan exists at vault/plans/${t.id}.md. Use it as input; where it disagrees with the spec or decisions, they win. Ignore its process steps (worktree, gate.mjs, STATUS, reviewers): this process replaces them.` : 'There is no plan; plan the work yourself briefly before coding.',
    '', 'Steps:',
    '1. Read only what you need, then plan.',
    '2. Write tests from the acceptance criteria, then the code. Expected values come from the spec, never from running the code.',
    BUILDER_TEST_STEP,
    `4. Commit everything on this branch: \`feat(${t.id}): ${t.title.replace(/[`"]/g, "'").slice(0, 70)}\`. Give a one-line reason in the body for every existing test you changed.`,
    '5. End with a summary of at most 10 lines: what you built, tests added, assumptions recorded.',
    // EZD-1953 (audit 2026-11-23 B6): one assumptions file per ticket, so lanes never share it. CLAUDE.md rules 1 and 6
    // still name vault/build/assumptions.md until Josh approves their new pointer; that file is now the generated index.
    '', `Unsettled question: follow CLAUDE.md rule 1, and record it (and any wording for Josh, rule 6) in your own ticket file ${ownAssumptions(t.id)}, not in vault/build/assumptions.md, which is now a generated index. Add rows at the end of its "## Open" table (\`| Ticket | Question or text | Choice made | Source |\`); create the file with that heading and table header if it does not exist. Keep going.`,
    'If the existing code already satisfies the ticket, add tests that prove the acceptance criteria and commit them.',
    'If you truly cannot finish, commit what works and make the last line of your answer start with "BLOCKED:" and the reason.',
    lanesNote(t),
  ].join('\n');
}
function fixPrompt(kind, detail) {
  return `${fixPromptBody(kind, detail)}\n\n${NO_PATTERN_KILL}`;
}
// EZD-1948: the text lives in scripts/loop/test-scope.mjs; the types file is the one the merge step regenerates.
function fixPromptBody(kind, detail) {
  return fixBody(kind, detail, TYPES_FILE);
}
// EZD-1955: trace = { missing, error, alreadyDone } from scripts/loop/ac-review.mjs (the ticket's ACs not named in a test).
function reviewerPrompt(t, security, plan, trace = {}) {
  return [
    `You are the independent reviewer for ticket ${t.id}: ${t.title}. You did not write this code.`,
    'Review the change on this branch: run `git diff --stat develop...HEAD` and `git diff develop...HEAD`.',
    `Check it against: the ticket's acceptance criteria (ids ${JSON.stringify(t.acs || [])} in vault/spec/acceptance-criteria.md), the spec files and decisions in the ticket record below${plan ? `, vault/plans/${t.id}.md` : ''}, and CLAUDE.md.`,
    'Report ONLY blocking problems: an acceptance criterion not met; wrong behaviour or a bug; a security or data-isolation hole (missing RLS, a policy that lets one company see or change another company\'s rows, an auth or permission bypass, a secret in code); a test deleted or weakened without a good reason; text that contradicts a mockup.',
    'Do not report style, naming, refactors, extra tests for impossible cases, or nice-to-haves. The automatic checks (typecheck, lint, tests, build, e2e) already passed; do not rerun them.',
    security ? `This change touches security-sensitive paths (${security}). Check RLS, permissions and tenant isolation carefully.` : '',
    ...acReviewLines(t, trace.missing, trace),
    '', 'Ticket record:', JSON.stringify(t, null, 1),
    '', 'Your last line must be exactly one JSON object and nothing after it:',
    '{"verdict":"pass" or "fail","findings":[{"file":"path","line":0,"problem":"what is wrong","fix":"what to do"}],"blocked_by":[],"notes":"one line"}',
    'verdict is "fail" only when findings is non-empty.',
    'blocked_by: when a finding can only be fixed after another ticket is built (it creates a table, function or feature this ticket needs), list that ticket id (e.g. "EZD-109"); otherwise leave it empty.',
  ].filter(Boolean).join('\n');
}
function parseVerdict(text) {
  const m = [...String(text).matchAll(/\{[^{}]*"verdict"[\s\S]*\}\s*$/gm)].pop();
  const cands = m ? [m[0]] : [];
  const idx = String(text).lastIndexOf('{"verdict"');
  if (idx >= 0) cands.push(String(text).slice(idx));
  for (const c of cands) { try { const v = JSON.parse(c.trim()); if (v.verdict) return v; } catch {} }
  return null;
}

// ---------- ticket flow ----------
// On a usage limit the loop waits, but sends a one-line probe every limit_probe_minutes and resumes as soon as one
// gets through (a reset or an account switch, Josh 2026-11-14). limit_sleep_minutes is the fallback wait when a probe
// fails for some other reason. Probes are not written to usage.jsonl: they are tiny and would count as a ticket.
async function handleLimit(r, s) {
  const c = cfg();
  log(`usage limit hit (${r.text.split('\n').find((l) => /limit|reset/i.test(l))?.slice(0, 160) ?? ''}); probing every ${c.limit_probe_minutes} min`);
  s.sleep_until = new Date(Date.now() + c.limit_sleep_minutes * 60000).toISOString();
  s.next_probe = new Date(Date.now() + c.limit_probe_minutes * 60000).toISOString();
  saveState(s);
}
async function limitCleared() {
  const c = cfg();
  const r = await runClaude({ cwd: os.tmpdir(), prompt: 'Reply with the single word OK.', model: c.builder_model, effort: 'low',
    name: 'limit-probe', timeoutMin: 3, readOnly: true });
  return { ok: !r.limited && r.code === 0 && !!r.res && !r.res.is_error, limited: r.limited };
}
// Ticket ids named in text or a list, that exist in tickets.json.
function ticketIds(v) {
  const known = new Set(tickets().map((t) => t.id));
  const ids = Array.isArray(v) ? v.map(String) : String(v || '').match(/EZD-[0-9]+[a-z]?/g) || [];
  return [...new Set(ids)].filter((id) => known.has(id));
}
// Adds ticket ids to a ticket's depends_on in tickets.json and commits it. Returns the ids added.
function addDeps(id, ids) {
  const f = path.join(ROOT, 'vault/tickets/tickets.json');
  const raw = readFileSync(f, 'utf8');
  const j = JSON.parse(raw);
  const list = Array.isArray(j) ? j : j.tickets;
  const t = list.find((x) => x.id === id);
  if (!t) return [];
  const added = ids.filter((d) => d !== id && !(t.depends_on || []).includes(d));
  if (!added.length) return [];
  t.depends_on = [...(t.depends_on || []), ...added];
  const indent = (raw.match(/^[\[{]\n( +)/) || [])[1]?.length || 2;
  writeFileSync(f, JSON.stringify(j, null, indent) + '\n');
  git(['commit', '-q', '-m', `chore(tickets): ${id} depends on ${added.join(', ')} (build loop: named as needed first)`, '--', 'vault/tickets/tickets.json']);
  return added;
}
// First failure: back in line (at the front: retried tickets go first, EZD-1940), with any ticket named as needed first added to depends_on.
// Second failure: set aside for Josh (Josh 2026-11-13).
// line: the one-line detail for loop.log (a red check's summary); without it, the detail's head in whole words.
function setAside(s, t, reason, detail, wt, needs = [], line = '') {
  const shown = line || (detail ? oneLine(detail) : '');
  if (!(s.retries?.[t.id]) && !String(t.id).startsWith('EZD-REPAIR')) {
    s.retries = { ...(s.retries || {}), [t.id]: 1 };
    s.retry_log = { ...(s.retry_log || {}), [t.id]: { ts: now(), reason } };
    const added = addDeps(t.id, needs);
    endRun(s, t.id);
    saveFootprint(t.id, null);
    cleanupWorktree(t.id);
    log(`REQUEUED ${t.id} (first failure: ${reason})${added.length ? `; now waits for ${added.join(', ')}` : ''}${shown ? `\n  detail: ${shown}` : ''}`);
    saveState(s);
    return;
  }
  s.set_aside[t.id] = { title: t.title, ts: now(), reason: s.retry_log?.[t.id] ? `${reason} (first try: ${s.retry_log[t.id].reason})` : reason, detail: detail || '', branch: `t/${t.id}`, worktree: path.relative(ROOT, wt) };
  endRun(s, t.id);
  saveFootprint(t.id, null);
  log(`SET ASIDE ${t.id}: ${reason}${shown ? `\n  detail: ${shown}` : ''}`);
  saveState(s);
}
// A ticket stops building: it leaves `running` and gives up its claim.
function endRun(s, id) {
  delete s.running?.[id];
  try { withClaims(ROOT, (c) => { delete c[id]; }); } catch (e) { log(`could not release the claim of ${id}: ${e.message}`); }
}
// The builder stopped because a file it needs is held by another running ticket. That is a wait, not a failure: the
// ticket goes back in line without spending its retry and starts again once every holder has finished.
function waitForHolders(s, t, holders, why) {
  s.hold = { ...(s.hold || {}), [t.id]: { holders, ts: now(), why } };
  endRun(s, t.id);
  saveFootprint(t.id, null);
  cleanupWorktree(t.id);
  log(`WAITING ${t.id}: ${why}; starts again after ${holders.join(', ')}`);
  saveState(s);
}
function cleanupWorktree(id) {
  const wt = path.join(ROOT, '.claude/worktrees', id);
  if (existsSync(wt)) git(['worktree', 'remove', '--force', wt]);
  git(['worktree', 'prune']);
  git(['branch', '-D', `t/${id}`]);
}
async function review(t, wt, s, round, lane) {
  const c = cfg();
  const files = git(['diff', '--name-only', 'develop...HEAD'], wt).out.split('\n').filter(Boolean);
  const sec = files.filter((f) => SECURITY_PATHS.test(f)).slice(0, 8).join(', ');
  const plan = existsSync(path.join(ROOT, 'vault/plans', `${t.id}.md`));
  const trace = { ...traceTicket(wt, t.id), alreadyDone: (s.done || []).includes(t.id) };
  if (trace.missing.length) log(`${t.id} AC trace: not named in a test: ${trace.missing.join(', ')}${trace.alreadyDone ? ' (merged before; reported only)' : ''}`);
  let model = c.reviewer_model;
  let r = await runClaude({ cwd: wt, prompt: reviewerPrompt(t, sec, plan, trace), model, effort: c.reviewer_effort, name: `${t.id} review ${round}`, timeoutMin: c.reviewer_timeout_min, readOnly: true, lane, ticket: t.id });
  recordUsage(t.id, 'reviewer', model, r);
  if ((r.limited || r.code !== 0 || !r.res) && model !== c.reviewer_fallback) {
    log(`reviewer ${model} unavailable for ${t.id} (${r.limited ? 'limit' : 'error'}); using ${c.reviewer_fallback}`);
    model = c.reviewer_fallback;
    r = await runClaude({ cwd: wt, prompt: reviewerPrompt(t, sec, plan, trace), model, effort: c.reviewer_effort, name: `${t.id} review ${round} fallback`, timeoutMin: c.reviewer_timeout_min, readOnly: true, lane, ticket: t.id });
    recordUsage(t.id, 'reviewer', model, r);
  }
  if (r.limited) return { limited: true, r };
  const v = parseVerdict(r.res?.result ?? '');
  if (!v) return { verdict: 'error', detail: `reviewer gave no verdict: ${String(r.res?.result ?? r.text).slice(-1500)}` };
  if (v.verdict === 'fail' && !(v.findings || []).length) v.verdict = 'pass';
  return { verdict: v.verdict, findings: v.findings || [], blockedBy: ticketIds(v.blocked_by), notes: v.notes || '', detail: JSON.stringify(v.findings || [], null, 1), model };
}

// Predicts a ticket's footprint with one read-only call in the main checkout (on develop). Cached until the ticket
// merges, is requeued or is set aside. Returns { fp } or { limited } or { error }.
async function predictFootprint(t) {
  const c = cfg();
  const plan = existsSync(path.join(ROOT, 'vault/plans', `${t.id}.md`));
  const tree = footprintTree();
  const r = await runClaude({ cwd: tree, prompt: footprintPrompt(t, plan, readingList(t.id)), model: c.builder_model,
    effort: c.footprint_effort, name: `${t.id} footprint`, timeoutMin: c.footprint_timeout_min, readOnly: true });
  recordUsage(t.id, 'footprint', c.builder_model, r);
  if (r.limited) return { limited: true, r };
  const fp = parseFootprint(r.res?.result ?? '');
  if (!fp) return { error: `no footprint: ${String(r.res?.result ?? r.text).slice(-300)}` };
  // The tests that import a claimed file join the claim (EZD-1942): a static import scan of develop's read-only
  // footprint checkout, cached per develop commit. A scan failure leaves the footprint as predicted.
  let tests = '';
  try {
    const x = withImportingTests(tree, fp.files, { key: git(['rev-parse', 'HEAD'], tree).out.trim() || null, skip: sharedSet(ROOT) });
    fp.files = impliedFiles(x.files, new Set());
    tests = `; +${x.added.length} importing tests (scan ${x.ms} ms${x.hubs.length ? `; not followed: ${x.hubs.map((h) => `${h.file} (${h.tests} tests)`).slice(0, 3).join(', ')}` : ''})`;
  } catch (e) { tests = `; import scan failed: ${e.message}`; }
  const saved = { ...fp, ts: now() };
  saveFootprint(t.id, saved);
  log(`FOOTPRINT ${t.id}: ${fp.files.length} files${tests}${fp.notes ? ` (${fp.notes.slice(0, 120)})` : ''}`);
  return { fp: saved };
}

async function doTicket(t, s, lane, kind = 'ticket') {
  const c = cfg();
  const wt = path.join(ROOT, '.claude/worktrees', t.id);
  cleanupWorktree(t.id);
  const add = git(['worktree', 'add', '-B', `t/${t.id}`, wt, 'develop']);
  if (!add.ok) { setAside(s, t, 'could not create worktree', add.err, wt); return 'aside'; }
  log(`START ${t.id} · lane ${lane} · ${t.title}`);
  const stopForLimit = async (r) => { await handleLimit(r, s); endRun(s, t.id); cleanupWorktree(t.id); saveState(s); return 'limit'; };
  // A BLOCKED line that names a file held by another running ticket means "wait", not "failed".
  const heldBy = (text) => {
    const m = /^BLOCKED:.*\(file held\).*$/m.exec(String(text || ''));
    if (!m) return null;
    const ids = ticketIds(m[0]).filter((id) => id !== t.id);
    return ids.length ? ids : null;
  };
  const plan = existsSync(path.join(ROOT, 'vault/plans', `${t.id}.md`));
  const prompt = t.prompt ? `${t.prompt}\n${lanesNote(t)}` : builderPrompt(t, plan, readingList(t.id));
  const buildModel = isFixTicket(t) ? (c.fix_model || c.builder_model) : c.builder_model;
  await WTC.waitOff(); // EZD-1945: no builder starts while worktree config is on
  let r = await runClaude({ cwd: wt, prompt, model: buildModel, effort: c.builder_effort, name: `${t.id} build`, timeoutMin: c.builder_timeout_min, lane, ticket: t.id });
  recordUsage(t.id, 'builder', buildModel, r);
  if (r.limited) return stopForLimit(r);
  let session = r.res?.session_id;
  const held = heldBy(r.res?.result);
  if (held && held.some((h) => s.running[h])) { waitForHolders(s, t, held, `needs a file held by ${held.join(', ')}`); return 'wait'; }
  if (r.timedOut && !git(['log', '--oneline', 'develop..HEAD'], wt).out) { setAside(s, t, `builder timed out after ${c.builder_timeout_min} min with no commits`, r.text.slice(-2000), wt); return 'aside'; }
  if (r.timedOut) log(`${t.id} builder timed out after ${c.builder_timeout_min} min but committed work; checking it`);
  const blocked = /^BLOCKED:.*$/m.exec(String(r.res?.result ?? ''));
  if (!session && !r.timedOut) { setAside(s, t, 'builder crashed (no result)', r.text.slice(-2000), wt); return 'aside'; }

  const commitAll = () => { if (git(['status', '--porcelain'], wt).out) { git(['add', '-A'], wt); git(['commit', '-q', '-m', `feat(${t.id}): uncommitted builder work`], wt); } };
  const fix = async (kindOf, detail, label) => {
    const fixModel = c.fix_model || c.builder_model;
    await WTC.waitOff(); // EZD-1945
    let f = await runClaude({ cwd: wt, prompt: fixPrompt(kindOf, detail), model: fixModel, effort: c.builder_effort, name: `${t.id} ${label}`, resume: session, timeoutMin: c.builder_timeout_min, lane, ticket: t.id });
    recordUsage(t.id, `builder-fix-${kindOf}`, fixModel, f);
    if (fixModel !== c.builder_model && !f.res && !f.timedOut && !f.limited) {
      log(`${t.id} ${label}: ${fixModel} gave no result; trying ${c.builder_model}`);
      f = await runClaude({ cwd: wt, prompt: fixPrompt(kindOf, detail), model: c.builder_model, effort: c.builder_effort, name: `${t.id} ${label} (fallback)`, resume: session, timeoutMin: c.builder_timeout_min, lane, ticket: t.id });
      recordUsage(t.id, `builder-fix-${kindOf}`, c.builder_model, f);
    }
    if (f.res?.session_id) session = f.res.session_id;
    return f;
  };

  // check, with fix rounds
  commitAll();
  if (!git(['log', '--oneline', 'develop..HEAD'], wt).out) {
    setAside(s, t, blocked ? blocked[0] : 'builder made no commits', String(r.res?.result ?? '').slice(-2000), wt, blocked ? ticketIds(blocked[0]) : []); return 'aside';
  }
  let ck = await check(wt, lane);
  for (let i = 0; !ck.pass && i < c.fix_rounds; i++) {
    log(`${t.id} check red (round ${i + 1}); builder fixing\n  detail: ${ck.summary}`);
    const f = await fix('check', ck.detail, `fix check ${i + 1}`);
    if (f.limited) return stopForLimit(f);
    commitAll();
    ck = await check(wt, lane);
  }
  if (!ck.pass) { setAside(s, t, `check still red after ${c.fix_rounds} fix rounds`, ck.detail.slice(-3000), wt, [], ck.summary); s.red_streak++; saveState(s); return 'red'; }

  // review, with fix rounds
  let rv = await review(t, wt, s, 1, lane);
  if (rv.verdict === 'fail' && rv.blockedBy?.length) { setAside(s, t, `review: needs ${rv.blockedBy.join(', ')} first`, rv.detail, wt, rv.blockedBy); return 'aside'; }
  for (let i = 0; i < c.review_rounds && (rv.verdict === 'fail'); i++) {
    log(`${t.id} review fail (${rv.findings.length} findings); builder fixing`);
    const f = await fix('review', rv.detail, `fix review ${i + 1}`);
    if (f.limited) return stopForLimit(f);
    commitAll();
    ck = await check(wt, lane);
    if (!ck.pass) { setAside(s, t, 'check red after a review fix', ck.detail.slice(-3000), wt, [], ck.summary); return 'aside'; }
    rv = await review(t, wt, s, i + 2, lane);
  }
  if (rv.limited) return stopForLimit(rv.r);
  if (rv.verdict !== 'pass') { setAside(s, t, rv.verdict === 'fail' ? `review still failing after ${c.review_rounds} fix rounds` : 'reviewer error', rv.detail, wt, rv.blockedBy || []); return 'aside'; }

  // Oversight before the merge: every file the branch changed must be in its claim. A file it changed without a claim
  // is claimed now if free; if another running ticket holds it, this ticket waits for that one to merge first, then
  // takes in develop and re-checks below, so the two changes never land unchecked together.
  const changed = git(['diff', '--name-only', 'develop...HEAD'], wt).out.split('\n').filter(Boolean);
  const added = git(['diff', '--name-only', '--diff-filter=A', 'develop...HEAD'], wt).out.split('\n').filter(Boolean);
  let d = drift(changed, readClaims(ROOT), t.id, sharedSet(ROOT), added);
  if (d.unclaimed.length) {
    log(`DRIFT ${t.id}: changed ${d.unclaimed.length} file(s) outside its claim: ${d.unclaimed.slice(0, 8).join(', ')}`);
  }
  // Unclaimed files and new files under a <new> placeholder join the claim by name if free.
  const free = [...d.unclaimed, ...d.placed].filter((f) => !d.clashes.some((x) => x.file === f || (x.file.endsWith('/') && f.startsWith(x.file))));
  if (free.length) withClaims(ROOT, (cl) => { if (cl[t.id]) cl[t.id].files = impliedFiles([...cl[t.id].files, ...free], sharedSet(ROOT)); });
  const waitStart = Date.now();
  while (d.clashes.length) {
    const holders = [...new Set(d.clashes.map((x) => x.holder))];
    if (Date.now() - waitStart > c.holder_wait_min * 60000) { setAside(s, t, `changed files held by ${holders.join(', ')} for over ${c.holder_wait_min} min`, JSON.stringify(d.clashes), wt); return 'aside'; }
    if (Date.now() - waitStart < 1000) log(`${t.id} changed files ${d.clashes.map((x) => x.file).join(', ')} held by ${holders.join(', ')}; waits for them to finish before merging`);
    await sleep(60000);
    d = drift(changed, readClaims(ROOT), t.id, sharedSet(ROOT), added);
    if (!d.clashes.length) withClaims(ROOT, (cl) => { if (cl[t.id]) cl[t.id].files = impliedFiles([...cl[t.id].files, ...d.unclaimed, ...d.placed], sharedSet(ROOT)); });
  }

  // Merge: develop must be an ancestor of the branch at the moment of the squash. Bringing develop in and re-checking
  // takes time, during which another lane may merge; then the round repeats. The squash itself is synchronous, so no
  // other lane can merge between the ancestor test and the commit.
  // EZD-1941: the types check (committed types equal the ones generated from the branch's migrations, else no merge)
  // is an await, so it runs inside the rounds and the ancestor test is repeated after it: no await sits between the
  // last ancestor test and the squash.
  let typesOk = false;
  for (let round = 0; ; round++) {
    if (git(['merge-base', '--is-ancestor', 'develop', 'HEAD'], wt).ok) {
      if (typesOk || !touchesSchema(branchChanges(wt))) break;
      const tc = await regenerateTypes(laneRun(wt, lane), wt, { check: true });
      if (!tc.ok) { setAside(s, t, `${TYPES_FILE} differs from the regenerated types (${tc.step})`, tc.out.slice(-3000), wt); return 'aside'; }
      typesOk = true; round--;
      continue;
    }
    typesOk = false;
    if (round >= c.merge_rounds) { setAside(s, t, `develop kept moving: ${c.merge_rounds} merge rounds`, '', wt); return 'aside'; }
    const m = git(['merge', '-q', '--no-edit', 'develop'], wt);
    if (!m.ok) {
      const all = git(['diff', '--name-only', '--diff-filter=U'], wt).out;
      if (!all) { git(['merge', '--abort'], wt); setAside(s, t, 'merge with develop failed', m.err || m.out, wt); return 'aside'; }
      // EZD-1941: the generated database types are never hand-merged; they are regenerated below.
      const rest = settleGeneratedConflicts(all.split('\n').filter(Boolean), git, wt);
      const conflicted = rest.join('\n');
      if (!rest.length) {
        log(`${t.id} merge conflict with develop only in ${TYPES_FILE}; regenerating it`);
        const cm = git(['commit', '-q', '--no-edit'], wt);
        if (!cm.ok) { git(['merge', '--abort'], wt); setAside(s, t, 'merge commit failed', cm.err || cm.out, wt); return 'aside'; }
      } else {
        log(`${t.id} merge conflict with develop in ${rest.join(', ')}; builder resolving`);
        const f = await fix('merge', `${conflicted}\n\n${m.out}\n${m.err}`, `resolve merge ${round + 1}`);
        if (f.limited) { git(['merge', '--abort'], wt); return stopForLimit(f); }
        if (git(['diff', '--name-only', '--diff-filter=U'], wt).out || existsSync(path.join(wt, '.git')) && git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], wt).ok) {
          git(['merge', '--abort'], wt); setAside(s, t, 'merge clash with develop not resolved', conflicted, wt); return 'aside';
        }
      }
    }
    commitAll();
    // EZD-1941: the branch's migrations apply after develop's newest; the types are regenerated from the merged
    // migrations and committed (the check below and the types check before the squash compare them).
    const om = orderMigrations(git, wt, t.id);
    if (!om.ok) { setAside(s, t, 'renaming migrations after develop failed', om.error, wt); return 'aside'; }
    if (om.renames.length) log(`${t.id} migrations renamed to apply after develop's newest: ${om.renames.map((r) => `${path.basename(r.from)} -> ${path.basename(r.to)}`).join(', ')}`);
    if (touchesSchema(branchChanges(wt))) {
      const rg = await regenerateTypes(laneRun(wt, lane), wt);
      if (!rg.ok) { setAside(s, t, `regenerating ${TYPES_FILE} after the merge failed (${rg.step})`, rg.out.slice(-3000), wt); return 'aside'; }
      if (git(['status', '--porcelain', '--', TYPES_FILE], wt).out) git(['commit', '-q', '-m', `chore(${t.id}): ${TYPES_FILE} regenerated after merging develop`, '--', TYPES_FILE], wt);
      // Just generated from these migrations and committed: equal by construction, no second database reset.
      typesOk = !git(['status', '--porcelain', '--', TYPES_FILE], wt).out;
    }
    ck = await check(wt, lane);
    if (!ck.pass) { setAside(s, t, 'check red after merging newer develop', ck.detail.slice(-3000), wt, [], ck.summary); return 'aside'; }
  }

  // end of the merge rounds: only synchronous steps from here to the squash commit (EZD-1941)
  // squash merge into develop in the main checkout
  if (git(['rev-parse', '--abbrev-ref', 'HEAD']).out !== 'develop') { setAside(s, t, 'main checkout is not on develop', '', wt); return 'aside'; }
  // The squash commit must hold the ticket's change only: unstage the loop's own build files first. Anything else
  // staged in the main checkout is someone's work in progress, so the merge waits for it instead of taking it in.
  git(['reset', '-q', '--', ...BUILD_FILES]);
  const staged = git(['diff', '--cached', '--name-only']).out;
  if (staged) { setAside(s, t, 'files are staged in the main checkout; not merging over them', staged, wt); return 'aside'; }
  const sq = git(['merge', '--squash', `t/${t.id}`]);
  if (!sq.ok) { git(['reset', '--merge']); setAside(s, t, 'squash merge failed', sq.err || sq.out, wt); return 'aside'; }
  const msg = `feat(${t.id}): ${t.title.slice(0, 90)}\n\nBuild v3 loop: Opus builder, ${rv.model} review pass${rv.notes ? ` (${rv.notes.slice(0, 200)})` : ''}.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  const cm = git(['commit', '-q', '-m', msg]);
  if (!cm.ok) { git(['reset', '--merge']); setAside(s, t, 'commit on develop failed', cm.err || cm.out, wt); return 'aside'; }
  const sha = git(['rev-parse', '--short', 'HEAD']).out;
  s.done.push(t.id);
  s.merged.push({ id: t.id, title: t.title, commit: sha, ts: now(), kind, lane });
  s.red_streak = 0; s.push_pending = true;
  if (s.hold) delete s.hold[t.id];
  endRun(s, t.id);
  saveFootprint(t.id, null);
  saveState(s);
  cleanupWorktree(t.id);
  log(`MERGED ${t.id} as ${sha} (lane ${lane})`);
  if (SELF.onMerge(sha, changedFiles(sha, git))) log(`loop change ${sha} merged: no new tickets; restarting once running tickets finish`);
  return 'merged';
}

function push(s) {
  if (!s.push_pending) return;
  const p = git(['push', '-q', 'origin', 'develop']);
  if (p.ok) { s.push_pending = false; saveState(s); log('pushed develop'); } else log(`push failed (will retry): ${p.err.slice(0, 200)}`);
}
function commitBuildFiles(msg) {
  const files = BUILD_FILES.filter((f) => existsSync(path.join(ROOT, f)));
  git(['add', '--', ...files]);
  if (git(['diff', '--cached', '--quiet', '--', ...files]).ok) return;
  const cm = git(['commit', '-q', '-m', `docs(build): ${msg}`, '--', ...files]);
  if (!cm.ok) { git(['reset', '-q', '--', ...files]); log(`build files not committed (${cm.err.slice(0, 160)}); next time`); }
}
// Security advisories (Josh 2026-11-19): every advisory_check_hours, pnpm audit; anything new becomes one fix ticket at
// the front of the line, committed by pathspec so nothing is left staged for the next squash merge. A failed audit
// (registry down, no network) is logged and tried again next time; it never stops the loop or sets a ticket aside.
function checkAdvisories(s, c) {
  const due = Date.parse(s.advisories_checked_at || 0) + Number(c.advisory_check_hours || 6) * 3600000;
  if (Date.now() < due) return;
  s.advisories_checked_at = now(); saveState(s);
  const a = runAudit(ROOT);
  if (!a.ok) { log(`advisory check failed (will try again in ${c.advisory_check_hours} h): ${a.error}`); return; }
  const fresh = unseen(a.list, readSeen(ROOT));
  if (!fresh.length) { log(`advisory check: ${a.list.length} known advisor${a.list.length === 1 ? 'y' : 'ies'}, none new`); return; }
  const r = recordFixTicket(ROOT, fresh, now().slice(0, 10));
  const cm = git(['commit', '-q', '-m', `chore(tickets): ${r.id} security fix for ${fresh.map((x) => x.id).join(', ')} (build loop advisory check)\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, '--', ...r.files]);
  if (!cm.ok) { log(`advisory ticket ${r.id} written but not committed: ${cm.err.slice(0, 200)}`); return; }
  s.push_pending = true; saveState(s);
  log(`SECURITY ${r.id}: ${fresh.length} new advisor${fresh.length === 1 ? 'y' : 'ies'} (${fresh.map((x) => `${x.module} ${x.severity} ${x.id}`).join('; ')}); queued first`);
}
function writeTrialReport(s) {
  const rows = readFileSync(P.usage, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  writeFileSync(P.report, reportMarkdown(rows, s));
  s.trial_report_written = true; saveState(s);
  log(`trial report written: ${path.relative(ROOT, P.report)}`);
}
// Runs only when no lane is building (main drains the lanes first), so the repair has develop to itself.
async function guardDevelop(s) {
  const lane = laneList()[0];
  log(`${s.red_streak} tickets in a row set aside on a red check; checking develop itself`);
  const id = 'DEVELOP-CHECK';
  cleanupWorktree(id);
  const wt = path.join(ROOT, '.claude/worktrees', id);
  git(['worktree', 'add', '-B', `t/${id}`, wt, 'develop']);
  const ck = await check(wt, lane);
  cleanupWorktree(id);
  s.red_streak = 0; saveState(s);
  if (ck.pass) { log('develop is green; the red tickets were their own problem'); return; }
  log('develop is red; running one repair build');
  const t = { id: `EZD-REPAIR-${Date.now().toString(36)}`, title: 'Repair: develop fails the check', acs: [], prompt:
    `develop fails the full check (node scripts/check.mjs). Read CLAUDE.md, find the cause, fix it without weakening any test, and commit with message "fix(develop): <what>". ${FIX_TEST_RULE}\n\n${ck.detail.slice(-8000)}` };
  beginRun(s, t, lane, []);
  const res = await doTicket(t, s, lane, 'repair');
  endRun(s, t.id); saveState(s);
  // Josh 2026-11-14: a red check never stops the loop. A failed repair is set aside (set-aside.md) and the loop goes on;
  // the next red streak runs another repair.
  if (res !== 'merged') log(`develop is red and repair ${t.id} failed; set aside, building continues`);
}
// EZD-1946 (audit 2026-11-23 B1, B2): once a day the perf trend takes a free lane: develop is built and measured and
// one line is appended to perf-results/history.jsonl (scripts/loop/perf-trend.mjs). It holds the lane through
// s.running (no file claims) and the `active` map, so drains and restarts wait for it; it never counts as a ticket.
function startPerfTrend(s, lane, active) {
  s.perf_trend_at = now();
  s.running[PERF_TREND_ID] = { lane, title: 'perf trend on develop', started: now() };
  saveState(s);
  log(`perf trend: building and measuring develop on lane ${lane}`);
  const wt = path.join(ROOT, '.claude/worktrees', PERF_TREND_ID);
  const p = runPerfTrend({ root: ROOT, env: laneEnv(lane, wt), git, run: runCheck, log })
    .catch((e) => log(`perf trend error: ${e?.stack || e}`))
    .then(() => { delete s.running[PERF_TREND_ID]; saveState(s); active.delete(PERF_TREND_ID); });
  active.set(PERF_TREND_ID, p);
}

// ---------- lanes ----------
// config `lanes`: the database lanes to build on (0-3), or a count n meaning lanes 0..n-1. One ticket per lane.
function laneList(c = cfg()) {
  const v = c.lanes ?? [0];
  const list = Array.isArray(v) ? v.map(Number) : Array.from({ length: Math.max(1, Math.min(4, Number(v) || 1)) }, (_, i) => i);
  return [...new Set(list.filter((n) => Number.isInteger(n) && n >= 0 && n <= 3))].sort();
}
// Takes the ticket's claim under the claims lock, checking again that no builder claimed one of its files since the
// schedule was worked out. Returns false (and starts nothing) when one did.
function beginRun(s, t, lane, files) {
  const shared = sharedSet(ROOT);
  const ok = withClaims(ROOT, (cl) => {
    if (overlaps(files, cl, t.id, shared).length) return false;
    cl[t.id] = { lane, files: impliedFiles(files, shared) };
    return true;
  });
  if (!ok) return false;
  s.running[t.id] = { lane, title: t.title, started: now(), develop: git(['rev-parse', '--short', 'develop']).out };
  saveState(s);
  return true;
}
function afterTicket(t, res) {
  const s = loadState();
  const mergedTickets = s.merged.filter((m) => m.kind === 'ticket').length;
  if (res === 'merged' && mergedTickets % 5 === 0) {
    const rows = readFileSync(P.usage, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    log(`usage after ${mergedTickets} merges:\n${summarize(rows).text}`);
  }
  const handled = mergedTickets + Object.keys(s.set_aside).length;
  if (!s.trial_report_written && handled >= cfg().trial_size) writeTrialReport(s);
  commitBuildFiles(`${t.id} ${res}`);
  if (res === 'merged') commitAssumptionsIndex(t.id);
  push(s);
}
// EZD-1953: after a merge, rebuild the assumptions index and Josh's wording checklist on develop (and move any row an
// older branch still wrote in assumptions.md into its ticket file). The merge already set push_pending, so the push
// right after takes this commit too. A failure is logged and tried after the next merge.
function commitAssumptionsIndex(id) {
  try {
    const r = rebuildAssumptions(ROOT);
    if (!r.changed.length) return;
    git(['add', '--', ...r.changed]);
    const cm = git(['commit', '-q', '-m', `docs(build): assumptions index after ${id}`, '--', ...r.changed]);
    if (!cm.ok) { git(['reset', '-q', '--', ...r.changed]); log(`assumptions index not committed (${cm.err.slice(0, 160)}); next merge`); return; }
    log(`assumptions index rebuilt after ${id}: ${r.moved} rows moved in, ${r.confirmed} confirmed`);
  } catch (e) { log(`assumptions index rebuild failed (${String(e.message).slice(0, 160)}); next merge`); }
}

// Footprints for the first few eligible tickets, one call at a time. Returns 'limit' when a call hit the usage limit.
async function ensureFootprints(s, list) {
  const c = cfg();
  const fps = readFootprints();
  for (const t of list.slice(0, c.footprint_lookahead)) {
    if (fps[t.id]) continue;
    if (s.sleep_until || existsSync(P.stop)) return 'stopped';
    const r = await predictFootprint(t);
    if (r.limited) { await handleLimit(r.r, s); return 'limit'; }
    if (r.error) {
      // The ticket cannot be scheduled safely beside others without a footprint; it waits until it can run alone.
      log(`FOOTPRINT ${t.id} failed (${r.error.slice(0, 160)}); it will build only when no other lane is running`);
      saveFootprint(t.id, { files: [], alone: true, ts: now() });
    }
    return 'one'; // one call per pass, so a lane that frees up meanwhile is filled promptly
  }
  return 'ok';
}

// ---------- main ----------
const SELF = createSelfRestart({ log, exit: (code) => process.exit(code), dryRun: () => runDryRun({ cwd: ROOT }) });
async function main() {
  const s = loadState();
  // Heartbeat (2026-11-17): explain the gap since the last run, then record the machine's state every minute.
  const first = sample();
  const prev = lastBeat(P.heartbeat);
  const gap = startNote(prev, { now: first.ts, boot: first.boot, reason: prev && prev.boot !== first.boot ? resetReason(prev.ts) : null });
  if (gap) log(gap);
  // Josh 2026-11-20: two heavy-check slots are a trial. A Mac reset since the last run puts it back to one slot.
  if (gap && gap.startsWith('MAC RESTARTED')) {
    try {
      const raw = readJson(P.config, {});
      if (Number(raw.heavy_slots) > 1) { raw.heavy_slots = 1; raw.heavy_slots_note = `${raw.heavy_slots_note || ''} Set back to 1 by the loop after a Mac reset (${now()}).`.trim(); writeFileSync(P.config, JSON.stringify(raw, null, 2) + '\n'); log('heavy_slots set back to 1 after the Mac reset'); }
    } catch (e) { log(`could not reset heavy_slots: ${e?.message || e}`); }
  }
  log(`loop start at ${git(['rev-parse', '--short', 'HEAD']).out || 'unknown'} (pid ${process.pid}; lanes ${laneList().join(', ')})`);
  // EZD-1955: tickets merged before the traceability rule are reported here, never failed.
  try { const tr = traceDone(ROOT); log(`AC trace: ${tr.missing} of ${tr.total} acceptance criteria of done tickets are not named in a test (report only; node scripts/conventions/ac-trace.mjs lists them)`); } catch (e) { log(`AC trace report failed: ${String(e?.message || e).slice(0, 160)}`); }
  const heavyLock = path.join(os.tmpdir(), 'ezdraft-check-heavy.lock'); // slot 1; heartbeat reads every slot
  const beat = () => { try { writeBeat(P.heartbeat, sample({ running: Object.keys(s.running), heavyLock })); } catch (e) { console.log(`heartbeat: ${e?.message || e}`); } };
  writeBeat(P.heartbeat, { ...first, running: [] });
  setInterval(beat, 60000);
  // Recovery: anything still marked running was interrupted by a restart.
  if (s.current) { s.running[s.current] = { lane: 0 }; delete s.current; }
  for (const id of Object.keys(s.running)) { log(`recovering: ${id} was interrupted; starting it fresh`); cleanupWorktree(id); }
  s.running = {};
  withClaims(ROOT, (cl) => { for (const k of Object.keys(cl)) delete cl[k]; });
  saveState(s);

  const active = new Map(); // ticket id -> promise
  let lastNote = '';
  const note = (m) => { if (m !== lastNote) { log(m); lastNote = m; } };
  const idle = (ms) => Promise.race([sleep(ms), ...active.values()]);
  for (;;) {
    const c = cfg();
    adoptHandEdits(s);
    const lanes = laneList(c);
    // Drain (STOP file or a merged loop change): no new starts; running tickets finish first.
    if (existsSync(P.stop) || SELF.draining()) {
      if (SELF.draining() && !active.size) {
        saveState(s); push(s);
        if (SELF.tryRestart(active.size) === 'not-loaded') continue;
      }
      const why = SELF.draining() ? `loop change ${SELF.pending()} merged` : 'STOP file present';
      note(`${why}; ${active.size ? `${active.size} running ticket(s) finish first` : 'waiting'}`); await idle(60000); continue;
    }
    if (existsSync(P.attention)) { note('ATTENTION.md present; waiting'); await idle(10 * 60000); continue; }
    if (s.sleep_until && Date.parse(s.sleep_until) > Date.now()) {
      if (Date.parse(s.next_probe || 0) <= Date.now()) {
        const p = await limitCleared();
        if (p.ok) { log('usage available again; resuming'); delete s.sleep_until; delete s.next_probe; saveState(s); continue; }
        s.next_probe = new Date(Date.now() + c.limit_probe_minutes * 60000).toISOString();
        // A limit that is still on pushes the fallback wait a full limit_sleep_minutes ahead, well past the next probe,
        // so the loop keeps probing instead of retrying a ticket. Any other probe failure leaves the fallback wait as it is.
        if (p.limited) s.sleep_until = new Date(Date.now() + c.limit_sleep_minutes * 60000).toISOString();
        saveState(s);
      }
      await idle(Math.max(1000, Math.min(60000, Date.parse(s.sleep_until) - Date.now())));
      continue;
    }
    if (s.sleep_until) { delete s.sleep_until; delete s.next_probe; saveState(s); }
    try { checkAdvisories(s, c); } catch (e) { log(`advisory check error: ${e?.message || e}`); }
    // EZD-1958: once a day, 'BACKUP STALE <workflow>' for a backup workflow with no success in 8 days or a failed newest run.
    try { checkBackups(s, { cwd: ROOT, save: saveState, log }); } catch (e) { log(`backup status check error: ${e?.message || e}`); }
    if (!active.size) push(s);
    if (s.red_streak >= c.red_streak_guard) {
      if (active.size) { note(`red streak of ${s.red_streak}: no new starts until the ${active.size} running ticket(s) finish`); await idle(60000); continue; }
      await guardDevelop(s); commitBuildFiles('develop guard'); push(s); continue;
    }
    // EZD-1945: no new ticket, footprint, repair or perf run starts while worktree config is on (logged once by WTC).
    if (WTC.isOn()) { await idle(60000); continue; }
    const used = new Set(Object.values(s.running).map((r) => r.lane));
    const free = lanes.filter((l) => !used.has(l));
    // A ticket whose footprint could not be predicted runs only alone.
    const alone = Object.keys(s.running).some((id) => readFootprints()[id]?.alone);
    if (alone) { await idle(60000); continue; }
    if (free.length && !s.running[PERF_TREND_ID] && perfDue(s.perf_trend_at)) startPerfTrend(s, free.shift(), active);
    const list = eligible(s);
    if (!free.length) {
      // Every lane is busy: predict the next footprints now, so a lane that frees up starts without waiting for one.
      if (list.length && (await ensureFootprints(s, list)) === 'one') continue;
      await idle(60000); continue;
    }
    if (!list.length) {
      if (!active.size) note(gateNote(s) || `no eligible ticket; checking again every ${c.idle_minutes} min`);
      await idle(active.size ? 60000 : c.idle_minutes * 60000); continue;
    }
    const fpState = await ensureFootprints(s, list);
    if (fpState === 'limit' || fpState === 'stopped') continue;
    const fps = readFootprints();
    const cands = list.filter((t) => fps[t.id] && !(fps[t.id].alone && active.size));
    const { start, waiting } = schedule({ candidates: cands, footprints: fps, claims: readClaims(ROOT), free: free.length, shared: sharedSet(ROOT) });
    for (const t of start) {
      if (fps[t.id].alone && (active.size || start.length > 1)) continue;
      const lane = free[0];
      if (!beginRun(s, t, lane, fps[t.id].files)) continue;
      free.shift();
      lastNote = '';
      const p = doTicket(t, s, lane)
        .catch((e) => { log(`${t.id} crashed: ${e?.stack || e}`); try { setAside(s, t, 'loop error', String(e?.stack || e), path.join(ROOT, '.claude/worktrees', t.id)); } catch {} return 'aside'; })
        .then((res) => { endRun(s, t.id); saveState(s); active.delete(t.id); try { afterTicket(t, res); } catch (e) { log(`after ${t.id}: ${e?.message || e}`); } });
      active.set(t.id, p);
      if (fps[t.id].alone) break;
    }
    if (!start.length && waiting.length) note(`lanes free: ${free.length}; next tickets wait on held files: ${waiting.slice(0, 3).map((w) => `${w.id} ${w.reason}`).join('; ')}`);
    // Footprints still missing for the lookahead: go round again at once to predict the next one.
    if (fpState === 'one') continue;
    await idle(60000);
  }
}

// Dry run: which tickets would build together on `--lanes N` lanes, using footprints already predicted.
// `--footprints K` first predicts missing footprints for the next K tickets (claude calls, recorded in usage.jsonl).
async function dryRun() {
  const argv = process.argv;
  const num = (flag, fb) => (argv.includes(flag) ? Number(argv[argv.indexOf(flag) + 1]) || fb : fb);
  const n = num('--plan', 20);
  const lanes = num('--lanes', laneList().length);
  const predict = num('--footprints', 0);
  const s = readJson(P.state, null) || { done: seedDone(), set_aside: {} };
  s.running = {};
  s.done = [...s.done];
  if (predict) {
    for (const t of eligible(s).slice(0, predict)) {
      if (readFootprints()[t.id]) continue;
      const r = await predictFootprint(t);
      if (r.limited || r.error) { console.log(`footprint ${t.id}: ${r.limited ? 'usage limit' : r.error}`); break; }
    }
  }
  const fps = readFootprints();
  let shown = 0;
  for (let wave = 1; shown < n; wave++) {
    const list = eligible(s);
    if (!list.length) { console.log(gateNote(s) || '(no more eligible tickets)'); break; }
    const withFp = list.filter((t) => fps[t.id]);
    const { start, waiting } = schedule({ candidates: withFp, footprints: fps, claims: {}, free: lanes, shared: sharedSet(ROOT) });
    const run = start.length ? start : [list[0]];
    console.log(`wave ${wave}:`);
    for (const t of run) { console.log(`  ${t.id} · phase ${t.phase} · ${t.title.slice(0, 70)}${fps[t.id] ? ` · ${fps[t.id].files.length} files` : ' · no footprint yet (would be predicted first)'}`); shown++; }
    for (const w of waiting.slice(0, 3)) console.log(`    waits: ${w.id} ${w.reason}`);
    for (const t of run) s.done.push(t.id);
  }
}

if (process.argv.includes('--retry')) {
  process.exit(retryCli(process.argv, { state: P.state, setAside: P.setAside }));
} else if (process.argv.includes('--plan')) {
  dryRun().catch((e) => { console.error(e); process.exit(1); });
} else {
  main().catch((e) => { log(`loop crashed: ${e?.stack || e}`); process.exit(1); });
}
