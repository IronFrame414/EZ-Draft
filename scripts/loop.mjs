#!/usr/bin/env node
// Build v3 loop (2026-11-13, Josh): one Opus builder per ticket, one fresh reviewer (Fable), scripts/check.mjs as the
// gate, squash merge to develop, push. Runs unattended as the launchd agent com.ezdraft.build (scripts/launchd/build.mjs).
// A ticket that does not finish for any reason is set aside (vault/build/set-aside.md) and the loop moves on.
// Pause: touch vault/build/STOP (the current ticket finishes first). State: vault/build/state.json.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize, reportMarkdown } from './usage-report.mjs';

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
};
const DEFAULTS = {
  builder_model: 'claude-opus-5-5', builder_effort: 'medium',
  reviewer_model: 'claude-fable-5-2', reviewer_fallback: 'claude-opus-5-5', reviewer_effort: 'medium',
  builder_timeout_min: 90, reviewer_timeout_min: 30, fix_rounds: 2, review_rounds: 2,
  trial_size: 20, lane: '0', idle_minutes: 30, limit_sleep_minutes: 30, limit_probe_minutes: 5, red_streak_guard: 3,
  skip_tracks: ['tooling'], skip_statuses: ['blocked'],
};
const SECURITY_PATHS = /(supabase\/migrations|\/server\/|rls|auth|permission|share|price|money|cost|webhook|invite|role)/i;

