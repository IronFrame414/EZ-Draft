// EZD-384 (vault/plans/EZD-384.md, section 4): --plan-step and the brief rules in vault/tools/next_ticket.mjs, run on a
// temporary copy of vault/ (makeLedgerCopy). Tests run in order; every test starts with reset().
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeLedgerCopy } from '../launcher/test-utils/ledger-copy.mjs';
import { repairable } from '../launcher-idle.mjs';

const pad2 = (n) => String(n).padStart(2, '0');
const A = 'EZD-9841', B = 'EZD-9842', C = 'EZD-9843', D = 'EZD-9844', E = 'EZD-9845', G = 'EZD-9846';
const SYNTH = [A, B, C, D, E, G];
const NOTE = 'Synthetic ticket of scripts/ledger/plan-steps.test.mjs.';

// Plan texts (section 4, "Plan texts").
const briefTable = (files, tests, split) =>
  `## Brief\n| Item | Value |\n| --- | --- |\n${[['Plain words', 'The fixture ticket.'], ['ACs', 'AC-EZD-900-1'], ['Screens', 'none'], ['Tables', 'none'], ['Routes', 'none'],
    ['Files (estimate)', files], ['Tests (estimate)', tests], ['Split', split]].map(([i, v]) => `| ${i} | ${v} |`).join('\n')}\n`;
const BRIEF = (id, files, tests, split, proposal = false) => [
  `# ${id} · Fixture`, '',
  '- **ACs:** AC-EZD-900-1', '- **Areas:** tooling', '- **User-visible result:** none.', '- Plan step: brief', '',
  briefTable(files, tests, split),
  ...(proposal ? ['## Split proposal\nParts a and b.\n'] : []),
  '## 2. Sources', 'Fixture.', 'Architecture: none beyond the core', '',
  '## 10. Open questions', 'None', '',
].join('\n');
const LEGACY = (id, p) =>
  `# ${id} · plan-steps fixture\n\n- **Complexity:** low\n\n## 1. What to build\n### Build steps\n| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |\n| --- | --- | --- | --- | --- | --- |\n| 1 | \`${p}\` | new | none | none | none |\n\n## 2. Sources\nArchitecture: none beyond the core\n\n## 10. Open questions\nNone\n`;
const CODE_BOUND = (id, p) =>
  LEGACY(id, p).replace('- **Complexity:** low\n', '- **Complexity:** low\n- Template: v2\n- Plan step: code-bound\n').replace('## 1. What to build', `${briefTable(3, 4, 'no')}\n## 1. What to build`);
const PATHS = { [A]: 'app/src/a.ts', [B]: 'app/src/b.ts', [D]: 'app/src/d.ts', [G]: 'app/src/g.ts', [E]: 'scripts/e.mjs' };
const CB = (id) => CODE_BOUND(id, PATHS[id]);

let l, Pa, Pb, U;
const phaseOf = (id) => (id === G ? Pa : U);
const plan = (id) => l.file(`plans/${id}.md`);
const put = (id, text) => writeFileSync(plan(id), text);
const run = (...args) => l.tool('next_ticket.mjs', args);
const nextUnit = () => run('--next-unit').stdout.trim();
const readStatus = () => readFileSync(l.file('tickets/STATUS.md'), 'utf8');
const writeStatus = (s) => writeFileSync(l.file('tickets/STATUS.md'), s);
const rowRe = (id) => new RegExp(`^\\| ${id} \\|.*$\\n?`, 'm');

function setRow(id, status, complexity = '') {
  const notes = status === 'blocked' ? 'plan-steps fixture' : NOTE;
  const row = `| ${id} | ${phaseOf(id)} | Plan-steps test ${id} | ${status} | ${complexity} |  |  |  | ${notes} |\n`;
  const s = readStatus();
  if (rowRe(id).test(s)) writeStatus(s.replace(rowRe(id), row));
  else writeStatus(`${s}${s.endsWith('\n') ? '' : '\n'}${row}`);
}
const removeRow = (id) => writeStatus(readStatus().replace(rowRe(id), ''));
const setE = (track) => {
  const f = l.file('tickets/tickets.json');
  const data = JSON.parse(readFileSync(f, 'utf8'));
  const t = data.tickets.find((x) => x.id === E);
  if (track) t.track = track; else delete t.track;
  writeFileSync(f, JSON.stringify(data, null, 1) + '\n');
};
const ticketE = () => JSON.parse(readFileSync(l.file('tickets/tickets.json'), 'utf8')).tickets.find((x) => x.id === E);

