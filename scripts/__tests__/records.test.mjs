// REMEDIATION-PLAN 2.10: the records database. Fixtures only, in temp folders (L-041); never ~/.ezdraft/records.db.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRecords, importVault, exportVault, showTicket, backup, splitRow, renderRow } from '../records.mjs';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../records.mjs');
const tmp = () => mkdtempSync(path.join(realpathSync(os.tmpdir()), 'records-'));

const FILES = {
  'tickets/STATUS.md': [
    '# Ticket status ledger',
    '',
    '| Phase (slice) | Name | From spec phase(s) | Tickets |',
    '| --- | --- | --- | --- |',
    '| 0 | Phase 0 · Setup | 0 | 2 |',
    '',
    '| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| EZD-001 | 0 | Repo | done | high | — | 3b1037c | 139 | Done 2026-10-19 |',
    '| EZD-010 | 0 | Shell | ready | low | EZD-001 |  |  |  |',
    '',
  ].join('\n'),
  'questions/QUESTIONS.md': [
    '# Questions',
    '',
    '| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    '| Q-0001 | 0 / EZD-001 | planner | Use a \\| b? | answered-josh | Josh | a | chat |',
    '| Q-0002 | 0 / EZD-010 | planner | Which? | open |  |  |  |',
    '',
  ].join('\n'),
  'DONE.md': ['# Done', '', 'Append-only.', '2026-10-19 · EZD-001 · Repo · it builds · 3b1037c', ''].join('\n'),
  'debt.md': ['# Debt list', '', '| ID | Severity | Where | What | Found by | Phase | Deadline | Closed |', '| --- | --- | --- | --- | --- | --- | --- | --- |', '| D-001 | low | x | y | z | 1 | phase 3 gate |  |', ''].join('\n'),
  'handoff/CURRENT.md': '# Handoff\n\n- Next: none',
  'cost/log.jsonl': '{"a":1}\n{"b":[2,3]}\n',
};

function fixtureVault() {
  const dir = tmp();
  for (const [f, text] of Object.entries(FILES)) { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); writeFileSync(path.join(dir, f), text); }
  return dir;
}

test('2.10 a row splits on unescaped pipes only and renders back', () => {
  assert.deepEqual(splitRow('| a | b \\| c |  |'), ['a', 'b \\| c', '']);
  assert.equal(renderRow(['a', 'b \\| c', '']), '| a | b \\| c |  |');
  // with a column count, the last cell keeps a bare pipe as written
  assert.deepEqual(splitRow('| a | b | note with x|y and z |', 3), ['a', 'b', 'note with x|y and z']);
  assert.deepEqual(splitRow('| a | b |', 3), ['a', 'b'], 'too few cells stay too few (the import refuses them)');
});

test('2.10 import then export gives every file back byte for byte (2.11 round trip on a fixture)', () => {
  const vault = fixtureVault();
  const db = openRecords(path.join(tmp(), 'r.db'));
  const counts = importVault(db, vault);
  assert.equal(counts['tickets/STATUS.md'], 3);
  assert.equal(counts['questions/QUESTIONS.md'], 2);
  assert.equal(counts['DONE.md'], 1);
  assert.equal(counts['cost/log.jsonl'], 2);
  const out = tmp();
  exportVault(db, out);
  for (const [f, text] of Object.entries(FILES)) assert.equal(readFileSync(path.join(out, f), 'utf8'), text, f);
});

test('2.10 rows land in typed tables; an exported change comes from the table', () => {
  const db = openRecords(path.join(tmp(), 'r.db'));
  importVault(db, fixtureVault());
  assert.equal(db.prepare("select status from tickets where id = 'EZD-010'").get().status, 'ready');
  assert.equal(db.prepare("select file from questions where id = 'Q-0002'").get().file, 'questions/QUESTIONS.md');
  db.prepare("update tickets set status = 'done', commit_hash = 'abc1234' where id = 'EZD-010'").run();
  const out = tmp();
  exportVault(db, out);
  assert.match(readFileSync(path.join(out, 'tickets/STATUS.md'), 'utf8'), /^\| EZD-010 \| 0 \| Shell \| done \| low \| EZD-001 \| abc1234 \|  \|  \|$/m);
});

test('2.10 a bad row or a duplicate ID is refused and nothing is imported', () => {
  const vault = fixtureVault();
  writeFileSync(path.join(vault, 'questions/QUESTIONS.md'), FILES['questions/QUESTIONS.md'].replace('| Q-0002 |', '| Q-0001 |'));
  const db = openRecords(path.join(tmp(), 'r.db'));
  assert.throws(() => importVault(db, vault), /UNIQUE|constraint/i);
  assert.equal(db.prepare('select count(*) as n from docs').get().n, 0);
  writeFileSync(path.join(vault, 'questions/QUESTIONS.md'), FILES['questions/QUESTIONS.md'].replace('| Which? | open |', '| Which? |'));
  assert.throws(() => importVault(db, vault), /7 cells, the questions table has 8/);
  assert.equal(db.prepare('select count(*) as n from tickets').get().n, 0);
});

test('2.10 a second import needs --replace; show and backup work', () => {
  const dbFile = path.join(tmp(), 'r.db');
  const db = openRecords(dbFile);
  importVault(db, fixtureVault());
  assert.throws(() => importVault(db, fixtureVault()), /--replace/);
  importVault(db, fixtureVault(), { replace: true });
  const s = showTicket(db, 'EZD-001');
  assert.equal(s.ticket.status, 'done');
  assert.deepEqual(s.questions.map((q) => q.id), ['Q-0001'], 'EZD-001 does not pick up EZD-010');
  assert.deepEqual(s.done, ['2026-10-19 · EZD-001 · Repo · it builds · 3b1037c']);
  assert.equal(showTicket(db, 'EZD-999'), null);
  const copy = path.join(tmp(), 'copy.db');
  backup(db, copy);
  assert.ok(existsSync(copy));
  assert.equal(openRecords(copy).prepare('select count(*) as n from tickets').get().n, 2);
});

test('2.10 the CLI imports and exports with --db and prints no warning', () => {
  const vault = fixtureVault();
  const dbFile = path.join(tmp(), 'r.db');
  const out = tmp();
  const env = { ...process.env, NO_COLOR: '1' };
  const a = spawnSync(process.execPath, [script, 'import', '--vault', vault, '--db', dbFile], { encoding: 'utf8', env });
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /RECORDS IMPORT OK/);
  assert.equal(a.stderr, '', 'no warning on stderr');
  const b = spawnSync(process.execPath, [script, 'export', '--out', out, '--db', dbFile], { encoding: 'utf8', env });
  assert.equal(b.status, 0, b.stderr);
  assert.equal(readFileSync(path.join(out, 'DONE.md'), 'utf8'), FILES['DONE.md']);
});
