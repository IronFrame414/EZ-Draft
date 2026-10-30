// EZD-278: when the current phase B has no product ticket the launcher can build, the build pool also takes the next
// signed-off phase's ready product tickets (plan sections 3 and 4, D1-D15). Runs on a temporary copy of vault/ with a fixed
// ledger state; each test resets the synthetic state first, so the tests do not depend on each other.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, copyFileSync, writeFileSync, appendFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NT_URL = pathToFileURL(path.join(root, 'vault/tools/next_ticket.mjs')).href;
let dir;
let vault;
let signoffText;
let spikeText;
let importN = 0;
const file = (rel) => path.join(vault, rel);
const run = (name, args) => spawnSync(process.execPath, [file(`tools/${name}`), ...args], {
  encoding: 'utf8', cwd: dir, env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(dir) },
});
const nextUnit = () => run('next_ticket.mjs', ['--next-unit']).stdout.trim();
const check = () => run('next_ticket.mjs', ['--check']);
const tickets = () => JSON.parse(readFileSync(file('tickets/tickets.json'), 'utf8'));
const setTickets = (data) => writeFileSync(file('tickets/tickets.json'), JSON.stringify(data, null, 1) + '\n');
const editTicket = (id, fn) => { const d = tickets(); fn(d.tickets.find((t) => t.id === id)); setTickets(d); };

const [P1, X1, P2, P2b, P3, T1] = ['EZD-9970', 'EZD-9971', 'EZD-9972', 'EZD-9973', 'EZD-9974', 'EZD-9975'];
const PHASE = { [P1]: 1, [X1]: 1, [P2]: 2, [P2b]: 2, [P3]: 3, [T1]: 1 };
const BASE_STATUS = { [P1]: 'ready', [X1]: 'blocked', [P2]: 'ready', [P2b]: 'ready', [P3]: 'todo', [T1]: 'blocked' };
const BASE_PATH = { [P1]: 'app/src/a.ts', [X1]: 'app/src/b.ts', [P2]: 'app/src/c.ts', [P2b]: 'app/src/d.ts', [P3]: 'app/src/e.ts', [T1]: 'vault/tools/x.mjs' };
const BASE_TRACK = { [T1]: 'tooling' };
const planText = (cell) => `## 1. What to build\n### Build steps\n| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |\n| --- | --- | --- | --- | --- | --- |\n| 1 | ${cell} | new | none | none | none |\n`;
const writePlan = (id, cell) => writeFileSync(file(`plans/${id}.md`), planText(cell));

// STATUS.md columns after the ID: Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes
function setStatus(id, status, extra = {}) {
  const p = file('tickets/STATUS.md');
  const note = status === 'blocked' ? 'phase-overlap test' : 'Synthetic ticket of scripts/ledger/phase-overlap.test.mjs.';
  const complexity = status === 'todo' ? '' : 'low';
  const row = `| ${id} | ${PHASE[id]} | Overlap test ${id} | ${status} | ${complexity} | ${extra.deps ?? ''} |  |  | ${note} |`;
  writeFileSync(p, readFileSync(p, 'utf8').replace(new RegExp(`^\\| ${id} \\|.*$`, 'm'), row));
}

function reset() {
  for (const f of ['handoff/BUDGET_HOLD.md', 'tickets/gates/phase-01.md', 'cost/phase-01.md']) rmSync(file(f), { force: true });
  const d = tickets();
  for (const t of d.tickets) delete t.priority;
  for (const id of Object.keys(PHASE)) {
    const t = d.tickets.find((x) => x.id === id);
    delete t.track;
    t.depends_on = [];
    if (BASE_TRACK[id]) t.track = BASE_TRACK[id];
  }
  setTickets(d);
  for (const id of Object.keys(PHASE)) { writePlan(id, `\`${BASE_PATH[id]}\``); setStatus(id, BASE_STATUS[id]); }
  writeFileSync(file('spec/SIGNOFF.md'), signoffText);
  writeFileSync(file('spikes/EZD-031.md'), spikeText);
  rmSync(path.join(dir, '.claude'), { recursive: true, force: true });
}

