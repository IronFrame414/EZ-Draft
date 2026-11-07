// EZD-360 T3-T5 (vault/plans/EZD-360.md section 4): phase 56 ranks right after phase 5 and before phase 6 in `--next-unit`.
// Runs on a temporary copy of vault/ (the scripts/ledger/phase-overlap.test.mjs pattern): phases 5, 56 and 6 are signed off and
// hold synthetic tickets; every real ticket of phases 1 to 6 that is not done is blocked; phases 0 to 4 are wrapped. Each test resets the state first.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { seedRecordViews } from '../launcher/test-utils/record-views.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NT_URL = pathToFileURL(path.join(root, 'vault/tools/next_ticket.mjs')).href;
let dir;
let vault;
let signoffText;
const file = (rel) => path.join(vault, rel);
const run = (name, args) => spawnSync(process.execPath, [file(`tools/${name}`), ...args], {
  encoding: 'utf8', cwd: dir, env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(dir) },
});
const nextUnit = () => run('next_ticket.mjs', ['--next-unit']).stdout.trim();
const tickets = () => JSON.parse(readFileSync(file('tickets/tickets.json'), 'utf8'));
const setTickets = (data) => writeFileSync(file('tickets/tickets.json'), JSON.stringify(data, null, 1) + '\n');
const pad2 = (n) => String(n).padStart(2, '0');

const [A5, A56, A6, TOOL6] = ['EZD-9960', 'EZD-9961', 'EZD-9962', 'EZD-9963'];
const PHASE = { [A5]: 5, [A56]: 56, [A6]: 6, [TOOL6]: 6 };
const BASE_STATUS = { [A5]: 'ready', [A56]: 'ready', [A6]: 'ready', [TOOL6]: 'blocked' };
const BASE_PATH = { [A5]: 'app/src/a.ts', [A56]: 'app/src/b.ts', [A6]: 'app/src/c.ts', [TOOL6]: 'vault/tools/x.mjs' };
const planText = (cell) => `## 1. What to build\n### Build steps\n| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |\n| --- | --- | --- | --- | --- | --- |\n| 1 | ${cell} | new | none | none | none |\n`;

// STATUS.md columns after the ID: Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes
function setStatus(id, status) {
  const p = file('tickets/STATUS.md');
  const note = status === 'blocked' ? 'phase-rank test' : 'Synthetic ticket of scripts/ledger/phase-rank-order.test.mjs.';
  const complexity = status === 'todo' ? '' : 'low';
  const commit = status === 'done' ? 'abc1234' : '';
  const row = `| ${id} | ${PHASE[id]} | Rank test ${id} | ${status} | ${complexity} |  | ${commit} |  | ${note} |`;
  writeFileSync(p, readFileSync(p, 'utf8').replace(new RegExp(`^\\| ${id} \\|.*$`, 'm'), row));
}
const wrap = (p) => writeFileSync(file(`cost/phase-${pad2(p)}.md`), `# Phase ${p} wrap (EZD-360 test)\n`);

function reset() {
  for (const f of ['handoff/BUDGET_HOLD.md', 'cost/phase-05.md']) rmSync(file(f), { force: true });
  for (const p of [1, 2, 3, 4]) wrap(p);
  const d = tickets();
  for (const t of d.tickets) delete t.priority;
  for (const id of Object.keys(PHASE)) {
    const t = d.tickets.find((x) => x.id === id);
    delete t.track;
    t.depends_on = [];
    if (id === TOOL6) t.track = 'tooling';
  }
  setTickets(d);
  for (const id of Object.keys(PHASE)) {
    writeFileSync(file(`plans/${id}.md`), planText(`\`${BASE_PATH[id]}\``));
    setStatus(id, BASE_STATUS[id]);
  }
  writeFileSync(file('spec/SIGNOFF.md'), signoffText);
  rmSync(path.join(dir, '.claude'), { recursive: true, force: true });
}

