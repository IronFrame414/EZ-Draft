#!/usr/bin/env node
// The launcher (vault/PROCESS.md section 10 and 11). Runs one unit of work per fresh `claude -p` session, in a loop,
// until nothing can run without Josh. No dependencies; Node 22; macOS or Linux.
//
//   node scripts/run.mjs              run units until a budget hold or a repeated error; STOP and `none` wait and re-check (Q-0233)
//   node scripts/run.mjs --once       run one unit and exit
//   node scripts/run.mjs --dry-run    print what would run (unit, command line) and exit
//   node scripts/run.mjs --status     budget, next unit, config check
//
// Untracked config: scripts/launcher.config.json (gitignored; agents cannot read it). Keys, all optional:
//   notify_cmd      shell command; $MSG holds the message. Example: curl -s -d "$MSG" https://ntfy.sh/<long-random-topic>
//   auth_mode       "plan" (default) or "api". In api mode the run uses api_key and draws from API credits (section 11).
//   api_key         the Console API key for api mode. Never committed; never passed to agents (subprocess env scrub).
//   claude_bin      path to the claude binary (default "claude")
//   extra_args      array of extra flags for every run
//   max_turns       { build: 150, plan: 60, "review-plans": 60, questions: 80, "gate-phase": 150, wrap: 60 }
//   limit_formats_confirmed   true once the pilot (section 15) confirmed the limit-error message formats; until then every
//                   limit error that is not one of Claude Code's documented messages (vault/tools/limit-message.mjs) is treated as
//                   the weekly case (section 11); a documented message is classified by its own words whatever this flag says.
//                   Either way the raw output of every limit error is saved
//                   to vault/handoff/limit-error-<time>.txt and Josh is told its name (EZD-193; Q-0299 (b))
//   quick_pause_ms  how long no unit starts after a unit that ended in under 30 s with under $0.01 and at most 1 turn (default 1800000; EZD-377)
//   prompt_style    "slash" (default: the prompt is `/<skill> <arg>`) or "ask" (plain sentence naming the skill)
//   records_db      the records database file (REMEDIATION-PLAN 2.12); default $EZD_RECORDS_DB, else ~/.ezdraft/records.db
//   log_dir         where the launcher keeps its in-flight records (inflight/) and the launchd logs (default ~/Library/Logs/ezdraft on macOS,
//                   .launcher/ in the checkout elsewhere); scripts/launchd/install.mjs and scripts/watchdog.mjs use the same
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, statSync, renameSync, appendFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { verifyDevelop, developSha, recordDevelop, inPushChain } from './release/github-ops.mjs';
import { trustedGit } from '../vault/tools/trusted-git.mjs';
import { matchLimit } from '../vault/tools/limit-message.mjs';
import {
  launcherLogDir, inflightDir, unitId, writeInflight, removeInflight, listInflight, launcherHandoffText, writeFileAtomic,
  takeLauncherLock, withLedgerLock, LockError, queueDirs,
} from './ledger.mjs';
// The launcher is the only writer of the running records (REMEDIATION-PLAN 2.12; D1 (a), D2 (a)): a unit's tools queue ops
// in its results file, and the launcher applies them with its own ops in one transaction, then re-exports the views.
// Nothing here commits records.
import { openRecords, dbPath, readQueue, applyOps, refreshViews, nextQuestionId, inboxFiles } from './records.mjs';
import { UNIT_ENV_LIMITS } from './launcher/unit-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// EZD-316 D14: the D-021 record folder, as scripts/unit-steps.mjs D6: tests point EZD_GITHUB_OPS_HOME at a temp folder, or with
// EZD_ROOT and no EZD_GITHUB_OPS_HOME get none (no record step), so they never touch the real one.
const opsHome = process.env.EZD_GITHUB_OPS_HOME || (process.env.EZD_ROOT ? '' : os.userInfo().homedir);
const vault = path.join(root, 'vault');
const args = process.argv.slice(2);
const once = args.includes('--once');
const dryRun = args.includes('--dry-run');
const statusOnly = args.includes('--status');

const readJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };
const config = readJson(path.join(root, 'scripts/launcher.config.json'), {});
// records_db: the records database (default $EZD_RECORDS_DB, else ~/.ezdraft/records.db); set by test roots (L-041). The
// launcher's units and helpers inherit it.
if (config.records_db) process.env.EZD_RECORDS_DB = path.resolve(root, config.records_db);
const budgetPath = path.join(vault, 'budget.json');
const holdFile = path.join(vault, 'handoff/BUDGET_HOLD.md');
const stopFile = path.join(vault, 'handoff/STOP');
const windowPauseFile = path.join(vault, 'handoff/WINDOW_PAUSE.md');
const failureFile = path.join(vault, 'handoff/last-failure.json');
// The unit in flight, written before each `claude -p` and removed after its cost row, so a launcher killed mid-unit
// (2026-10-23: a Claude app restart) still gets a cost row for that unit on its next start. One record per unit in
// <logDir>/inflight/ (EZD-173); the single file of earlier launchers is still recovered once.
export const logDir = launcherLogDir(root);
const legacyInflightFile = path.join(logDir, 'inflight.json');
const claudeBin = config.claude_bin || 'claude';
// Every unit runs its shell commands in the OS sandbox (REMEDIATION 2.7; Josh 2026-11-02: option 3 now, option 1 with the lanes work; vault/spikes/sandbox/NOTES.md).
// Every unit runs its shell commands in the OS sandbox (REMEDIATION 2.7; back on after probe rounds 5 and 6, the audit vault/handoff/SANDBOX-AUDIT-2026-11-03.md, and D-021 closed by EZD-316 and EZD-345; Josh 2026-11-06).
const sandboxSettings = path.join(root, 'scripts/unit-sandbox.json');
const ntModule = await import(path.join(vault, 'tools/next_ticket.mjs'));
const { weekSpend, questionsFingerprint, planQuestionRows, architectureEntry } = ntModule;
// EZD-369: a ledger tool without the strike exports (an older copy, a test stub) records no strikes.
const strikeExempt = ntModule.strikeExempt ?? (() => true);
const strikeVerdict = ntModule.strikeVerdict ?? (() => 'none');
const recordStrike = ntModule.recordStrike ?? (() => 0);
const STRIKE_LIMIT = ntModule.STRIKE_LIMIT ?? 3;
const assessmentPath = ntModule.assessmentPath ?? ((key) => path.join(vault, 'handoff', 'assessments', `${key}.md`));
const { createOAuthFallback } = await import('./oauth-usage.mjs');
const { readMeters, gateDecision, applyGates, waitForWindow, writeHold, overrideActive, writeWindowPause } = await import('./budget.mjs');
const { costEntry } = await import('./cost-log.mjs');
const {
  idleAction, repairDecision, parseVerdict, unitSubject, repairStopLine, fingerprint, codeFingerprint, writeLauncherState,
  isPhaseWide, LANE_POLL_MS, laneLimits, pickUnits, dbLaneFor, pauseFrom, statusRow, unitProgress, createGuards, guardAfterUnit,
  laneEnvFor, writeLease, removeLease, limitPause, neverRejects, repairForbidden, joshQuestion, REPAIR_NEVER_FILES, REPAIR_JOSH_FILES, AUTO_MERGE_ON_RE, PR_GREEN_OPEN_RE,
  quickEmpty, QUICK_PAUSE_MS, recordStart, startStopText,
  readAccounts, recoveredAccount, unitAuthEnv, signInVerdict, parseReset, accountSpend, pickAccount, readAccountState, restAccount, accountSignInText, accountsPausedText, ACCOUNT_REST_UNKNOWN_MS, SIGNIN_RECHECK_MS,
} = await import('./launcher-idle.mjs');
const { boostState, BOOST_UNIT_CAP_USD, turnOff: boostOff } = await import(path.join(vault, 'tools/boost.mjs'));
// Lanes (EZD-174): several units at once while vault/handoff/LANES.json is on.
const { lanesState, lanesFile, inProgressCount, turnOff: lanesOff } = await import(path.join(vault, 'tools/lanes.mjs'));

// Process v2.4 (Josh 2026-10-22): every orchestrator unit runs Sonnet 5.5 at medium effort with the Opus 5.5 advisor from
// .claude/settings.json advisorModel; plan and review-plans run as the Opus agent. Never change model or effort mid-session.
const MODELS = { orchestrator: 'claude-sonnet-5-5', planner: 'claude-opus-5-5', 'code-reviewer': 'claude-opus-5-5' };
const UNITS = {
  // unit: how it runs. `as` = the session runs as that agent (no orchestrator in front); effort per section 10.
  build: { skill: 'build-ticket', effort: 'medium', model: MODELS.orchestrator, turns: 150 },
  plan: { skill: 'plan-ticket', effort: 'high', model: MODELS.planner, turns: 60, as: 'planner' },
  'review-plans': { skill: 'review-plans', effort: 'high', model: MODELS['code-reviewer'], turns: 60, as: 'code-reviewer' },
  questions: { skill: 'questions', effort: 'medium', model: MODELS.orchestrator, turns: 80 },
  'gate-phase': { skill: 'gate-phase', effort: 'medium', model: MODELS.orchestrator, turns: 150 },
  wrap: { skill: 'wrap', effort: 'medium', model: MODELS.orchestrator, turns: 60 },
  // EZD-250 D12-D13: started only by the launcher, for a ledger failure, an agent-fixable wait or a failed phase PR CI gate.
  repair: { skill: 'repair', effort: 'medium', model: MODELS.orchestrator, turns: 80 },
};

const log = (msg) => console.log(`[run ${new Date().toISOString().slice(11, 19)}] ${msg}`);
function notify(msg) {
  // A dry run reports the message and sends nothing (EZD-155; Q-0291 (a)).
  if (dryRun) { log(`dry run: would notify: ${msg}`); return; }
  log(`NOTIFY: ${msg}`);
  if (!config.notify_cmd) return;
  const r = spawnSync('/bin/sh', ['-c', config.notify_cmd], { env: { ...process.env, MSG: `EZ Draft: ${msg}` }, encoding: 'utf8', timeout: 20000 });
  if (r.status !== 0) log(`notify command failed: ${(r.stderr || '').trim()}`);
}
const oauthFallback = createOAuthFallback({ notify, log });
const tool = (...a) => spawnSync(process.execPath, [path.join(vault, 'tools/next_ticket.mjs'), ...a], { encoding: 'utf8', cwd: root });
const git = (...a) => trustedGit(root, a);
const nowIso = () => new Date().toISOString();
const firstLine = (text) => String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
// What the launcher is doing, for the watchdog (EZD-250 D7). Never written in a dry run.
const setState = (patch) => { if (!dryRun) { try { writeLauncherState(logDir, patch); } catch (e) { log(`launcher state not written: ${e.message}`); } } };
// The next unit, with the poll recorded in the launcher state (D7).
function nextUnitText() {
  const next = tool('--next-unit').stdout.trim();
  setState({ next, polledAt: nowIso() });
  return next;
}

