// EZD-369 (Josh 2026-11-10): three strikes, then a full assessment before a unit runs again. Plan vault/plans/EZD-369.md,
// section 4 (T1-T10), D-Key to D-Release. The strike functions are imported from the ledger copy's next_ticket.mjs, which
// resolves its root from its own path, so the copy's .git/unit-strikes.json is the one read and written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeLedgerCopy } from '../launcher/test-utils/ledger-copy.mjs';
import { repo } from '../launcher/test-utils/harness.mjs';

const EXPORTS = ['strikeVerdict', 'strikeExempt', 'recordStrike', 'strikeHolds'];

// The copy's .git/ folder, as scripts/ledger/set-aside.test.mjs creates it.
function gitDir(copy) {
  const d = path.join(copy.dir, '.git');
  mkdirSync(d, { recursive: true });
  return d;
}

async function api(copy) {
  const mod = await import(pathToFileURL(copy.file('tools/next_ticket.mjs')).href);
  for (const name of EXPORTS) assert.equal(typeof mod[name], 'function', `vault/tools/next_ticket.mjs exports ${name}`);
  assert.equal(mod.STRIKE_LIMIT, 3, 'STRIKE_LIMIT = 3 (plan build step 2)');
  return mod;
}

const strikesFile = (copy) => path.join(copy.dir, '.git', 'unit-strikes.json');
const readStrikes = (copy) => JSON.parse(readFileSync(strikesFile(copy), 'utf8'));

// The set-aside.test.mjs fixture where the next unit is gate-phase 1.
function gateCopy() {
  const copy = makeLedgerCopy({ phaseZeroDone: true });
  for (const f of ['tickets/gates/phase-01.md', 'cost/phase-01.md']) rmSync(path.join(copy.dir, 'vault', f), { force: true });
  gitDir(copy);
  return copy;
}

function nextUnit(copy) {
  const r = copy.tool('next_ticket.mjs', ['--next-unit']);
  const out = r.stdout.trim();
  // A failed ledger check would make every "is not X" assertion pass for the wrong reason.
  assert.doesNotMatch(out, /ledger check failed/, `--next-unit: ${out}${r.stderr}`);
  return out;
}

test('T1 strikeVerdict: strike, reset or none per D-Strike and D-Reset', async () => {
  const copy = makeLedgerCopy();
  const { strikeVerdict } = await api(copy);
  const cases = [
    [{ unit: 'build', outcome: 'error', progress: true, statusAfter: 'in-progress' }, 'strike'],
    [{ unit: 'build', outcome: 'ok', progress: false, statusAfter: 'in-progress' }, 'strike'],
    [{ unit: 'build', outcome: 'ok', progress: true, statusAfter: 'blocked' }, 'strike'],
    [{ unit: 'build', outcome: 'ok', progress: true, statusAfter: 'done' }, 'reset'],
    [{ unit: 'build', outcome: 'ok', progress: true, statusAfter: 'in-progress' }, 'none'],
    [{ unit: 'gate-phase', outcome: 'ok', progress: true, gateRecord: false }, 'none'],
    [{ unit: 'gate-phase', outcome: 'ok', progress: true, gateRecord: true }, 'reset'],
    [{ unit: 'plan', outcome: 'ok', progress: true }, 'reset'],
  ];
  assert.deepEqual(cases.map(([input]) => strikeVerdict(input)), cases.map(([, want]) => want));
});

test('T2 three strikes on gate-phase 4: count 3, history length 3', async () => {
  const copy = makeLedgerCopy();
  gitDir(copy);
  const { recordStrike } = await api(copy);
  for (let i = 0; i < 3; i++) recordStrike('gate-phase 4', 'strike');
  const entry = readStrikes(copy)['gate-phase 4'];
  assert.equal(entry.count, 3);
  assert.equal(entry.history.length, 3);
});

