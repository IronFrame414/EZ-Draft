#!/usr/bin/env node
// EZ Draft ledger tool (PROCESS.md section 13). No dependencies; Node 22.
//   node vault/tools/next_ticket.mjs                 -> the next ticket to work on, any stage (phases in order; dependencies first)
//   node vault/tools/next_ticket.mjs --ready         -> the next `ready` ticket whose dependencies are all done (Stage 3)
//   node vault/tools/next_ticket.mjs --next-unit     -> the next unit for the launcher: `<unit> <ticket-or-phase>` or `none: <reason>`
//   node vault/tools/next_ticket.mjs --check         -> validates the ledger (exit 1 on any problem)
//   node vault/tools/next_ticket.mjs --report        -> regenerates vault/PROGRESS.md and vault/tickets/TRACE.md
//   node vault/tools/next_ticket.mjs --lessons <role> <area> [<area>...]  -> prints the lessons a dispatch carries
//   node vault/tools/next_ticket.mjs --phase N       -> counts by status for phase N
// Rules: phases in order; in the current phase, the lowest-numbered ticket whose depends_on are all done. depends_on comes
// from tickets.json (base IDs already expanded). Architecture checkpoint (PROCESS-EZDRAFT.md section 6): no ticket numbered
// 200 or higher starts until EZD-000 is done and each spike EZD-027..EZD-031 has a go / no-go note in vault/spikes/.
// Stage 1 of a phase needs a sign-off row in vault/spec/SIGNOFF.md (PROCESS.md section 5).
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const vault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(vault, '..');
const STATUSES = ['todo', 'planned', 'questions', 'ready', 'in-progress', 'review', 'done', 'blocked'];
const COMPLEXITY = ['low', 'medium', 'high'];
const SPIKES = ['EZD-027', 'EZD-028', 'EZD-029', 'EZD-030', 'EZD-031'];
const CHECKPOINT_FROM = 200; // ticket numbers at or above this wait for the architecture checkpoint
const LIMIT_IN_PROGRESS = 1; // PROCESS-EZDRAFT.md section 8

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const data = JSON.parse(readFileSync(path.join(vault, 'tickets/tickets.json'), 'utf8'));
const tickets = new Map(data.tickets.map((t) => [t.id, t]));
const pad2 = (n) => String(n).padStart(2, '0');

// STATUS.md rows. Columns after the ID: Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes
const rows = new Map();
const statusText = read(path.join(vault, 'tickets/STATUS.md'));
for (const line of statusText.split(/\r?\n/)) {
  const m = line.match(/^\|\s*(EZD-\d+[a-z]?)\s*\|(.*)\|\s*$/);
  if (!m) continue;
  const c = m[2].split('|').map((s) => s.trim());
  rows.set(m[1], { phase: Number(c[0]), title: c[1], status: c[2], complexity: c[3] || '', depends: c[4] || '', commit: c[5] || '', tests: c[6] || '', notes: c[7] || '' });
}

const num = (id) => { const m = id.match(/EZD-(\d+)([a-z]?)/); return Number(m[1]) * 100 + (m[2] ? m[2].charCodeAt(0) - 96 : 0); };
const ticketNumber = (id) => Number(id.match(/EZD-(\d+)/)[1]);
const status = (id) => rows.get(id)?.status;
const depsDone = (t) => t.depends_on.every((d) => status(d) === 'done');
const phaseTickets = (p) => data.tickets.filter((t) => t.phase === p);

