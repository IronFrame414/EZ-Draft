// EZD-253: build-system tickets run on their own track beside the product phases. A ticket whose plan's Build steps touch
// no file under app/, packages/, worker/ or supabase/ is marked "track": "tooling" in tickets.json; the phase gate, the
// phase PR and wrap do not wait for it, and the next phase is planned meanwhile. Runs on a temporary copy of vault/ with a
// fixed ledger state (plan section 4): four synthetic tickets, every other real phase 1 and 2 ticket not done is blocked.
// Each test resets the synthetic state first, so the tests do not depend on each other.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NT_URL = pathToFileURL(path.join(root, 'vault/tools/next_ticket.mjs')).href;
let dir;
let vault;
const file = (rel) => path.join(vault, rel);
const run = (name, args) => spawnSync(process.execPath, [file(`tools/${name}`), ...args], {
  encoding: 'utf8', cwd: dir, env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(dir) },
});
const nextUnit = () => run('next_ticket.mjs', ['--next-unit']).stdout.trim();
const check = () => run('next_ticket.mjs', ['--check']);
const tickets = () => JSON.parse(readFileSync(file('tickets/tickets.json'), 'utf8'));
const setTickets = (data) => writeFileSync(file('tickets/tickets.json'), JSON.stringify(data, null, 1) + '\n');
const editTicket = (id, fn) => { const d = tickets(); fn(d.tickets.find((t) => t.id === id)); setTickets(d); };

const [P1, T1, P2, T3] = ['EZD-9980', 'EZD-9981', 'EZD-9982', 'EZD-9983'];
const PHASE = { [P1]: 1, [T1]: 1, [P2]: 2, [T3]: 1 };
const BASE_STATUS = { [P1]: 'ready', [T1]: 'ready', [P2]: 'todo', [T3]: 'blocked' };
const BASE_PATH = { [P1]: 'app/src/x.ts', [T1]: 'vault/tools/x.mjs', [P2]: 'app/src/z.ts', [T3]: 'scripts/x.mjs' };
const BASE_TRACK = { [T1]: 'tooling', [T3]: 'tooling' };
const planText = (cell) => `## 1. What to build\n### Build steps\n| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |\n| --- | --- | --- | --- | --- | --- |\n| 1 | ${cell} | new | none | none | none |\n`;
const writePlan = (id, cell) => writeFileSync(file(`plans/${id}.md`), planText(cell));

// STATUS.md columns after the ID: Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes
function setStatus(id, status, extra = {}) {
  const p = file('tickets/STATUS.md');
  const commit = status === 'done' ? 'abc1234' : '';
  const note = status === 'blocked' ? 'tooling-track test' : 'Synthetic ticket of scripts/ledger/tooling-track.test.mjs.';
  const complexity = status === 'todo' ? '' : 'low';
  const row = `| ${id} | ${PHASE[id]} | Tooling test ${id} | ${status} | ${complexity} | ${extra.deps ?? ''} | ${extra.commit ?? commit} |  | ${note} |`;
  writeFileSync(p, readFileSync(p, 'utf8').replace(new RegExp(`^\\| ${id} \\|.*$`, 'm'), row));
}
const GATE = 'PR: https://github.com/x/y/pull/1\nMerged: yes\n';
const gateFile = () => writeFileSync(file('tickets/gates/phase-01.md'), GATE);
const wrapped = () => { gateFile(); writeFileSync(file('cost/phase-01.md'), '# tooling-track test\n'); };

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
}

