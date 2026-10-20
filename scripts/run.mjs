#!/usr/bin/env node
// The launcher (vault/PROCESS.md section 10 and 11). Runs one unit of work per fresh `claude -p` session, in a loop,
// until nothing can run without Josh. No dependencies; Node 22; macOS or Linux.
//
//   node scripts/run.mjs              run units until `next_ticket.mjs --next-unit` says `none`, a hold, STOP, or an error
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
//                   limit error is treated as the weekly case (section 11)
//   prompt_style    "slash" (default: the prompt is `/<skill> <arg>`) or "ask" (plain sentence naming the skill)
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, unlinkSync, copyFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vault = path.join(root, 'vault');
const args = process.argv.slice(2);
const once = args.includes('--once');
const dryRun = args.includes('--dry-run');
const statusOnly = args.includes('--status');

const readJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };
const config = readJson(path.join(root, 'scripts/launcher.config.json'), {});
const budgetPath = path.join(vault, 'budget.json');
const costLog = path.join(vault, 'cost/log.jsonl');
const holdFile = path.join(vault, 'handoff/BUDGET_HOLD.md');
const stopFile = path.join(vault, 'handoff/STOP');
const failureFile = path.join(vault, 'handoff/last-failure.json');
const claudeBin = config.claude_bin || 'claude';
const { weekSpend, questionsFingerprint, assignQuestionIds } = await import(path.join(vault, 'tools/next_ticket.mjs'));
const { createOAuthFallback } = await import('./oauth-usage.mjs');
const { readMeters, gateDecision, applyGates, waitForWindow, writeHold, overrideActive } = await import('./budget.mjs');
const { costEntry } = await import('./cost-log.mjs');

const MODELS = { orchestrator: 'claude-opus-5-5', planner: 'claude-opus-5-5', 'code-reviewer': 'claude-opus-5-5' };
const UNITS = {
  // unit: how it runs. `as` = the session runs as that agent (no orchestrator in front); effort per section 10.
  build: { skill: 'build-ticket', effort: 'medium', model: MODELS.orchestrator, turns: 150 },
  plan: { skill: 'plan-ticket', effort: 'high', model: MODELS.planner, turns: 60, as: 'planner' },
  'review-plans': { skill: 'review-plans', effort: 'high', model: MODELS['code-reviewer'], turns: 60, as: 'code-reviewer' },
  questions: { skill: 'questions', effort: 'high', model: MODELS.orchestrator, turns: 80 },
  'gate-phase': { skill: 'gate-phase', effort: 'high', model: MODELS.orchestrator, turns: 150 },
  wrap: { skill: 'wrap', effort: 'medium', model: MODELS.orchestrator, turns: 60 },
};

