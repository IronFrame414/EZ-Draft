// What the launcher does when it cannot start a unit right now (Q-0233, Josh 2026-10-20): it never stops unless it hits a
// usage limit or truly nothing can be done until Josh answers, and even then it waits and re-checks so his answer is picked
// up without a restart. STOP (fix mode, PROCESS.md rule 19) pauses it until the file is removed. Only a budget hold ends it.
// --once and --dry-run keep exiting at once.
// EZD-250: a wait an agent can fix starts a repair unit (D12); the launcher reloads its own code when it changes (D9) and
// records what it is doing in <log_dir>/launcher-state.json for the watchdog (D7).
// EZD-174: the pure rules of the lanes launcher (several units at once while vault/handoff/LANES.json is on).
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, unlinkSync, realpathSync } from 'node:fs';
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
// gate-lock, gate-env, excluded-form, gate-user, gate-docker-relay, gate-port and db/lane): a throw there would switch a guard or the gate off. overseer-limits.test.mjs follows those imports.
// Josh-only files (budget, sign-off, hold) stay with guard-paths' joshOnly rule, so the launcher never undoes Josh's own edit.
export const REPAIR_NEVER_FILES = ['.claude/settings.json', '.claude/settings.local.json', '.claude/agents/code-reviewer.md',
  '.claude/agents/security-reviewer.md', 'scripts/unit-sandbox.json', 'scripts/gate.mjs', 'scripts/gate-summary.mjs',
  'scripts/gate-lock.mjs', 'scripts/db/lane.mjs', 'vault/tools/outline.mjs', 'scripts/launcher-idle.mjs', 'vault/tools/security-paths.mjs', 'scripts/gate-env.mjs', 'vault/tools/trusted-git.mjs', 'scripts/excluded-form.mjs', 'scripts/gate-user.mjs', 'scripts/gate-docker-relay.mjs', 'scripts/gate-port.mjs'];
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

// EZD-377 D-Quick, D-Pause: a unit that ended in under 30 s with under $0.01 and at most 1 turn did nothing; the launcher
// pauses every lane for QUICK_PAUSE_MS (config quick_pause_ms) instead of starting it again at once.
export const QUICK_UNIT = Object.freeze({ maxMs: 30_000, maxUsd: 0.01, maxTurns: 1 });
export const QUICK_PAUSE_MS = 1_800_000;
export function quickEmpty({ outcome, wallMs, usd, turns } = {}) {
  if (!Number.isFinite(wallMs) || typeof outcome !== 'string') return false;
  if (outcome.startsWith('limit-') || outcome === 'dry-run' || outcome === 'interrupted') return false;
  return wallMs < QUICK_UNIT.maxMs && (Number(usd) || 0) < QUICK_UNIT.maxUsd && (Number(turns) || 0) <= QUICK_UNIT.maxTurns;
}

// EZD-377 D-Start, D-StartFile, D-Text: a unit key started more than START_LIMIT times in START_WINDOW_MS is refused, and the
// launcher stops with one notice. The starts live in <log_dir>/unit-starts.json, so a restart of the launcher keeps them.
export const START_LIMIT = 3;
export const START_WINDOW_MS = 600_000;
export function startGuard(starts, key, now) {
  const src = starts !== null && typeof starts === 'object' && !Array.isArray(starts) ? starts : {};
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    const kept = (Array.isArray(v) ? v : []).filter((t) => typeof t === 'number' && Number.isFinite(t) && now - t < START_WINDOW_MS);
    if (kept.length) out[k] = kept;
  }
  const mine = out[key] ?? [];
  if (mine.length > START_LIMIT) {
    delete out[key];
    return { allow: false, count: mine.length, starts: out };
  }
  out[key] = [...mine, now];
  return { allow: true, count: out[key].length, starts: out };
}
export function recordStart(dir, key, now = Date.now()) {
  const file = path.join(dir, 'unit-starts.json');
  let cur = {};
  try {
    cur = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    cur = {};
  }
  const { allow, count, starts } = startGuard(cur, key, now);
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(starts) + '\n');
  renameSync(`${file}.tmp`, file);
  return { allow, count };
}