function reset() {
  for (const p of [`plans/review-phase-${pad2(U)}.md`, `plans/review-phase-${pad2(Pa)}.md`, 'handoff/.questions-last-run.json', `cost/phase-${pad2(U)}.md`, `tickets/gates/phase-${pad2(U)}.md`, ...SYNTH.map((id) => `plans/${id}.md`)]) {
    rmSync(l.file(p), { recursive: true, force: true });
  }
  rmSync(path.join(l.dir, '.git', 'set-aside.json'), { recursive: true, force: true });
  setE('tooling');
  setRow(A, 'todo');
  setRow(B, 'planned'); put(B, BRIEF(B, 3, 4, 'no'));
  setRow(C, 'planned'); put(C, BRIEF(C, 21, 25, 'yes', true));
  setRow(D, 'planned', 'low'); put(D, LEGACY(D, PATHS[D]));
  setRow(E, 'blocked'); put(E, LEGACY(E, PATHS[E]));
  setRow(G, 'blocked');
  // EZD-384b: no synthetic ticket keeps a dependency from an earlier test.
  const tj = l.file('tickets/tickets.json');
  const data = JSON.parse(readFileSync(tj, 'utf8'));
  let changed = false;
  for (const t of data.tickets) {
    if (SYNTH.includes(t.id) && !(Array.isArray(t.depends_on) && t.depends_on.length === 0)) { t.depends_on = []; changed = true; }
  }
  if (changed) writeFileSync(tj, JSON.stringify(data, null, 1) + '\n');
}

before(async () => {
  l = makeLedgerCopy({ phaseZeroDone: true });
  const { comparePhases } = await import(pathToFileURL(l.file('tools/phase-rank.mjs')).href);
  const { planArchitecture } = await import(pathToFileURL(l.file('tools/outline.mjs')).href);
  const { planTrack } = await import(pathToFileURL(l.file('tools/next_ticket.mjs')).href);
  const tj = l.file('tickets/tickets.json');
  const data = JSON.parse(readFileSync(tj, 'utf8'));
  const phases = [...new Set(data.tickets.map((t) => t.phase))].sort(comparePhases);
  [Pa, Pb, U] = phases.slice(-3);
  const statusOf = (id) => (readStatus().match(new RegExp(`^\\| ${id} \\|[^|]*\\|[^|]*\\| ([a-z-]+) \\|`, 'm')) ?? [])[1];
  for (const t of data.tickets.filter((x) => [Pa, Pb, U].includes(x.phase))) {
    assert.notEqual(statusOf(t.id), 'done', 'the last three phases need no done ticket');
  }
  // F3: a sign-off row for every phase.
  const signed = new Set(readFileSync(l.file('spec/SIGNOFF.md'), 'utf8').split(/\r?\n/).map((x) => x.match(/^\|\s*(\d+)\s*\|/)).filter(Boolean).map((m) => Number(m[1])));
  for (const p of phases) if (!signed.has(p)) appendFileSync(l.file('spec/SIGNOFF.md'), `| ${p} | plan-steps fixture | 2026-11-11 | test |\n`);
  // F4: every row not done or blocked becomes blocked.
  const blocked = new Set();
  writeStatus(readStatus().split('\n').map((line) => {
    const m = line.match(/^\| (EZD-\w+) \|(.*)\|$/);
    if (!m) return line;
    const c = m[2].split('|');
    const st = c[2].trim();
    if (st !== 'done' && st !== 'blocked') { c[2] = ' blocked '; if (!c[7].trim()) c[7] = ' plan-steps fixture '; }
    if (c[2].trim() === 'blocked') blocked.add(m[1]);
    return `| ${m[1]} |${c.join('|')}|`;
  }).join('\n'));
  // F5: architecture lists and tooling marks for every blocked ticket.
  for (const t of data.tickets) {
    if (!blocked.has(t.id)) continue;
    const pf = l.file(`plans/${t.id}.md`);
    if (existsSync(pf)) {
      const text = readFileSync(pf, 'utf8');
      t.architecture = planArchitecture(text).list ?? t.architecture ?? [];
      if (!('track' in t) && planTrack(text) === 'tooling') t.track = 'tooling';
    } else t.architecture = t.architecture ?? [];
  }
  // F6: a cost record for every phase ranked before U.
  for (const p of phases) if (comparePhases(p, U) < 0 && !existsSync(l.file(`cost/phase-${pad2(p)}.md`))) writeFileSync(l.file(`cost/phase-${pad2(p)}.md`), '# plan-steps fixture\n');
  // F7: the synthetic tickets, their phase file rows, the acceptance criteria.
  for (const id of SYNTH) {
    const ph = phaseOf(id);
    const m = data.tickets.find((t) => t.phase === ph);
    data.tickets.push({ id, phase: ph, title: `Plan-steps test ${id}`, spec_files: m.spec_files, decisions: m.decisions, mockups: [], phase_file: m.phase_file, depends_on: [], acs: [], architecture: [], ...(id === E ? { track: 'tooling' } : {}) });
    appendFileSync(l.file(m.phase_file), `\n| ${id} | Plan-steps test ${id} | The test passes. | — | — |\n`);
  }
  writeFileSync(tj, JSON.stringify(data, null, 1) + '\n');
  const acs = l.tool('gen_acs.mjs', []);
  assert.equal(acs.status, 0, acs.stdout + acs.stderr);
  // F8
  reset();
  const check = run('--check');
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.ok(!nextUnit().startsWith('none: architecture checkpoint'), 'the fixture reaches Stage 1');
});

