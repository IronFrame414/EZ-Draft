// EZD-1955 (audit 2026-11-23 O2): scripts/conventions/ac-trace.mjs lists the ACs of done tickets not named in a test.
// Fixture repos are built in a temporary directory. Fixture AC ids are assembled at run time so this file never names
// one itself (it is a test file under scripts/ and would otherwise count as naming them in the real repository).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTestFile, namedAcIds, skipReason, skippedAcIds, traceDone, traceForTicket, untracedForTicket } from '../ac-trace.mjs';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'ac-trace.mjs');
const ac = (t, n) => ['AC', 'EZD', t, n].join('-');
const roots = [];
after(() => { for (const d of roots) rmSync(d, { recursive: true, force: true }); });

function fixture(files, tickets, done) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ac-trace-'));
  roots.push(root);
  const put = (rel, text) => { mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); writeFileSync(path.join(root, rel), text); };
  put('vault/tickets/tickets.json', JSON.stringify({ tickets }));
  put('vault/build/state.json', JSON.stringify({ done }));
  for (const [rel, text] of Object.entries(files)) put(rel, text);
  return root;
}

test('AC-EZD-1955-1: finds a missing AC of a done ticket and passes a named one', () => {
  const root = fixture(
    { 'app/src/a.test.ts': `test('${ac('9101', 1)}: named in a title', () => {});\n// ${ac('9101', 3)} named in a comment\n` },
    [{ id: 'EZD-9101', acs: [ac('9101', 1), ac('9101', 2), ac('9101', 3)] }],
    ['EZD-9101'],
  );
  const r = traceDone(root);
  assert.deepEqual(r.tickets, [{ ticket: 'EZD-9101', total: 3, missing: [ac('9101', 2)] }]);
  assert.equal(r.total, 3);
  assert.equal(r.missing, 1);
});

test('AC-EZD-1955-1: only done tickets are listed; a ticket that is not done is left out of the report', () => {
  const root = fixture({}, [{ id: 'EZD-9102', acs: [ac('9102', 1)] }, { id: 'EZD-9103', acs: [ac('9103', 1)] }], ['EZD-9102']);
  assert.deepEqual(traceDone(root).tickets.map((t) => t.ticket), ['EZD-9102']);
  // --ticket checks one ticket whether or not it is done (the reviewer's case: not merged yet).
  assert.deepEqual(untracedForTicket(root, 'EZD-9103'), [ac('9103', 1)]);
});

test('AC-EZD-1955-1: ids match whole, so -1 is not named by a mention of -10', () => {
  const root = fixture(
    { 'packages/geometry/src/x.test.ts': `// ${ac('9104', 10)}\n// ${ac('9104a', 2)}\n` },
    [{ id: 'EZD-9104', acs: [ac('9104', 1), ac('9104', 10)] }, { id: 'EZD-9104a', acs: [ac('9104a', 2)] }],
    ['EZD-9104', 'EZD-9104a'],
  );
  assert.deepEqual(traceDone(root).tickets, [{ ticket: 'EZD-9104', total: 2, missing: [ac('9104', 1)] }]);
});

test('AC-EZD-1955-1: a name counts only in a test file under app/, packages/, scripts/ or supabase/', () => {
  const root = fixture(
    {
      'app/src/feature.ts': `// ${ac('9105', 1)}\n`,
      'docs/notes.test.md': `${ac('9105', 2)}\n`,
      'vault/x.test.mjs': `${ac('9105', 3)}\n`,
      'app/node_modules/pkg/y.test.js': `${ac('9105', 4)}\n`,
      'scripts/loop/__tests__/z.test.mjs': `${ac('9105', 5)}\n`,
      'supabase/tests/rls.sql': `-- ${ac('9105', 6)}\n`,
      'app/e2e/flow.spec.ts': `${ac('9105', 7)}\n`,
    },
    [], [],
  );
  assert.deepEqual([...namedAcIds(root)].sort(), [ac('9105', 5), ac('9105', 6), ac('9105', 7)]);
  assert.equal(isTestFile('app/src/feature.ts'), false);
  assert.equal(isTestFile('app/src/feature.test.tsx'), true);
});

test('AC-EZD-1955-1: the CLI lists the missing id, reports and exits 0; --ticket exits 1 when one is unnamed', () => {
  const root = fixture(
    { 'scripts/q.test.mjs': `test('${ac('9106', 1)}', () => {});\n` },
    [{ id: 'EZD-9106', acs: [ac('9106', 1), ac('9106', 2)] }],
    ['EZD-9106'],
  );
  const all = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
  assert.equal(all.status, 0);
  assert.match(all.stdout, new RegExp(`^EZD-9106 ${ac('9106', 2)}$`, 'm'));
  assert.doesNotMatch(all.stdout, new RegExp(`${ac('9106', 1)}(?![0-9])`));
  assert.match(all.stdout, /1 of 2 acceptance criteria of done tickets are not named in a test/);
  const one = spawnSync(process.execPath, [script, '--root', root, '--ticket', 'EZD-9106', '--json'], { encoding: 'utf8' });
  assert.equal(one.status, 1);
  assert.deepEqual(JSON.parse(one.stdout), { ticket: 'EZD-9106', missing: [ac('9106', 2)] });
});