function spikeNote(id) {
  const f = path.join(vault, 'spikes', `${id}.md`);
  if (!existsSync(f)) return null;
  const m = readFileSync(f, 'utf8').match(/^Verdict:\s*(go|no-go)\b/im);
  return m ? m[1].toLowerCase() : null;
}
function checkpointMissing() {
  const missing = [];
  if (status('EZD-000') !== 'done') missing.push('EZD-000 not done');
  for (const s of SPIKES) if (!spikeNote(s)) missing.push(`no go/no-go note at vault/spikes/${s}.md`);
  return missing;
}
function signedOff(phase) {
  const txt = read(path.join(vault, 'spec/SIGNOFF.md'));
  return txt.split(/\r?\n/).some((l) => new RegExp(`^\\|\\s*${phase}\\s*\\|`).test(l));
}
function questionsForPhase(phase) {
  const q = read(path.join(vault, 'questions/QUESTIONS.md'));
  const out = { open: 0, escalated: 0 };
  for (const line of q.split(/\r?\n/)) {
    const m = line.match(/^\|\s*(Q-\d{4})\s*\|\s*([^|]*)\|\s*[^|]*\|\s*[^|]*\|\s*(open|answered-agent|escalated|answered-josh|confirmed-josh)\s*\|/);
    if (!m) continue;
    const ph = m[2].trim();
    const inPhase = ph === 'all' || ph.startsWith(`${phase} /`) || ph.startsWith(`${phase}/`) || ph === String(phase) || /^every ticket/.test(ph);
    if (!inPhase) continue;
    if (m[3] === 'open') out.open++;
    if (m[3] === 'escalated') out.escalated++;
  }
  return out;
}

// Q-0129 (Josh, 2026-10-19): questions are answered automatically; only uncitable or product questions wait on Josh.
// Rows naming a ticket, with letter ranges such as "EZD-000b–EZD-000i" expanded.
function rowTickets(cell) {
  const ids = new Set(cell.match(/EZD-\d{3,4}[a-z]?/g) || []);
  for (const m of cell.matchAll(/EZD-(\d{3,4})([a-z])\s*[–-]\s*EZD-\1([a-z])/g))
    for (let c = m[2].charCodeAt(0); c <= m[3].charCodeAt(0); c++) ids.add(`EZD-${m[1]}${String.fromCharCode(c)}`);
  return ids;
}
function questionRows() {
  const out = [];
  for (const line of read(path.join(vault, 'questions/QUESTIONS.md')).split(/\r?\n/)) {
    const m = line.match(/^\|\s*(Q-\d{4})\s*\|\s*([^|]*)\|\s*[^|]*\|\s*[^|]*\|\s*(open|answered-agent|escalated|answered-josh|confirmed-josh)\s*\|/);
    if (m) out.push({ id: m[1], tickets: rowTickets(m[2]), status: m[3] });
  }
  return out;
}
// A questions unit has work when the phase has an open row, or a `planned` or `questions` ticket none of whose questions
// is escalated (its QPs still need Q-IDs, or its answers are in and it can go ready). A ticket with an escalated question
// waits on Josh while the rest of the phase builds.
function questionsWork(p) {
  if (questionsForPhase(p).open) return true;
  const rows = questionRows();
  return phaseTickets(p).filter((t) => ['planned', 'questions'].includes(status(t.id)))
    .some((t) => !rows.some((r) => r.tickets.has(t.id) && r.status === 'escalated'));
}
// Loop guard (Q-0129): the launcher records the ledger fingerprint before and after each questions unit in
// vault/handoff/.questions-last-run.json. A run that changed nothing is not repeated until the ledger changes.
export function questionsFingerprint() {
  return createHash('sha256').update(read(path.join(vault, 'questions/QUESTIONS.md'))).update(read(path.join(vault, 'tickets/STATUS.md'))).digest('hex');
}
function questionsGuarded(p) {
  let last; try { last = JSON.parse(read(path.join(vault, 'handoff/.questions-last-run.json'))); } catch { return false; }
  return last?.phase === p && last.before === last.after && last.after === questionsFingerprint();
}
const questionsDue = (p) => questionsWork(p) && !questionsGuarded(p);