test('T3 a reset after three strikes deletes the key', async () => {
  const copy = makeLedgerCopy();
  gitDir(copy);
  const { recordStrike } = await api(copy);
  for (let i = 0; i < 3; i++) recordStrike('gate-phase 4', 'strike');
  assert.equal(readStrikes(copy)['gate-phase 4'].count, 3);
  recordStrike('gate-phase 4', 'reset');
  assert.equal(Object.hasOwn(readStrikes(copy), 'gate-phase 4'), false);
});

test('T4 strikes are counted per key: two on questions 5 and two on questions 56 hold neither', async () => {
  const copy = makeLedgerCopy();
  gitDir(copy);
  const { recordStrike, strikeHolds } = await api(copy);
  for (let i = 0; i < 2; i++) recordStrike('questions 5', 'strike');
  for (let i = 0; i < 2; i++) recordStrike('questions 56', 'strike');
  const s = readStrikes(copy);
  assert.equal(s['questions 5'].count, 2);
  assert.equal(s['questions 56'].count, 2);
  const holds = strikeHolds();
  assert.equal(holds.has('questions 5'), false);
  assert.equal(holds.has('questions 56'), false);
});

test('T5 an unreadable .git/unit-strikes.json means no strikes, no throw', async () => {
  const copy = makeLedgerCopy();
  writeFileSync(path.join(gitDir(copy), 'unit-strikes.json'), '{ not json');
  const { strikeHolds } = await api(copy);
  let holds;
  assert.doesNotThrow(() => { holds = strikeHolds(); });
  assert.ok(holds instanceof Set);
  assert.equal(holds.size, 0);
});

test('T6 three strikes on gate-phase 1: --next-unit no longer offers it', async () => {
  const copy = gateCopy();
  assert.equal(nextUnit(copy), 'gate-phase 1');
  const { recordStrike } = await api(copy);
  for (let i = 0; i < 3; i++) recordStrike('gate-phase 1', 'strike');
  assert.notEqual(nextUnit(copy), 'gate-phase 1');
});

test('T7 writing .git/set-aside.json as [] does not release a held key', async () => {
  const copy = gateCopy();
  assert.equal(nextUnit(copy), 'gate-phase 1');
  const { recordStrike } = await api(copy);
  for (let i = 0; i < 3; i++) recordStrike('gate-phase 1', 'strike');
  writeFileSync(path.join(copy.dir, '.git', 'set-aside.json'), JSON.stringify([]));
  assert.notEqual(nextUnit(copy), 'gate-phase 1');
});

test('T8 a ready assessment that covers the count lifts the hold; one covering fewer strikes does not', async () => {
  const copy = gateCopy();
  assert.equal(nextUnit(copy), 'gate-phase 1');
  const { recordStrike } = await api(copy);
  for (let i = 0; i < 3; i++) recordStrike('gate-phase 1', 'strike');
  writeFileSync(path.join(copy.dir, '.git', 'set-aside.json'), JSON.stringify([]));
  mkdirSync(copy.file('handoff/assessments'), { recursive: true });
  const assessment = copy.file('handoff/assessments/gate-phase-1.md');
  writeFileSync(assessment, '# Assessment: gate-phase 1\n\nCovers strikes: 3\nVerdict: ready\n');
  assert.equal(nextUnit(copy), 'gate-phase 1');
  writeFileSync(assessment, '# Assessment: gate-phase 1\n\nCovers strikes: 2\nVerdict: ready\n');
  assert.notEqual(nextUnit(copy), 'gate-phase 1');
});

test('T9 three strikes on build T: not offered, and setting T in-progress does not bring it back', async () => {
  const T = 'EZD-9369';
  const copy = makeLedgerCopy({ phaseZeroDone: true, synthetic: [[T, 'ready']] });
  gitDir(copy);
  assert.equal(nextUnit(copy), `build ${T}`);
  const { recordStrike } = await api(copy);
  for (let i = 0; i < 3; i++) recordStrike(`build ${T}`, 'strike');
  assert.notEqual(nextUnit(copy), `build ${T}`);
  copy.setStatus(T, 'in-progress');
  assert.notEqual(nextUnit(copy), `build ${T}`);
});

