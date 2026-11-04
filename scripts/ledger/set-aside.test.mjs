// Josh 2026-11-03: a unit that runs twice without progress is set aside, not a stop. next_ticket.mjs skips what the launcher listed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { makeLedgerCopy } from '../launcher/test-utils/ledger-copy.mjs';

test('a set-aside phase gate is skipped until the list no longer names it', () => {
  const copy = makeLedgerCopy({ phaseZeroDone: true });
  // Phase 1 not yet gated, whatever the live ledger says (the gate record reached develop at 54a13513 and turned CI red).
  for (const f of ['tickets/gates/phase-01.md', 'cost/phase-01.md']) rmSync(path.join(copy.dir, 'vault', f), { force: true });
  const next = () => copy.tool('next_ticket.mjs', ['--next-unit']).stdout.trim();
  assert.equal(next(), 'gate-phase 1');
  mkdirSync(path.join(copy.dir, '.git'), { recursive: true });
  const list = path.join(copy.dir, '.git', 'set-aside.json');
  writeFileSync(list, JSON.stringify(['gate-phase 1']));
  assert.notEqual(next(), 'gate-phase 1');
  writeFileSync(list, JSON.stringify([]));
  assert.equal(next(), 'gate-phase 1');
});