// EZD-378: the launcher's two accounts (vault/plans/EZD-378.md D-Read to D-State). scripts/launcher-accounts.json holds folder
// paths only; credentials stay in each folder's sign-in. Without the file the launcher runs exactly as before (D-Off).
export const ACCOUNTS_FILE = 'scripts/launcher-accounts.json';
export const AUTH_OVERRIDE_VARS = Object.freeze(['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_PROFILE']);
export const ACCOUNT_REST_UNKNOWN_MS = 1_800_000;
export const SIGNIN_RECHECK_MS = NONE_POLL_MS;
const plainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ACCOUNT_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
export function readAccounts(root, { home = os.homedir() } = {}) {
  let text;
  try {
    text = readFileSync(path.join(root, ACCOUNTS_FILE), 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') return { on: false };
    return { on: true, problem: `cannot be read (${e?.code ?? e?.message ?? e})` };
  }
  let j;
  try { j = JSON.parse(text); } catch { return { on: true, problem: 'is not valid JSON' }; }
  if (!plainObject(j) || Object.keys(j).some((k) => k !== 'accounts') || !Array.isArray(j.accounts) || j.accounts.length < 2)
    return { on: true, problem: 'needs an "accounts" list of at least 2 accounts and no other key' };
  let sb;
  try { sb = JSON.parse(readFileSync(path.join(root, 'scripts/unit-sandbox.json'), 'utf8')); } catch { sb = null; }
  const fsCfg = sb?.sandbox?.filesystem;
  if (!fsCfg || !Array.isArray(fsCfg.denyRead) || !Array.isArray(fsCfg.allowWrite)) return { on: true, problem: 'scripts/unit-sandbox.json cannot be read' };
  const out = [];
  for (let i = 0; i < j.accounts.length; i++) {
    const n = i + 1;
    const row = j.accounts[i];
    if (!plainObject(row) || Object.keys(row).sort().join(',') !== 'dir,id') return { on: true, problem: `account ${n} needs exactly an "id" and a "dir"` };
    const { id, dir } = row;
    if (typeof id !== 'string' || !ACCOUNT_ID_RE.test(id))
      return { on: true, problem: `account ${n}: id "${String(id)}" must be 1 to 32 lower-case letters, digits or dashes, starting with a letter or digit` };
    const badDir = typeof dir !== 'string' || !(dir.startsWith('~/') || dir.startsWith('/')) || dir.endsWith('/') || dir.includes('//')
      || dir.split('/').some((p) => p === '.' || p === '..');
    if (badDir) return { on: true, problem: `account ${n}: dir "${String(dir)}" must start with ~/ or /, with no . or .. part and no trailing /` };
    const full = dir.startsWith('~/') ? path.join(home, dir.slice(2)) : dir;
    for (const entry of fsCfg.allowWrite) {
      let e;
      if (typeof entry === 'string' && entry.startsWith('./')) e = path.join(root, entry.slice(2));
      else if (typeof entry === 'string' && entry.startsWith('~/')) e = path.join(home, entry.slice(2));
      else if (typeof entry === 'string' && entry.startsWith('/')) e = entry;
      else return { on: true, problem: `scripts/unit-sandbox.json allowWrite entry "${String(entry)}" cannot be read` };
      const base = e.endsWith(path.sep) && e.length > 1 ? e.slice(0, -1) : e;
      if (full === base || full.startsWith(base === path.sep ? base : base + path.sep))
        return { on: true, problem: `account ${n}: dir "${dir}" is inside "${entry}", which units may write (scripts/unit-sandbox.json allowWrite)` };
    }
    if (out.some((a) => a.id === id)) return { on: true, problem: `account ${n}: id "${id}" is used twice` };
    if (out.some((a) => a.path === full)) return { on: true, problem: `account ${n}: dir "${dir}" is used twice` };
    if (!fsCfg.denyRead.includes(`${dir}/.credentials.json`)) return { on: true, problem: `scripts/unit-sandbox.json denyRead lacks "${dir}/.credentials.json"` };
    out.push({ id, dir, path: full });
  }
  return { on: true, accounts: out };
}
// D-Env: no unit's environment carries a sign-in override; plan mode gets the chosen account's folder.
export function unitAuthEnv(env, { mode, account = null, apiKey } = {}) {
  const out = { ...env };
  for (const k of AUTH_OVERRIDE_VARS) delete out[k];
  delete out.CLAUDE_CONFIG_DIR;
  if (mode === 'api') out.ANTHROPIC_API_KEY = apiKey;
  else if (account) out.CLAUDE_CONFIG_DIR = account.path;
  return out;
}
const realOr = (p) => { try { return realpathSync(p); } catch { return path.resolve(p); } };
// D-SignIn: the result of `claude auth status` run in the unit's own environment.
export function signInVerdict({ status, stdout, error } = {}, account) {
  if (error) return { ok: false, why: `claude auth status did not run (${error.code ?? error.message})` };
  if (status !== 0) return { ok: false, why: `not signed in (claude auth status exit ${status})` };
  const s = String(stdout ?? '');
  const at = s.indexOf('{');
  let j = null;
  try { j = at >= 0 ? JSON.parse(s.slice(at)) : null; } catch { j = null; }
  if (j === null || typeof j !== 'object') return { ok: false, why: 'claude auth status printed no JSON' };
  if (j.authMethod !== 'claude.ai') return { ok: false, why: `signed in with ${String(j.authMethod ?? 'nothing')}, not a claude.ai subscription` };
  if (typeof j.configDirectory !== 'string') return { ok: false, why: 'claude auth status names no configDirectory (Claude Code 2.1.268 or later is needed)' };
  if (realOr(j.configDirectory) !== realOr(account.path)) return { ok: false, why: `claude auth status uses ${j.configDirectory}, not ${account.path}` };
  return { ok: true, why: null };
}
// D-Reset: a documented reset time ("3:45pm", "Mon 12:00am") as the first such local time after now, or a date.
const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
export function parseReset(until, now) {
  if (typeof until !== 'string' || until.trim() === '') return null;
  const t = until.trim();
  const m = t.match(/^(?:(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (m) {
    const h = Number(m[2]);
    const mm = m[3] === undefined ? 0 : Number(m[3]);
    if (h < 1 || h > 12 || mm > 59) return null;
    const h24 = (h % 12) + (m[4].toLowerCase() === 'pm' ? 12 : 0);
    const wd = m[1] === undefined ? null : WEEKDAYS[m[1].toLowerCase()];
    for (let d = 0; d <= 8; d++) {
      const c = new Date(now);
      c.setDate(c.getDate() + d);
      c.setHours(h24, mm, 0, 0);
      if (c.getTime() > now && (wd === null || c.getDay() === wd)) return c.getTime();
    }
    return null;
  }
  const p = Date.parse(t);
  return Number.isFinite(p) && p > now ? p : null;
}
// D-Spend: each account's estimated spend over the last 7 days, from the cost rows.
export function accountSpend(lines, now) {
  const out = {};
  for (const l of lines ?? []) {
    let r;
    try { r = typeof l === 'string' ? JSON.parse(l) : l; } catch { continue; }
    if (!r || typeof r.account !== 'string' || !(Date.parse(r.ts) > now - 604_800_000)) continue;
    out[r.account] = (out[r.account] ?? 0) + (Number(r.est_usd) || 0);
  }
  return out;
}
// D-Pick: the free account with the lowest spend, then fewer running units, then file order.
export function pickAccount({ accounts, state = {}, spend = {}, running = {}, blocked = {}, now }) {
  const restT = (a) => Date.parse(state?.[a.id]?.restingUntil);
  const blockT = (a) => Number(blocked?.[a.id]);
  const resting = (a) => restT(a) > now;
  const isBlocked = (a) => blockT(a) > now;
  const free = accounts.map((a, i) => ({ a, i })).filter(({ a }) => !resting(a) && !isBlocked(a));
  if (free.length) {
    free.sort((x, y) => (spend[x.a.id] ?? 0) - (spend[y.a.id] ?? 0) || (running[x.a.id] ?? 0) - (running[y.a.id] ?? 0) || x.i - y.i);
    return { account: free[0].a, until: null, parts: [] };
  }
  let until = null;
  for (const a of accounts) {
    const r = Number.isFinite(restT(a)) ? restT(a) : -Infinity;
    const b = Number.isFinite(blockT(a)) ? blockT(a) : -Infinity;
    const t = Math.max(r, b);
    if (until === null || t < until) until = t;
  }
  const parts = accounts.map((a) => (resting(a) ? `${a.id} resting until ${new Date(restT(a)).toISOString()}` : `${a.id} not signed in`));
  return { account: null, until, parts };
}
// D-State: <logDir>/accounts-state.json; any read problem counts as empty (EISDIR included, test review note 2).
export function readAccountState(dir) {
  try {
    const j = JSON.parse(readFileSync(path.join(dir, 'accounts-state.json'), 'utf8'));
    return plainObject(j) ? j : {};
  } catch {
    return {};
  }
}
export function restAccount(dir, id, untilMs, note, now = Date.now()) {
  const file = path.join(dir, 'accounts-state.json');
  const cur = readAccountState(dir);
  const stored = Date.parse(cur[id]?.restingUntil);
  const rec = { restingUntil: new Date(Math.max(Number.isFinite(stored) ? stored : -Infinity, untilMs)).toISOString(), note: String(note ?? '').slice(0, 200), at: new Date(now).toISOString() };
  cur[id] = rec;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(cur) + '\n');
  renameSync(`${file}.tmp`, file);
  return rec;
}
export const accountSignInText = (account, why) => `account ${account.id} cannot start units: ${why}. Units go to the other accounts. To sign in once: CLAUDE_CONFIG_DIR=${account.path} claude`;
// D-Run10: a recovered in-flight record may name only a configured account's folder and id (the in-flight folder is
// writable by units; security review 2026-11-10 finding 1). Anything else falls back to the default folder and account.
export function recoveredAccount(record, accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  const r = record ?? {};
  const configDir = list.some((a) => a.path === r.configDir) ? r.configDir : undefined;
  const account = list.some((a) => a.id === r.account) || r.account === 'default' || r.account === 'api' ? r.account : 'default';
  return { configDir, account };
}
export const accountsPausedText = (parts, untilMs) => `launcher paused: no account can start a unit (${parts.join(', ')}); the next try is at ${new Date(untilMs).toISOString()}`;
export const startStopText = (key, count) => `launcher stopped: ${key} started ${count} times in 10 minutes; no new unit starts until the launcher is restarted`;