const log = (msg) => console.log(`[run ${new Date().toISOString().slice(11, 19)}] ${msg}`);
function notify(msg) {
  log(`NOTIFY: ${msg}`);
  if (!config.notify_cmd) return;
  const r = spawnSync('/bin/sh', ['-c', config.notify_cmd], { env: { ...process.env, MSG: `EZ Draft: ${msg}` }, encoding: 'utf8', timeout: 20000 });
  if (r.status !== 0) log(`notify command failed: ${(r.stderr || '').trim()}`);
}
const oauthFallback = createOAuthFallback({ notify, log });
const tool = (...a) => spawnSync(process.execPath, [path.join(vault, 'tools/next_ticket.mjs'), ...a], { encoding: 'utf8', cwd: root });
const git = (...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' });

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
  const prompt = (config.prompt_style === 'ask')
    ? `Run the ${u.skill} skill for ${arg}. Follow it exactly and end the session when the unit is complete.`
    : `/${u.skill} ${arg}`;
  const cmd = [
    '-p', prompt,
    '--output-format', 'json',
    '--model', u.model,
    '--effort', u.effort,
    '--permission-mode', 'bypassPermissions',
    '--name', `${arg} ${unitName}`,
  ];
  const b = budget();
  if (b.per_unit_cap_usd_est) cmd.push('--max-budget-usd', String(b.per_unit_cap_usd_est));
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
const LIMIT_RE = /(usage|rate) limit|limit (reached|exceeded|hit)|out of (extra )?usage|too many requests|quota/i;
function classifyLimit(text) {
  if (!LIMIT_RE.test(text)) return null;
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function appendCost(entry) { mkdirSync(path.dirname(costLog), { recursive: true }); appendFileSync(costLog, JSON.stringify(entry) + '\n'); }

// Ledger line and handoff for the units that run as an agent (plan, review-plans), PROCESS.md section 10.
function afterAgentUnit(unitName, arg, res) {
  const text = String(res?.result || '');
  if (unitName === 'plan') {
    const planPath = path.join(vault, 'plans', `${arg}.md`);
    if (!existsSync(planPath)) return `plan file missing: ${planPath}`;
    const plan = readFileSync(planPath, 'utf8');
    const complexity = plan.match(/\*\*Complexity:\*\*\s*(low|medium|high)/i)?.[1]?.toLowerCase() || '';
    const oq = plan.match(/^## (?:10\. )?Open questions[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] || '';
    const hasQ = /\bQP-\d+/.test(oq);
    const statusPath = path.join(vault, 'tickets/STATUS.md');
    const lines = readFileSync(statusPath, 'utf8').split('\n');
    const i = lines.findIndex((l) => l.startsWith(`| ${arg} |`));
    if (i < 0) return `no STATUS.md row for ${arg}`;
    const c = lines[i].split('|');
    // | '' | id | phase | title | status | complexity | depends | commit | tests | notes | ''
    const ids = hasQ ? assignQuestionIds(arg) : [];
    c[4] = ` ${hasQ ? 'questions' : 'planned'} `; c[5] = ` ${complexity} `;
    lines[i] = c.join('|');
    writeFileSync(statusPath, lines.join('\n'));
    writeHandoff(`plan ${arg}`, `Planned ${arg}: status ${hasQ ? 'questions' : 'planned'}, complexity ${complexity || '(none in plan header)'}${ids.length ? `; open questions ${ids.join(', ')}` : ''}.`);
    return null;
  }
  if (unitName === 'review-plans') {
    const out = path.join(vault, 'plans', `review-phase-${String(arg).padStart(2, '0')}.md`);
    writeFileSync(out, `# Plan review · phase ${arg}\n\nWritten by the launcher from the code-reviewer's final report (${new Date().toISOString()}).\n\n${text.trim()}\n`);
    writeHandoff(`review-plans ${arg}`, `Plan review written to ${path.relative(root, out)}.`);
    return null;
  }
  return null;
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

function writeHandoff(unit, line) {
  const cur = path.join(vault, 'handoff/CURRENT.md');
  if (existsSync(cur)) {
    mkdirSync(path.join(vault, 'handoff/log'), { recursive: true });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const dest = path.join(vault, 'handoff/log', `${stamp}.md`);
    if (!existsSync(dest)) copyFileSync(cur, dest);
  }
  const next = tool('--next-unit').stdout.trim();
  writeFileSync(cur, `# Handoff · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${unit}\n\n- Phase and stage: see vault/PROGRESS.md\n- Why the session ended: unit complete (launcher-run agent unit)\n- Completed this session: ${line}\n- In progress: none\n- Blocked: none new\n- Questions for Josh: see vault/questions/QUESTIONS.md\n- Decisions made: none\n- Next unit: ${next}\n`);
}
function commitVault(msg) {
  if (git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim() !== 'develop') return;
  if (!git('status', '--porcelain', '--', 'vault').stdout.trim()) return;
  git('add', '--', 'vault'); git('commit', '-m', msg, '--', 'vault');
}

async function runUnit(unitName, arg, meterSource = null) {
  const cmd = buildCommand(unitName, arg);
  // The scrub is set in api mode only (PROCESS.md section 11, Auth mode). Claude Code 2.1.303 forces the permission
  // mode to default whenever it is set, and with --permission-prompts none every write is then denied (2026-10-19 loop).
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB;
  if (authMode() === 'api') {
    if (!config.api_key) return { outcome: 'error', note: 'auth_mode api but no api_key in launcher.config.json' };
    env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = '1';
    env.ANTHROPIC_API_KEY = config.api_key;
  } else {
    delete env.ANTHROPIC_API_KEY; // plan auth: a stray key in the shell would silently move the spend
  }
  log(`${unitName} ${arg}: ${claudeBin} ${cmd.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`);
  if (dryRun) return { outcome: 'dry-run' };
  const started = Date.now();
  const processRev = git('rev-parse', '--short', 'HEAD').stdout.trim() || null;
  const qBefore = unitName === 'questions' ? { fp: questionsFingerprint(), esc: escalatedRows() } : null;
  const res = await new Promise((resolve) => {
    const child = spawn(claudeBin, cmd, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; process.stderr.write(d); });
    child.on('close', (code) => resolve({ code, out, err }));
    child.on('error', (e) => resolve({ code: -1, out, err: String(e) }));
  });
  const parsed = parseResult(res.out);
  const { total, fable, models } = costOf(parsed);
  const text = `${parsed?.result || ''}\n${res.err}`;
  // A limit is only looked for in a failed run (2026-10-19: a successful report that mentioned "usage limit" was
  // misread as limit-weekly and wrote a hold after EZD-000 had merged).
  const limit = (res.code !== 0 || parsed?.is_error) ? classifyLimit(text) : null;
  const outcome = limit ? `limit-${limit.kind}` : (res.code === 0 && !parsed?.is_error ? 'ok' : `error${parsed?.subtype ? `:${parsed.subtype}` : ''}`);
  appendCost(costEntry({ ts: new Date().toISOString(), unit: unitName, ticket: arg, models, total, fable, outcome, parsed, startedMs: started, endedMs: Date.now(), auth: authMode(), meterSource, processRev }));
  if (!parsed) log(`no JSON result parsed (exit ${res.code}); raw tail: ${res.out.slice(-400).replace(/\n/g, ' ')}`);
  else log(`${unitName} ${arg} → ${outcome}; est $${total.toFixed(2)}${fable ? ` (Fable $${fable.toFixed(2)})` : ''}; turns ${parsed.num_turns ?? '?'}`);
  if (outcome === 'ok' && UNITS[unitName].as) {
    const problem = afterAgentUnit(unitName, arg, parsed);
    if (problem) { log(problem); return { outcome: 'error', note: problem, limit }; }
  }
  if (qBefore) {
    // Q-0129: one notification per newly escalated question; the fingerprints feed the loop guard in next_ticket.mjs.
    for (const [id, text] of escalatedRows()) if (!qBefore.esc.has(id)) notify(`question for Josh: ${id} (${text.slice(0, 300)}). vault/questions/phase-${String(arg).padStart(2, '0')}-for-josh.md`);
    writeFileSync(path.join(vault, 'handoff/.questions-last-run.json'), JSON.stringify({ phase: Number(arg), before: qBefore.fp, after: questionsFingerprint(), ts: new Date().toISOString() }) + '\n');
  }
  commitVault(`docs(vault): ${unitName} ${arg}`);
  return { outcome, limit, parsed };
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
  if (process.platform === 'darwin' && !dryRun) {
    // Keep the Mac awake for the life of the launcher (PROCESS.md section 10, "Keeping the machine running").
    try { const c = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true }); c.unref(); } catch {}
  }
  let checkFailures = 0;
  let noProgress = 0;
  const statusHash = () => createHash('sha256').update(readFileSync(path.join(vault, 'tickets/STATUS.md'))).digest('hex');
  for (;;) {
    if (existsSync(stopFile)) { log('vault/handoff/STOP exists; stopping.'); return; }
    if (await waitForWindow({ now: new Date(), sleep })) continue;
    const next = tool('--next-unit').stdout.trim();
    const [unitName, arg] = next.split(/\s+/, 2);
    if (unitName === 'none:' || !UNITS[unitName]) {
      const reason = next.replace(/^none:\s*/, '');
      if (/budget hold/.test(reason)) { log(reason); return; }
      notify(`launcher stopped: ${reason}`);
      return;
    }
    const inProgressBuild = unitName === 'build' && /\b(in-progress|review)\b/.test(spawnSync(process.execPath, [path.join(vault, 'tools/next_ticket.mjs')], { encoding: 'utf8', cwd: root }).stdout);
    const b = budget();
    const meters = await readMeters({ budget: b, fallback: oauthFallback });
    if (meters.warning) log(meters.warning);
    const decision = gateDecision(meters, b);
    if (decision.pause) {
      log(`five-hour window at ${decision.pause.pct}%; paused until ${decision.pause.resume_at} (vault/handoff/WINDOW_PAUSE.md)`);
      await waitForWindow({ pause: decision.pause, sleep });
      continue;
    }
    const gate = await applyGates({ budget: b, meters, nextUnit: next, inProgressBuild, notify });
    if (!gate.start) {
      log(gate.reason);
      if (/weekly_ceiling_usd_est/.test(gate.reason)) notify(`launcher stopped: ${gate.reason}`);
      return;
    }
    if (decision.hold && inProgressBuild) log('budget hold: finishing the in-progress ticket');
    // Fable fallback flag for the orchestrator (section 4): exported so the skill can read it.
    if (decision.fable === 'opus') log(`Fable weekly window at ${Math.round(meters.fable_seven_day.pct)}%: Fable dispatches use Opus 5.5 until ${meters.fable_seven_day.resets_at.slice(0, 16).replace('T', ' ')} UTC`);
    process.env.EZD_FABLE_ALLOWED = decision.fable === 'fable' ? '1' : '0';
    const statusBefore = statusHash();
    const r = await runUnit(unitName, arg, meters.source);
    if (dryRun) return;
    if (r.outcome.startsWith('limit-')) {
      if (r.limit.kind === 'five-hour') {
        const until = parseWhen(r.limit.until) || new Date(Date.now() + 30 * 60000);
        log(`five-hour limit; waiting until ${until.toISOString()} then resuming ${next}`);
        await sleep(Math.max(60000, until.getTime() - Date.now() + 60000));
        continue;
      }
      writeHold({ reason: `plan limit error (${r.limit.note || 'weekly'})`, meters, budget: b, nextUnit: next });
      notify(`plan limit reached during ${next}. Hold written; override with budget.mjs or wait for the weekly reset.`);
      return;
    }
    const chk = tool('--check');
    if (chk.status !== 0) {
      checkFailures++;
      log(`ledger check failed (${checkFailures}):\n${chk.stdout}`);
      if (checkFailures >= 2) { notify('ledger check failed twice in a row; launcher stopped. See vault/handoff/CURRENT.md.'); return; }
    } else checkFailures = 0;
    // No-progress guard (2026-10-19): a unit that ends ok but leaves STATUS.md and the next unit unchanged is not
    // retried forever; two in a row stop the launcher.
    if (r.outcome === 'ok' && statusHash() === statusBefore && tool('--next-unit').stdout.trim() === next) {
      noProgress++;
      log(`${next} ended ok but changed nothing in STATUS.md (${noProgress} in a row)`);
      if (noProgress >= 2) { notify(`unit ${next} ended twice without progress; launcher stopped. See vault/handoff/CURRENT.md.`); return; }
    } else noProgress = 0;
    if (r.outcome !== 'ok') {
      const info = { ts: new Date().toISOString(), unit: next, outcome: r.outcome, note: r.note || r.parsed?.result?.slice?.(0, 500) };
      writeFileSync(failureFile, JSON.stringify(info, null, 2));
      if (/max_turns|budget/i.test(r.outcome) || r.outcome === 'error') {
        // One retry of the same unit (the worktree resumes); a second failure stops the loop.
        if (!main.retried) { main.retried = next; log(`retrying ${next} once`); continue; }
        if (main.retried === next) { notify(`unit ${next} failed twice (${r.outcome}); launcher stopped.`); return; }
      }
    }
    main.retried = null;
    if (once) return;
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
