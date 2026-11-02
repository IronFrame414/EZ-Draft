// REMEDIATION-PLAN 2.10: the records database. Fixtures only, in temp folders (L-041); never ~/.ezdraft/records.db.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRecords, importVault, exportVault, showTicket, backup, splitRow, renderRow, applyOps, queueOp, readQueue, applyQueueFile, nextQuestionId, record } from '../records.mjs';

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
  'handoff/CURRENT.md': '# Handoff\n\n- Next: none',
  'questions/QUESTIONS-answered.md': ['# Answered', '', '| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |', '| --- | --- | --- | --- | --- | --- | --- | --- |', '| Q-0000 | 0 / EZD-010 | planner | Old? | answered-agent | orch | yes | x |', ''].join('\n'),
  'lessons/findings.jsonl': '{"f":1}\n',
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

// ---- 2.12 results API (vault/handoff/records-writer/P1-results-api.md) ----
const loaded = () => { const db = openRecords(path.join(tmp(), 'r.db')); importVault(db, fixtureVault()); return db; };
const exported = (db) => { const out = tmp(); exportVault(db, out); return Object.fromEntries(Object.keys(FILES).map((f) => [f, readFileSync(path.join(out, f), 'utf8')])); };
const QROW = { id: 'Q-0003', phase_ticket: '0 / EZD-010', asked_by: 'builder', question: 'New?', status: 'open', answered_by: '', answer: '', source: '' };

test('2.12 R1 a status op changes one row and nothing else', () => {
  const db = loaded();
  applyOps(db, [{ op: 'status', ticket: 'EZD-010', changes: { status: 'done', commit: 'abc1234' } }]);
  const want = FILES['tickets/STATUS.md'].replace('| EZD-010 | 0 | Shell | ready | low | EZD-001 |  |  |  |', '| EZD-010 | 0 | Shell | done | low | EZD-001 | abc1234 |  |  |');
  assert.equal(exported(db)['tickets/STATUS.md'], want);
  assert.throws(() => applyOps(db, [{ op: 'status', ticket: 'EZD-999', changes: { status: 'done' } }]), /EZD-999/);
  assert.throws(() => applyOps(db, [{ op: 'status', ticket: 'EZD-010', changes: { status: 'finished' } }]), /status/);
});

test('2.12 R2 a question op lands after the last Q row; nextQuestionId counts it', () => {
  const db = loaded();
  assert.equal(nextQuestionId(db), 'Q-0003');
  applyOps(db, [{ op: 'question', row: QROW }]);
  assert.equal(nextQuestionId(db), 'Q-0004');
  const lines = exported(db)['questions/QUESTIONS.md'].split('\n');
  assert.equal(lines[lines.findIndex((l) => l.startsWith('| Q-0002 |')) + 1], '| Q-0003 | 0 / EZD-010 | builder | New? | open |  |  |  |');
  assert.throws(() => applyOps(db, [{ op: 'question', row: QROW }]), /Q-0003/);
});

test('2.12 R3 an escalated answer moves the row to QUESTIONS.md', () => {
  const db = loaded();
  applyOps(db, [{ op: 'answer', id: 'Q-0000', status: 'escalated', answered_by: '', answer: '', source: '' }]);
  const e = exported(db);
  assert.doesNotMatch(e['questions/QUESTIONS-answered.md'], /Q-0000/);
  assert.match(e['questions/QUESTIONS.md'], /^\| Q-0000 \| 0 \/ EZD-010 \| planner \| Old\? \| escalated \|  \|  \|  \|$/m);
  assert.equal(db.prepare("select file from questions where id = 'Q-0000'").get().file, 'questions/QUESTIONS.md');
});

test('2.12 R4 done, cost and finding ops append one line each', () => {
  const db = loaded();
  applyOps(db, [{ op: 'done', line: '2026-11-02 · EZD-010 · Shell · works · abc1234' }, { op: 'cost', entry: { unit: 'build' } }, { op: 'finding', entry: { id: 'F-1' } }]);
  const e = exported(db);
  assert.equal(e['DONE.md'], FILES['DONE.md'] + '2026-11-02 · EZD-010 · Shell · works · abc1234\n');
  assert.equal(e['cost/log.jsonl'], FILES['cost/log.jsonl'] + '{"unit":"build"}\n');
  assert.equal(e['lessons/findings.jsonl'], FILES['lessons/findings.jsonl'] + '{"id":"F-1"}\n');
});

test('2.12 R5 a handoff op replaces CURRENT.md and keeps the old text as an event', () => {
  const db = loaded();
  applyOps(db, [{ op: 'handoff', text: '# Handoff 2\n\n- Next: build EZD-010\n' }]);
  assert.equal(exported(db)['handoff/CURRENT.md'], '# Handoff 2\n\n- Next: build EZD-010\n');
  const ev = db.prepare("select data from events where kind = 'handoff'").all();
  assert.equal(ev.length, 1);
  assert.equal(JSON.parse(ev[0].data).text, FILES['handoff/CURRENT.md']);
});

test('2.12 R6 one bad op applies nothing', () => {
  const db = loaded();
  const before = exported(db);
  assert.throws(() => applyOps(db, [{ op: 'done', line: '2026-11-02 · EZD-010 · x' }, { op: 'nonsense' }]), /nonsense/);
  assert.throws(() => applyOps(db, [{ op: 'status', ticket: 'EZD-010', changes: { status: 'done' } }, { op: 'status', ticket: 'EZD-010', changes: { notes: 'a\nb' } }]), /line break/);
  assert.deepEqual(exported(db), before);
});

