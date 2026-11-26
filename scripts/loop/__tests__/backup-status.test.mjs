// EZD-1958: the loop runs the backup status check once a day and logs 'BACKUP STALE <workflow>' (stub gh, rule 5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKUP_CHECK_HOURS, backupCheckDue, checkBackups } from '../backup-status.mjs';
import { makeStubGh } from './fixtures/backup-runs/make-stub.mjs';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const H = 3600000;

test('AC-EZD-1958-1, AC-EZD-1958-3 the check is due once a day: first run, then 24 h after the last', () => {
  assert.equal(BACKUP_CHECK_HOURS, 24);
  assert.equal(backupCheckDue(undefined, NOW), true);
  assert.equal(backupCheckDue('2026-11-25T12:00:01Z', NOW), false);
  assert.equal(backupCheckDue('2026-11-25T12:00:00Z', NOW), true);
});

test('AC-EZD-1958-1, AC-EZD-1958-2, AC-EZD-1958-3 a due check logs BACKUP STALE for the stale and failed workflows and records when it ran', () => {
  for (const [c, want] of [['stale', ['backup-db.yml']], ['failed', ['backup-check.yml', 'backup-files.yml']], ['green', []]]) {
    const stub = makeStubGh(c);
    try {
      const s = {}; const logged = []; let saved = 0;
      const lines = checkBackups(s, { nowMs: NOW, gh: stub.gh, env: stub.env, log: (l) => logged.push(l), save: () => saved++ });
      assert.deepEqual(lines, logged);
      assert.equal(logged.length, 3);
      assert.deepEqual(logged.filter((l) => l.startsWith('BACKUP STALE ')).map((l) => l.split(' ')[2].replace(/:$/, '')), want, c);
      assert.equal(s.backups_checked_at, '2026-11-26T12:00:00Z');
      assert.equal(saved, 1);
      // Not due again for a day: gh is not called again.
      const before = stub.calls().length;
      assert.equal(checkBackups(s, { nowMs: NOW + 23 * H, gh: stub.gh, env: stub.env }), null);
      assert.equal(stub.calls().length, before);
    } finally { stub.done(); }
  }
});

test('AC-EZD-1958-3 the loop calls the backup check from its main loop, guarded like the advisory check', () => {
  const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../loop.mjs'), 'utf8');
  assert.match(src, /from '\.\/loop\/backup-status\.mjs'/);
  assert.match(src, /try \{ checkBackups\(s, \{[^}]*log[^}]*\}\); \} catch \(e\) \{ log\(`backup status check error/);
});
