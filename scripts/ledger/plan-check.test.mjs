// D-004 (vault/debt.md): the ledger check refuses a ticket past todo with no plan file, so a phase gate that writes a fix
// ticket as ready is caught at once instead of stopping the launcher on an empty build. Runs on a ledger copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { makeLedgerCopy } from '../launcher/test-utils/ledger-copy.mjs';

test('D-004 a ready ticket with no plan fails the ledger check; todo with no plan passes', () => {
  const l = makeLedgerCopy({ synthetic: [['EZD-9992', 'ready'], ['EZD-9993', 'todo']] });
  rmSync(l.file('plans/EZD-9992.md'));
  const r = l.tool('next_ticket.mjs', ['--check']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('EZD-9992 is ready but has no plan (vault/plans/EZD-9992.md); a new ticket starts as todo'), r.stdout);
  assert.ok(!r.stdout.includes('EZD-9993'), r.stdout);
  l.setStatus('EZD-9992', 'todo');
  assert.equal(l.tool('next_ticket.mjs', ['--check']).status, 0);
});