before(async () => {
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-tooling-track-')));
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
    if ((ph === 1 || ph === 2) && st !== 'done') { c[2] = ' blocked '; if (!c[7].trim()) c[7] = ' tooling-track test '; }
    else if (st === 'in-progress' || st === 'review') c[2] = ' ready ';
    return `| ${m[1]} |${c.join('|')}|`;
  }).join('\n'));
  for (const t of data.tickets) {
    if ((t.phase !== 1 && t.phase !== 2) || t.id in PHASE) continue;
    const planFile = file(`plans/${t.id}.md`);
    if (!('architecture' in t) && !existsSync(planFile)) t.architecture = [];
    if (!('track' in t) && typeof planTrack === 'function' && existsSync(planFile) && planTrack(readFileSync(planFile, 'utf8')) === 'tooling') t.track = 'tooling';
  }

  // The synthetic tickets (same keys as priority.test.mjs), their STATUS rows, phase file rows and plans.
  const model = (ph) => data.tickets.find((t) => t.phase === ph) ?? data.tickets.find((t) => t.phase === 1);
  for (const id of Object.keys(PHASE)) {
    const m = model(PHASE[id]);
    data.tickets.push({ id, phase: PHASE[id], title: `Tooling test ${id}`, spec_files: m.spec_files, decisions: m.decisions, mockups: [],
      phase_file: `tickets/phases/phase-0${PHASE[id]}.md`, depends_on: [], acs: [], architecture: [] });
    appendFileSync(file('tickets/STATUS.md'), `| ${id} | ${PHASE[id]} | Tooling test ${id} | ${BASE_STATUS[id]} |  |  |  |  | x |\n`);
    appendFileSync(file(`tickets/phases/phase-0${PHASE[id]}.md`), `\n| ${id} | Tooling test ${id} | The test passes. | — | — |\n`);
  }
  setTickets(data);
  appendFileSync(file('spec/SIGNOFF.md'), '| 2 | tooling-track test | 2026-10-28 | test |\n');
  reset();
  const acs = run('gen_acs.mjs', []);
  assert.equal(acs.status, 0, acs.stdout + acs.stderr);
  const c = check();
  assert.equal(c.status, 0, c.stdout + c.stderr);
  assert.ok(!nextUnit().startsWith('none: architecture checkpoint'), nextUnit());
});

const done = (id) => setStatus(id, 'done');

test('EZD-253 U1 phase done, tooling ticket ready: gate-phase (AC-EZD-253-1)', () => {
  reset(); done(P1);
  assert.equal(nextUnit(), 'gate-phase 1');
});

test('EZD-253 U2 phase done, tooling ticket in progress: gate-phase (AC-EZD-253-1)', () => {
  reset(); done(P1); setStatus(T1, 'in-progress');
  assert.equal(nextUnit(), 'gate-phase 1');
});

test('EZD-253 U3 tooling ticket in review resumes its build (AC-EZD-253-1)', () => {
  reset(); done(P1); setStatus(T1, 'review');
  assert.equal(nextUnit(), `build ${T1}`);
});

test('EZD-253 U4 merged gate, no cost file, tooling ticket in progress: wrap (AC-EZD-253-1)', () => {
  reset(); done(P1); setStatus(T1, 'in-progress'); gateFile();
  assert.equal(nextUnit(), 'wrap 1');
});

test('EZD-253 U5 phase 1 wrapped, tooling ticket ready: next phase is planned (AC-EZD-253-2)', () => {
  reset(); done(P1); wrapped();
  assert.equal(nextUnit(), `plan ${P2}`);
});

test('EZD-253 U6 current phase still builds: signed-off next phase is planned (AC-EZD-253-2)', () => {
  reset();
  assert.equal(nextUnit(), `plan ${P2}`);
});

test('EZD-253 U7 tooling builds before product, then the next phase product (AC-EZD-253-3)', () => {
  reset(); done(P1); wrapped(); setStatus(P2, 'ready');
  assert.equal(nextUnit(), `build ${T1}`);
  done(T1);
  assert.equal(nextUnit(), `build ${P2}`);
});

test('EZD-253 U8 tooling keeps its priority and builds before product (AC-EZD-253-3)', () => {
  reset(); setStatus(P2, 'blocked'); // a todo P2 would be planned first (Stage 1-2 before builds, Q-0129)
  assert.equal(nextUnit(), `build ${T1}`);
  editTicket(P1, (t) => { t.priority = 1; });
  assert.equal(nextUnit(), `build ${T1}`);
  setStatus(T3, 'ready'); editTicket(T3, (t) => { t.priority = 1; });
  assert.equal(nextUnit(), `build ${T3}`);
});

test('EZD-253 U9 budget hold lets only the in-flight build run (AC-EZD-253-1)', () => {
  reset(); done(P1); setStatus(T1, 'in-progress');
  writeFileSync(file('handoff/BUDGET_HOLD.md'), 'budget hold (tooling-track test)\n');
  assert.equal(nextUnit(), `build ${T1}`);
  setStatus(T1, 'ready');
  assert.equal(nextUnit(), 'none: budget hold (vault/handoff/BUDGET_HOLD.md); no ticket in progress');
});