before(async () => {
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-phase-rank-')));
  vault = path.join(dir, 'vault');
  cpSync(path.join(root, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
  seedRecordViews(vault); // the committed snapshot's records, not the checkout's (2.14, L-041)
  mkdirSync(path.join(dir, 'docs'), { recursive: true });
  cpSync(path.join(root, 'docs', 'architecture.md'), path.join(dir, 'docs', 'architecture.md'));
  for (const f of ['handoff/STOP', 'handoff/BUDGET_HOLD.md', 'handoff/LAUNCHER_FIX.md']) if (existsSync(file(f))) rmSync(file(f));
    const planTrack = (await import(NT_URL)).planTrack;

  const data = tickets();
  for (const t of data.tickets) delete t.priority;
  writeFileSync(file('questions/QUESTIONS.md'), readFileSync(file('questions/QUESTIONS.md'), 'utf8')
    .replace(/^(\|\s*Q-\d{4}\s*\|[^|]*\|[^|]*\|[^|]*\|\s*)open(\s*\|)/gm, '$1answered-agent$2'));

  // Every real ticket of phases 1 to 6 that is not done is blocked (a blocked row needs a note); other in-progress/review tickets are ready.
  const quiet = (ph) => ph >= 1 && ph <= 6;
  const phaseOf = new Map(data.tickets.map((t) => [t.id, t.phase]));
  writeFileSync(file('tickets/STATUS.md'), readFileSync(file('tickets/STATUS.md'), 'utf8').split('\n').map((line) => {
    const m = line.match(/^\| (EZD-\w+) \|(.*)\|$/);
    if (!m) return line;
    const c = m[2].split('|');
    const st = c[2].trim();
    if (quiet(phaseOf.get(m[1])) && st !== 'done') { c[2] = ' blocked '; if (!c[7].trim()) c[7] = ' phase-rank test '; }
    else if (st === 'in-progress' || st === 'review') c[2] = ' ready ';
    return `| ${m[1]} |${c.join('|')}|`;
  }).join('\n'));
  for (const t of data.tickets) {
    if (!quiet(t.phase) || t.id in PHASE) continue;
    const planFile = file(`plans/${t.id}.md`);
    if (!('architecture' in t) && !existsSync(planFile)) t.architecture = [];
    if (!('track' in t) && typeof planTrack === 'function' && existsSync(planFile) && planTrack(readFileSync(planFile, 'utf8')) === 'tooling') t.track = 'tooling';
  }

  // The synthetic tickets, their STATUS rows, phase file rows and plans. Phase 56 has no phase file in the repo yet; the copy gets one.
  const model = (ph) => data.tickets.find((t) => t.phase === ph) ?? data.tickets.find((t) => t.phase === 5);
  writeFileSync(file('tickets/phases/phase-56.md'), '## Phase 56 · AI assistant (EZD-360 test)\n\n| ID | Ticket | Scope (what to build, concrete) | Done when (testable) | Depends on | Spec ref |\n| --- | --- | --- | --- | --- | --- |\n');
  for (const id of Object.keys(PHASE)) {
    const ph = PHASE[id];
    const m = model(ph);
    data.tickets.push({ id, phase: ph, title: `Rank test ${id}`, spec_files: m.spec_files, decisions: m.decisions, mockups: [],
      phase_file: `tickets/phases/phase-${pad2(ph)}.md`, depends_on: [], acs: [], architecture: [] });
    appendFileSync(file('tickets/STATUS.md'), `| ${id} | ${ph} | Rank test ${id} | ${BASE_STATUS[id]} |  |  |  |  | x |\n`);
    appendFileSync(file(`tickets/phases/phase-${pad2(ph)}.md`), `\n| ${id} | Rank test ${id} | The test passes. | — | — |\n`);
  }
  setTickets(data);
  appendFileSync(file('spec/SIGNOFF.md'), '| 5 | phase-rank test | 2026-11-07 | test |\n| 56 | phase-rank test | 2026-11-07 | test |\n| 6 | phase-rank test | 2026-11-07 | test |\n');
  signoffText = readFileSync(file('spec/SIGNOFF.md'), 'utf8');
  reset();
  const acs = run('gen_acs.mjs', []);
  assert.equal(acs.status, 0, acs.stdout + acs.stderr);
  // A live plan whose Architecture line differs from tickets.json is not this test's concern: align the copy's tickets.json to its plans.
  const drift = [...run('next_ticket.mjs', ['--check']).stdout.matchAll(/^- (EZD-\w+): plan Architecture line differs/gm)].map((m) => m[1]);
  for (const id of drift) run('next_ticket.mjs', ['--set-architecture', id]);
  const c = run('next_ticket.mjs', ['--check']);
  assert.equal(c.status, 0, c.stdout + c.stderr);
});

test('EZD-360 T3 phases 5, 56 and 6 open: the next unit names the phase 5 ticket (AC-EZD-360-2)', () => {
  reset();
  assert.equal(nextUnit(), `build ${A5}`);
});

test('EZD-360 T4 phase 5 done and wrapped: the next unit names the phase 56 ticket, not the phase 6 one (AC-EZD-360-2)', () => {
  reset();
  setStatus(A5, 'done');
  wrap(5);
  const out = nextUnit();
  assert.equal(out, `build ${A56}`);
  assert.ok(!out.includes('5.5'), out);
});

test('EZD-360 T5 a ready phase 6 tooling ticket is not picked while phase 56 blocks (AC-EZD-360-2)', () => {
  reset();
  setStatus(A5, 'done');
  wrap(5);
  setStatus(TOOL6, 'ready');
  const out = nextUnit();
  assert.notEqual(out, `build ${TOOL6}`);
  assert.equal(out, `build ${A56}`);
});

test('EZD-360 T10 phase 56 gates and wraps before phase 6 builds; the printed phase is 56 (AC-EZD-360-2, D-Return)', () => {
  reset();
  setStatus(A5, 'done');
  setStatus(A56, 'done');
  wrap(5);
  const gate = nextUnit();
  assert.equal(gate, 'gate-phase 56');
  assert.ok(!gate.includes('5.5'), gate);
  wrap(56);
  assert.equal(nextUnit(), `build ${A6}`);
});