// Confirm the flags this launcher relies on against the installed CLI (PROCESS.md section 15). Unknown flags are dropped
// with a warning so a version change never makes every run fail at the parser.
let helpText = null;
function flagSupported(flag) {
  if (helpText === null) {
    const r = spawnSync(claudeBin, ['--help'], { encoding: 'utf8' });
    helpText = (r.stdout || '') + (r.stderr || '');
    if (!helpText.trim()) { console.error(`${claudeBin} --help printed nothing (not installed, or not on PATH). Set claude_bin in scripts/launcher.config.json.`); process.exit(1); }
  }
  return helpText.includes(flag);
}
const OPTIONAL_FLAGS = [['--permission-prompts', 'none']]; // sessions are persisted so a failed unit can be inspected with --resume

function budget() { return readJson(budgetPath, {}); }
function authMode() {
  const o = overrideActive(budget());
  if (o?.type === 'api-until-reset') return 'api';
  return config.auth_mode === 'api' ? 'api' : 'plan';
}

function buildCommand(unitName, arg) {
  const u = UNITS[unitName];
  const boost = boostState({ root }).active;
  const prompt = (config.prompt_style === 'ask')
    ? `Run the ${u.skill} skill for ${arg}. Follow it exactly and end the session when the unit is complete.`
    : `/${u.skill} ${arg}`;
  const cmd = [
    '-p', prompt,
    '--output-format', 'json',
    // Boost keeps the normal model and effort (Josh 2026-10-26); it changes only the hold and the cap.
    '--model', u.model,
    '--effort', u.effort,
    '--permission-mode', 'bypassPermissions',
    '--name', `${arg} ${unitName}`,
    '--settings', sandboxSettings,
  ];
  const b = budget();
  // Boost raises the per-unit cap to $80 (Josh 2026-10-24); never lowers a higher configured cap.
  const cap = boost ? Math.max(BOOST_UNIT_CAP_USD, b.per_unit_cap_usd_est || 0) : b.per_unit_cap_usd_est;
  if (cap) cmd.push('--max-budget-usd', String(cap));
  if (u.as) cmd.push('--agent', u.as);
  // --max-turns is not listed by every CLI version (absent in 2.1.302); the per-unit dollar cap is the hard stop either way.
  if (flagSupported('--max-turns')) cmd.push('--max-turns', String(config.max_turns?.[unitName] ?? u.turns));
  for (const f of OPTIONAL_FLAGS) if (flagSupported(f[0])) cmd.push(...f);
  if (Array.isArray(config.extra_args)) cmd.push(...config.extra_args);
  return cmd;
}

function parseResult(stdout) {
  // --output-format json prints one JSON object (the result). Tolerate leading noise.
  const i = stdout.indexOf('{');
  if (i < 0) return null;
  try { return JSON.parse(stdout.slice(i)); } catch {}
  // stream-ish fallback: last JSON line
  const lines = stdout.trim().split('\n').reverse();
  for (const l of lines) { try { const o = JSON.parse(l); if (o && typeof o === 'object') return o; } catch {} }
  return null;
}
function costOf(res) {
  const total = Number(res?.total_cost_usd ?? res?.cost_usd ?? 0) || 0;
  let fable = 0; const models = [];
  const mu = res?.modelUsage || res?.model_usage || {};
  for (const [m, v] of Object.entries(mu)) { models.push(m); if (/fable/i.test(m)) fable += Number(v?.costUSD ?? v?.cost_usd ?? 0) || 0; }
  return { total, fable, models };
}
function classifyLimit(text) {
  const m0 = matchLimit(text);
  if (!m0) return null;
  if (m0.documented) return { kind: m0.kind, until: m0.until, note: m0.text };
  if (!config.limit_formats_confirmed) return { kind: 'weekly', note: 'formats not yet confirmed (section 11): treated as weekly' };
  const m = text.match(/(?:resets?|try again|available)\s+(?:at|after|in)\s+([^\n.]+)/i);
  if (/5-hour|five-hour|session limit/i.test(text) || (m && !/week/i.test(text))) return { kind: 'five-hour', until: m ? m[1].trim() : null };
  return { kind: 'weekly' };
}
function parseWhen(s) {
  if (!s) return null;
  const t = Date.parse(s); if (!Number.isNaN(t)) return new Date(t);
  const m = s.match(/(\d{1,2})(?::(\d\d))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = Number(m[1]); const mm = Number(m[2] || 0); const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  const d = new Date(); d.setHours(h, mm, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1);
  return d;
}
// EZD-193 (Q-0299 (b)): the raw output of a run that ended on a limit error goes to its own file under vault/handoff/, and
// Josh is told its name, so the message formats can be read the first time they appear (PROCESS.md section 15 row 9).
// The file is git-ignored (.gitignore), and each stream is cut to its first and last LIMIT_TEXT_EDGE bytes after the key is
// redacted, so session output never reaches the public repository and one huge run cannot fill the disk or the log.
const LIMIT_TEXT_EDGE = 8192;
function capLimitText(s) {
  const b = Buffer.from(s, 'utf8');
  if (b.length <= 2 * LIMIT_TEXT_EDGE) return s;
  return `${b.subarray(0, LIMIT_TEXT_EDGE).toString('utf8')}\n--- cut ${b.length - 2 * LIMIT_TEXT_EDGE} of ${b.length} bytes ---\n${b.subarray(b.length - LIMIT_TEXT_EDGE).toString('utf8')}`;
}
function saveLimitText(unitName, arg, res, limit) {
  const rel = `vault/handoff/limit-error-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  const key = typeof config.api_key === 'string' ? config.api_key : '';
  const redact = (s) => (key ? s.split(key).join('<api_key>') : s);
  const keep = (s) => capLimitText(redact(s));
  const body = `unit: ${unitName} ${arg}\nexit: ${res.code}\nclassified: ${limit.kind}${limit.note ? ` (${limit.note})` : ''}\n\n--- stdout ---\n${keep(res.out)}\n--- stderr ---\n${keep(res.err)}\n`;
  try {
    mkdirSync(path.join(root, 'vault/handoff'), { recursive: true });
    writeFileSync(path.join(root, rel), body);
    notify(`limit error during ${unitName} ${arg}: raw text saved to ${rel}`);
  } catch (e) {
    log(`could not save the limit error text to ${rel} (${e.code || e.message}); the text follows:\n${body}`);
    notify(`limit error during ${unitName} ${arg}: raw text could not be saved; it is in the launcher log`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A build tables its ticket (blocked with a note); any other unit goes on the list next_ticket.mjs skips (.git/set-aside.json). Josh clears it.
// isNext: whether the unit would still run next (lanes: whether it is still offered).
function setAside(unitName, arg, next, isNext = () => nextUnitText() === next) {
  if (unitName === 'build') {
    const t = spawnSync(process.execPath, [path.join(root, 'scripts/unit-steps.mjs'), 'table', arg], { encoding: 'utf8', cwd: root, env: { ...process.env, EZD_RESULTS_FILE: '', EZD_RECORDS_WRITER: String(process.pid) } });
    return { ok: t.status === 0 && !isNext(), text: `${t.stdout ?? ''}${t.stderr ?? ''}`.trim().split('\n')[0] };
  }
  try {
    const file = path.join(root, '.git', 'set-aside.json');
    const list = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    writeFileSync(file, JSON.stringify([...new Set([...list, next])]) + '\n');
    return { ok: !isNext(), text: `SET ASIDE ${next}` }; // the same unit next would loop: only then does the launcher stop
  } catch (e) { return { ok: false, text: e.message }; }
}

const resultsFile = (dir, id) => path.join(dir, `${id}.results.jsonl`);

// Applies a unit's results file and the launcher's own ops (the cost row first) in one transaction, then re-exports the
// views. A file that fails is kept as .rejected, Josh is told, and the launcher's ops are applied on their own.
function applyUnit(file, ownOps) {
  const db = openRecords(dbPath());
  try {
    let queued = [];
    let problem = null;
    try { queued = readQueue(file); } catch (e) { problem = e.message; }
    if (!problem) {
      try { applyOps(db, [...ownOps, ...queued]); } catch (e) { problem = e.message; }
    }
    if (existsSync(file)) { try { renameSync(file, `${file}.${problem ? 'rejected' : 'applied'}`); } catch {} }
    if (problem) {
      log(`results not applied: ${problem}`);
      notify(`unit results not recorded (${problem}); kept as ${path.basename(file)}.rejected for you to look at`);
      try { applyOps(db, ownOps); } catch (e) { log(`launcher records not applied: ${e.message}`); }
    }
    refreshViews(db, vault);
  } finally { db.close(); }
  // Questions are sorted after the results are in (2.13; inside a unit the sort is deferred), then the reports regenerated.
  spawnSync(process.execPath, [path.join(vault, 'tools/next_ticket.mjs'), '--sort-questions'], { encoding: 'utf8', cwd: root, env: { ...process.env, EZD_RESULTS_FILE: '', EZD_RECORDS_WRITER: String(process.pid) } });
  tool('--report');
}

const handoffOp = (label, line) => ({ op: 'handoff', text: launcherHandoffText(label, line, nextUnitText()) });
// Records of the units that run as an agent (plan, review-plans), PROCESS.md section 10: { problem, ops }.
function agentUnitOps(unitName, arg, res) {
  const text = String(res?.result || '');
  if (unitName === 'plan') {
    const planRel = `vault/plans/${arg}.md`;
    const planPath = path.join(root, planRel);
    if (!existsSync(planPath)) return { problem: `plan file missing: ${planPath}`, ops: [] };
    const plan = readFileSync(planPath, 'utf8');
    const complexity = plan.match(/\*\*Complexity:\*\*\s*(low|medium|high)/i)?.[1]?.toLowerCase() || '';
    const oq = plan.match(/^## (?:10\. )?Open questions[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] || '';
    const db = openRecords(dbPath());
    let firstId;
    try {
      if (!db.prepare('select 1 from tickets where id = ?').get(arg)) return { problem: `no STATUS.md row for ${arg}`, ops: [] };
      firstId = nextQuestionId(db, null, queueDirs(root));
    } finally { db.close(); }
    // EZD-244: the plan's Architecture line for tickets.json; a failure records nothing more. The entry and the plan's text
    // and hash wait in the records database for the ticket's feat commit (D9 (a), 2026-11-02).
    const archRes = architectureEntry(arg);
    if (!archRes.ok) return { problem: archRes.message, ops: [] };
    const q = /\bQP-\d+/.test(oq) ? planQuestionRows(arg, firstId) : { ids: [], rows: [] };
    if (q.ids.length) writeFileAtomic(root, planPath, q.planText);
    const planOp = { op: 'plan', ticket: arg, text: q.ids.length ? q.planText : plan, entry: archRes.entry ?? null };
    const status = q.ids.length ? 'questions' : 'planned';
    const line = `Planned ${arg}: status ${status}, complexity ${complexity || '(none in plan header)'}${q.ids.length ? `; open questions ${q.ids.join(', ')}` : ''}.`;
    return { problem: null, ops: [...q.rows.map((row) => ({ op: 'question', row })), planOp, { op: 'status', ticket: arg, changes: { status, complexity } }, handoffOp(`plan ${arg}`, line)] };
  }
  if (unitName === 'review-plans') {
    const out = path.join(vault, 'plans', `review-phase-${String(arg).padStart(2, '0')}.md`);
    writeFileAtomic(root, out, `# Plan review · phase ${arg}\n\nWritten by the launcher from the code-reviewer's final report (${new Date().toISOString()}).\n\n${text.trim()}\n`);
    return { problem: null, ops: [handoffOp(`review-plans ${arg}`, `Plan review written to ${path.relative(root, out)}.`)] };
  }
  return { problem: null, ops: [] };
}
// Escalated rows, for one notification per new escalation after a questions unit (Q-0129).
function escalatedRows() {
  const out = new Map();
  for (const l of readFileSync(path.join(vault, 'questions/QUESTIONS.md'), 'utf8').split('\n')) {
    const c = l.split('|').map((x) => x.trim());
    if (/^Q-\d{4}$/.test(c[1] || '') && c[5] === 'escalated') out.set(c[1], `${c[2]}: ${c[4]}`);
  }
  return out;
}