test('EZD-253 U10 check refuses a tooling mark whose plan changes a product dir (AC-EZD-253-3)', () => {
  for (const p of ['app/src/y.ts', 'packages/geometry/src/a.ts', 'worker/src/a.ts', 'supabase/migrations/a.sql']) {
    reset(); writePlan(T1, `\`${p}\``);
    const r = check();
    assert.equal(r.status, 1, `${p}: ${r.stdout}${r.stderr}`);
    assert.ok(r.stdout.includes(`${T1}: tooling mark but the plan changes ${p} (EZD-253)`), `${p}: ${r.stdout}`);
  }
});

test('EZD-253 U11 a dir name prefix is not a product dir; a leading ./ is removed (AC-EZD-253-3)', () => {
  reset(); writePlan(T1, '`apps/x.ts`');
  let r = check();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!r.stdout.includes(T1), r.stdout);
  writePlan(T1, '`./app/a.ts`');
  r = check();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(r.stdout.includes(`${T1}: tooling mark but the plan changes app/a.ts (EZD-253)`), r.stdout);
});

test('EZD-253 U12 a tooling mark needs a plan with Build steps files (AC-EZD-253-3)', () => {
  const line = `${T3}: tooling mark but its plan lists no Build steps files (EZD-253)`;
  reset(); rmSync(file(`plans/${T3}.md`));
  let r = check();
  assert.ok(r.stdout.includes(line), r.stdout + r.stderr);
  reset(); writePlan(T3, 'scripts/x.mjs');
  r = check();
  assert.ok(r.stdout.includes(line), r.stdout + r.stderr);
});

test('EZD-253 U13 a tooling plan without the mark is refused (AC-EZD-253-3)', () => {
  reset(); writePlan(P1, '`scripts/a.mjs`');
  const r = check();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(r.stdout.includes(`${P1}: plan changes no file under app/, packages/, worker/ or supabase/ but tickets.json has no tooling mark (run --set-architecture ${P1})`), r.stdout);
});

test('EZD-253 U14 a track value other than tooling is refused (AC-EZD-253-3)', () => {
  reset(); editTicket(P1, (t) => { t.track = 'product'; });
  const r = check();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(r.stdout.includes(`${P1}: track "product" is not "tooling" (EZD-253)`), r.stdout);
});