before(async () => {
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-phase-overlap-')));
  vault = path.join(dir, 'vault');
  cpSync(path.join(root, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
  mkdirSync(path.join(dir, 'docs'), { recursive: true });
  cpSync(path.join(root, 'docs', 'architecture.md'), path.join(dir, 'docs', 'architecture.md'));
  for (const f of ['handoff/STOP', 'handoff/BUDGET_HOLD.md', 'handoff/LAUNCHER_FIX.md', 'tickets/gates/phase-01.md', 'cost/phase-01.md', 'plans/review-phase-02.md']) {
    if (existsSync(file(f))) rmSync(file(f));
  }
  const planTrack = (await import(NT_URL)).planTrack;

  const data = tickets();
  for (const t of data.tickets) delete t.priority;
  writeFileSync(file('questions/QUESTIONS.md'), readFileSync(file('questions/QUESTIONS.md'), 'utf8')
    .replace(/^(\|\s*Q-\d{4}\s*\|[^|]*\|[^|]*\|[^|]*\|\s*)open(\s*\|)/gm, '$1answered-agent$2'));

  // Every real phase 1 and 2 ticket not done is blocked; other in-progress/review tickets are ready.
  const phaseOf = new Map(data.tickets.map((t) => [t.id, t.phase]));
  writeFileSync(file('tickets/STATUS.md'), readFileSync(file('tickets/STATUS.md'), 'utf8').split('\n').map((line) => {
    const m = line.match(/^\| (EZD-\w+) \|(.*)\|$/);
    if (!m) return line;
    const c = m[2].split('|');
    const st = c[2].trim();
    const ph = phaseOf.get(m[1]);
    if ((ph === 1 || ph === 2) && st !== 'done') { c[2] = ' blocked '; if (!c[7].trim()) c[7] = ' phase-overlap test '; }
    else if (st === 'in-progress' || st === 'review') c[2] = ' ready ';
    return `| ${m[1]} |${c.join('|')}|`;
  }).join('\n'));
  for (const t of data.tickets) {
    if ((t.phase !== 1 && t.phase !== 2) || t.id in PHASE) continue;
    const planFile = file(`plans/${t.id}.md`);
    if (!('architecture' in t) && !existsSync(planFile)) t.architecture = [];
    if (!('track' in t) && typeof planTrack === 'function' && existsSync(planFile) && planTrack(readFileSync(planFile, 'utf8')) === 'tooling') t.track = 'tooling';
  }

  // The synthetic tickets (D11), their STATUS rows, phase file rows and plans.
  const model = (ph) => data.tickets.find((t) => t.phase === ph) ?? data.tickets.find((t) => t.phase === 1);
  for (const id of Object.keys(PHASE)) {
    const m = model(PHASE[id]);
    data.tickets.push({ id, phase: PHASE[id], title: `Overlap test ${id}`, spec_files: m.spec_files, decisions: m.decisions, mockups: [],
      phase_file: `tickets/phases/phase-0${PHASE[id]}.md`, depends_on: [], acs: [], architecture: [] });
    appendFileSync(file('tickets/STATUS.md'), `| ${id} | ${PHASE[id]} | Overlap test ${id} | ${BASE_STATUS[id]} |  |  |  |  | x |\n`);
    appendFileSync(file(`tickets/phases/phase-0${PHASE[id]}.md`), `\n| ${id} | Overlap test ${id} | The test passes. | — | — |\n`);
  }
  setTickets(data);
  appendFileSync(file('spec/SIGNOFF.md'), '| 3 | phase-overlap test | 2026-10-30 | test |\n');
  signoffText = readFileSync(file('spec/SIGNOFF.md'), 'utf8');
  spikeText = readFileSync(file('spikes/EZD-031.md'), 'utf8');
  reset();
  const acs = run('gen_acs.mjs', []);
  assert.equal(acs.status, 0, acs.stdout + acs.stderr);
  const c = check();
  assert.equal(c.status, 0, c.stdout + c.stderr);
  assert.ok(!nextUnit().startsWith('none: architecture checkpoint'), nextUnit());
});

// D13: the copy's module, imported fresh; the pool as ticket IDs.
async function pool() {
  const m = await import(`${pathToFileURL(file('tools/next_ticket.mjs')).href}?n=${++importN}`);
  return m.buildPool(m.blockingPhase()).map((t) => t.id);
}
// "deps X1": P1 depends on X1 (blocked), so P1 is not buildable.
function depsX1() {
  editTicket(P1, (t) => { t.depends_on = [X1]; });
  setStatus(P1, 'ready', { deps: X1 });
}
const dropSignoff = (n) => {
  const re = new RegExp(`^\\|\\s*${n}\\s*\\|`);
  writeFileSync(file('spec/SIGNOFF.md'), readFileSync(file('spec/SIGNOFF.md'), 'utf8').split('\n').filter((l) => !re.test(l)).join('\n'));
};

test('EZD-278 O1 phase 1 has nothing buildable (AC-EZD-278-1)', () => {
  reset(); depsX1();
  assert.equal(nextUnit(), `build ${P2}`);
});

test('EZD-278 O2 priority inside the next phase (AC-EZD-278-1)', () => {
  reset(); depsX1(); editTicket(P2b, (t) => { t.priority = 1; });
  assert.equal(nextUnit(), `build ${P2b}`);
});

test('EZD-278 O3 phase 1 only ready ticket is held (AC-EZD-278-1)', () => {
  reset();
  mkdirSync(path.join(dir, '.claude/hooks'), { recursive: true });
  for (const f of readdirSync(path.join(root, '.claude/hooks')).filter((n) => n.endsWith('.mjs'))) {
    copyFileSync(path.join(root, '.claude/hooks', f), path.join(dir, '.claude/hooks', f));
  }
  writeFileSync(path.join(dir, '.claude/hooks/grants.json'), '{}\n');
  writePlan(P1, '`app/src/a.ts` and `scripts/gate.mjs`');
  assert.equal(nextUnit(), `build ${P2}`);
});

test('EZD-278 O4 phase 1 buildable first (AC-EZD-278-2)', () => {
  reset();
  assert.equal(nextUnit(), `build ${P1}`);
});

test('EZD-278 O5 phase order beats priority (AC-EZD-278-2)', () => {
  reset(); editTicket(P2, (t) => { t.priority = 1; });
  assert.equal(nextUnit(), `build ${P1}`);
});

test('EZD-278 O6 tooling still first (AC-EZD-278-2)', () => {
  reset(); depsX1(); setStatus(T1, 'ready');
  assert.equal(nextUnit(), `build ${T1}`);
});

test('EZD-278 O7 pool order (AC-EZD-278-2)', async () => {
  reset();
  assert.deepEqual(await pool(), [P1, P2, P2b]);
});

test('EZD-278 O8 next phase unsigned (AC-EZD-278-3)', async () => {
  reset(); depsX1(); dropSignoff(2);
  assert.deepEqual(await pool(), []);
});

test('EZD-278 O9 current phase unsigned (AC-EZD-278-3)', async () => {
  reset(); depsX1(); dropSignoff(1);
  assert.deepEqual(await pool(), []);
});

test('EZD-278 O10 only the next phase (AC-EZD-278-3)', async () => {
  reset(); depsX1(); setStatus(P2, 'blocked'); setStatus(P2b, 'blocked'); setStatus(P3, 'ready');
  assert.deepEqual(await pool(), []);
  assert.ok(!nextUnit().startsWith('build '), nextUnit());
});

test('EZD-278 O11 checkpoint not met (AC-EZD-278-3)', async () => {
  reset(); depsX1();
  assert.deepEqual(await pool(), [P2, P2b], 'control: checkpoint met');
  rmSync(file('spikes/EZD-031.md'));
  assert.deepEqual(await pool(), []);
});

test('EZD-278 O12 PROCESS.md rule (AC-EZD-278-2)', () => {
  const text = readFileSync(path.join(root, 'vault/PROCESS.md'), 'utf8');
  assert.ok(text.includes("its ready product tickets build whenever the current phase has none the launcher can build, and the current phase's buildable ones always go first (Josh 2026-10-29, EZD-278)."), 'missing D6 sentence');
  assert.ok(!text.includes('its product builds start once the current phase is wrapped'), 'old text still present');
});

test('EZD-278 O13 gate-phase text (AC-EZD-278-1)', () => {
  const text = readFileSync(path.join(root, '.claude/skills/gate-phase/SKILL.md'), 'utf8');
  assert.ok(text.includes(" Product tickets of a later phase that this PR carries (step 6) are not audited at this gate; their own phase's gate audits them. A `done` product ticket of this phase whose commit is already on main (built early, EZD-278) is audited at this gate with its plan and `git show <commit>`."), 'missing D7 (1)');
  assert.ok(text.includes("- **Later-phase tickets in this PR** (EZD-278): each `done` product ticket of a later phase (`STATUS.md`) whose commit is not on main (`git merge-base --is-ancestor <commit> origin/main` exits 1): ID, phase, title, commit. They were built while this phase had nothing the launcher could build; they reach main with this PR, and Josh tests them at their own phase's gate."), 'missing D7 (2)');
});

test('EZD-278 O14 phase-auditor text (AC-EZD-278-1)', () => {
  const text = readFileSync(path.join(root, '.claude/agents/phase-auditor.md'), 'utf8');
  assert.ok(text.includes(". Product tickets of a later phase that the orchestrator lists as in this PR are not audited here; their own phase's gate audits them, with their plan and commit (EZD-278)."), 'missing D8');
});