test('2.12 R7 queued ops apply like applyOps; the file is renamed .applied', () => {
  const ops = [{ op: 'status', ticket: 'EZD-010', changes: { status: 'in-progress' } }, { op: 'question', row: QROW }, { op: 'done', line: '2026-11-02 · EZD-010 · Shell · works · abc1234' }];
  const a = loaded();
  applyOps(a, ops);
  const q = path.join(tmp(), 'u.results.jsonl');
  for (const op of ops) queueOp(q, op);
  assert.equal(readQueue(q).length, 3);
  assert.throws(() => queueOp(q, { op: 'status', ticket: 'EZD-010', changes: { status: 'gone' } }), /status/);
  const b = loaded();
  assert.equal(applyQueueFile(b, q), 3);
  assert.deepEqual(exported(b), exported(a));
  assert.ok(existsSync(`${q}.applied`) && !existsSync(q));
  writeFileSync(q, '{"op":"done","line":"2026-11-02 · EZD-010 · x"}\nnot json\n');
  assert.throws(() => applyQueueFile(b, q), /line 2/);
  assert.ok(existsSync(`${q}.rejected`));
});

test('2.12 R8 record() never writes directly while another launcher runs: outside a unit it queues in the launcher inbox, inside a unit in the results file', async () => {
  const root = tmp();
  const logDir = tmp();
  mkdirSync(path.join(root, 'vault'), { recursive: true });
  const dbFile = path.join(tmp(), 'r.db');
  const db = openRecords(dbFile);
  importVault(db, fixtureVault());
  db.close();
  writeFileSync(path.join(logDir, 'launcher.lock'), String(process.ppid));
  const op = { op: 'status', ticket: 'EZD-010', changes: { notes: 'n' } };
  assert.deepEqual(record(op, { root, logDir, env: { EZD_RECORDS_DB: dbFile } }), { queued: true, inbox: true });
  assert.deepEqual(record(op, { root, logDir, env: { EZD_RECORDS_DB: dbFile, EZD_RECORDS_WRITER: String(process.ppid + 1) } }), { queued: true, inbox: true }, 'a writer pid other than the lock holder is not honoured');
  const { inboxFiles } = await import('../records.mjs');
  assert.equal(inboxFiles(logDir).length, 1);
  assert.equal(readQueue(inboxFiles(logDir)[0]).length, 2);
  assert.ok(!existsSync(path.join(root, 'vault/tickets/STATUS.md')), 'nothing written directly');
  const q = path.join(tmp(), 'u.results.jsonl');
  record(op, { root, logDir, env: { EZD_RECORDS_DB: dbFile, EZD_RESULTS_FILE: q } });
  assert.equal(readQueue(q).length, 1);
  writeFileSync(path.join(logDir, 'launcher.lock'), String(process.pid));
  record(op, { root, logDir, env: { EZD_RECORDS_DB: dbFile } });
  assert.match(readFileSync(path.join(root, 'vault/tickets/STATUS.md'), 'utf8'), /\| EZD-010 \| 0 \| Shell \| ready \| low \| EZD-001 \|  \|  \| n \|/);
});

test('2.12 R9 nextQuestionId counts queued question IDs', () => {
  const db = loaded();
  const q = path.join(tmp(), 'u.results.jsonl');
  queueOp(q, { op: 'question', row: QROW });
  assert.equal(nextQuestionId(db, q), 'Q-0004');
});

test('2.13 a row after a blank line inside a table is still a table row (as next_ticket.mjs reads it)', () => {
  const vault = fixtureVault();
  writeFileSync(path.join(vault, 'questions/QUESTIONS.md'), `${FILES['questions/QUESTIONS.md']}\n|  Q-0009 | 0 / EZD-001 | x | late? | answered-agent | y | z | w |\n`);
  const db = openRecords(path.join(tmp(), 'r.db'));
  importVault(db, vault);
  assert.equal(db.prepare("select status from questions where id = 'Q-0009'").get().status, 'answered-agent');
  assert.equal(nextQuestionId(db), 'Q-0010');
});

test('2.14 views-from-snapshot writes the last snapshot\'s views into a checkout that has none, and never overwrites one', () => {
  const root = tmp();
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  writeFileSync(path.join(root, 'scripts/records.mjs'), readFileSync(script));
  const db = openRecords(path.join(tmp(), 'r.db'));
  importVault(db, fixtureVault());
  exportVault(db, path.join(root, 'vault/snapshots/p1'));
  writeFileSync(path.join(root, 'vault/snapshots/LATEST'), 'p1\n');
  mkdirSync(path.join(root, 'vault/handoff'), { recursive: true });
  writeFileSync(path.join(root, 'vault/handoff/CURRENT.md'), 'mine\n');
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/records.mjs'), 'views-from-snapshot', '--db', path.join(tmp(), 'x.db')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(path.join(root, 'vault/tickets/STATUS.md'), 'utf8'), FILES['tickets/STATUS.md']);
  assert.equal(readFileSync(path.join(root, 'vault/handoff/CURRENT.md'), 'utf8'), 'mine\n');
});