// Q-0129 (Josh, 2026-10-19): the plan unit turns the plan's QP-n questions into `open` Q-IDs as it finishes, so the
// questions unit answers them at once (plan-ticket skill, ledger step). Only lines that open with QP-n are new questions.
const QP_LINE = /^(\s*(?:[-*]|\d+\.)?\s*\**\s*)(QP-\d+)\b(\**\s*[:.)]?\s*\**\s*)(.*)$/;
export function assignQuestionIds(ticket) {
  const planPath = path.join(vault, 'plans', `${ticket}.md`);
  const qPath = path.join(vault, 'questions/QUESTIONS.md');
  const qLines = readFileSync(qPath, 'utf8').split('\n');
  let max = 0, last = -1;
  qLines.forEach((l, i) => { const m = l.match(/^\|\s*Q-(\d{4})\s*\|/); if (m) { max = Math.max(max, Number(m[1])); last = i; } });
  const phase = tickets.get(ticket)?.phase ?? '?';
  const plan = readFileSync(planPath, 'utf8').split('\n');
  const start = plan.findIndex((l) => /^## (?:10\. )?Open questions/.test(l));
  const ids = [], rows = [];
  for (let i = start + 1; start >= 0 && i < plan.length && !/^## /.test(plan[i]); i++) {
    const m = plan[i].match(QP_LINE);
    if (!m) continue;
    const id = `Q-${String(++max).padStart(4, '0')}`;
    const text = m[4].replace(/\|/g, '\\|').trim();
    rows.push(`| ${id} | ${phase} / ${ticket} (plan ${m[2]}) | planner (${new Date().toISOString().slice(0, 10)}) | ${text} | open |  |  |  |`);
    plan[i] = `${m[1]}${id} (was ${m[2]})${m[3]}${m[4]}`;
    ids.push(id);
  }
  if (!ids.length) return ids;
  qLines.splice(last + 1, 0, ...rows);
  writeFileSync(qPath, qLines.join('\n'));
  writeFileSync(planPath, plan.join('\n'));
  return ids;
}
function check() {
  const problems = [];
  for (const id of tickets.keys()) if (!rows.has(id)) problems.push(`${id} is in tickets.json but not in STATUS.md`);
  for (const [id, r] of rows) {
    const t = tickets.get(id);
    if (!t) { problems.push(`${id} is in STATUS.md but not in tickets.json (a split must update both)`); continue; }
    if (!STATUSES.includes(r.status)) problems.push(`${id} has unknown status "${r.status}"`);
    if (r.status === 'done' && !/^[0-9a-f]{7,40}$/i.test(r.commit)) problems.push(`${id} is done but has no commit hash`);
    if (r.status === 'blocked' && !r.notes) problems.push(`${id} is blocked but has no note`);
    if (['ready', 'in-progress', 'review', 'done'].includes(r.status) && !COMPLEXITY.includes(r.complexity))
      problems.push(`${id} is ${r.status} but has no complexity rating (low, medium or high)`);
    if (['in-progress', 'review', 'done'].includes(r.status) && !depsDone(t))
      problems.push(`${id} is ${r.status} but depends on unfinished ${t.depends_on.filter((d) => status(d) !== 'done').join(', ')}`);
    if (r.status !== 'todo' && !signedOff(t.phase)) problems.push(`${id} is ${r.status} but phase ${t.phase} has no sign-off in vault/spec/SIGNOFF.md`);
    if (!Array.isArray(t.acs) || !t.acs.length) problems.push(`${id} has no acceptance criteria in tickets.json (run node vault/tools/gen_acs.mjs)`);
    if (['in-progress', 'review', 'done'].includes(r.status) && ticketNumber(id) >= CHECKPOINT_FROM && checkpointMissing().length)
      problems.push(`${id} is ${r.status} but the architecture checkpoint is not met`);
  }
  const busy = [...rows].filter(([, r]) => r.status === 'in-progress' || r.status === 'review').map(([id]) => id);
  if (busy.length > LIMIT_IN_PROGRESS) problems.push(`more than ${LIMIT_IN_PROGRESS} ticket in progress: ${busy.join(', ')} (PROCESS-EZDRAFT.md section 8)`);
  if (existsSync(path.join(vault, 'tickets/PHASES.md')) === false) problems.push('vault/tickets/PHASES.md is missing');
  const ac = spawnSync(process.execPath, [path.join(vault, 'tools/gen_acs.mjs'), '--check'], { encoding: 'utf8' });
  if (ac.status !== 0) problems.push((ac.stdout || ac.stderr).trim().split('\n')[0]);
  return problems;
}

function currentPhase() {
  const open = data.tickets.filter((t) => status(t.id) !== 'done');
  return open.length ? Math.min(...open.map((t) => t.phase)) : null;
}
// The phase with work left: a phase whose tickets are all done or blocked is finished for Stage 3 (its gate decides the rest).
function workingPhase() {
  const phase = currentPhase();
  let p = phase;
  while (p !== null && phaseTickets(p).every((t) => ['done', 'blocked'].includes(status(t.id)))) {
    const next = data.tickets.filter((t) => t.phase > p && status(t.id) !== 'done');
    p = next.length ? Math.min(...next.map((t) => t.phase)) : null;
  }
  return { phase, p };
}
function candidates(p, wantReady) {
  return phaseTickets(p)
    .filter((t) => !['done', 'blocked', 'in-progress', 'review'].includes(status(t.id)))
    .filter((t) => !wantReady || status(t.id) === 'ready')
    .filter(depsDone)
    .sort((a, b) => num(a.id) - num(b.id));
}
const inFlight = () => data.tickets.find((t) => ['in-progress', 'review'].includes(status(t.id)));

// Phase gate state, from the gate record the gate-phase unit writes (vault/tickets/gates/phase-NN.md).
function gateState(p) {
  const f = path.join(vault, 'tickets/gates', `phase-${pad2(p)}.md`);
  if (!existsSync(f)) return { state: 'not-gated' };
  const txt = readFileSync(f, 'utf8');
  const sha = txt.match(/^Develop at PR:\s*([0-9a-f]{7,40})/im)?.[1];
  const pr = txt.match(/^PR:\s*(\S+)/im)?.[1];
  if (/^Merged:\s*yes/im.test(txt)) return { state: 'merged', pr };
  if (sha) {
    const r = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', sha, 'origin/main'], { encoding: 'utf8' });
    if (r.status === 0) return { state: 'merged', pr, detected: true };
  }
  return { state: pr ? 'pr-open' : 'gating', pr };
}
const wrapped = (p) => existsSync(path.join(vault, 'cost', `phase-${pad2(p)}.md`));

function nextUnit() {
  if (existsSync(path.join(vault, 'handoff/STOP'))) return 'none: vault/handoff/STOP exists';
  const problems = check();
  if (problems.length) return `none: ledger check failed (${problems.length}); run --check`;
  const hold = existsSync(path.join(vault, 'handoff/BUDGET_HOLD.md'));
  const flying = inFlight();
  if (flying) return `build ${flying.id}`;
  if (hold) return 'none: budget hold (vault/handoff/BUDGET_HOLD.md); no ticket in progress';
  const phase = currentPhase();
  if (phase === null) return 'none: every ticket is done';
  // A finished phase (all done or blocked) goes through gate -> Josh merges -> wrap before the next phase starts.
  for (const p of [...new Set(data.tickets.map((t) => t.phase))].sort((a, b) => a - b)) {
    if (p > phase) break;
    const ts = phaseTickets(p);
    if (!ts.every((t) => ['done', 'blocked'].includes(status(t.id)))) continue;
    if (wrapped(p)) continue;
    const g = gateState(p);
    if (g.state === 'not-gated' || g.state === 'gating') return `gate-phase ${p}`;
    if (g.state === 'pr-open') return `none: waiting on Josh to test and merge the phase ${p} PR (${g.pr})`;
    if (g.state === 'merged') return `wrap ${p}`;
  }
  const { p } = workingPhase();
  if (p === null) return `none: only blocked tickets left (from phase ${phase}); see STATUS.md notes`;
  const ts = phaseTickets(p);
  if (!signedOff(p)) return `none: phase ${p} spec not signed off (spec-check unit needs Josh)`;
  const st = (s) => ts.filter((t) => status(t.id) === s);
  // Stage 1
  const todo = st('todo').filter(depsDone).sort((a, b) => num(a.id) - num(b.id));
  const planOrder = ts.filter((t) => status(t.id) === 'todo').sort((a, b) => num(a.id) - num(b.id));
  if (planOrder.length) return `plan ${planOrder[0].id}`;
  const reviewFile = path.join(vault, 'plans', `review-phase-${pad2(p)}.md`);
  const inStage3 = ts.some((t) => ['ready', 'in-progress', 'review', 'done'].includes(status(t.id)));
  if (!inStage3 && (st('planned').length || st('questions').length) && !existsSync(reviewFile)) return `review-plans ${p}`;
  // Stage 2, and Q-0129: questions are answered before any build, in any stage of the phase
  if (questionsDue(p)) return `questions ${p}`;
  if (!inStage3 && (st('planned').length || st('questions').length)) {
    const q = questionsForPhase(p);
    if (q.escalated) return `none: waiting on Josh (${q.escalated} escalated question${q.escalated === 1 ? '' : 's'} for phase ${p}; vault/questions/phase-${pad2(p)}-for-josh.md)`;
    return `none: the last questions ${p} unit changed nothing (loop guard, Q-0129); see vault/handoff/CURRENT.md`;
  }
  // Stage 3; tickets still in `questions` wait on their own answer while ready tickets build
  if (ticketNumber(ts[0].id) >= CHECKPOINT_FROM || ts.some((t) => ticketNumber(t.id) >= CHECKPOINT_FROM)) {
    const missing = checkpointMissing();
    if (missing.length) return `none: architecture checkpoint not met (${missing.join('; ')})`;
  }
  const ready = candidates(p, true);
  if (ready.length) return `build ${ready[0].id}`;
  const waiting = [...st('questions'), ...st('planned')].map((t) => t.id);
  if (waiting.length) {
    if (questionsGuarded(p)) return `none: the last questions ${p} unit changed nothing (loop guard, Q-0129); waiting: ${waiting.join(', ')}`;
    return `none: waiting on Josh (tickets with open questions: ${waiting.join(', ')}); nothing else is ready in phase ${p}`;
  }
  const blocked = st('blocked').map((t) => t.id);
  if (blocked.length) return `none: waiting on Josh (blocked: ${blocked.join(', ')}); nothing else is ready in phase ${p}`;
  return `none: nothing ready in phase ${p}; waiting on dependencies`;
  void todo;
}

function lessons(role, areas) {
  const f = path.join(vault, 'lessons', `${role}.md`);
  if (!existsSync(f)) return `(no lessons file for role ${role})`;
  const txt = readFileSync(f, 'utf8');
  const want = new Set(areas.map((a) => a.toLowerCase().replace(/,$/, '')));
  const entries = txt.split(/^(?=## L-\d+)/m).filter((e) => e.startsWith('## L-'));
  const out = [];
  for (const e of entries) {
    const head = e.split('\n')[0];
    const m = head.match(/areas:\s*([^]*?)\s+seen:/);
    const its = (m ? m[1] : '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (want.has('all') || !its.length || its.some((a) => want.has(a))) out.push(e.trim());
  }
  return out.length ? out.join('\n\n') : `(no lessons for ${role} in areas ${[...want].join(', ')})`;
}

function report() {
  // TRACE.md: AC -> ticket -> tests (test names from the plan's Tests table when a plan exists)
  const testsOf = (id) => {
    const f = path.join(vault, 'plans', `${id}.md`);
    if (!existsSync(f)) return [];
    const s = readFileSync(f, 'utf8');
    const m = s.match(/^## (?:\d+\. )?Tests[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
    if (!m) return [];
    return m[1].split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|')).map((l) => l.split('|')[1].trim()).filter((c) => c && c !== 'Test' && !/^-+$/.test(c));
  };
  let trace = '# Trace: acceptance criteria → ticket → tests\n\nGenerated by `node vault/tools/next_ticket.mjs --report`; never hand-edited. Tests are the rows of the ticket plan\'s Tests table (none until the ticket is planned). An AC is covered when its ticket is `done`.\n\n';
  const phases = [...new Set(data.tickets.map((t) => t.phase))].sort((a, b) => a - b);
  let uncovered = 0;
  for (const p of phases) {
    trace += `## Phase ${p}\n\n| AC | Ticket | Status | Tests (from the plan) |\n| --- | --- | --- | --- |\n`;
    for (const t of phaseTickets(p)) {
      const tests = testsOf(t.id);
      for (const ac of t.acs || []) {
        const st = status(t.id) || '?';
        if (st !== 'done') uncovered++;
        trace += `| ${ac} | ${t.id} | ${st} | ${tests.length ? tests.join('; ') : '(no plan yet)'} |\n`;
      }
    }
    trace += '\n';
  }
  trace += `ACs not yet covered by a merged ticket: ${uncovered}.\n`;
  writeFileSync(path.join(vault, 'tickets/TRACE.md'), trace);

  // PROGRESS.md
  const done = read(path.join(vault, 'DONE.md')).split(/\r?\n/).filter((l) => /^\d{4}-\d\d-\d\d/.test(l) || /^- \d{4}-\d\d-\d\d/.test(l) || /^\| \d{4}/.test(l));
  const q = read(path.join(vault, 'questions/QUESTIONS.md'));
  const openQ = (q.match(/\|\s*open\s*\|/g) || []).length;
  const escQ = (q.match(/\|\s*escalated\s*\|/g) || []).length;
  let budget = {};
  try { budget = JSON.parse(read(path.join(vault, 'budget.json')) || '{}'); } catch {}
  const spend = weekSpend(budget);
  let md = `# Progress\n\nGenerated by \`node vault/tools/next_ticket.mjs --report\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC; never hand-edited. Plain-words record of what is built: \`vault/DONE.md\`.\n\n`;
  md += `Next unit: \`${nextUnit()}\`\n\n## Phases\n\n| Phase | Tickets | Done | Blocked | Remaining | ACs covered |\n| --- | --- | --- | --- | --- | --- |\n`;
  for (const p of phases) {
    const ts = phaseTickets(p);
    const d = ts.filter((t) => status(t.id) === 'done');
    const b = ts.filter((t) => status(t.id) === 'blocked');
    const acTotal = ts.reduce((n, t) => n + (t.acs?.length || 0), 0);
    const acDone = d.reduce((n, t) => n + (t.acs?.length || 0), 0);
    md += `| ${p} | ${ts.length} | ${d.length} | ${b.length} | ${ts.length - d.length - b.length} | ${acDone} / ${acTotal} |\n`;
  }
  md += `\n## Last ten merges\n\n${done.slice(-10).reverse().map((l) => (l.startsWith('- ') ? l : `- ${l}`)).join('\n') || '(none yet)'}\n\n`;
  md += `## Questions\n\nOpen: ${openQ} · Escalated to Josh: ${escQ} (\`vault/questions/QUESTIONS.md\`)\n\n`;
  md += `## This week's estimated spend\n\n${spend.text}\n`;
  writeFileSync(path.join(vault, 'PROGRESS.md'), md);
  console.log('wrote vault/PROGRESS.md and vault/tickets/TRACE.md');
}

// Week window from budget.json `week_resets` ("Monday 02:00 America/New_York"); spend from cost/log.jsonl.
export function weekStart(budget, now = new Date()) {
  const spec = String(budget.week_resets || 'Monday 02:00 America/New_York');
  const m = spec.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(\d{1,2}):(\d\d)\s+(\S+)/i);
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dow = m ? days.indexOf(m[1].toLowerCase()) : 1;
  const hh = m ? Number(m[2]) : 2, mm = m ? Number(m[3]) : 0, tz = m ? m[4] : 'America/New_York';
  // Walk back day by day in the target zone until we hit the reset weekday at or before now.
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = (d) => Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  for (let back = 0; back < 8; back++) {
    const d = new Date(now.getTime() - back * 86400000);
    const p = parts(d);
    if (days.indexOf(p.weekday.toLowerCase().slice(0, 3) === 'sun' ? 'sunday' : days.find((x) => x.startsWith(p.weekday.toLowerCase().slice(0, 3)))) !== dow) continue;
    // Build the reset instant on that date: find the UTC time whose zoned clock reads hh:mm.
    const utcGuess = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hh, mm);
    let best = utcGuess;
    for (let off = -14 * 60; off <= 14 * 60; off += 15) {
      const cand = utcGuess + off * 60000;
      const q = parts(new Date(cand));
      if (Number(q.hour) % 24 === hh && Number(q.minute) === mm && Number(q.day) === Number(p.day)) { best = cand; break; }
    }
    if (best <= now.getTime()) return new Date(best);
  }
  return new Date(now.getTime() - 7 * 86400000);
}
export function weekSpend(budget, now = new Date()) {
  const start = weekStart(budget, now);
  let main = 0, fable = 0, runs = 0;
  for (const line of read(path.join(vault, 'cost/log.jsonl')).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (new Date(r.ts) < start) continue;
    runs++;
    main += Number(r.est_usd) || 0;
    fable += Number(r.fable_est_usd) || 0;
  }
  const ceiling = budget.weekly_ceiling_usd_est;
  const fc = budget.fable_ceiling_usd_est;
  const pct = ceiling ? Math.round((main / ceiling) * 100) : null;
  const text = `Since ${start.toISOString().slice(0, 16).replace('T', ' ')} UTC: ${runs} run(s), est. $${main.toFixed(2)}${ceiling ? ` of $${ceiling} (${pct}%)` : ' (no weekly ceiling set)'}; Fable est. $${fable.toFixed(2)}${fc ? ` of $${fc}` : ''}.`;
  return { start, main, fable, runs, ceiling, pct, text };
}

const args = process.argv.slice(2);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (args.includes('--check')) {
    const p = check();
    if (p.length) { console.log(`LEDGER INVALID (${p.length})`); p.forEach((x) => console.log(`- ${x}`)); process.exit(1); }
    console.log(`LEDGER OK: ${rows.size} tickets`);
    process.exit(0);
  }
  if (args.includes('--next-unit')) { console.log(nextUnit()); process.exit(0); }
  if (args.includes('--report')) { report(); process.exit(0); }
  if (args.includes('--lessons')) {
    const i = args.indexOf('--lessons');
    const role = args[i + 1]; const areas = args.slice(i + 2);
    if (!role) { console.error('usage: --lessons <role> <area> [<area>...]'); process.exit(1); }
    console.log(lessons(role, areas.length ? areas : ['all']));
    process.exit(0);
  }
  if (args.includes('--phase')) {
    const n = Number(args[args.indexOf('--phase') + 1]);
    const counts = {};
    for (const t of phaseTickets(n)) counts[status(t.id)] = (counts[status(t.id)] || 0) + 1;
    console.log(`Phase ${n}: ` + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', '));
    process.exit(0);
  }
  const problems = check();
  if (problems.length) { console.log('LEDGER INVALID - fix before picking a ticket (run with --check)'); process.exit(1); }
  const { phase, p } = workingPhase();
  if (phase === null) { console.log('ALL DONE'); process.exit(0); }
  if (p === null) { console.log(`ONLY BLOCKED TICKETS LEFT (from phase ${phase}). See STATUS.md notes.`); process.exit(3); }
  const wantReady = args.includes('--ready');
  const flying = inFlight();
  if (flying) { console.log(`${flying.id} IN FLIGHT (${status(flying.id)}) - finish it first`); process.exit(0); }
  const cands = candidates(p, wantReady);
  if (cands.length && ticketNumber(cands[0].id) >= CHECKPOINT_FROM) {
    const missing = checkpointMissing();
    if (missing.length) { console.log(`ARCHITECTURE CHECKPOINT: ${cands[0].id} cannot start: ${missing.join('; ')}`); process.exit(4); }
  }
  if (!cands.length) { console.log(`NOTHING READY in phase ${p}${wantReady ? ' (status ready)' : ''}; waiting on dependencies or questions`); process.exit(2); }
  const t = cands[0];
  console.log(t.id);
  console.log(`phase ${t.phase} · ${t.title} · status ${status(t.id)} · complexity ${rows.get(t.id)?.complexity || '-'} · depends on ${t.depends_on.join(', ') || 'nothing'}`);
  console.log(`spec: ${t.spec_files.join(', ') || '(see Spec ref)'}${t.mockups.length ? ` · mockups: ${t.mockups.join(', ')}` : ''} · ACs: ${(t.acs || []).join(', ')}`);
}