// laneEnv: a lane build's database lane environment; lease: its database lane, held by the unit's pid while it runs (EZD-174).
async function runUnit(unitName, arg, meterSource = null, { env: laneEnv = {}, lease = 0, account = null } = {}) {
  const cmd = buildCommand(unitName, arg);
  const mode = authMode();
  if (mode === 'api' && !config.api_key) return { outcome: 'error', note: 'auth_mode api but no api_key in launcher.config.json' };
  // EZD-378 D-Env: no unit's environment carries a sign-in override (AUTH_OVERRIDE_VARS, CLAUDE_CONFIG_DIR); plan auth gets
  // the chosen account's folder, api mode gets the key. A stray key in the shell would silently move the spend.
  // The scrub is set in api mode only (PROCESS.md section 11, Auth mode). Claude Code 2.1.303 forces the permission
  // mode to default whenever it is set, and with --permission-prompts none every write is then denied (2026-10-19 loop).
  const env = unitAuthEnv(process.env, { mode, account: mode === 'api' ? null : account, apiKey: config.api_key });
  delete env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB;
  // A -p session stops background subagents 10 minutes after its last turn ("Background tasks still running 10m after the
  // last turn"), which killed the EZD-017 and EZD-018 builders on 2026-10-22. 0 = wait for them indefinitely.
  // EZD-364: a run_in_background command is also stopped at BASH_MAX_TIMEOUT_MS (default 10 minutes), which cut gate-phase 4's
  // full gate mid e2e on 2026-11-09 and left its app server on the port; units get 2 hours (scripts/launcher/unit-env.mjs).
  Object.assign(env, UNIT_ENV_LIMITS);
  if (mode === 'api') env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = '1';
  const used = mode === 'api' ? null : account;
  const accountId = mode === 'api' ? 'api' : (account?.id ?? 'default');
  Object.assign(env, laneEnv);
  const sessionId = flagSupported('--session-id') ? randomUUID() : null;
  if (sessionId) cmd.push('--session-id', sessionId);
  if (!existsSync(sandboxSettings)) return { outcome: 'error', note: 'scripts/unit-sandbox.json missing: no unit starts unsandboxed' };
  log(`sandboxed start (scripts/unit-sandbox.json): ${unitName} ${arg}`);
  if (used) log(`${unitName} ${arg} on account ${used.id}`);
  log(`${unitName} ${arg}: ${claudeBin} ${cmd.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`);
  if (dryRun) return { outcome: 'dry-run' };
  const started = Date.now();
  const processRev = git('rev-parse', '--short', 'HEAD').stdout.trim() || null;
  // One in-flight record per unit (EZD-173 C6); the session's commands see their own id in EZD_UNIT_ID.
  const id = unitId(unitName, arg);
  const dir = inflightDir({ root });
  env.EZD_UNIT_ID = id;
  const results = resultsFile(dir, id);
  env.EZD_RESULTS_FILE = results;
  delete env.EZD_RECORDS_WRITER;
  try { writeInflight(dir, { id, pid: process.pid, unit: unitName, ticket: arg, skill: UNITS[unitName].skill, session_id: sessionId, startedMs: started, auth: mode, account: accountId, configDir: used?.path ?? null, meterSource, processRev }); } catch {}
  const qBefore = unitName === 'questions' ? { fp: questionsFingerprint(Number(arg)), esc: escalatedRows() } : null;
  if (lease) writeLease(lease, process.pid);
  const res = await new Promise((resolve) => {
    const done = (r) => { if (lease) removeLease(lease); resolve(r); };
    const child = spawn(claudeBin, cmd, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    if (lease && child.pid) writeLease(lease, child.pid);
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; process.stderr.write(d); });
    child.on('close', (code) => done({ code, out, err }));
    child.on('error', (e) => done({ code: -1, out, err: String(e) }));
  });
  const endedMs = Date.now();
  const parsed = parseResult(res.out);
  const { total, fable, models } = costOf(parsed);
  const text = `${parsed?.result || ''}\n${res.err}`;
  // A limit is only looked for in a failed run (2026-10-19: a successful report that mentioned "usage limit" was
  // misread as limit-weekly and wrote a hold after EZD-000 had merged).
  const limit = (res.code !== 0 || parsed?.is_error) ? classifyLimit(text) : null;
  const outcome = limit ? `limit-${limit.kind}` : (res.code === 0 && !parsed?.is_error ? 'ok' : `error${parsed?.subtype ? `:${parsed.subtype}` : ''}`);
  if (!parsed) log(`no JSON result parsed (exit ${res.code}); raw tail: ${res.out.slice(-400).replace(/\n/g, ' ')}`);
  else log(`${unitName} ${arg} → ${outcome}; est $${total.toFixed(2)}${fable ? ` (Fable $${fable.toFixed(2)})` : ''}; turns ${parsed.num_turns ?? '?'}`);
  if (limit) saveLimitText(unitName, arg, res, limit);
  const cost = { op: 'cost', entry: costEntry({ ts: new Date().toISOString(), unit: unitName, ticket: arg, models, total, fable, outcome, parsed, startedMs: started, endedMs: Date.now(), auth: mode, account: accountId, meterSource, processRev }) };
  // A plan problem records nothing more, but the cost row is still recorded (C13). Under the ledger lock, so a Q-ID given
  // here and a unit's `ledger.mjs question` never collide (EZD-174); a lock that stays busy is logged, never waited out.
  const record = () => {
    const a = outcome === 'ok' && UNITS[unitName].as ? agentUnitOps(unitName, arg, parsed) : { problem: null, ops: [] };
    applyUnit(results, [cost, ...a.ops]);
    return a;
  };
  let agent;
  try { agent = withLedgerLock(root, { owner: `launcher apply ${id}`, timeoutMs: config.apply_lock_ms ?? 120000 }, record); } catch (e) {
    if (!(e instanceof LockError)) throw e;
    log(`results applied without the ledger lock: ${e.message}`);
    agent = record();
  }
  removeInflight(dir, id);
  // Q-0129: the fingerprints feed the loop guard in next_ticket.mjs.
  if (qBefore) writeFileAtomic(root, path.join(vault, 'handoff/.questions-last-run.json'), JSON.stringify({ phase: Number(arg), scope: 'phase', before: qBefore.fp, after: questionsFingerprint(Number(arg)), ts: new Date().toISOString() }) + '\n');
  const problem = agent.problem;
  if (problem) { log(problem); return { outcome: 'error', note: problem, limit, wallMs: endedMs - started, usd: total, turns: parsed?.num_turns ?? null, account: used }; }
  // Q-0129: one notification per newly escalated question.
  if (qBefore) for (const [qid, text] of escalatedRows()) if (!qBefore.esc.has(qid)) notify(`question for Josh: ${qid} (${text.slice(0, 300)}). vault/questions/phase-${String(arg).padStart(2, '0')}-for-josh.md`);
  return { outcome, limit, parsed, wallMs: endedMs - started, usd: total, turns: parsed?.num_turns ?? null, account: used };
}

// A unit whose launcher died before its cost row (its in-flight record still there, its pid dead): price its transcripts
// with the cost tool's rates and append one row with outcome "interrupted", then tell Josh. The unit itself is picked up
// again by the next --next-unit (an in-progress build resumes; unit-steps.mjs finishes an interrupted merge). Records of
// launchers still running are left alone; the single inflight.json of earlier launchers is recovered the same way.
async function recoverInflight() {
  const dir = inflightDir({ root });
  const found = listInflight(dir).filter((r) => !r.alive).map((r) => ({ rec: r, remove: () => removeInflight(dir, r.id) }));
  if (existsSync(legacyInflightFile)) {
    const remove = () => { try { unlinkSync(legacyInflightFile); } catch {} };
    let rec = null;
    try { rec = JSON.parse(readFileSync(legacyInflightFile, 'utf8')); } catch {}
    found.push({ rec: rec && typeof rec === 'object' ? rec : { unreadable: true }, remove });
  }
  for (const { rec, remove } of found) {
    if (rec.unreadable) { remove(); continue; }
    await recoverOne(rec, remove);
  }
}
async function recoverOne(f, remove) {
  const ra = recoveredAccount(f, readAccounts(root).accounts ?? []);
  let est = 0, fable = 0, models = new Set(), sessionId = f.session_id, last = f.startedMs;
  try {
    const u = await import(path.join(vault, 'tools/usage-by-agent.mjs'));
    const dir = u.projectsDirFor(root, ra.configDir);
    if (!sessionId && existsSync(dir)) {
      // No --session-id on this CLI: the newest transcript started after the unit whose opening prompt names it.
      const want = `/${f.skill} ${f.ticket}`;
      const hit = readdirSync(dir).filter((n) => n.endsWith('.jsonl')).map((n) => path.join(dir, n))
        .filter((p) => statSync(p).mtimeMs >= f.startedMs && readFileSync(p, 'utf8').slice(0, 20000).includes(want))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
      if (hit) sessionId = path.basename(hit, '.jsonl');
    }
    for (const { file } of (sessionId && u.sessionFiles(dir, sessionId)) || []) {
      last = Math.max(last, statSync(file).mtimeMs);
      for (const m of u.readTranscript(file).messages) {
        const { usd } = u.priceUsage(m.model, m.usage);
        est += usd; models.add(m.model);
        if (/fable/i.test(m.model)) fable += usd;
      }
    }
  } catch (e) { log(`interrupted unit: could not price its transcripts (${e.message})`); }
  // The dead unit's results file is applied with its cost row, so a unit killed after its squash still lands done (2.12).
  const entry = JSON.parse(JSON.stringify({ ts: new Date().toISOString(), unit: f.unit, ticket: f.ticket, models: [...models], est_usd: est, fable_est_usd: fable, outcome: 'interrupted', session_id: sessionId || undefined, num_turns: null, duration_ms: last - f.startedMs, auth: f.auth, account: ra.account, wall_ms: last - f.startedMs, meter_source: f.meterSource, process_rev: f.processRev }));
  applyUnit(resultsFile(inflightDir({ root }), f.id || unitId(f.unit, f.ticket)), [{ op: 'cost', entry }]);
  remove();
  log(`previous launcher stopped during ${f.unit} ${f.ticket}; cost row written (est ${est.toFixed(2)}); resuming`);
  notify(`launcher restarted after it stopped during ${f.unit} ${f.ticket}; resuming`);
}