test('EZD-253 U15 --set-architecture writes and removes the mark (AC-EZD-253-3)', () => {
  reset(); writePlan(P1, '`scripts/a.mjs`');
  let r = run('next_ticket.mjs', ['--set-architecture', P1]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.startsWith(`ARCHITECTURE KEPT ${P1}`), r.stdout);
  let t = tickets().tickets.find((x) => x.id === P1);
  const keys = Object.keys(t);
  assert.equal(t.track, 'tooling');
  assert.equal(keys[keys.indexOf('architecture') + 1], 'track');
  writePlan(P1, '`app/src/x.ts`');
  r = run('next_ticket.mjs', ['--set-architecture', P1]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  t = tickets().tickets.find((x) => x.id === P1);
  assert.ok(!('track' in t));
  r = check();
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('EZD-253 U16 planTrack and PRODUCT_DIRS (AC-EZD-253-3)', async () => {
  const nt = await import(NT_URL);
  assert.equal(typeof nt.planTrack, 'function', 'planTrack is exported');
  assert.equal(nt.planTrack(planText('`app/a.ts`')), 'product');
  assert.equal(nt.planTrack(planText('`docs/a.md`')), 'tooling');
  assert.equal(nt.planTrack('## 1. What to build\nNo table here.\n'), 'product');
  assert.deepEqual(nt.PRODUCT_DIRS, ['app', 'packages', 'worker', 'supabase']);
});

test('EZD-253 U17 gate-phase, wrap, phase-auditor and PROCESS.md carry the new sentences (AC-EZD-253-1)', () => {
  const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
  const gate = read('.claude/skills/gate-phase/SKILL.md');
  const wrap = read('.claude/skills/wrap/SKILL.md');
  const auditor = read('.claude/agents/phase-auditor.md');
  const process_ = read('vault/PROCESS.md');
  const has = (text, s, label) => assert.ok(text.includes(s), `missing (${label}): ${s}`);
  const lacks = (text, s, label) => assert.ok(!text.includes(s), `old text still present (${label}): ${s}`);

  // D14 gate-phase
  has(gate, 'Every product ticket in the phase must be `done` or `blocked`; tooling tickets (`"track": "tooling"` in `tickets.json`, EZD-253) may be in any status and do not hold the gate, the PR or wrap.', 'D14-1');
  has(gate, ' Also give it the output of `node vault/tools/next_ticket.mjs --tooling $ARGUMENTS`: ACs of tooling tickets not `done` are not counted at this gate; a `done` tooling ticket of an earlier phase whose commit is not on main (`git merge-base --is-ancestor <commit> origin/main` exits 1) is audited at this gate with its plan.', 'D14-2');
  has(gate, 'no product fix ticket of the phase is open (a fix ticket whose plan marks it tooling is listed in the PR body instead, EZD-253)', 'D14-3');
  has(gate, '- **Tooling tickets still open** (EZD-253): each `--tooling $ARGUMENTS` line whose status is not `done` (ID, title, status); their merges reach main with the next phase PR. **Tooling tickets from earlier phases in this PR:** each `done` line of an earlier phase whose commit is not on main.', 'D14-4');
  lacks(gate, 'Every ticket in the phase must be `done` or `blocked`.', 'D14-1');
  lacks(gate, 'no fix ticket of the phase is open', 'D14-3');

  // D15 wrap
  has(wrap, "the launcher builds the product ones before the next phase's product tickets; tooling ones build on the tooling track (EZD-253)", 'D15-1');
  has(wrap, "Handoff: next unit is what `node vault/tools/next_ticket.mjs --next-unit` prints (a signed-off next phase may already be planned, EZD-253); `none: phase <N> spec not signed off` means the next phase's `spec-check` (needs Josh).", 'D15-2');
  lacks(wrap, 'the launcher builds them before the next phase starts', 'D15-1');
  lacks(wrap, "Handoff: next unit is the next phase's `spec-check` (needs Josh) or, if its spec is already signed off, `plan <first ticket>`.", 'D15-2');

  // D16 phase-auditor
  has(auditor, "Does every AC of the phase's product tickets, and of the tooling tickets the orchestrator lists as in this PR, map to a merged ticket with passing tests (TRACE.md)? ACs of tooling tickets still open are not counted (EZD-253).", 'D16');
  lacks(auditor, 'Does every AC in the phase map to a merged ticket with passing tests (TRACE.md)?', 'D16');

  // D17 PROCESS.md
  has(process_, '- **Tooling track** (Josh 2026-10-28, EZD-253): a tooling ticket is one whose plan\'s Build steps change no file under `app/`, `packages/`, `worker/` or `supabase/`; `--set-architecture` marks it `"track": "tooling"` in `tickets.json` and `--check` refuses a mark the plan does not support. Tooling tickets build before product tickets, but the gate, the phase PR, wrap and the next phase do not wait for them; the PR lists the open ones and their merges reach main with the next phase PR. A signed-off next phase is planned, plan-reviewed and questioned while the current phase builds; its product builds start once the current phase is wrapped.', 'D17-1');
  has(process_, 'every product ticket is `done` or explicitly deferred by Josh (open tooling tickets carry over, section 2)', 'D17-2');
  has(process_, 'Stage 3 ends when every product ticket in the phase is `done` or `blocked` (tooling tickets build on, section 2).', 'D17-3');
  has(process_, 'every AC of a product ticket in the phase, and of each tooling ticket the PR carries, must map', 'D17-4');
  has(process_, '- The next phase starts at Stage 0, unless it is already signed off; then its planning may already have run (section 2, Tooling track).', 'D17-5');
  lacks(process_, 'every ticket is `done` or explicitly deferred by Josh', 'D17-2');
  lacks(process_, 'Stage 3 ends when every ticket in the phase is `done` or `blocked`.', 'D17-3');
  lacks(process_, 'every AC in the phase must map', 'D17-4');
  assert.ok(!process_.split('\n').includes('- The next phase starts at Stage 0.'), 'old text still present (D17-5)');
});

test('EZD-253 U18 --tooling lists the tooling tickets up to a phase (AC-EZD-253-1)', () => {
  reset();
  let r = run('next_ticket.mjs', ['--tooling', '1']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const lines = r.stdout.split('\n');
  assert.ok(lines.includes(`${T1}\t1\tready\t-\tTooling test ${T1}`), r.stdout);
  assert.ok(!lines.some((l) => l.startsWith(`${P1}\t`)), r.stdout);
  r = run('next_ticket.mjs', ['--tooling', 'x']);
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('usage: --tooling <phase number>'), r.stderr);
});

test('EZD-253 U19 nothing tooling is ready: the fall-through message names the open ticket (AC-EZD-253-3)', async () => {
  const saved = ['tickets/STATUS.md', 'tickets/tickets.json', 'spec/SIGNOFF.md'].map((f) => [f, readFileSync(file(f), 'utf8')]);
  const costWritten = [];
  try {
    const planTrack = (await import(NT_URL)).planTrack;
    const d = tickets();
    const later = d.tickets.filter((t) => t.phase >= 3);
    const phaseOf = new Map(d.tickets.map((t) => [t.id, t.phase]));
    writeFileSync(file('tickets/STATUS.md'), readFileSync(file('tickets/STATUS.md'), 'utf8').split('\n').map((line) => {
      const m = line.match(/^\| (EZD-\w+) \|(.*)\|$/);
      if (!m || !(phaseOf.get(m[1]) >= 3)) return line;
      const c = m[2].split('|');
      if (c[2].trim() !== 'done') { c[2] = ' blocked '; if (!c[7].trim()) c[7] = ' tooling-track test '; }
      return `| ${m[1]} |${c.join('|')}|`;
    }).join('\n'));
    for (const t of later) {
      const planFile = file(`plans/${t.id}.md`);
      if (!('architecture' in t) && !existsSync(planFile)) t.architecture = [];
      if (!('track' in t) && typeof planTrack === 'function' && existsSync(planFile) && planTrack(readFileSync(planFile, 'utf8')) === 'tooling') t.track = 'tooling';
    }
    setTickets(d);
    const signed = new Set([...readFileSync(file('spec/SIGNOFF.md'), 'utf8').matchAll(/^\|\s*(\d+)\s*\|/gm)].map((m) => Number(m[1])));
    for (const n of [...new Set(later.map((t) => t.phase))].sort((a, b) => a - b)) {
      if (!signed.has(n)) appendFileSync(file('spec/SIGNOFF.md'), `| ${n} | tooling-track test | 2026-10-28 | test |\n`);
    }
    reset(); done(P1); setStatus(P2, 'blocked'); wrapped();
    editTicket(T1, (t) => { t.depends_on = [T3]; });
    setStatus(T1, 'ready', { deps: T3 });
    for (const n of new Set(d.tickets.map((t) => t.phase))) {
      const f = `cost/phase-${String(n).padStart(2, '0')}.md`;
      if (!existsSync(file(f))) { writeFileSync(file(f), '# tooling-track test\n'); costWritten.push(f); }
    }
    const c = check();
    assert.equal(c.status, 0, c.stdout + c.stderr);
    assert.equal(nextUnit(), `none: no tooling ticket is ready; waiting on dependencies or questions (open: ${T1})`);
  } finally {
    for (const [f, text] of saved) writeFileSync(file(f), text);
    for (const f of costWritten) rmSync(file(f), { force: true });
    reset();
  }
});

test('EZD-253 U20 a guard grant for a tooling ticket of an earlier phase holds only that ticket (AC-EZD-253-3)', () => {
  try {
    mkdirSync(path.join(dir, '.claude/hooks'), { recursive: true });
    for (const f of ['guard-paths.mjs', 'lib.mjs']) copyFileSync(path.join(root, '.claude/hooks', f), path.join(dir, '.claude/hooks', f));
    writeFileSync(path.join(dir, '.claude/hooks/grants.json'), '{}\n');
    reset(); done(P1); wrapped(); writePlan(T1, '`scripts/run.mjs`'); setStatus(P2, 'ready');
    assert.equal(nextUnit(), `build ${P2}`);
    appendFileSync(file(`plans/${P2}.md`), '| 2 | `scripts/run.mjs` | new | none | none | none |\n');
    const needs = run('next_ticket.mjs', ['--grant-needs']);
    assert.deepEqual(JSON.parse(needs.stdout), [{ id: T1, paths: ['scripts/run.mjs'] }, { id: P2, paths: ['scripts/run.mjs'] }]);
    assert.equal(nextUnit(), `none: waiting on Josh (guard grant for ${T1}: scripts/run.mjs; ${P2}: scripts/run.mjs; see vault/handoff/)`);
  } finally {
    rmSync(path.join(dir, '.claude'), { recursive: true, force: true });
    reset();
  }
});
