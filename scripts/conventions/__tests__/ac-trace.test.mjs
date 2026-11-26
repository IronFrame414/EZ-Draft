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
import { isTestFile, namedAcIds, traceDone, untracedForTicket } from '../ac-trace.mjs';

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