const review = (p) => writeFileSync(l.file(`plans/review-phase-${pad2(p)}.md`), '# fixture review\n');
const planStep = (id) => run('--plan-step', id);
const stepIs = (id, line) => {
  const r = planStep(id);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, `${line}\n`);
};
const errIs = (args, line) => {
  const r = run('--plan-step', ...args);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(r.stdout, `${line}\n`);
};
const SPLIT_WAIT = (ids) => `none: split proposal waiting to be applied for ${ids} (.claude/skills/plan-ticket/SKILL.md ledger step)`;
const DRAFT = 'unknown plan step "draft" in vault/plans/EZD-9842.md; the steps are brief, design and code-bound';
const NO_ROWS = 'the brief in vault/plans/EZD-9842.md has no readable Files (estimate), Tests (estimate) or Split row; run plan_lint on it';
const noFiles = (text) => text.replace(/^\| Files \(estimate\) \|.*\n/m, '');

test('EZD-384 P1 --plan-step names the step for each state', () => {
  const cases = [
    [() => {}, A, 'STEP brief'],
    [() => put(A, LEGACY(A, PATHS[A])), A, 'STEP brief'],
    [() => put(A, BRIEF(A, 3, 4, 'no')), A, 'STEP brief'],
    [() => put(A, CB(A)), A, 'STEP code-bound'],
    [() => {}, B, 'STEP design'],
    [() => setRow(B, 'questions'), B, 'STEP design'],
    [() => put(B, BRIEF(B, 20, 25, 'no')), B, 'STEP design'],
    [() => put(B, BRIEF(B, 21, 25, 'no')), B, 'STEP split 21 files, 25 tests'],
    [() => put(B, BRIEF(B, 20, 26, 'no')), B, 'STEP split 20 files, 26 tests'],
    [() => {}, C, 'STEP split 21 files, 25 tests'],
    [() => put(B, BRIEF(B, 3, 4, 'yes', true)), B, 'STEP split 3 files, 4 tests'],
    [() => {}, D, 'STEP none (legacy plan, no step line)'],
    [() => { setRow(A, 'planned', 'low'); put(A, CB(A)); }, A, 'STEP none (plan written at step code-bound)'],
    [() => {}, E, 'STEP none (status blocked)'],
    [() => { setRow(A, 'ready', 'low'); put(A, CB(A)); }, A, 'STEP none (status ready)'],
  ];
  for (const [edit, id, line] of cases) {
    reset();
    edit();
    stepIs(id, line);
  }
});

test('EZD-384 P2 --plan-step refusals', () => {
  reset();
  for (const args of [[], ['not-a-ticket']]) {
    const r = run('--plan-step', ...args);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.ok(r.stderr.includes('usage: --plan-step <ticket>'), r.stderr);
    assert.equal(r.stdout, '');
  }
  errIs(['EZD-9899'], 'ERROR EZD-9899: not in vault/tickets/tickets.json');
  removeRow(A);
  errIs([A], 'ERROR EZD-9841: no row in vault/tickets/STATUS.md');
  reset();
  put(B, BRIEF(B, 3, 4, 'no').replace('- Plan step: brief', '- Plan step: draft'));
  errIs([B], `ERROR EZD-9842: ${DRAFT}`);
  reset();
  put(A, BRIEF(A, 3, 4, 'no').replace('- Plan step: brief', '- Plan step: draft'));
  errIs([A], `ERROR EZD-9841: ${DRAFT.replace('EZD-9842', 'EZD-9841')}`);
  reset();
  put(B, noFiles(BRIEF(B, 3, 4, 'no')));
  errIs([B], `ERROR EZD-9842: ${NO_ROWS}`);
  reset();
  rmSync(plan(B), { force: true });
  errIs([B], 'ERROR EZD-9842: planned but vault/plans/EZD-9842.md does not exist');
  reset();
  rmSync(plan(B), { force: true });
  mkdirSync(plan(B));
  errIs([B], 'ERROR EZD-9842: cannot read vault/plans/EZD-9842.md (EISDIR)');
});