mkdirSync(B, { recursive: true });
const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } };
const cfg = () => ({ ...DEFAULTS, ...readJson(P.config, {}) });
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(msg) { const line = `[${now()}] ${msg}`; console.log(line); appendFileSync(P.log, line + '\n'); }
function git(args, cwd = ROOT, opts = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', ...opts });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
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
function seedStatuses() {
  const st = {};
  for (const line of readFileSync(path.join(ROOT, 'vault/tickets/STATUS.md'), 'utf8').split('\n')) {
    const c = line.split('|').map((s) => s.trim());
    if (/^EZD-/.test(c[1] || '')) st[c[1]] = c[4];
  }
  return st;
}
function loadState() {
  const s = readJson(P.state, null);
  if (s) return s;
  const fresh = { started: now(), done: seedDone(), seeded_done: 0, merged: [], set_aside: {}, current: null,
    red_streak: 0, push_pending: false, trial_report_written: false, idle_logged: false };
  fresh.seeded_done = fresh.done.length;
  saveState(fresh);
  return fresh;
}
function saveState(s) { writeFileSync(P.state, JSON.stringify(s, null, 2) + '\n'); writeSetAside(s); }
function writeSetAside(s) {
  const rows = Object.entries(s.set_aside);
  const out = ['# Set-aside tickets', '', 'Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.',
    'To retry one, delete its entry from vault/build/state.json `set_aside` (the loop picks it up again).', ''];
  if (!rows.length) out.push('None.');
  for (const [id, r] of rows) {
    out.push(`## ${id} · ${r.title}`, `- When: ${r.ts}`, `- Reason: ${r.reason}`, `- Branch: ${r.branch} · worktree: ${r.worktree}`);
    if (r.detail) out.push('- Last output:', '```', r.detail.slice(0, 2500), '```');
    out.push('');
  }
  writeFileSync(P.setAside, out.join('\n'));
}

// ---------- tickets ----------
function tickets() { const t = readJson(path.join(ROOT, 'vault/tickets/tickets.json'), {}); return Array.isArray(t) ? t : t.tickets || []; }
function pickNext(s) {
  const c = cfg();
  const statuses = seedStatuses();
  const done = new Set(s.done);
  const aside = new Set(Object.keys(s.set_aside));
  const list = tickets().filter((t) => !done.has(t.id) && !aside.has(t.id)
    && !c.skip_tracks.includes(t.track) && !c.skip_statuses.includes(statuses[t.id])
    && (t.depends_on || []).every((d) => done.has(d)));
  const retried = (t) => (s.retries?.[t.id] ? 1 : 0);
  list.sort((a, b) => (retried(a) - retried(b)) || (a.phase - b.phase) || ((a.build_position ?? 1e9) - (b.build_position ?? 1e9)) || a.id.localeCompare(b.id));
  return list[0] || null;
}
function readingList(id) {
  const r = spawnSync('node', ['vault/tools/next_ticket.mjs', '--reads', id, 'builder'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

// ---------- claude ----------
function runClaude({ cwd, prompt, model, effort, name, resume, timeoutMin, readOnly }) {
  const c = cfg();
  const args = ['-p', prompt, '--output-format', 'json', '--model', model, '--effort', effort, '--name', name];
  if (resume) args.push('--resume', resume);
  if (readOnly) {
    args.push('--permission-mode', 'dontAsk',
      '--allowedTools', 'Read', 'Grep', 'Glob', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)',
      'Bash(node vault/tools/outline.mjs:*)', 'Bash(node vault/tools/next_ticket.mjs --reads:*)',
      '--disallowedTools', 'Edit', 'Write', 'NotebookEdit');
  } else {
    args.push('--permission-mode', 'bypassPermissions');
  }
  return new Promise((resolve) => {
    const started = Date.now();
    const env = { ...process.env, EZD_LANE: c.lane };
    if (c.lane !== '0') env.SUPABASE_WORKDIR = path.join(cwd, '.lanes', `lane${c.lane}`);
    const p = spawn('claude', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { p.kill('SIGTERM'); setTimeout(() => p.kill('SIGKILL'), 10000); }, timeoutMin * 60000);
    p.on('close', (code) => {
      clearTimeout(timer);
      const res = parseResult(out);
      const text = String(res?.result ?? '') + '\n' + err.slice(-2000);
      resolve({ code, res, text, secs: Math.round((Date.now() - started) / 1000),
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
function check(cwd) {
  const r = spawnSync('node', [path.join(ROOT, 'scripts/check.mjs'), cwd], { cwd, encoding: 'utf8', env: { ...process.env, EZD_LANE: cfg().lane }, timeout: 60 * 60000 });
  const pass = r.status === 0 && /CHECK PASS/.test(r.stdout || '');
  let detail = (r.stdout || '').trim();
  if (!pass) { try { detail += '\n' + readFileSync(path.join(cwd, 'check-failures.log'), 'utf8').slice(0, 9000); } catch {} }
  return { pass, detail };
}

// ---------- prompts ----------
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
    '3. Run `node scripts/check.mjs --fast` until it passes, then the full `node scripts/check.mjs` once. One passing full check is enough: do not rerun tests to prove stability or timing.',
    `4. Commit everything on this branch: \`feat(${t.id}): ${t.title.replace(/[`"]/g, "'").slice(0, 70)}\`. Give a one-line reason in the body for every existing test you changed.`,
    '5. End with a summary of at most 10 lines: what you built, tests added, assumptions recorded.',
    '', 'Unsettled question: follow CLAUDE.md rule 1 (record it in vault/build/assumptions.md and keep going).',
    'If the existing code already satisfies the ticket, add tests that prove the acceptance criteria and commit them.',
    'If you truly cannot finish, commit what works and make the last line of your answer start with "BLOCKED:" and the reason.',
  ].join('\n');
}
function fixPrompt(kind, detail) {
  return kind === 'check'
    ? `The full check (node scripts/check.mjs) failed after your work. The failing lines are below; the full output is in check.log in this folder. Fix the cause (do not weaken tests), rerun the full check until it passes, and commit.\n\n${detail.slice(0, 9000)}`
    : `An independent reviewer found blocking problems. Fix each one, rerun the full check (node scripts/check.mjs) until it passes, and commit. If you believe a finding is wrong, say why in one line instead of changing code.\n\n${detail}`;
}
function reviewerPrompt(t, security, plan) {
  return [
    `You are the independent reviewer for ticket ${t.id}: ${t.title}. You did not write this code.`,
    'Review the change on this branch: run `git diff --stat develop...HEAD` and `git diff develop...HEAD`.',
    `Check it against: the ticket's acceptance criteria (ids ${JSON.stringify(t.acs || [])} in vault/spec/acceptance-criteria.md), the spec files and decisions in the ticket record below${plan ? `, vault/plans/${t.id}.md` : ''}, and CLAUDE.md.`,
    'Report ONLY blocking problems: an acceptance criterion not met; wrong behaviour or a bug; a security or data-isolation hole (missing RLS, a policy that lets one company see or change another company\'s rows, an auth or permission bypass, a secret in code); a test deleted or weakened without a good reason; text that contradicts a mockup.',
    'Do not report style, naming, refactors, extra tests for impossible cases, or nice-to-haves. The automatic checks (typecheck, lint, tests, build, e2e) already passed; do not rerun them.',
    security ? `This change touches security-sensitive paths (${security}). Check RLS, permissions and tenant isolation carefully.` : '',
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
  const r = await runClaude({ cwd: ROOT, prompt: 'Reply with the single word OK.', model: c.builder_model, effort: 'low',
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
// First failure: back in line (at the end), with any ticket named as needed first added to depends_on.
// Second failure: set aside for Josh (Josh 2026-11-13).
function setAside(s, t, reason, detail, wt, needs = []) {
  if (!(s.retries?.[t.id]) && !String(t.id).startsWith('EZD-REPAIR')) {
    s.retries = { ...(s.retries || {}), [t.id]: 1 };
    s.retry_log = { ...(s.retry_log || {}), [t.id]: { ts: now(), reason } };
    const added = addDeps(t.id, needs);
    s.current = null;
    cleanupWorktree(t.id);
    log(`REQUEUED ${t.id} (first failure: ${reason})${added.length ? `; now waits for ${added.join(', ')}` : ''}`);
    saveState(s);
    return;
  }
  s.set_aside[t.id] = { title: t.title, ts: now(), reason: s.retry_log?.[t.id] ? `${reason} (first try: ${s.retry_log[t.id].reason})` : reason, detail: detail || '', branch: `t/${t.id}`, worktree: path.relative(ROOT, wt) };
  s.current = null;
  log(`SET ASIDE ${t.id}: ${reason}`);
  saveState(s);
}
function cleanupWorktree(id) {
  const wt = path.join(ROOT, '.claude/worktrees', id);
  if (existsSync(wt)) git(['worktree', 'remove', '--force', wt]);
  git(['worktree', 'prune']);
  git(['branch', '-D', `t/${id}`]);
}
async function review(t, wt, s, round) {
  const c = cfg();
  const files = git(['diff', '--name-only', 'develop...HEAD'], wt).out.split('\n').filter(Boolean);
  const sec = files.filter((f) => SECURITY_PATHS.test(f)).slice(0, 8).join(', ');
  const plan = existsSync(path.join(ROOT, 'vault/plans', `${t.id}.md`));
  let model = c.reviewer_model;
  let r = await runClaude({ cwd: wt, prompt: reviewerPrompt(t, sec, plan), model, effort: c.reviewer_effort, name: `${t.id} review ${round}`, timeoutMin: c.reviewer_timeout_min, readOnly: true });
  recordUsage(t.id, 'reviewer', model, r);
  if ((r.limited || r.code !== 0 || !r.res) && model !== c.reviewer_fallback) {
    log(`reviewer ${model} unavailable for ${t.id} (${r.limited ? 'limit' : 'error'}); using ${c.reviewer_fallback}`);
    model = c.reviewer_fallback;
    r = await runClaude({ cwd: wt, prompt: reviewerPrompt(t, sec, plan), model, effort: c.reviewer_effort, name: `${t.id} review ${round} fallback`, timeoutMin: c.reviewer_timeout_min, readOnly: true });
    recordUsage(t.id, 'reviewer', model, r);
  }
  if (r.limited) return { limited: true, r };
  const v = parseVerdict(r.res?.result ?? '');
  if (!v) return { verdict: 'error', detail: `reviewer gave no verdict: ${String(r.res?.result ?? r.text).slice(-1500)}` };
  if (v.verdict === 'fail' && !(v.findings || []).length) v.verdict = 'pass';
  return { verdict: v.verdict, findings: v.findings || [], blockedBy: ticketIds(v.blocked_by), notes: v.notes || '', detail: JSON.stringify(v.findings || [], null, 1), model };
}

async function doTicket(t, s, kind = 'ticket') {
  const c = cfg();
  const wt = path.join(ROOT, '.claude/worktrees', t.id);
  cleanupWorktree(t.id);
  const add = git(['worktree', 'add', '-B', `t/${t.id}`, wt, 'develop']);
  if (!add.ok) { setAside(s, t, 'could not create worktree', add.err, wt); return 'aside'; }
  s.current = t.id; saveState(s);
  log(`START ${t.id} · ${t.title}`);
  const plan = existsSync(path.join(ROOT, 'vault/plans', `${t.id}.md`));
  const prompt = t.prompt || builderPrompt(t, plan, readingList(t.id));
  let r = await runClaude({ cwd: wt, prompt, model: c.builder_model, effort: c.builder_effort, name: `${t.id} build`, timeoutMin: c.builder_timeout_min });
  recordUsage(t.id, 'builder', c.builder_model, r);
  if (r.limited) { await handleLimit(r, s); cleanupWorktree(t.id); s.current = null; saveState(s); return 'limit'; }
  let session = r.res?.session_id;
  if (r.timedOut && !git(['log', '--oneline', 'develop..HEAD'], wt).out) { setAside(s, t, `builder timed out after ${c.builder_timeout_min} min with no commits`, r.text.slice(-2000), wt); return 'aside'; }
  if (r.timedOut) log(`${t.id} builder timed out after ${c.builder_timeout_min} min but committed work; checking it`);
  const blocked = /^BLOCKED:.*$/m.exec(String(r.res?.result ?? ''));
  if (!session && !r.timedOut) { setAside(s, t, 'builder crashed (no result)', r.text.slice(-2000), wt); return 'aside'; }

  const commitAll = () => { if (git(['status', '--porcelain'], wt).out) { git(['add', '-A'], wt); git(['commit', '-q', '-m', `feat(${t.id}): uncommitted builder work`], wt); } };
  const fix = async (kindOf, detail, label) => {
    const f = await runClaude({ cwd: wt, prompt: fixPrompt(kindOf, detail), model: c.builder_model, effort: c.builder_effort, name: `${t.id} ${label}`, resume: session, timeoutMin: c.builder_timeout_min });
    recordUsage(t.id, `builder-fix-${kindOf}`, c.builder_model, f);
    if (f.res?.session_id) session = f.res.session_id;
    return f;
  };

  // check, with fix rounds
  commitAll();
  if (!git(['log', '--oneline', 'develop..HEAD'], wt).out) {
    setAside(s, t, blocked ? blocked[0] : 'builder made no commits', String(r.res?.result ?? '').slice(-2000), wt, blocked ? ticketIds(blocked[0]) : []); return 'aside';
  }
  let ck = check(wt);
  for (let i = 0; !ck.pass && i < c.fix_rounds; i++) {
    log(`${t.id} check red (round ${i + 1}); builder fixing`);
    const f = await fix('check', ck.detail, `fix check ${i + 1}`);
    if (f.limited) { await handleLimit(f, s); cleanupWorktree(t.id); s.current = null; saveState(s); return 'limit'; }
    commitAll();
    ck = check(wt);
  }
  if (!ck.pass) { setAside(s, t, `check still red after ${c.fix_rounds} fix rounds`, ck.detail.slice(-3000), wt); s.red_streak++; saveState(s); return 'red'; }

  // review, with fix rounds
  let rv = await review(t, wt, s, 1);
  if (rv.verdict === 'fail' && rv.blockedBy?.length) { setAside(s, t, `review: needs ${rv.blockedBy.join(', ')} first`, rv.detail, wt, rv.blockedBy); return 'aside'; }
  for (let i = 0; i < c.review_rounds && (rv.verdict === 'fail'); i++) {
    log(`${t.id} review fail (${rv.findings.length} findings); builder fixing`);
    const f = await fix('review', rv.detail, `fix review ${i + 1}`);
    if (f.limited) { await handleLimit(f, s); cleanupWorktree(t.id); s.current = null; saveState(s); return 'limit'; }
    commitAll();
    ck = check(wt);
    if (!ck.pass) { setAside(s, t, 'check red after a review fix', ck.detail.slice(-3000), wt); return 'aside'; }
    rv = await review(t, wt, s, i + 2);
  }
  if (rv.limited) { await handleLimit(rv.r, s); cleanupWorktree(t.id); s.current = null; saveState(s); return 'limit'; }
  if (rv.verdict !== 'pass') { setAside(s, t, rv.verdict === 'fail' ? `review still failing after ${c.review_rounds} fix rounds` : 'reviewer error', rv.detail, wt, rv.blockedBy || []); return 'aside'; }

  // develop moved while we worked? bring it in and re-check
  if (!git(['merge-base', '--is-ancestor', 'develop', 'HEAD'], wt).ok) {
    const m = git(['merge', '-q', '--no-edit', 'develop'], wt);
    if (!m.ok) { git(['merge', '--abort'], wt); setAside(s, t, 'merge clash with develop', m.err || m.out, wt); return 'aside'; }
    ck = check(wt);
    if (!ck.pass) { setAside(s, t, 'check red after merging newer develop', ck.detail.slice(-3000), wt); return 'aside'; }
  }

  // squash merge into develop in the main checkout
  if (git(['rev-parse', '--abbrev-ref', 'HEAD']).out !== 'develop') { setAside(s, t, 'main checkout is not on develop', '', wt); return 'aside'; }
  const sq = git(['merge', '--squash', `t/${t.id}`]);
  if (!sq.ok) { git(['reset', '--merge']); setAside(s, t, 'squash merge failed', sq.err || sq.out, wt); return 'aside'; }
  const msg = `feat(${t.id}): ${t.title.slice(0, 90)}\n\nBuild v3 loop: Opus builder, ${rv.model} review pass${rv.notes ? ` (${rv.notes.slice(0, 200)})` : ''}.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  const cm = git(['commit', '-q', '-m', msg]);
  if (!cm.ok) { git(['reset', '--merge']); setAside(s, t, 'commit on develop failed', cm.err || cm.out, wt); return 'aside'; }
  const sha = git(['rev-parse', '--short', 'HEAD']).out;
  s.done.push(t.id);
  s.merged.push({ id: t.id, title: t.title, commit: sha, ts: now(), kind });
  s.current = null; s.red_streak = 0; s.push_pending = true;
  saveState(s);
  cleanupWorktree(t.id);
  log(`MERGED ${t.id} as ${sha}`);
  return 'merged';
}

function push(s) {
  if (!s.push_pending) return;
  const p = git(['push', '-q', 'origin', 'develop']);
  if (p.ok) { s.push_pending = false; saveState(s); log('pushed develop'); } else log(`push failed (will retry): ${p.err.slice(0, 200)}`);
}
function commitBuildFiles(msg) {
  const files = ['vault/build/state.json', 'vault/build/set-aside.md', 'vault/build/usage.jsonl', 'vault/build/loop.log', 'vault/build/trial-report.md'].filter((f) => existsSync(path.join(ROOT, f)));
  git(['add', '--', ...files]);
  if (git(['diff', '--cached', '--quiet', '--', ...files]).ok) return;
  git(['commit', '-q', '-m', `docs(build): ${msg}`, '--', ...files]);
}
function writeTrialReport(s) {
  const rows = readFileSync(P.usage, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  writeFileSync(P.report, reportMarkdown(rows, s));
  s.trial_report_written = true; saveState(s);
  log(`trial report written: ${path.relative(ROOT, P.report)}`);
}
async function guardDevelop(s) {
  log(`${s.red_streak} tickets in a row set aside on a red check; checking develop itself`);
  const id = 'DEVELOP-CHECK';
  cleanupWorktree(id);
  const wt = path.join(ROOT, '.claude/worktrees', id);
  git(['worktree', 'add', '-B', `t/${id}`, wt, 'develop']);
  const ck = check(wt);
  cleanupWorktree(id);
  s.red_streak = 0; saveState(s);
  if (ck.pass) { log('develop is green; the red tickets were their own problem'); return; }
  log('develop is red; running one repair build');
  const t = { id: `EZD-REPAIR-${Date.now().toString(36)}`, title: 'Repair: develop fails the check', acs: [], prompt:
    `develop fails the full check (node scripts/check.mjs). Read CLAUDE.md, find the cause, fix it without weakening any test, run the full check until it passes, and commit with message "fix(develop): <what>".\n\n${ck.detail.slice(-8000)}` };
  const res = await doTicket(t, s, 'repair');
  if (res !== 'merged') {
    writeFileSync(P.attention, `# Build loop stopped (${now()})\n\ndevelop fails scripts/check.mjs and one repair build did not fix it. See vault/build/set-aside.md (${t.id}) and vault/build/loop.log.\nDelete this file to let the loop continue.\n`);
    log('ATTENTION: develop is red and the repair failed; loop holds until vault/build/ATTENTION.md is deleted');
  }
}

// ---------- main ----------
async function main() {
  log(`loop start (pid ${process.pid})`);
  let lastNote = '';
  const note = (m) => { if (m !== lastNote) { log(m); lastNote = m; } };
  for (;;) {
    const c = cfg();
    const s = loadState();
    if (existsSync(P.stop)) { note('STOP file present; waiting'); await sleep(60000); continue; }
    if (existsSync(P.attention)) { note('ATTENTION.md present; waiting'); await sleep(10 * 60000); continue; }
    if (s.sleep_until && Date.parse(s.sleep_until) > Date.now()) {
      if (Date.parse(s.next_probe || 0) <= Date.now()) {
        const p = await limitCleared();
        if (p.ok) { log('usage available again; resuming'); delete s.sleep_until; delete s.next_probe; saveState(s); continue; }
        s.next_probe = new Date(Date.now() + c.limit_probe_minutes * 60000).toISOString();
        // A limit that is still on pushes the fallback wait out, so the loop keeps probing instead of retrying a ticket.
        // Any other probe failure leaves the fallback wait as it is.
        if (p.limited && Date.parse(s.sleep_until) < Date.parse(s.next_probe)) s.sleep_until = s.next_probe;
        saveState(s);
      }
      await sleep(Math.min(60000, Date.parse(s.sleep_until) - Date.now()));
      continue;
    }
    if (s.current) { log(`recovering: ${s.current} was interrupted; starting it fresh`); cleanupWorktree(s.current); s.current = null; saveState(s); }
    push(s);
    if (s.red_streak >= c.red_streak_guard) { await guardDevelop(s); commitBuildFiles('develop guard'); push(s); continue; }
    const t = pickNext(s);
    if (!t) { note(`no eligible ticket; checking again every ${c.idle_minutes} min`); await sleep(c.idle_minutes * 60000); continue; }
    lastNote = '';
    const res = await doTicket(t, s);
    const s2 = loadState();
    const mergedTickets = s2.merged.filter((m) => m.kind === 'ticket').length;
    if (res === 'merged' && mergedTickets % 5 === 0) {
      const rows = readFileSync(P.usage, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
      log(`usage after ${mergedTickets} merges:\n${summarize(rows).text}`);
    }
    const handled = mergedTickets + Object.keys(s2.set_aside).length;
    if (!s2.trial_report_written && handled >= c.trial_size) writeTrialReport(s2);
    commitBuildFiles(`${t.id} ${res}`);
    push(loadState());
  }
}

if (process.argv.includes('--plan')) {
  // Dry run: the order the loop would take the next N tickets in, assuming each merges. Writes nothing.
  const n = Number(process.argv[process.argv.indexOf('--plan') + 1]) || 20;
  const s = readJson(P.state, null) || { done: seedDone(), set_aside: {} };
  for (let i = 0; i < n; i++) {
    const t = pickNext(s);
    if (!t) { console.log('(no more eligible tickets)'); break; }
    console.log(`${String(i + 1).padStart(2)}. ${t.id} · phase ${t.phase} · ${t.title.slice(0, 90)}`);
    s.done.push(t.id);
  }
} else {
  main().catch((e) => { log(`loop crashed: ${e?.stack || e}`); process.exit(1); });
}
