// Durable holds (2026-11-18): a regenerated STATUS.md never releases a ticket held in the tracked vault/build/holds.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyHoldsToVault, effectiveStatuses, parseStatuses, readHolds, withHolds } from '../holds.mjs';
import { applyHoldsToVault as recordsApplyHolds, exportVault, importVault, openRecords } from '../../records.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const row = (id, status, notes = '') => `| ${id} | 20 | Title of ${id} | ${status} |  | EZD-001 |  |  | ${notes} |`;
const statusMd = (rows) => ['# Ticket status ledger', '', '| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |', ...rows, ''].join('\n');

function tempRoot(t, { status, holds }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'holds-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'vault/tickets'), { recursive: true });
  mkdirSync(path.join(root, 'vault/build'), { recursive: true });
  if (status !== undefined) writeFileSync(path.join(root, 'vault/tickets/STATUS.md'), status);
  if (holds !== undefined) writeFileSync(path.join(root, 'vault/build/holds.json'), typeof holds === 'string' ? holds : JSON.stringify({ holds }));
  return root;
}

test('a held ticket is blocked for the loop even after STATUS.md is regenerated with it as todo or ready', (t) => {
  const root = tempRoot(t, { status: statusMd([row('EZD-640', 'todo'), row('EZD-732', 'ready'), row('EZD-601', 'todo')]),
    holds: [{ ticket: 'EZD-640', reason: 'waits on Josh', question: 'Q-0766' }, { ticket: 'EZD-732', reason: 'Manual J', question: 'Q-0763' }] });
  const st = effectiveStatuses(root);
  assert.equal(st['EZD-640'], 'blocked');
  assert.equal(st['EZD-732'], 'blocked');
  assert.equal(st['EZD-601'], 'todo');
});

test('a hold applies even when STATUS.md has no row for the ticket, or no STATUS.md exists', (t) => {
  const root = tempRoot(t, { holds: [{ ticket: 'EZD-640' }] });
  assert.deepEqual(effectiveStatuses(root), { 'EZD-640': 'blocked' });
});

test('no holds file: statuses are STATUS.md as written', (t) => {
  const root = tempRoot(t, { status: statusMd([row('EZD-640', 'todo'), row('EZD-003', 'blocked')]) });
  assert.deepEqual(effectiveStatuses(root), { 'EZD-640': 'todo', 'EZD-003': 'blocked' });
});

test('a holds file that cannot be read throws instead of releasing every hold', (t) => {
  assert.throws(() => effectiveStatuses(tempRoot(t, { status: statusMd([]), holds: '{ not json' })), /not valid JSON/);
  assert.throws(() => effectiveStatuses(tempRoot(t, { status: statusMd([]), holds: '{"tickets": []}' })), /no "holds" list/);
  assert.throws(() => effectiveStatuses(tempRoot(t, { status: statusMd([]), holds: '{"holds": [{"reason": "x"}]}' })), /without a ticket id/);
});

test('withHolds sets only the Status cell of held rows and leaves every other line as written', () => {
  const text = statusMd([row('EZD-640', 'todo', 'note with a | bar'), row('EZD-601', 'ready')]);
  const out = withHolds(text, new Set(['EZD-640']));
  assert.equal(out.split('\n').find((l) => l.startsWith('| EZD-640 |')), row('EZD-640', 'blocked', 'note with a | bar'));
  assert.equal(out.split('\n').find((l) => l.startsWith('| EZD-601 |')), row('EZD-601', 'ready'));
  assert.equal(withHolds(out, new Set(['EZD-640'])), out);
});

test('applyHoldsToVault rewrites a regenerated STATUS.md and reports the rows it changed', (t) => {
  const root = tempRoot(t, { status: statusMd([row('EZD-640', 'todo'), row('EZD-003', 'blocked')]), holds: [{ ticket: 'EZD-640' }, { ticket: 'EZD-003' }] });
  const vault = path.join(root, 'vault');
  assert.deepEqual(applyHoldsToVault(vault), ['EZD-640']);
  assert.equal(parseStatuses(readFileSync(path.join(vault, 'tickets/STATUS.md'), 'utf8'))['EZD-640'], 'blocked');
  assert.deepEqual(applyHoldsToVault(vault), []);
});

test('records.mjs export from a database that lost the hold writes the held ticket back as blocked', (t) => {
  const root = tempRoot(t, { status: statusMd([row('EZD-640', 'blocked'), row('EZD-601', 'todo')]), holds: [{ ticket: 'EZD-640', question: 'Q-0766' }] });
  const vault = path.join(root, 'vault');
  const db = openRecords(path.join(root, 'records.db'));
  t.after(() => db.close());
  importVault(db, vault);
  // The 2026-11-18 incident: the records database had the ticket as todo; its export overwrote STATUS.md.
  db.prepare('update tickets set status = ? where id = ?').run('todo', 'EZD-640');
  writeFileSync(path.join(vault, 'tickets/STATUS.md'), 'stale\n');
  exportVault(db, vault);
  const st = parseStatuses(readFileSync(path.join(vault, 'tickets/STATUS.md'), 'utf8'));
  assert.equal(st['EZD-640'], 'blocked');
  assert.equal(st['EZD-601'], 'todo');
});

test('the repository holds file reads, and every held ticket exists in tickets.json', () => {
  const holds = readHolds(path.join(REPO, 'vault/build/holds.json'));
  assert.ok(holds.length > 0);
  const ids = new Set(JSON.parse(readFileSync(path.join(REPO, 'vault/tickets/tickets.json'), 'utf8')).tickets.map((x) => x.id));
  for (const h of holds) assert.ok(ids.has(h.ticket), `${h.ticket} is not in tickets.json`);
  assert.equal(new Set(holds.map((h) => h.ticket)).size, holds.length, 'a ticket is held twice');
});

test('records.mjs and the loop apply holds the same way', (t) => {
  const rows = [row('EZD-640', 'todo', 'a | b'), row('EZD-003', 'blocked'), row('EZD-601', 'ready')];
  const holds = [{ ticket: 'EZD-640' }, { ticket: 'EZD-003' }];
  const a = path.join(tempRoot(t, { status: statusMd(rows), holds }), 'vault');
  const b = path.join(tempRoot(t, { status: statusMd(rows), holds }), 'vault');
  assert.deepEqual(applyHoldsToVault(a), recordsApplyHolds(b));
  assert.equal(readFileSync(path.join(a, 'tickets/STATUS.md'), 'utf8'), readFileSync(path.join(b, 'tickets/STATUS.md'), 'utf8'));
  assert.throws(() => recordsApplyHolds(path.join(tempRoot(t, { status: statusMd(rows), holds: '{ bad' }), 'vault')), /not valid JSON/);
});