test('EZD-384 N1 a todo ticket is planned first', () => {
  reset();
  assert.equal(nextUnit(), `plan ${A}`);
});

test('EZD-384 N2 then a brief within the limit, before review-plans', () => {
  reset();
  setRow(A, 'planned', 'low'); put(A, CB(A));
  assert.equal(nextUnit(), `plan ${B}`);
  setRow(B, 'questions');
  assert.equal(nextUnit(), `plan ${B}`);
});

test('EZD-384 N3 review-plans counts whole and legacy plans, never a brief', () => {
  reset();
  setRow(A, 'planned', 'low'); put(A, CB(A));
  setRow(B, 'planned', 'low'); put(B, CB(B));
  assert.equal(nextUnit(), `review-plans ${U}`);
  reset();
  for (const id of [A, B, D]) setRow(id, 'blocked');
  const wait = nextUnit();
  assert.equal(wait, SPLIT_WAIT(C));
  assert.equal(repairable(wait), true);
  reset();
  for (const id of [A, B]) setRow(id, 'blocked');
  assert.equal(nextUnit(), `review-plans ${U}`);
});

test('EZD-384 N4 questions after the review', () => {
  reset();
  setRow(A, 'planned', 'low'); put(A, CB(A));
  setRow(B, 'planned', 'low'); put(B, CB(B));
  review(U);
  assert.equal(nextUnit(), `questions ${U}`);
});

test('EZD-384 N5 a split brief does not make questions due; the build runs', () => {
  reset();
  review(U);
  setRow(A, 'ready', 'low'); put(A, CB(A));
  for (const id of [B, D]) setRow(id, 'blocked');
  assert.equal(nextUnit(), `build ${A}`);
});

test('EZD-384 N6 a skipped brief within the limit does not make questions due', () => {
  reset();
  review(U);
  setRow(A, 'ready', 'low'); put(A, CB(A));
  for (const id of [C, D]) setRow(id, 'blocked');
  const r = run('--next-units', '--skip', B);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { units: [{ unit: 'build', arg: A, resume: false }], none: null });
});

test('EZD-384 N7 PROGRESS.md lists split briefs only when there is one', () => {
  reset();
  const HEAD = '## Split proposals waiting to be applied';
  const r1 = run('--report');
  assert.equal(r1.status, 0, r1.stdout + r1.stderr);
  const lines1 = readFileSync(l.file('PROGRESS.md'), 'utf8').split('\n');
  assert.ok(lines1.includes(HEAD));
  assert.ok(lines1.includes('| Ticket | Phase | Estimate | Plan |'));
  assert.ok(lines1.includes(`| ${C} | ${U} | 21 files, 25 tests | vault/plans/${C}.md |`));
  assert.ok(!lines1.some((x) => x.startsWith(`| ${B} |`)), 'a brief within the limit is not listed');
  setRow(C, 'blocked');
  const r2 = run('--report');
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.ok(!readFileSync(l.file('PROGRESS.md'), 'utf8').split('\n').includes(HEAD));
});

test('EZD-384 N8 the ledger check refuses a bad step line', () => {
  reset();
  const ok = run('--check');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.ok(ok.stdout.startsWith('LEDGER OK'), ok.stdout);
  put(B, BRIEF(B, 3, 4, 'no').replace('- Plan step: brief', '- Plan step: draft'));
  const bad = run('--check');
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.ok(bad.stdout.split('\n').includes(`- EZD-9842: ${DRAFT} (EZD-384)`), bad.stdout);
  put(B, noFiles(BRIEF(B, 3, 4, 'no')));
  const rows = run('--check');
  assert.equal(rows.status, 1, rows.stdout + rows.stderr);
  assert.ok(rows.stdout.split('\n').includes(`- EZD-9842: ${NO_ROWS} (EZD-384)`), rows.stdout);
});