// EZD-2023 (audit 2026-11-27 X2): rows marked *(field check)*, *(met by EZD-xxx)* or *(not a builder task)* are skipped.
// AC-EZD-2023-4: the new tests for the AC trace change. They run on temporary fixture repos; the only child process is
// the ac-trace.mjs script itself on a fixture (no docker, no launchctl, no loop or claude process).
const acRow = (id, text) => `| ${id} | EZD-x title | ${text} |`;
test('AC-EZD-2023-2: marked rows are listed as skipped, never as missing; every other AC is still traced', () => {
  const root = fixture(
    {
      'vault/spec/acceptance-criteria.md': ['| AC | Ticket | Criterion |', '|---|---|---|',
        acRow(ac('9401', 1), 'Field check: Josh runs it on the iPad. *(field check)*'),
        acRow(ac('9401', 2), 'It becomes the selection item of an option in EZD-1011. *(met by EZD-1011)*'),
        acRow(ac('9401', 3), 'Done by the overseer session. *(not a builder task)*'),
        acRow(ac('9401', 4), 'A field check of the plan saves (no marker, so it is traced).'),
        acRow(ac('9401', 5), 'Named in a test.'),
      ].join('\n'),
      'app/n.test.ts': `// ${ac('9401', 5)}\n` },
    [{ id: 'EZD-9401', acs: [1, 2, 3, 4, 5].map((n) => ac('9401', n)) }],
    ['EZD-9401'],
  );
  const skipped = [
    { id: ac('9401', 1), reason: 'field check' },
    { id: ac('9401', 2), reason: 'met by EZD-1011' },
    { id: ac('9401', 3), reason: 'not a builder task' },
  ];
  assert.deepEqual(traceForTicket(root, 'EZD-9401'), { missing: [ac('9401', 4)], skipped });
  assert.deepEqual(untracedForTicket(root, 'EZD-9401'), [ac('9401', 4)]);
  const r = traceDone(root);
  assert.equal(r.missing, 1);
  assert.equal(r.skipped, 3);
  assert.deepEqual(r.tickets, [{ ticket: 'EZD-9401', total: 5, missing: [ac('9401', 4)], skipped }]);
  const one = spawnSync(process.execPath, [script, '--root', root, '--ticket', 'EZD-9401', '--json'], { encoding: 'utf8' });
  assert.equal(one.status, 1);
  assert.deepEqual(JSON.parse(one.stdout), { ticket: 'EZD-9401', missing: [ac('9401', 4)], skipped });
  const text = spawnSync(process.execPath, [script, '--root', root, '--ticket', 'EZD-9401'], { encoding: 'utf8' });
  assert.match(text.stdout, new RegExp(`^EZD-9401 ${ac('9401', 1)} skipped \\(field check\\)$`, 'm'));
  assert.match(text.stdout, new RegExp(`^EZD-9401 ${ac('9401', 4)}$`, 'm'));
});

test('AC-EZD-2023-2: a ticket whose only unnamed ACs are marked passes --ticket (exit 0)', () => {
  const root = fixture(
    { 'vault/spec/acceptance-criteria.md': acRow(ac('9402', 1), 'Josh measures a print. *(field check)*') },
    [{ id: 'EZD-9402', acs: [ac('9402', 1)] }], [],
  );
  const one = spawnSync(process.execPath, [script, '--root', root, '--ticket', 'EZD-9402'], { encoding: 'utf8' });
  assert.equal(one.status, 0);
});

test('AC-EZD-2023-2: skipReason reads only the three markers; the real AC file marks the audit rows', () => {
  assert.equal(skipReason('Josh tries real panel photos. *(field check)*'), 'field check');
  assert.equal(skipReason('*(met by EZD-1204a)*'), 'met by EZD-1204a');
  assert.equal(skipReason('*(not a builder task)*'), 'not a builder task');
  assert.equal(skipReason('A field check of the plan'), '');
  assert.equal(skipReason('(field check) without the stars'), '');
  // A marker counts only at the end of the criterion: a sentence that talks about the markers is still traced.
  assert.equal(skipReason('The trace skips rows marked *(field check)* or *(not a builder task)*; every other AC is traced. |'), '');
  assert.equal(skipReason('Josh measures a print. *(field check)* |'), 'field check');
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const real = skippedAcIds(repo);
  // vault/spec/acceptance-criteria.md: the EZD-516 pointer row and the EZD-1014 USDZ row (audit 2026-11-27 X2).
  assert.equal(real.get(ac('516', 4)), 'met by EZD-1011');
  assert.equal(real.get(ac('1014', 3)), 'field check');
  assert.equal(real.has(ac('1014', 1)), false);
  // This ticket's own row about the markers names them mid-sentence and is traced, not skipped.
  assert.equal(real.has(ac('2023', 2)), false);
});