// EZD-250 D10a: queued ledger edits (vault/tools/ledger-queue.mjs) are applied between units, on develop only. A failure is
// logged and sent once per distinct line, never a stop; the branches stay and the next pass retries.
let queueFailure = null;
const rejectedSent = new Set();
function applyQueuedEdits() {
  if (git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim() !== 'develop') return;
  const script = path.join(vault, 'tools/ledger-queue.mjs');
  let line = null;
  let res = null;
  if (!existsSync(script)) line = 'ledger-queue.mjs not found';
  else {
    const r = spawnSync(process.execPath, [script, 'apply'], { encoding: 'utf8', cwd: root });
    if (r.status !== 0) line = firstLine(r.stderr) || `exit ${r.status}`;
    else {
      try { res = JSON.parse(r.stdout); } catch {}
      if (!res || typeof res !== 'object') line = 'output unreadable';
    }
  }
  if (line) {
    if (line !== queueFailure) {
      log(`queue apply failed: ${line}`);
      if (line !== 'ledger-queue.mjs not found') notify(`queued ledger edits not applied: ${line}. They stay on their queue/ branches; the launcher retries each pass.`);
      queueFailure = line;
    }
    return;
  }
  queueFailure = null;
  for (const name of res.applied ?? []) log(`queue: applied ${name}`);
  for (const { name, reason } of res.rejected ?? []) {
    if (rejectedSent.has(name)) continue;
    rejectedSent.add(name);
    notify(`queued ledger edit ${name} not applied (${reason}); kept as branch queue-rejected/${name}.`);
  }
}

// EZD-250 D9: the launcher's code changed (a merge): restart in place, same pid, so launchd and the watchdog see one process.
function restartIfCodeChanged(atStart) {
  const now = codeFingerprint(root);
  if (now.hash === atStart.hash) return;
  const changed = [...new Set([...Object.keys(atStart.files), ...Object.keys(now.files)])].filter((k) => atStart.files[k] !== now.files[k]).sort();
  log(`launcher code changed (${changed.join(', ')}); restarting`);
  setState({ state: 'restarting', at: nowIso() });
  if (typeof process.execve !== 'function') { log('cannot restart in place; exiting for launchd'); process.exit(75); }
  process.execve(process.execPath, [process.execPath, ...process.execArgv, fileURLToPath(import.meta.url), ...args], { ...process.env, EZD_LAUNCHER_RESTARTED: '1' });
}

// EZD-250 D13: the repair unit's brief.
function writeRepairBrief({ kind, fp, next }) {
  const chk = tool('--check');
  writeFileSync(path.join(vault, 'handoff/REPAIR.md'), `# Repair · ${nowIso()}\n- Trigger: ${kind}\n- Fingerprint: ${fp}\n- Reason: ${next}\n\n## Ledger check output\n\`\`\`\n${(chk.stdout || '').trimEnd()}\n\`\`\`\n`);
}

// EZD-333 (decision 2026-11-05 "Overseer repair unit"): the repair unit may open fix mode, so after it the launcher checks every
// file it changed against the hard limits (guard-paths sees only Edit and Write; a shell command can write too), undoes a repair
// that touched one, closes a fix mode the repair left open and writes one line per repair to the overseer log for Josh.
const fixFile = path.join(vault, 'handoff/LAUNCHER_FIX.md');
const probeFile = path.join(vault, 'handoff/REPAIR_PROBE.md');
const overseerLog = path.join(vault, 'handoff/overseer-log.md');
const shortSha = (s) => String(s).slice(0, 8);
const headSha = () => git('rev-parse', '-q', '--verify', 'HEAD').stdout.trim();
const originSha = () => git('rev-parse', '-q', '--verify', 'refs/remotes/origin/develop').stdout.trim();
// Changed and untracked files, one by one (-z: no quoting; a rename lists both paths).
function changedFiles() {
  const parts = (git('status', '--porcelain', '-z', '--untracked-files=all').stdout || '').split('\0');
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e) continue;
    files.push(e.slice(3));
    if (/^[RC]/.test(e)) files.push(parts[++i]);
  }
  return files.filter(Boolean);
}
const blobOf = (rel) => (existsSync(path.join(root, rel)) ? git('hash-object', '--no-filters', '--', rel).stdout.trim() : 'absent');
// -w keeps the content in the object store, so a file dirty before the repair (or ignored by git) can be put back exactly.
const saveBlob = (rel) => (existsSync(path.join(root, rel)) ? git('hash-object', '-w', '--no-filters', '--', rel).stdout.trim() : 'absent');
const blobAt = (rev, rel) => { const r = git('rev-parse', '-q', '--verify', `${rev}:${rel}`); return r.status === 0 ? r.stdout.trim() : 'absent'; };
// Files the check watches: the hard limits, plus the files that may hold Josh's own edits (his local settings, the Josh-only
// files). A change to one of Josh's is never overwritten: the launcher stops instead (code review round 2).
const watched = (f) => repairForbidden(f) !== null || REPAIR_JOSH_FILES.includes(f);
// What each watched file looked like before the repair: every named one (ignored ones too, such as .claude/settings.local.json)
// and every one already changed, saved with -w; any other one is as the last commit had it.
function repairSnapshot() {
  const saved = new Map();
  for (const f of [...REPAIR_NEVER_FILES, ...REPAIR_JOSH_FILES, ...changedFiles().filter(watched)]) saved.set(f, saveBlob(f));
  return { head: headSha(), origin: originSha(), saved, fixBefore: existsSync(fixFile) };
}
const targetOf = (snap, f) => (snap.saved.has(f) ? snap.saved.get(f) : blobAt(snap.head, f));
function repairChanges(snap, fp) {
  const head = headSha();
  const commits = [];
  if (head && head !== snap.head) {
    // Newest first; --no-renames lists both sides of a move, so a guard moved to an unlisted name still counts (code review 1).
    for (const sha of git('rev-list', `${snap.head}..${head}`).stdout.split('\n').filter(Boolean)) {
      const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', '-m', '--no-renames', '-z', sha).stdout.split('\0').filter(Boolean);
      const parents = git('rev-list', '--parents', '-n', '1', sha).stdout.trim().split(' ').length - 1;
      commits.push({ sha, subject: git('log', '-1', '--format=%s', sha).stdout.trim(), merge: parents > 1, forbidden: files.filter(watched) });
    }
  }
  const committed = [...new Set(commits.flatMap((c) => c.forbidden))];
  const files = head && head !== snap.head ? git('diff', '--name-only', '--no-renames', '-z', `${snap.head}..${head}`).stdout.split('\0').filter(Boolean) : [];
  const watch = [...new Set([...snap.saved.keys(), ...committed, ...changedFiles().filter(watched)])].sort();
  const origin = originSha();
  const originAway = origin !== snap.origin && origin !== '' && git('merge-base', '--is-ancestor', origin, head).status !== 0;
  // A hard-limit change pushed to origin/develop counts even when the checkout's HEAD no longer has it (security re-review 1).
  const pushed = origin !== snap.origin && origin !== '' && snap.origin !== ''
    ? git('diff', '--name-only', '--no-renames', '-z', `${snap.origin}..${origin}`).stdout.split('\0').filter((f) => f && watched(f)) : [];
  const bad = [...new Set([...committed, ...(originAway ? pushed : []), ...watch.filter((f) => blobOf(f) !== targetOf(snap, f))])].sort();
  // A fix file opened during the repair that does not name it is someone else's (skill step 4.2: `Repair: <fingerprint>`).
  let fixOther = false;
  if (!snap.fixBefore && existsSync(fixFile)) {
    let text = '';
    try { text = readFileSync(fixFile, 'utf8'); } catch {}
    fixOther = !text.split('\n').some((l) => l.trim() === `Repair: ${fp}`);
  }
  return { head, commits, files, watch, bad, originAway, fixOther };
}
// Undo a refused repair: the repair's own hard-limit commits reverted (pushed when it had pushed), then every hard-limit file put
// back as it was before the repair, each overwritten copy kept in the object store and named in the log. What may not be the
// repair's (an interactive fix open before or opened during it, a commit without the `fix(repair):` subject, a merge, origin moved
// elsewhere, a change to one of Josh's files) is not undone: the launcher stops instead, so nobody's work is lost (code review 4, round 2).
function undoRepair(snap, ch) {
  const problems = [];
  const kept = [];
  if (snap.fixBefore) problems.push('an interactive fix was open, so the change may be its own');
  if (ch.fixOther) problems.push('an interactive fix was opened during the repair, so the change may be its own');
  for (const f of ch.bad) if (REPAIR_JOSH_FILES.includes(f)) problems.push(`${f} may hold Josh's own edit`);
  for (const c of ch.commits) {
    if (c.forbidden.length && (c.merge || !/^fix\(repair\):/.test(c.subject))) problems.push(`commit ${shortSha(c.sha)} "${c.subject}" is not the repair's`);
  }
  if (ch.originAway) problems.push('origin/develop moved to a commit the checkout does not have');
  if (problems.length) return { problems, kept };
  const keep = (f) => { const b = saveBlob(f); if (b !== 'absent') kept.push(`${f} kept as ${b}`); };
  // A tracked hard-limit file changed since the last commit goes back to it first, so the revert applies.
  for (const f of changedFiles().filter(watched)) if (blobAt('HEAD', f) !== 'absent') { keep(f); git('restore', '--source=HEAD', '--staged', '--worktree', '--', f); }
  const own = ch.commits.filter((c) => c.forbidden.length);
  for (const c of own) {
    const rv = git('revert', '--no-edit', c.sha);
    if (rv.status !== 0) { git('revert', '--abort'); problems.push(`git revert ${shortSha(c.sha)} failed: ${(rv.stderr || rv.stdout).trim().split('\n')[0]}`); break; }
  }
  if (!problems.length && own.length && originSha() !== snap.origin) {
    const p = git('push', 'origin', 'refs/heads/develop:refs/heads/develop');
    if (p.status !== 0) problems.push(`the revert was not pushed: ${(p.stderr || '').trim().split('\n')[0]}`);
  }
  for (const f of ch.watch) {
    const want = targetOf(snap, f);
    if (blobOf(f) === want) continue;
    const abs = path.join(root, f);
    if (!kept.some((k) => k.startsWith(`${f} kept as `))) keep(f);
    if (want === 'absent') { git('rm', '-q', '--cached', '--ignore-unmatch', '--', f); try { unlinkSync(abs); } catch {} continue; }
    const body = trustedGit(root, ['cat-file', 'blob', want], { encoding: 'buffer' });
    if (body.status !== 0) { problems.push(`${f}: saved copy not readable`); continue; }
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body.stdout);
    if (blobAt('HEAD', f) !== 'absent') git('restore', '--staged', '--', f);
  }
  const left = ch.watch.filter((f) => blobOf(f) !== targetOf(snap, f));
  if (left.length) problems.push(`still changed: ${left.join(', ')}`);
  return { problems, kept };
}
function overseerAppend(text) {
  try {
    if (!existsSync(overseerLog)) writeFileSync(overseerLog, '# Overseer log\n\nOne line per repair the launcher ran (EZD-333; decision 2026-11-05). Read at the daily check-in.\n\n');
    appendFileSync(overseerLog, `- ${nowIso()} ${String(text).replace(/\s*\n\s*/g, ' ')}\n`);
  } catch (e) { log(`overseer log not written: ${e.message}`); }
}