test('EZD-384 N9 a tooling ticket keeps its mark at step brief', () => {
  reset();
  setRow(E, 'planned'); put(E, BRIEF(E, 3, 4, 'no'));
  const check = run('--check');
  assert.equal(check.status, 0, check.stdout + check.stderr);
  const set = run('--set-architecture', E);
  assert.equal(set.status, 0, set.stdout + set.stderr);
  assert.equal(set.stdout.trim(), `ARCHITECTURE SET ${E}: 0 section(s)`);
  assert.equal(ticketE().track, 'tooling');
});

test('EZD-384 N10 a set-aside brief is neither planned, reviewed nor listed as waiting on questions', () => {
  reset();
  for (const id of [A, C, D]) setRow(id, 'blocked');
  mkdirSync(path.join(l.dir, '.git'), { recursive: true });
  writeFileSync(path.join(l.dir, '.git', 'set-aside.json'), JSON.stringify([`plan ${B}`]));
  const out = nextUnit();
  assert.ok(out.startsWith('none: waiting on Josh (blocked: '), out);
  assert.ok(out.endsWith(`; nothing else is ready in phase ${U}`), out);
});

test('EZD-384 N11 the look-ahead plans a brief in a later phase', async () => {
  reset();
  for (const id of [A, C, D]) setRow(id, 'blocked');
  setRow(G, 'questions'); put(G, LEGACY(G, PATHS[G]));
  review(Pa);
  const { questionsFingerprint } = await import(`${pathToFileURL(l.file('tools/next_ticket.mjs')).href}?n11=${Date.now()}`);
  const fp = questionsFingerprint(Pa);
  writeFileSync(l.file('handoff/.questions-last-run.json'), JSON.stringify({ phase: Pa, scope: 'phase', before: fp, after: fp }));
  assert.equal(nextUnit(), `plan ${B}`);
});

// EZD-384b (vault/plans/EZD-384b.md, section 4): the design step, the wait and the dependency rules in next_ticket.mjs.
const DESIGN = (id) =>
  `# ${id} · plan-steps fixture\n\n- **Complexity:** medium\n- Template: v2\n- Plan step: design\n\n${briefTable(3, 4, 'no')}\n## 1. What to build\n### Build steps\nNone: written at the code-bound step (P3)\n\n## 2. Sources\nArchitecture: none beyond the core\n\n## 10. Open questions\nNone\n`;
const deps = (id, list) => {
  const f = l.file('tickets/tickets.json');
  const data = JSON.parse(readFileSync(f, 'utf8'));
  data.tickets.find((x) => x.id === id).depends_on = list;
  writeFileSync(f, JSON.stringify(data, null, 1) + '\n');
};
const designB = (list) => { setRow(B, 'planned', 'medium'); put(B, DESIGN(B)); deps(B, list); };

test('EZD-384b S1 --plan-step for the design states', () => {
  const cases = [
    [() => {}, B, 'STEP design'],
    [() => designB([]), B, 'STEP code-bound'],
    [() => designB(['EZD-001']), B, 'STEP code-bound'],
    [() => designB(['EZD-001', A]), B, `STEP wait ${A} (todo)`],
    [() => designB([A, D]), B, `STEP wait ${A} (todo), ${D} (planned)`],
    [() => { designB([A, D]); setRow(B, 'questions', 'medium'); }, B, `STEP wait ${A} (todo), ${D} (planned)`],
    [() => put(A, DESIGN(A)), A, 'STEP design'],
    [() => { put(A, CODE_BOUND(A, 'app/src/a.ts')); deps(A, [D]); }, A, 'STEP design'],
    [() => { setRow(A, 'ready', 'low'); put(A, DESIGN(A)); }, A, 'STEP none (status ready)'],
    [() => designB(['EZD-001', 'EZD-9999']), B, 'STEP wait EZD-9999 (no row)'],
  ];
  for (const [edit, id, line] of cases) {
    reset();
    edit();
    stepIs(id, line);
  }
});

test('EZD-384b S2 the code-bound unit is offered only when every dependency is done', () => {
  reset();
  for (const id of [A, C, D]) setRow(id, 'blocked');
  designB(['EZD-001']);
  assert.equal(nextUnit(), `plan ${B}`);
  deps(B, [A]);
  assert.equal(nextUnit(), `review-plans ${U}`);
});

