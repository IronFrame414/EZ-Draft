// EZD-1958 (audit 2026-11-23 O4): a backup workflow is stale when its newest success is older than 8 days or its newest
// finished run failed. gh is a stub answering from fixtures (rule 5). "Now" is 2026-11-26T12:00:00Z throughout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKFLOWS, STALE_DAYS, backupStatus, judge, statusLine } from '../status.mjs';
import { makeStubGh } from '../../loop/__tests__/fixtures/backup-runs/make-stub.mjs';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const run = (conclusion, at, status = 'completed') => ({ status, conclusion, createdAt: at, updatedAt: at });

function withStub(c, fn) { const s = makeStubGh(c); try { return fn(s); } finally { s.done(); } }

test('AC-EZD-1958-1 the three backup workflows are checked, with an 8-day limit', () => {
  assert.deepEqual(WORKFLOWS, ['backup-check.yml', 'backup-db.yml', 'backup-files.yml']);
  assert.equal(STALE_DAYS, 8);
});

test('AC-EZD-1958-1, AC-EZD-1958-2 green: every workflow passed within 8 days, so nothing is stale', () => withStub('green', ({ gh, env, calls }) => {
  const res = backupStatus({ gh, env, nowMs: NOW });
  assert.deepEqual(res.map((r) => [r.workflow, r.stale]), [['backup-check.yml', false], ['backup-db.yml', false], ['backup-files.yml', false]]);
  assert.equal(res[1].lastSuccess, '2026-11-22T08:20:00.000Z', 'newest success found even when gh lists runs oldest first');
  assert.equal(res[2].lastSuccess, '2026-11-26T07:10:00.000Z', 'a run still in progress is neither a pass nor a failure');
  assert.ok(res.every((r) => !statusLine(r).includes('BACKUP STALE')));
  assert.deepEqual(calls().map((c) => c.split(' ').slice(0, 4).join(' ')), WORKFLOWS.map((w) => `run list --workflow ${w}`));
}));

test('AC-EZD-1958-1, AC-EZD-1958-2 stale: newest success 9 days old is BACKUP STALE; exactly 8 days old is not', () => withStub('stale', ({ gh, env }) => {
  const res = backupStatus({ gh, env, nowMs: NOW });
  assert.deepEqual(res.map((r) => [r.workflow, r.stale]), [['backup-check.yml', false], ['backup-db.yml', true], ['backup-files.yml', false]]);
  assert.match(statusLine(res[1]), /^BACKUP STALE backup-db\.yml: last success 2026-11-17T11:00:00\.000Z, more than 8 days ago$/);
}));

test('AC-EZD-1958-1, AC-EZD-1958-2 failed: a newest run that failed is BACKUP STALE even with a success the day before; no run at all is stale', () => withStub('failed', ({ gh, env }) => {
  const res = backupStatus({ gh, env, nowMs: NOW });
  assert.deepEqual(res.map((r) => [r.workflow, r.stale]), [['backup-check.yml', true], ['backup-db.yml', false], ['backup-files.yml', true]]);
  assert.equal(statusLine(res[0]), 'BACKUP STALE backup-check.yml: newest run failure at 2026-11-26T10:05:00.000Z');
  assert.equal(statusLine(res[2]), 'BACKUP STALE backup-files.yml: no successful run found');
}));

test('gh failing (no answer) is reported as unreadable, never as ok', () => withStub('missing-case', ({ gh, env }) => {
  const res = backupStatus({ gh, env, nowMs: NOW });
  assert.ok(res.every((r) => r.stale === null && r.error));
  assert.match(statusLine(res[0]), /^backup status backup-check\.yml unreadable: stub gh: no answer/);
}));

test('a cancelled or timed-out newest run counts as not passing', () => {
  assert.equal(judge('w', [run('cancelled', '2026-11-26T10:00:00Z'), run('success', '2026-11-25T10:00:00Z')], NOW).stale, true);
  assert.equal(judge('w', [run('timed_out', '2026-11-26T10:00:00Z')], NOW).stale, true);
  assert.equal(judge('w', [run('', '2026-11-26T11:00:00Z', 'queued'), run('success', '2026-11-25T10:00:00Z')], NOW).stale, false);
});