test('T9b three strikes on a tooling build: not offered, and setting it ready again does not bring it back', async () => {
  const T = 'EZD-9370';
  // A ready product ticket keeps phase 1 open, so the later phases' gates do not come first and the build pool is reached.
  const copy = makeLedgerCopy({ phaseZeroDone: true, synthetic: [[T, 'ready'], ['EZD-9371', 'ready']] });
  gitDir(copy);
  // The tooling mark (EZD-253): track "tooling" in tickets.json and a plan whose Build steps change no product file.
  const ticketsFile = copy.file('tickets/tickets.json');
  const data = JSON.parse(readFileSync(ticketsFile, 'utf8'));
  data.tickets.find((t) => t.id === T).track = 'tooling';
  writeFileSync(ticketsFile, JSON.stringify(data, null, 1) + '\n');
  writeFileSync(copy.file(`plans/${T}.md`), [
    `# ${T} · synthetic tooling test plan`, '', '## 1. What to build', '', '### Build steps',
    '| # | Path | New / change |', '| --- | --- | --- |', '| 1 | `scripts/x.mjs` | new |', '', '## 2. Sources', '',
  ].join('\n'));
  assert.equal(nextUnit(copy), `build ${T}`);
  const { recordStrike } = await api(copy);
  for (let i = 0; i < 3; i++) recordStrike(`build ${T}`, 'strike');
  assert.notEqual(nextUnit(copy), `build ${T}`);
  copy.setStatus(T, 'ready');
  assert.notEqual(nextUnit(copy), `build ${T}`);
});

test('T10 limit and launcher stops are exempt, and run.mjs records strikes in both after-unit paths behind strikeExempt', async () => {
  const copy = makeLedgerCopy();
  const { strikeExempt } = await api(copy);
  const cases = [
    [{ outcome: 'limit-five-hour' }, true],
    [{ outcome: 'limit-weekly' }, true],
    [{ outcome: 'interrupted' }, true],
    [{ outcome: 'dry-run' }, true],
    [{ outcome: 'error:success', note: "You've hit your weekly limit · resets 2am" }, true],
    [{ outcome: 'error', note: 'boom' }, false],
    [{ outcome: 'ok' }, false],
  ];
  assert.deepEqual(cases.map(([input]) => strikeExempt(input)), cases.map(([, want]) => want));

  const run = readFileSync(path.join(repo, 'scripts', 'run.mjs'), 'utf8');
  const lines = run.split('\n');
  // Lane path: the body of `const afterUnit = (...) => { ... };` in main(). One-at-a-time path: main()'s own `for (;;)` loop.
  const laneStart = lines.findIndex((l) => /^\s*const afterUnit = \(/.test(l));
  assert.ok(laneStart >= 0, 'run.mjs has the lane afterUnit');
  const laneEnd = lines.findIndex((l, i) => i > laneStart && /^  };\s*$/.test(l));
  assert.ok(laneEnd > laneStart, 'end of the lane afterUnit');
  const loopStart = lines.findIndex((l) => /^  for \(;;\) \{\s*$/.test(l));
  assert.ok(loopStart > laneEnd, 'run.mjs has the one-at-a-time loop');
  const calls = lines.map((l, i) => (/\brecordStrike\(/.test(l) ? i : -1)).filter((i) => i >= 0);
  const inLane = calls.filter((i) => i > laneStart && i < laneEnd);
  const inLoop = calls.filter((i) => i > loopStart);
  assert.ok(inLane.length >= 1, 'recordStrike( in the lane afterUnit');
  assert.ok(inLoop.length >= 1, 'recordStrike( in the one-at-a-time loop');
  // Each call is guarded by strikeExempt( on its own line or within the ten lines before it.
  for (const i of [...inLane, ...inLoop]) {
    const window = lines.slice(Math.max(0, i - 10), i + 1).join('\n');
    assert.match(window, /\bstrikeExempt\(/, `recordStrike( at run.mjs:${i + 1} is guarded by strikeExempt(`);
  }
});