test('EZD-384b S3 brief to design, then design to code-bound, before review-plans', () => {
  reset();
  for (const id of [A, C]) setRow(id, 'blocked');
  setRow(D, 'planned', 'medium'); put(D, DESIGN(D)); deps(D, []);
  assert.equal(nextUnit(), `plan ${B}`);
  setRow(B, 'blocked');
  assert.equal(nextUnit(), `plan ${D}`);
});

test('EZD-384b S4 a waiting design plan does not make questions due', () => {
  reset();
  review(U);
  for (const id of [A, C, D]) setRow(id, 'blocked');
  designB([A]);
  const wait = nextUnit();
  assert.equal(wait, `none: waiting for the code-bound step: ${B} waits for ${A} (blocked)`);
  assert.equal(repairable(wait), true);
  put(B, LEGACY(B, PATHS[B]));
  assert.equal(nextUnit(), `questions ${U}`);
});

test('EZD-384b S5 PROGRESS.md lists waiting plans only while they wait', () => {
  reset();
  designB([A, 'EZD-001']);
  const r1 = run('--report');
  assert.equal(r1.status, 0, r1.stdout + r1.stderr);
  const lines1 = readFileSync(l.file('PROGRESS.md'), 'utf8').split('\n');
  const W = '## Waiting for the code-bound step';
  assert.ok(lines1.includes(W));
  assert.ok(lines1.includes('| Ticket | Phase | Not done yet |'));
  assert.ok(lines1.includes(`| ${B} | ${U} | ${A} (todo) |`));
  const iSplit = lines1.indexOf('## Split proposals waiting to be applied');
  const iWait = lines1.indexOf(W);
  const iMerges = lines1.indexOf('## Last ten merges');
  assert.ok(iSplit >= 0 && iMerges >= 0);
  assert.ok(iSplit < iWait && iWait < iMerges, `order ${iSplit} ${iWait} ${iMerges}`);
  deps(B, ['EZD-001']);
  const r2 = run('--report');
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.ok(!readFileSync(l.file('PROGRESS.md'), 'utf8').split('\n').includes(W));
});

test('EZD-384b S6 a tooling ticket keeps its mark at step design', () => {
  reset();
  setRow(E, 'planned', 'medium'); put(E, DESIGN(E));
  const check = run('--check');
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.ok(check.stdout.startsWith('LEDGER OK'), check.stdout);
  const set = run('--set-architecture', E);
  assert.equal(set.status, 0, set.stdout + set.stderr);
  assert.equal(set.stdout.trim(), `ARCHITECTURE SET ${E}: 0 section(s)`);
  assert.equal(ticketE().track, 'tooling');
});

test('EZD-384b S7 a set-aside design plan is not listed as waiting on questions', () => {
  reset();
  review(U);
  for (const id of [A, C, D]) setRow(id, 'blocked');
  designB(['EZD-001']);
  mkdirSync(path.join(l.dir, '.git'), { recursive: true });
  writeFileSync(path.join(l.dir, '.git', 'set-aside.json'), JSON.stringify([`plan ${B}`]));
  const out = nextUnit();
  assert.ok(out.startsWith('none: waiting on Josh (blocked: '), out);
  assert.ok(out.endsWith(`; nothing else is ready in phase ${U}`), out);
});

test('EZD-384b S8 the look-ahead offers a code-bound unit only when its dependencies are done', async () => {
  reset();
  for (const id of [A, C, D]) setRow(id, 'blocked');
  designB(['EZD-001']);
  setRow(G, 'questions'); put(G, LEGACY(G, PATHS[G]));
  review(Pa);
  const { questionsFingerprint } = await import(`${pathToFileURL(l.file('tools/next_ticket.mjs')).href}?s8=${Date.now()}`);
  const fp = questionsFingerprint(Pa);
  writeFileSync(l.file('handoff/.questions-last-run.json'), JSON.stringify({ phase: Pa, scope: 'phase', before: fp, after: fp }));
  assert.equal(nextUnit(), `plan ${B}`);
  deps(B, [A]);
  assert.equal(nextUnit(), `review-plans ${U}`);
});

test('EZD-384b S9 build and questions run beside a waiting design plan', () => {
  reset();
  review(U);
  setRow(A, 'ready', 'low'); put(A, CB(A));
  designB([A]);
  for (const id of [C, D]) setRow(id, 'blocked');
  assert.equal(nextUnit(), `build ${A}`);
  setRow(D, 'planned', 'low'); put(D, LEGACY(D, PATHS[D]));
  assert.equal(nextUnit(), `questions ${U}`);
});