async function main() {
  if (statusOnly) {
    const b = budget(); const s = weekSpend(b); const m = await readMeters({ budget: b });
    console.log(`Config: ${existsSync(path.join(root, 'scripts/launcher.config.json')) ? 'scripts/launcher.config.json found' : 'no launcher config (notify off, plan auth)'}; auth ${authMode()}; notify ${config.notify_cmd ? 'set' : 'not set'}`);
    console.log(`Budget: ${s.text}`);
    console.log(`Meters (${m.source}): five-hour ${m.five_hour ? Math.round(m.five_hour.pct) + '%' : 'no meter'} · weekly ${m.seven_day ? Math.round(m.seven_day.pct) + '%' : 'no meter'} · Fable ${m.fable_seven_day ? Math.round(m.fable_seven_day.pct) + '%' : 'no meter'}`);
    console.log(`Hold file: ${existsSync(holdFile) ? 'present' : 'none'}; STOP: ${existsSync(stopFile) ? 'present' : 'none'}`);
    console.log(`Next unit: ${tool('--next-unit').stdout.trim()}`);
    for (const f of [...OPTIONAL_FLAGS, ['--max-turns'], ['--max-budget-usd'], ['--effort'], ['--agent'], ['--permission-mode']]) console.log(`flag ${f[0]}: ${flagSupported(f[0]) ? 'supported' : 'not in claude --help (dropped)'}`);
    return;
  }
  if (!dryRun) {
    // One launcher at a time (REMEDIATION-PLAN 2.4): a second one would run a second build on the shared local database.
    const lock = takeLauncherLock(logDir);
    if (!lock.ok) { console.error(`another launcher is running (pid ${lock.pid ?? 'unknown'}); one build at a time until H1 and EZD-172 land`); process.exit(1); }
  }
  if (process.platform === 'darwin' && !dryRun && process.env.EZD_LAUNCHER_RESTARTED !== '1') {
    // Keep the Mac awake for the life of the launcher (PROCESS.md section 10, "Keeping the machine running"). A restart in
    // place (D9) keeps the pid, so the first caffeinate still watches it.
    try { const c = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true }); c.unref(); } catch {}
  }
  // EZD-378 D-Run2: the accounts file is read once at start; a bad file stops the launcher before any unit starts.
  const accounts = readAccounts(root);
  if (accounts.problem) { const t = `launcher stopped: scripts/launcher-accounts.json: ${accounts.problem}`; log(t); notify(t); return; }
  if (accounts.on) log(`accounts: ${accounts.accounts.map((a) => `${a.id} (${a.dir})`).join(', ')}`);
  const signedIn = new Set();
  const blocked = {};
  const signInNoticed = new Set();
  let accountPauseNoticed = false;
  const costLines = () => {
    let db = null;
    try {
      db = openRecords(dbPath());
      return db.prepare('select line from cost').all().map((r) => r.line);
    } catch (e) {
      log(`account spend not read: ${e.message}`);
      return [];
    } finally {
      try { db?.close(); } catch {}
    }
  };
  // D-Check: `claude auth status` in the unit's own environment, before the first unit on an account in this process.
  const checkSignIn = (account) => {
    const r = spawnSync(claudeBin, ['auth', 'status'], { cwd: root, env: unitAuthEnv(process.env, { mode: 'plan', account }), encoding: 'utf8', timeout: 30000 });
    return signInVerdict({ status: r.status, stdout: r.stdout ?? '', error: r.error }, account);
  };
  // D-Run3: the account for the next unit; off without the accounts file or in api mode.
  const chooseAccount = (running = {}) => {
    if (!accounts.on || authMode() === 'api') return { off: true, account: null };
    for (;;) {
      const now = Date.now();
      const pick = pickAccount({ accounts: accounts.accounts, state: readAccountState(logDir), spend: accountSpend(costLines(), now), running, blocked, now });
      if (!pick.account || dryRun || signedIn.has(pick.account.id)) return pick;
      const v = checkSignIn(pick.account);
      if (v.ok) {
        signedIn.add(pick.account.id);
        delete blocked[pick.account.id];
        signInNoticed.delete(pick.account.id);
        return pick;
      }
      blocked[pick.account.id] = now + SIGNIN_RECHECK_MS;
      const t = accountSignInText(pick.account, v.why);
      log(t);
      if (!signInNoticed.has(pick.account.id)) { notify(t); signInNoticed.add(pick.account.id); }
    }
  };
  if (!dryRun) await recoverInflight();
  // EZD-250 D8: the continuous run also restarts on new code, applies queued ledger edits and repairs.
  const continuous = !once && !dryRun;
  const codeAtStart = codeFingerprint(root);
  const repairStateFile = path.join(logDir, 'repair-state.json');
  let repairs = 0; // repair units since the last runnable next unit (D12)
  let noProgress = 0;
  let tabled = 0; // builds tabled in a row by the no-progress guard
  const statusHash = () => createHash('sha256').update(readFileSync(path.join(vault, 'tickets/STATUS.md'))).digest('hex');
  let waiting = null; // the reason the launcher is idle, so it logs and notifies once per reason (Q-0233)
  let failedWait = null; // the next-unit text a failed repair was started for; the same wait keeps state repair-failed (D7)
  const prActionTried = new Set(); // EZD-336: PR wait texts the launcher already tried to clear
  // Lanes (EZD-174): the running units (`<unit> <arg>` → { unit, arg, dbLane, resume, before, task }), the per-key guards,
  // why the launcher stops once they end, and when a pause after three set-asides ends.
  const running = new Map();
  const guards = createGuards();
  let stopping = null;
  let asideUntil = 0;
  let quickUntil = 0;
  const quickPauseMs = config.quick_pause_ms ?? QUICK_PAUSE_MS;
  let lastMeters = null;
  const statusText = () => { try { return readFileSync(path.join(vault, 'tickets/STATUS.md'), 'utf8'); } catch { return ''; } };
  // EZD-369: after every unit except a stop that is not its fault (strikeExempt), one strike verdict for its key; at the third
  // strike next_ticket.mjs holds the key until an assessment covers it, whatever set-aside.json or STATUS say.
  const strikeVerdictFor = ({ unit, arg, outcome, progress }) => {
    const statusAfter = statusRow(statusText(), arg).split('|')[4]?.trim() ?? '';
    const gateRecord = unit === 'gate-phase' && existsSync(path.join(vault, 'tickets/gates', `phase-${String(arg).padStart(2, '0')}.md`));
    return strikeVerdict({ unit, outcome, progress, statusAfter, gateRecord });
  };
  const strikeLog = (key, verdict, count) => {
    if (verdict !== 'strike' || count < STRIKE_LIMIT) return;
    log(`STRIKE ${count} ${key}: held for an assessment (${path.relative(root, assessmentPath(key))})`);
    if (count === STRIKE_LIMIT) notify(`${key} failed ${count} times and is held until it is fully assessed (${path.relative(root, assessmentPath(key))}); the launcher goes on with other work.`);
  };
  const nextUnitsCall = () => {
    const skip = [...running.values()].map((u) => u.arg);
    const r = tool('--next-units', ...(skip.length ? ['--skip', skip.join(',')] : []));
    let parsed = null;
    try { parsed = JSON.parse(r.stdout); } catch {}
    const ok = r.status === 0 && parsed && typeof parsed === 'object' && Array.isArray(parsed.units)
      && parsed.units.every((u) => u && Object.hasOwn(UNITS, u.unit) && typeof u.arg === 'string');
    return ok ? { ok, units: parsed.units, none: parsed.none ?? null } : { ok, line: firstLine(r.stderr) || firstLine(r.stdout) || `exit ${r.status}` };
  };
  // After a lane unit (synchronous; running already without it).
  const afterUnit = (key, u, before, r) => {
    const now = Date.now();
    if (quickEmpty(r)) {
      quickUntil = Math.max(quickUntil, Date.now() + quickPauseMs);
      log(`quick empty unit ${key}: ${r.wallMs} ms, $${r.usd.toFixed(2)}, ${r.turns ?? 0} turns; no unit starts until ${new Date(quickUntil).toISOString()}`);
    }
    // EZD-378 D-Run9: a limit on an account rests only that account; no hold, wait, ledger check, strike or guard.
    if (r.account && r.outcome.startsWith('limit-')) {
      const until = parseReset(r.limit.until, Date.now()) ?? Date.now() + ACCOUNT_REST_UNKNOWN_MS;
      try {
        restAccount(logDir, r.account.id, until, r.limit.note ?? r.outcome);
        log(`account ${r.account.id} hit a ${r.limit.kind} limit during ${key}; resting until ${new Date(until).toISOString()}; the next unit goes to another account`);
      } catch (e) {
        const t = `launcher stopped: account state not written (${e.message})`;
        log(t);
        notify(t);
        stopping = t;
      }
    } else if (r.outcome === 'limit-five-hour') {
      const pause = limitPause({ limit: { until: parseWhen(r.limit.until)?.toISOString() ?? null }, now });
      const held = existsSync(windowPauseFile) ? Date.parse(readFileSync(windowPauseFile, 'utf8').match(/^- Resume at: (.+)$/m)?.[1]?.trim()) : NaN;
      if (!(held > Date.parse(pause.resume_at))) writeWindowPause({ now: new Date(now), pause });
      log(`five-hour limit during ${key}; no unit starts in any lane until ${pause.resume_at}`);
    } else if (r.outcome === 'limit-weekly') {
      if (!existsSync(holdFile)) {
        writeHold({ reason: `plan limit error (${r.limit.note || 'weekly'})`, meters: lastMeters, budget: budget(), nextUnit: key });
        notify(`plan limit reached during ${key}. Hold written; override with budget.mjs or wait for the weekly reset.`);
      }
      stopping = `plan limit reached during ${key}`;
    } else {
      const chk = tool('--check');
      if (chk.status !== 0) log(`ledger check failed:\n${chk.stdout}`);
      if (r.outcome !== 'ok') writeFileSync(failureFile, JSON.stringify({ ts: nowIso(), unit: key, outcome: r.outcome, note: r.note || r.parsed?.result?.slice?.(0, 500) }, null, 2));
      // A failed call counts the unit as still offered (no progress); the next pass's own call stops the launcher.
      const offeredKeys = () => {
        const n = nextUnitsCall();
        if (n.ok) return n.units.map((x) => `${x.unit} ${x.arg}`);
        log(`--next-units failed after ${key}: ${n.line}`);
        return [key];
      };
      const progress = unitProgress({ key, before, after: statusRow(statusText(), u.arg), offeredAfter: offeredKeys() });
      const strikeNote = r.note || r.parsed?.result;
      if (!strikeExempt({ outcome: r.outcome, note: strikeNote })) {
        const verdict = strikeVerdictFor({ unit: u.unit, arg: u.arg, outcome: r.outcome, progress });
        strikeLog(key, verdict, recordStrike(key, verdict, { outcome: r.outcome, note: strikeNote }));
      }
      const g = guardAfterUnit(guards, { key, outcome: r.outcome, progress });
      if (g.action === 'aside') {
        const aside = setAside(u.unit, u.arg, key, () => offeredKeys().includes(key));
        if (aside.ok) {
          log(aside.text);
          notify(`${key} set aside until Josh is back, after ${g.why}; the launcher goes on with other work.`);
          if (g.pause) { log('three set aside in a row; no new unit starts for a while'); asideUntil = Date.now() + (config.aside_pause_ms ?? 1800000); }
        } else {
          log(`set aside ${key} failed: ${aside.text}`);
          notify(g.stopText);
          stopping = g.stopText;
        }
      }
    }
    if (!running.size) setState({ state: 'after-unit', at: nowIso() });
  };
  // Starts ticket units side by side; never returns while one runs. 'exit' ends the launcher, 'sequential' hands the
  // pass to the one-unit-at-a-time loop below (STOP, pause, none, repair, phase-wide units, the code restart).
  const laneLoop = async () => {
    let codeLogged = false;
    let lastReason = null;
    for (;;) {
      const now = Date.now();
      const drained = running.size === 0;
      let go = true;
      let limits = null;
      if (stopping) { if (drained) { log(stopping); return 'exit'; } go = false; }
      if (go) {
        const st = lanesState({ root });
        if (!st.on) { if (drained) return 'sequential'; go = false; } else limits = laneLimits(st);
      }
      if (go && continuous && codeFingerprint(root).hash !== codeAtStart.hash) {
        if (!codeLogged) { log(`launcher code changed; waiting for ${running.size} running units`); codeLogged = true; }
        if (drained) return 'sequential';
        go = false;
      }
      if (go && existsSync(stopFile)) { if (drained) return 'sequential'; go = false; }
      if (go && asideUntil > now) {
        if (drained) { await sleep(asideUntil - now); continue; }
        go = false;
      }
      if (go && quickUntil > now) {
        if (drained) {
          const until = new Date(quickUntil).toISOString();
          log(`paused after a quick empty unit until ${until}`);
          setState({ state: 'limit-wait', at: nowIso(), until });
          await sleep(quickUntil - now);
          continue;
        }
        go = false;
      }
      if (go && !dryRun) for (const f of inboxFiles(logDir)) applyUnit(f, []);
      let b = null;
      let meters = null;
      if (go) {
        b = budget();
        meters = await readMeters({ budget: b, fallback: oauthFallback });
        lastMeters = meters;
        if (meters.warning) log(meters.warning);
        const decision = gateDecision(meters, b);
        if (decision.fable === 'opus') log(`Fable weekly window at ${Math.round(meters.fable_seven_day.pct)}%: Fable dispatches use Opus 5.5 until ${meters.fable_seven_day.resets_at.slice(0, 16).replace('T', ' ')} UTC`);
        process.env.EZD_FABLE_ALLOWED = decision.fable === 'fable' ? '1' : '0';
        const fileText = existsSync(windowPauseFile) ? readFileSync(windowPauseFile, 'utf8') : '';
        const pause = pauseFrom({ fileText, decision, now });
        if (pause) {
          if (dryRun) { log(`DRY-RUN PAUSE five-hour pause until ${pause.until}; no unit starts in any lane`); return 'exit'; }
          if (drained) return 'sequential';
          go = false;
        }
      }
      let offered = [];
      if (go) {
        const n = nextUnitsCall();
        if (!n.ok) {
          log(n.line);
          notify(`launcher stopped: --next-units failed: ${n.line}`);
          stopping = `--next-units failed: ${n.line}`;
          continue;
        }
        offered = n.units;
        setState({ next: offered.length ? `${offered[0].unit} ${offered[0].arg}` : (n.none ?? 'none'), polledAt: nowIso() });
        if (!offered.length) { if (drained) return 'sequential'; go = false; }
      }
      if (go) {
        const busy = [...running.values()].map(({ unit, arg, dbLane, account }) => ({ unit, arg, dbLane, account }));
        const { start, reason } = pickUnits({ offered, running: busy, limits });
        if (reason !== lastReason && reason) log(reason);
        lastReason = reason;
        if (start.length && isPhaseWide(start[0].unit)) {
          if (!dryRun) return 'sequential';
          log(`DRY-RUN START ${start[0].unit} ${start[0].arg} db-lane=0`);
          log(`DRY-RUN LANES lanes=${limits.lanes} build-lanes=${limits.buildLanes} started=1`);
          return 'exit';
        }
        let refused = 0;
        let noAccount = null;
        let started = 0;
        for (const u of start) {
          const key = `${u.unit} ${u.arg}`;
          const gate = boostState({ root }).active ? { start: true, reason: null } : await applyGates({ budget: b, meters, nextUnit: key, inProgressBuild: u.resume, notify, dryRun });
          if (!gate.start) {
            log(gate.reason);
            refused++;
            if (/weekly_ceiling_usd_est/.test(gate.reason)) { notify(`launcher stopped: ${gate.reason}`); stopping = gate.reason; break; }
            continue;
          }
          const dbLane = dbLaneFor({ unit: u.unit, running: busy, limits, lanesOn: true });
          if (dbLane === null) continue;
          // EZD-378 D-Run7: the account for this unit; none free ends this pass (D-Run8 pauses when nothing runs).
          const counts = {};
          for (const x of busy) if (x.account) counts[x.account] = (counts[x.account] ?? 0) + 1;
          const pick = chooseAccount(counts);
          if (!pick.off && !pick.account) { noAccount = pick; break; }
          if (!dryRun) {
            const sg = recordStart(logDir, key, Date.now());
            if (!sg.allow) { const text = startStopText(key, sg.count); log(text); notify(text); stopping = text; refused++; break; }
          }
          busy.push({ unit: u.unit, arg: u.arg, dbLane, account: pick.account?.id ?? null });
          started++;
          accountPauseNoticed = false;
          if (dryRun) { await runUnit(u.unit, u.arg, meters.source, { account: pick.account }); log(`DRY-RUN START ${key} db-lane=${dbLane}`); continue; }
          const before = statusRow(statusText(), u.arg);
          const task = neverRejects(async () => {
            const r = await runUnit(u.unit, u.arg, meters.source, { ...(dbLane ? { env: laneEnvFor({ root, ticket: u.arg, lane: dbLane }), lease: dbLane } : {}), account: pick.account });
            running.delete(key);
            afterUnit(key, u, before, r);
          }, (e) => {
            log(`${key}: ${e?.stack || e}`);
            notify(`launcher stopped: ${key}: ${e?.message ?? e}`);
            running.delete(key);
            stopping = stopping ?? `${key}: ${e?.message ?? e}`;
          });
          running.set(key, { unit: u.unit, arg: u.arg, dbLane, account: pick.account?.id ?? null, resume: u.resume, before, task });
          repairs = 0;
          try { unlinkSync(repairStateFile); } catch {}
          waiting = null;
          failedWait = null;
          setState({ state: 'unit', at: nowIso() });
          log(`lane: starting ${key}${dbLane ? ` on database lane ${dbLane}` : ''} (${running.size} running)`);
        }
        // EZD-378 D-Run8: no account can start a unit and nothing runs: wait for the earliest account, one notice.
        if (noAccount && !started && running.size === 0) {
          const text = accountsPausedText(noAccount.parts, noAccount.until);
          if (dryRun) { log(`DRY-RUN PAUSE ${text}`); return 'exit'; }
          log(text);
          if (!accountPauseNoticed) { notify(text); accountPauseNoticed = true; }
          setState({ state: 'limit-wait', at: nowIso(), until: new Date(noAccount.until).toISOString() });
          await sleep(Math.max(60000, noAccount.until - Date.now() + 60000));
          continue;
        }
        if (dryRun) { log(`DRY-RUN LANES lanes=${limits.lanes} build-lanes=${limits.buildLanes} started=${started}`); return 'exit'; }
        if (!started && running.size === 0) return refused > 0 ? 'exit' : 'sequential';
      }
      let timer;
      await Promise.race([...[...running.values()].map((x) => x.task), new Promise((r) => { timer = setTimeout(r, config.idle_poll_ms ?? LANE_POLL_MS); })]);
      clearTimeout(timer);
    }
  };
  for (;;) {
    if (continuous) restartIfCodeChanged(codeAtStart);
    // Boost mode ends by itself at the weekly reset (Josh 2026-10-24): remove the switch, say so once.
    if (dryRun && boostState({ root }).expired) log('dry run: boost mode has expired; a real run would remove vault/handoff/BOOST.json');
    else if (boostState({ root }).expired && boostOff({ root })) { notify('boost mode ended (weekly usage reset): weekly hold and normal per-unit cap back'); }
    // Lanes turned off: the file goes once at most one ticket is in progress (EZD-174; Q-0303 (a)).
    if (existsSync(lanesFile(root)) && !lanesState({ root }).on && inProgressCount(statusText()) <= 1) {
      if (dryRun) log('dry run: lanes are off; a real run would remove vault/handoff/LANES.json');
      else { lanesOff({ root, force: true }); notify('lanes off: back to one unit at a time'); }
    }
    if (!once && lanesState({ root }).on) {
      const r = await laneLoop();
      if (r === 'exit') return;
      if (continuous) restartIfCodeChanged(codeAtStart);
    }
    const stopExists = existsSync(stopFile);
    // A dry run reports the pause and exits: it never writes WINDOW_PAUSE.md, waits or removes it (EZD-155; Q-0268 sweep item 25).
    if (!stopExists && dryRun && existsSync(windowPauseFile)) { log('dry run: vault/handoff/WINDOW_PAUSE.md is in place; a real run would wait until its resume time'); return; }
    if (!stopExists && await waitForWindow({ now: new Date(), sleep })) continue;
    if (continuous && !stopExists) applyQueuedEdits();
    // Records that interactive sessions queued while the launcher ran (records.mjs record()), applied between units.
    if (!dryRun) for (const f of inboxFiles(logDir)) applyUnit(f, []);
    const next = stopExists ? '' : nextUnitText();
    let [unitName, arg] = next.split(/\s+/, 2);
    const effective = stopExists || unitName === 'none:' || UNITS[unitName] ? next : `none: unknown unit "${next}"`;
    let idle = idleAction({ stopExists, next: effective, once: once || dryRun });
    // EZD-250 D12: a wait an agent can fix starts a repair unit; a runnable unit is the only reset.
    let repair = null;
    if (continuous && !stopExists) {
      if (!/^none:/.test(effective)) {
        try { unlinkSync(repairStateFile); } catch {}
        repairs = 0;
      } else if ((AUTO_MERGE_ON_RE.test(effective) || PR_GREEN_OPEN_RE.test(effective)) && !prActionTried.has(effective)) {
        // EZD-336, EZD-337 (Q-0594 (a); Josh 2026-11-05 a57931ba: Claude Code completes its own PRs): GitHub auto-merge is not used.
        // The launcher turns off auto-merge it finds on, and merges a green PR only at the head next_ticket.mjs checked for a post-audit
        // security hold (--match-head-commit), once per wait text; it logs it and sends nothing. GitHub refuses the merge while the
        // required gate check is not green or the head moved (rule 12).
        prActionTried.add(effective);
        const on = effective.match(AUTO_MERGE_ON_RE);
        const green = effective.match(PR_GREEN_OPEN_RE);
        const url = (on || green)[1];
        const what = on ? 'AUTO-MERGE' : 'MERGE';
        const ghArgs = on ? ['pr', 'merge', url, '--disable-auto'] : ['pr', 'merge', url, '--merge', '--match-head-commit', green[2]];
        const m = spawnSync('gh', ghArgs, { cwd: '/', encoding: 'utf8', timeout: 60000, env: { ...process.env, GH_PROMPT_DISABLED: '1' } });
        if (m.status === 0) {
          prActionTried.delete(effective);
          overseerAppend(`launcher: ${what}: ${on ? `off for ${url}` : `merged ${url} at ${green[2]}`}`);
          log(`${what.toLowerCase()} done for ${url}`);
        }
        else {
          const why = `${m.stderr || ''}\n${m.stdout || ''}`.split('\n').map((l) => l.trim()).find(Boolean) || (m.error ? `gh error ${m.error.code}` : `gh exited ${m.status}`);
          overseerAppend(`launcher: ${what}: FAILED: ${why}`);
          // Code review finding 3 (CLAUDE.md rule 17, third-party clause): a refused clear would hold the launcher, so Josh hears it once.
          notify(`launcher waiting: ${effective.replace(/^none:\s*/, '')}; the launcher could not clear it: ${why}`);
          log(`${what.toLowerCase()} for ${url} failed: ${why}`);
        }
        continue;
      } else if (existsSync(probeFile)) {
        // EZD-333: the one-shot probe (vault/handoff/REPAIR_PROBE.md) proves a launcher-started repair unit may edit a guarded
        // file in fix mode. Any wait will do; it sets no repair state and counts toward no cap.
        try { unlinkSync(probeFile); } catch {}
        repair = { kind: 'probe', fp: 'probe', next: effective };
        writeRepairBrief(repair);
        unitName = 'repair';
        arg = 'probe';
        idle = { action: 'run' };
      } else {
        const d = repairDecision({ next: effective, state: readJson(repairStateFile, null), consecutive: repairs });
        if (d.action === 'repair') {
          repair = { ...d, next: effective };
          writeRepairBrief(repair);
          unitName = 'repair';
          arg = d.kind;
          idle = { action: 'run' };
        } else if (d.why === 'tried' && idle.action === 'wait') idle = { ...idle, notify: null };
      }
    }
    const subject = unitSubject(next, repair);
    if (idle.action === 'stop') { log(stopExists ? 'vault/handoff/STOP exists; stopping.' : next); if (!stopExists && !/budget hold/.test(next)) notify(`launcher stopped: ${next.replace(/^none:\s*/, '')}`); return; }
    if (idle.action === 'wait') {
      if (waiting !== idle.why) {
        log(idle.why); if (idle.notify) notify(idle.notify); waiting = idle.why;
        // D7: after a failed repair the same wait keeps state repair-failed and its time, so the watchdog can alert (D16 (a)).
        if (failedWait === null || effective !== failedWait) { setState({ state: 'idle', at: nowIso() }); failedWait = null; }
      }
      await sleep(config.idle_poll_ms ?? idle.ms);
      continue;
    }
    if (waiting) { log('resuming'); waiting = null; }
    if (quickUntil > Date.now()) {
      if (once) { log(`${subject}: not restarted after a quick empty unit (--once)`); return; }
      const until = new Date(quickUntil).toISOString();
      log(`paused after a quick empty unit until ${until}; then ${subject}`);
      setState({ state: 'limit-wait', at: nowIso(), until });
      await sleep(quickUntil - Date.now());
      continue;
    }
    const inProgressBuild = unitName === 'build' && /\b(in-progress|review)\b/.test(spawnSync(process.execPath, [path.join(vault, 'tools/next_ticket.mjs')], { encoding: 'utf8', cwd: root }).stdout);
    const b = budget();
    const meters = await readMeters({ budget: b, fallback: oauthFallback });
    if (meters.warning) log(meters.warning);
    const decision = gateDecision(meters, b);
    if (decision.pause) {
      if (dryRun) { log(`dry run: five-hour window at ${decision.pause.pct}%; a real run would pause until ${decision.pause.resume_at} and write vault/handoff/WINDOW_PAUSE.md`); return; }
      log(`five-hour window at ${decision.pause.pct}%; paused until ${decision.pause.resume_at} (vault/handoff/WINDOW_PAUSE.md)`);
      await waitForWindow({ pause: decision.pause, sleep });
      continue;
    }
    // Boost mode skips the weekly hold (Josh 2026-10-24: "remove the hold completely during boost"); the five-hour pause
    // above and a real plan-limit error below still apply.
    const gate = boostState({ root }).active ? { start: true, reason: null } : await applyGates({ budget: b, meters, nextUnit: subject, inProgressBuild, notify, dryRun });
    // A dry run writes no hold or marker file (EZD-155; Q-0291 (a)); it says what a real run would write, and under boost a real run skips the hold (above).
    if (dryRun && !boostState({ root }).active && decision.hold && !existsSync(holdFile)) log(`dry run: weekly usage at ${Math.round(meters.seven_day.pct)}%; a real run would write vault/handoff/BUDGET_HOLD.md and notify`);
    if (!gate.start) {
      log(gate.reason);
      if (/weekly_ceiling_usd_est/.test(gate.reason)) notify(`launcher stopped: ${gate.reason}`);
      return;
    }
    if (decision.hold && inProgressBuild) log('budget hold: finishing the in-progress ticket');
    // Fable fallback flag for the orchestrator (section 4): exported so the skill can read it.
    if (decision.fable === 'opus') log(`Fable weekly window at ${Math.round(meters.fable_seven_day.pct)}%: Fable dispatches use Opus 5.5 until ${meters.fable_seven_day.resets_at.slice(0, 16).replace('T', ' ')} UTC`);
    process.env.EZD_FABLE_ALLOWED = decision.fable === 'fable' ? '1' : '0';
    // EZD-378 D-Run5: the account for this unit; none free waits for the earliest one, with one notice.
    const pick = chooseAccount();
    if (!pick.off && !pick.account) {
      const text = accountsPausedText(pick.parts, pick.until);
      if (once || dryRun) { log(`${subject}: not started: ${text} (${dryRun ? '--dry-run' : '--once'})`); return; }
      log(text);
      if (!accountPauseNoticed) { notify(text); accountPauseNoticed = true; }
      setState({ state: 'limit-wait', at: nowIso(), until: new Date(pick.until).toISOString() });
      await sleep(Math.max(60000, pick.until - Date.now() + 60000));
      continue;
    }
    if (!dryRun) {
      const k = `${unitName} ${arg}`;
      const sg = recordStart(logDir, k, Date.now());
      if (!sg.allow) { const text = startStopText(k, sg.count); log(text); notify(text); return; }
    }
    const statusBefore = statusHash();
    setState({ state: 'unit', at: nowIso() });
    failedWait = null;
    const snap = repair ? repairSnapshot() : null;
    // EZD-316 D14 (Q-0606 (b)): whether develop was on the D-021 record before the repair.
    if (snap && opsHome) {
      try { snap.verified = verifyDevelop(root, opsHome, spawnSync); } catch (e) { snap.verified = { refuse: e?.message ?? String(e) }; }
    }
    accountPauseNoticed = false;
    const r = await runUnit(unitName, arg, meters.source, { account: pick.account });
    if (dryRun) return;
    if (quickEmpty(r)) {
      quickUntil = Math.max(quickUntil, Date.now() + quickPauseMs);
      log(`quick empty unit ${unitName} ${arg}: ${r.wallMs} ms, $${r.usd.toFixed(2)}, ${r.turns ?? 0} turns; no unit starts until ${new Date(quickUntil).toISOString()}`);
    }
    setState({ state: 'after-unit', at: nowIso() });
    // EZD-333: check what the repair changed before anything else, whatever its outcome (a limit can stop it half way).
    let refusal = null;
    let changes = null;
    if (repair) {
      changes = repairChanges(snap, repair.fp);
      if (changes.bad.length) {
        const { problems, kept } = undoRepair(snap, changes);
        const keptText = kept.length ? `; overwritten copies: ${kept.join(', ')}` : '';
        if (!problems.length) refusal = `changed ${changes.bad.join(', ')} (repair hard limits); the repair's change is undone${keptText}`;
        else {
          // A safety stop, not a question: a hard-limit change the launcher cannot safely undo must not run unattended.
          refusal = `changed ${changes.bad.join(', ')} (repair hard limits); not undone: ${problems.join('; ')}${keptText}; STOP written`;
          try { writeFileSync(stopFile, `# STOP · ${nowIso()}\nA repair run changed ${changes.bad.join(', ')} and the launcher did not undo it: ${problems.join('; ')}. See vault/handoff/overseer-log.md (EZD-333).\n`); } catch {}
          notify(`launcher stopped: a repair run changed ${changes.bad.join(', ')} and it was not undone. See vault/handoff/overseer-log.md.`);
        }
        log(`repair ${repair.kind}: refused: ${refusal}`);
      }
      // EZD-316 D14 (Q-0606 (b)): after a repair that passed the hard-limit check, the launcher records develop itself, but only
      // the repair's own commits on top of a recorded develop, and only develop's current commit. Its own log only.
      if (changes.bad.length === 0 && opsHome) {
        let why = null;
        if (!changes.head) why = 'no head commit';
        else if (changes.head === snap.head) why = '';
        else if (snap.verified?.sha !== snap.head) why = `develop was not on the record before the repair (${snap.verified?.refuse})`;
        else {
          const other = changes.commits.find((c) => c.merge || !c.subject.startsWith('fix(repair):'));
          // Security review Part B, finding 1: a repair never blesses the push chain itself (github-ops runs with Josh's login).
          const chain = changes.files.find(inPushChain);
          if (other) why = `a commit is not the repair's (${other.sha.slice(0, 7)} "${other.subject}")`;
          else if (chain) why = `a commit changes the push chain (${chain})`;
          else if (developSha(path.join(root, '.git')) !== changes.head) why = 'develop is not the checkout\'s commit';
          else {
            try { recordDevelop(opsHome, changes.head); log(`repair ${repair.kind}: RECORDED: develop ${changes.head.slice(0, 7)}`); }
            catch (e) { why = `record write failed: ${e?.message ?? e}`; }
          }
        }
        if (why) log(`repair ${repair.kind}: NOTE: develop not recorded: ${why}`);
      }
      // Fix mode the repair opened (its file names this repair, skill step 4.2) is closed; any other is left and logged.
      if (!snap.fixBefore && existsSync(fixFile)) {
        let text = '';
        try { text = readFileSync(fixFile, 'utf8'); } catch {}
        if (text.split('\n').some((l) => l.trim() === `Repair: ${repair.fp}`)) {
          try { unlinkSync(fixFile); log('the repair left vault/handoff/LAUNCHER_FIX.md open; removed'); } catch (e) { log(`LAUNCHER_FIX.md not removed: ${e.message}`); }
        } else overseerAppend(`repair ${repair.kind}: NOTE: vault/handoff/LAUNCHER_FIX.md left open (it names no repair ${repair.fp}; an interactive fix?)`);
      }
      if (r.outcome.startsWith('limit-')) overseerAppend(`repair ${repair.kind}: ${refusal ? `REFUSED: ${refusal}` : `FAILED: stopped by a usage limit (${r.outcome}); the launcher retries it`}`);
    }
    if (r.outcome.startsWith('limit-')) {
      // EZD-378 D-Run6: a limit on an account rests only that account; the unit is offered again as it was, with no
      // hold, wait, strike, failure file, retry count or set-aside.
      if (r.account) {
        const until = parseReset(r.limit.until, Date.now()) ?? Date.now() + ACCOUNT_REST_UNKNOWN_MS;
        try { restAccount(logDir, r.account.id, until, r.limit.note ?? r.outcome); } catch (e) { const t = `launcher stopped: account state not written (${e.message})`; log(t); notify(t); return; }
        log(`account ${r.account.id} hit a ${r.limit.kind} limit during ${subject}; resting until ${new Date(until).toISOString()}; the next unit goes to another account`);
        if (once) return;
        continue;
      }
      if (r.limit.kind === 'five-hour') {
        const until = parseWhen(r.limit.until) || new Date(Date.now() + 30 * 60000);
        log(`five-hour limit; waiting until ${until.toISOString()} then resuming ${subject}`);
        setState({ state: 'limit-wait', at: nowIso(), until: until.toISOString() });
        await sleep(Math.max(60000, until.getTime() - Date.now() + 60000));
        continue;
      }
      writeHold({ reason: `plan limit error (${r.limit.note || 'weekly'})`, meters, budget: b, nextUnit: subject });
      notify(`plan limit reached during ${subject}. Hold written; override with budget.mjs or wait for the weekly reset.`);
      return;
    }
    const chk = tool('--check');
    if (repair) {
      // EZD-250 D12a: a REPAIRED claim stands only if the ledger check passes and the wait it was started for is gone.
      // EZD-333: Josh hears only a design or user-interface question; every outcome gets one overseer log line instead.
      const after = nextUnitText();
      const probe = repair.kind === 'probe';
      let v = r.outcome === 'ok' ? parseVerdict(r.parsed?.result) : { verdict: 'failed', line: repairStopLine(repair.kind, r.outcome) };
      if (v.verdict === 'josh' && !joshQuestion(v.line)) v = { verdict: 'failed', line: `not a design or UI question: ${v.line}` };
      if (refusal) v = { verdict: 'refused', line: refusal };
      else if (!probe && v.verdict === 'repaired' && chk.status !== 0) v = { verdict: 'failed', line: 'the ledger check still fails after the repair' };
      else if (!probe && v.verdict === 'repaired' && /^none:/.test(after) && fingerprint(after) === repair.fp) v = { verdict: 'failed', line: 'the same wait remains after the repair' };
      let entry = `repair ${repair.kind}: ${v.verdict.toUpperCase()}: ${v.line}`;
      if (!refusal && changes.files.length) entry += `; commits ${shortSha(snap.head)}..${shortSha(changes.head)}; files: ${changes.files.join(', ')}`;
      overseerAppend(entry);
      if (probe) { log(`repair probe: ${v.verdict}: ${v.line}`); continue; }
      try { mkdirSync(logDir, { recursive: true }); writeFileSync(repairStateFile, JSON.stringify({ fp: repair.fp, verdict: v.verdict, at: nowIso() }) + '\n'); } catch (e) { log(`repair state not written: ${e.message}`); }
      repairs++;
      if (v.verdict === 'repaired') log(`repair ${repair.kind}: repaired: ${v.line}`);
      else if (v.verdict === 'josh') notify(`needs Josh: ${v.line} (vault/handoff/REPAIR.md)`);
      else {
        log(`repair ${repair.kind} ${v.verdict} for "${repair.next}": ${v.line} (vault/handoff/overseer-log.md)`);
        setState({ state: 'repair-failed', at: nowIso() });
        failedWait = repair.next;
      }
      continue;
    }
    // After a normal unit a failed check only logs; the next pass starts a repair unit (EZD-250 D12a).
    if (chk.status !== 0) log(`ledger check failed:\n${chk.stdout}`);
    // No-progress guard (2026-10-19): a unit that ends ok but leaves STATUS.md and the next unit unchanged is not
    // retried forever. Any unit that does it twice is set aside until Josh is back, and the launcher goes on with other
    // work (Josh 2026-10-27, 2026-11-03: "that item should just be set aside"). Only a set-aside that cannot be written
    // stops it. Three in a row look like a fault in the system, not one item: the launcher pauses, then goes on.
    const strikeNote = r.note || r.parsed?.result;
    if (!strikeExempt({ outcome: r.outcome, note: strikeNote })) {
      const verdict = strikeVerdictFor({ unit: unitName, arg, outcome: r.outcome, progress: !(statusHash() === statusBefore && nextUnitText() === next) });
      strikeLog(next, verdict, recordStrike(next, verdict, { outcome: r.outcome, note: strikeNote }));
    }
    if (r.outcome === 'ok' && statusHash() === statusBefore && nextUnitText() === next) {
      noProgress++;
      log(`${next} ended ok but changed nothing in STATUS.md (${noProgress} in a row)`);
      if (noProgress >= 2) {
        const aside = setAside(unitName, arg, next);
        if (aside.ok) {
          noProgress = 0;
          log(aside.text);
          notify(`${next} set aside until Josh is back, after two runs without progress; the launcher goes on with other work.`);
          if (++tabled >= 3) { log('three set aside in a row; pausing before the next unit'); tabled = 0; await sleep(config.aside_pause_ms ?? 1800000); }
          continue;
        }
        log(`set aside ${next} failed: ${aside.text}`);
        notify(`unit ${next} ended twice without progress; launcher stopped. See vault/handoff/CURRENT.md.`);
        return;
      }
    } else { noProgress = 0; tabled = 0; }
    if (r.outcome !== 'ok') {
      const info = { ts: new Date().toISOString(), unit: next, outcome: r.outcome, note: r.note || r.parsed?.result?.slice?.(0, 500) };
      writeFileSync(failureFile, JSON.stringify(info, null, 2));
      if (/max_turns|budget/i.test(r.outcome) || r.outcome === 'error') {
        // One retry of the same unit (the worktree resumes); a second failure stops the loop.
        if (!main.retried) { main.retried = next; log(`retrying ${next} once`); continue; }
        if (main.retried === next) {
          const aside = setAside(unitName, arg, next);
          if (!aside.ok) { notify(`unit ${next} failed twice (${r.outcome}); launcher stopped.`); return; }
          main.retried = null;
          log(aside.text);
          notify(`${next} set aside until Josh is back, after failing twice (${r.outcome}); the launcher goes on with other work.`);
          if (++tabled >= 3) { log('three set aside in a row; pausing before the next unit'); tabled = 0; await sleep(config.aside_pause_ms ?? 1800000); }
          continue;
        }
      }
    }
    main.retried = null;
    if (once) return;
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
