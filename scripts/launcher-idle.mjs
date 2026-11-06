// What the launcher does when it cannot start a unit right now (Q-0233, Josh 2026-10-20): it never stops unless it hits a
// usage limit or truly nothing can be done until Josh answers, and even then it waits and re-checks so his answer is picked
// up without a restart. STOP (fix mode, PROCESS.md rule 19) pauses it until the file is removed. Only a budget hold ends it.
// --once and --dry-run keep exiting at once.
// EZD-250: a wait an agent can fix starts a repair unit (D12); the launcher reloads its own code when it changes (D9) and
// records what it is doing in <log_dir>/launcher-state.json for the watchdog (D7).
// EZD-174: the pure rules of the lanes launcher (several units at once while vault/handoff/LANES.json is on).
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export const STOP_POLL_MS = 60_000;
export const NONE_POLL_MS = 5 * 60_000;
export const REPAIR_CAP = 3;

// next-unit reasons only Josh can clear (D12): never repaired.
export const JOSH_REASONS = [
  /^none: budget hold/,
  /^none: vault\/handoff\/STOP exists/,
  /^none: every ticket is done/,
  /^none: phase \d+ spec not signed off/,
  /^none: waiting on Josh \(\d+ escalated question/,
  /^none: waiting on Josh \(tickets with open questions/,
  /^none: waiting on Josh \(guard grant/,
  /^none: waiting for the phase \d+ PR to auto-merge/,
  // EZD-336, EZD-337 (Q-0594 (a)): auto-merge found on and a green gate on an open PR are cleared by the launcher itself
  // (scripts/run.mjs: --disable-auto; a merge pinned to the checked head), never by a repair unit.
  /^none: phase \d+ PR auto-merge is on/,
  /^none: phase \d+ PR gate is green but not merged/,
];
// EZD-337: the two PR waits the launcher clears itself; group 1 is the PR URL, PR_GREEN_OPEN_RE group 2 the checked head.
export const AUTO_MERGE_ON_RE = /^none: phase \d+ PR auto-merge is on \((https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+)\)$/;
export const PR_GREEN_OPEN_RE = /^none: phase \d+ PR gate is green but not merged \((https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+); head ([0-9a-f]{40})\)$/;
export const SECURITY_HOLD_RE = /^none: phase \d+ PR merge held for a security pass of ([0-9a-f]{40})\.\.([0-9a-f]{40}) \((https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+)\)$/;

export function idleAction({ stopExists, next, once = false }) {
  const none = /^none:/.test(next);
  if (once && (stopExists || none)) return { action: 'stop' };
  if (stopExists) return { action: 'wait', ms: STOP_POLL_MS, why: 'vault/handoff/STOP exists (fix mode); waiting for it to be removed', notify: null };
  if (!none) return { action: 'run' };
  const reason = next.replace(/^none:\s*/, '');
  if (/budget hold/.test(reason)) return { action: 'stop' };
  // A held ticket's guard grant already reached Josh as one patch notification (D11, D12d).
  // EZD-336: the launcher clears the two PR waits itself and logs them (Josh 2026-11-05: Claude Code completes its own PRs).
  const notify = /^waiting on Josh \(guard grant|^phase \d+ PR (auto-merge is on|gate is green but not merged)/.test(reason) ? null : `launcher waiting: ${reason}`;
  return { action: 'wait', ms: NONE_POLL_MS, why: `nothing to run: ${reason}; re-checking every 5 minutes`, notify };
}

export const repairable = (next) => /^none:/.test(next) && !JOSH_REASONS.some((r) => r.test(next));

export const fingerprint = (text) => createHash('sha256').update(String(text).trim()).digest('hex').slice(0, 16);

// D12: repair this next-unit text, or say why not.
export function repairDecision({ next, state, consecutive }) {
  if (!/^none:/.test(next)) return { action: 'skip', why: 'runnable' };
  if (!repairable(next)) return { action: 'skip', why: 'josh' };
  if (consecutive >= REPAIR_CAP) return { action: 'skip', why: 'cap' };
  const fp = fingerprint(next);
  if (state?.fp === fp) return { action: 'skip', why: 'tried' };
  const kind = next.startsWith('none: ledger check failed') ? 'check'
    : /^none: phase \d+ PR merge held for a security pass of /.test(next) ? 'security'
      : /^none: phase \d+ PR CI gate check (failed|cancelled)/.test(next) ? 'ci' : 'waiting';
  return { action: 'repair', fp, kind };
}

// D12b: the repair unit's verdict is its first non-empty line.
export function parseVerdict(text) {
  const line = String(text ?? '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  const m = line.match(/^(REPAIRED|JOSH|FAILED):\s*(.+)$/);
  return m ? { verdict: m[1].toLowerCase(), line: m[2] } : { verdict: 'failed', line: 'no verdict line' };
}

// EZD-333 (decision 2026-11-05 "Overseer repair unit"): the launcher's repair units, the only units that get fix mode, and only
// for the paths vault/handoff/LAUNCHER_FIX.md lists under `## Paths`. One list of hard limits, used by .claude/hooks/guard-paths.mjs
// (Edit and Write) and by scripts/run.mjs after every repair (whatever wrote the file), so the two cannot drift. This file holds
// the list, so it is on the list.
export const REPAIR_UNIT_RE = /^repair-(check|waiting|ci|probe)$/;
// The files the guards and the gate load are on it too (guard-reads loads vault/tools/outline.mjs; the gate loads gate-summary,
// gate-lock, gate-env, excluded-form and db/lane): a throw there would switch a guard or the gate off. overseer-limits.test.mjs follows those imports.
// Josh-only files (budget, sign-off, hold) stay with guard-paths' joshOnly rule, so the launcher never undoes Josh's own edit.
export const REPAIR_NEVER_FILES = ['.claude/settings.json', '.claude/settings.local.json', '.claude/agents/code-reviewer.md',
  '.claude/agents/security-reviewer.md', 'scripts/unit-sandbox.json', 'scripts/gate.mjs', 'scripts/gate-summary.mjs',
  'scripts/gate-lock.mjs', 'scripts/db/lane.mjs', 'vault/tools/outline.mjs', 'scripts/launcher-idle.mjs', 'vault/tools/security-paths.mjs', 'scripts/gate-env.mjs', 'vault/tools/trusted-git.mjs', 'scripts/excluded-form.mjs'];
// Files that may hold Josh's own edits: the launcher watches them around a repair and stops, never restores, when one changes.
export const REPAIR_JOSH_FILES = ['.claude/settings.local.json', 'vault/budget.json', 'vault/spec/SIGNOFF.md', 'vault/handoff/BUDGET_HOLD.md'];
const REPAIR_NEVER_DIRS = ['.claude/hooks/', '.claude/skills/repair/', '.github/'];
// The test-file pattern of guard-paths.mjs (isTest).
const TEST_FILE = (k) => /(^|\/)(tests?|e2e|__tests__|fixtures|__fixtures__|test-utils|test-harness)\//.test(k)
  || /\.(test|spec)\.[cm]?[jt]sx?$/.test(k)
  || /(^|\/)(vitest|playwright)(\.workspace)?(\.config)?\.[cm]?[jt]s$/.test(k);
export function repairForbidden(rel) {
  const k = String(rel).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\.claude\/worktrees\/[^/]+\//, '').toLowerCase();
  if (REPAIR_NEVER_FILES.some((f) => k === f.toLowerCase())) return `${rel} is a hard limit of the repair unit (guards, settings, sandbox, gate, reviewers)`;
  if (REPAIR_NEVER_DIRS.some((d) => k.startsWith(d))) return `${rel} is under a folder the repair unit never changes (hooks, its own skill, CI)`;
  if (/(^|\/)package\.json$/.test(k)) return `${rel} holds the test and gate commands; the repair unit never changes it`;
  if (TEST_FILE(k)) return `${rel} is a test file; the repair unit never changes, skips or narrows a test`;
  if (/(^|\/)\.env(\.|$)/.test(k) && !k.endsWith('.env.example')) return `${rel} is an environment file`;
  return null;
}
// The `- path` bullets under the `## Paths` heading (backticks dropped); a trailing `/` lists a folder.
export function fixModePaths(text) {
  const out = [];
  let inPaths = false;
  for (const raw of String(text ?? '').split('\n')) {
    const l = raw.trim();
    if (/^#{1,6}\s/.test(l)) { inPaths = /^##\s+Paths\s*$/i.test(l); continue; }
    if (!inPaths) continue;
    const m = l.match(/^-\s+`?([^`\s]+)`?\s*$/);
    if (m) out.push(m[1].replace(/^\.\//, ''));
  }
  return out;
}
export const fixListed = (paths, rel) => paths.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p));
// After a repair Josh hears only a design or user-interface question (standing rule 2026-11-05).
export const joshQuestion = (line) => /^(design|ui):/i.test(String(line ?? '').trim());

// EZD-255 D1: the unit a hold or limit text names: the repair unit while a repair runs, else the next unit.
export function unitSubject(next, repair) {
  return repair ? `repair ${repair.kind} for "${repair.next}"` : next;
}

// EZD-255 D2: the line for a repair stopped by the per-unit cap or the turn limit; any other outcome is returned unchanged.
export function repairStopLine(kind, outcome) {
  if (outcome === 'error:error_max_budget_usd') return `repair ${kind} stopped at the per-unit cap (${outcome})`;
  if (outcome === 'error:error_max_turns') return `repair ${kind} stopped at the turn limit (${outcome})`;
  return outcome;
}

// D9: the launcher's own code, every *.mjs directly in scripts/ and vault/tools/ except tests.
export function codeFingerprint(root) {
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const files = {};
  for (const dir of ['scripts', 'vault/tools']) {
    let names = [];
    try {
      names = readdirSync(path.join(root, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of names) {
      if (!d.isFile() || !d.name.endsWith('.mjs') || d.name.endsWith('.test.mjs')) continue;
      const rel = `${dir}/${d.name}`;
      files[rel] = sha(readFileSync(path.join(root, rel)));
    }
  }
  const hash = sha(Object.keys(files).sort().map((rel) => `${rel}\0${files[rel]}\0`).join(''));
  return { hash, files };
}

// D7: merge a patch into <dir>/launcher-state.json; returns the merged state.
export function writeLauncherState(dir, patch) {
  const file = path.join(dir, 'launcher-state.json');
  let cur = {};
  try {
    if (existsSync(file)) cur = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    cur = {};
  }
  if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) cur = {};
  const merged = { ...cur, ...patch };
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(merged) + '\n');
  return merged;
}

// ---- Lanes (EZD-174; vault/plans/EZD-174.md section 3, C4-C13) ----
export const PHASE_WIDE_UNITS = ['questions', 'review-plans', 'gate-phase', 'wrap'];
export const isPhaseWide = (unit) => PHASE_WIDE_UNITS.includes(unit);
export const LANE_POLL_MS = 60_000;

export const laneLimits = (state) => (state?.on ? { lanes: state.lanes, buildLanes: state.buildLanes } : { lanes: 1, buildLanes: 1 });

// Which offered units start now, in offered order; reason says why fewer than the free lanes start (null when none).
export function pickUnits({ offered, running, limits, paused = false }) {
  if (paused) return { start: [], reason: 'five-hour pause' };
  const wide = running.find((r) => isPhaseWide(r.unit));
  if (wide) return { start: [], reason: `phase-wide unit running: ${wide.unit} ${wide.arg}` };
  if (offered.length && isPhaseWide(offered[0].unit)) {
    return running.length ? { start: [], reason: `waiting for running units before ${offered[0].unit} ${offered[0].arg}` } : { start: [offered[0]], reason: null };
  }
  const start = [];
  const args = new Set(running.map((r) => r.arg));
  let builds = running.filter((r) => r.unit === 'build').length;
  for (const u of offered) {
    if (isPhaseWide(u.unit) || running.length + start.length >= limits.lanes) break;
    if (args.has(u.arg)) continue;
    if (u.unit === 'build' && builds >= limits.buildLanes) continue;
    start.push(u);
    args.add(u.arg);
    if (u.unit === 'build') builds++;
  }
  return { start, reason: start.length ? null : 'all lanes busy' };
}

// A build's local database lane: the lowest of 1..buildLanes no running build holds (null when none); 0 for anything else.
export function dbLaneFor({ unit, running, limits, lanesOn }) {
  if (unit !== 'build' || !lanesOn) return 0;
  const held = new Set(running.filter((r) => r.unit === 'build').map((r) => r.dbLane));
  for (let n = 1; n <= limits.buildLanes; n++) if (!held.has(n)) return n;
  return null;
}

// The five-hour pause in force: the pause file's resume time while it is ahead, else the meter's decision.
export function pauseFrom({ fileText, decision, now }) {
  const m = String(fileText ?? '').match(/^- Resume at: (.+)$/m);
  const t = m ? Date.parse(m[1].trim()) : NaN;
  if (Number.isFinite(t) && t > now) return { until: new Date(t).toISOString(), source: 'file' };
  if (decision?.pause) return { until: decision.pause.resume_at, source: 'meter' };
  return null;
}

export function statusRow(statusText, id) {
  return String(statusText).split('\n').find((l) => l.startsWith(`| ${id} |`)) ?? '';
}
export const unitProgress = ({ key, before, after, offeredAfter }) => before !== after || !offeredAfter.includes(key);

// Per-key guards: two runs without progress, or failing twice, set that key aside; three asides in a row pause new starts.
export const createGuards = () => ({ noProgress: new Map(), retried: new Set(), tabled: 0 });
export function guardAfterUnit(state, { key, outcome, progress }) {
  let res = { action: 'go', why: null, stopText: null };
  if (outcome === 'ok' && !progress) {
    const n = (state.noProgress.get(key) ?? 0) + 1;
    state.retried.delete(key);
    if (n >= 2) {
      state.noProgress.delete(key);
      res = { action: 'aside', why: 'two runs without progress', stopText: `unit ${key} ended twice without progress; launcher stopped. See vault/handoff/CURRENT.md.` };
    } else state.noProgress.set(key, n);
  } else {
    state.noProgress.delete(key);
    state.tabled = 0;
    if (outcome === 'error' || /max_turns|budget/i.test(outcome)) {
      if (state.retried.has(key)) {
        state.retried.delete(key);
        res = { action: 'aside', why: `failing twice (${outcome})`, stopText: `unit ${key} failed twice (${outcome}); launcher stopped.` };
      } else state.retried.add(key);
    } else state.retried.delete(key);
  }
  let pause = false;
  if (res.action === 'aside') {
    state.tabled++;
    pause = state.tabled >= 3;
    if (pause) state.tabled = 0;
  }
  return { ...res, pause };
}

// The lane environment a lane unit's local database calls must carry: the ticket worktree's own lane folder.
export const laneEnvFor = ({ root, ticket, lane }) => ({ EZD_LANE: String(lane), SUPABASE_WORKDIR: path.join(root, '.claude/worktrees', ticket, '.lanes', `lane${lane}`) });

// Lane lease: the pid holding database lane m, written through a temp file so a reader never sees it empty.
export const leasePath = (lane, dir = os.tmpdir()) => path.join(dir, `ezdraft-lane${lane}.lease`);
export function writeLease(lane, pid, dir = os.tmpdir()) {
  const file = leasePath(lane, dir);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, String(pid));
  renameSync(tmp, file);
}
export function removeLease(lane, dir = os.tmpdir()) {
  try { unlinkSync(leasePath(lane, dir)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

// The window pause after a unit hit the five-hour limit (scripts/run.mjs's limit rule): resume a minute after the reset.
export function limitPause({ limit, now }) {
  const parsed = Date.parse(limit?.until);
  const until = Number.isFinite(parsed) ? parsed : now + 1_800_000;
  return { pct: 100, resets_at: new Date(until).toISOString(), resume_at: new Date(Math.max(now + 60_000, until + 60_000)).toISOString() };
}

export const neverRejects = (fn, onError) => Promise.resolve().then(fn).catch(onError);
