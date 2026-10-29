// EZD-250 T1-T4: the launcher's repair decision, written to vault/plans/EZD-250.md sections 3 and 4 (D9, D12, D12b).
// Pure functions of scripts/launcher-idle.mjs; the namespace import keeps a missing export a failure of one test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as idle from '../launcher-idle.mjs';
import { mkTmp } from './test-utils/harness.mjs';

const CI_FAILED = 'none: phase 1 PR CI gate check failed (https://github.com/o/r/pull/5; https://github.com/o/r/actions/runs/7/job/9)';
const CHECK_FAILED = 'none: ledger check failed (1); run --check';
const BLOCKED_ONLY = 'none: only blocked tickets left (from phase 1); see STATUS.md notes';
const sha16 = (text) => createHash('sha256').update(text.trim()).digest('hex').slice(0, 16);

test('EZD-250 T1 repairable: agent-fixable waits are repairable, Josh\'s waits and runnable units are not (AC-EZD-250-1)', () => {
  const repairable = [
    CHECK_FAILED,
    BLOCKED_ONLY,
    'none: waiting on Josh (blocked: EZD-163); nothing else is ready in phase 1',
    'none: the last questions 1 unit changed nothing (loop guard, Q-0129); see vault/handoff/CURRENT.md',
    'none: nothing ready in phase 1; waiting on dependencies',
    'none: anything new',
    CI_FAILED,
  ];
  const notRepairable = [
    'none: budget hold (test)',
    'none: vault/handoff/STOP exists',
    'none: every ticket is done',
    'none: phase 2 spec not signed off (spec-check unit needs Josh)',
    'none: waiting on Josh (2 escalated questions for phase 1; x)',
    'none: waiting on Josh (tickets with open questions: EZD-1); x',
    'none: waiting on Josh (guard grant for EZD-1; see vault/handoff/)',
    'none: waiting for the phase 1 PR to auto-merge on a green CI gate (x)',
    'build EZD-1',
  ];
  for (const t of repairable) assert.equal(idle.repairable(t), true, t);
  for (const t of notRepairable) assert.equal(idle.repairable(t), false, t);
});

test('EZD-250 T2 verdict: the first non-empty line decides (AC-EZD-250-1)', () => {
  assert.deepEqual(idle.parseVerdict('REPAIRED: moved the row'), { verdict: 'repaired', line: 'moved the row' });
  assert.deepEqual(idle.parseVerdict('\n  JOSH: set the key'), { verdict: 'josh', line: 'set the key' });
  assert.deepEqual(idle.parseVerdict('FAILED: no idea'), { verdict: 'failed', line: 'no idea' });
  assert.deepEqual(idle.parseVerdict('done'), { verdict: 'failed', line: 'no verdict line' });
  assert.deepEqual(idle.parseVerdict('repaired: x'), { verdict: 'failed', line: 'no verdict line' });
});

test('EZD-250 T3 decision: repair, or skip with the reason (AC-EZD-250-1)', () => {
  const fp = sha16(CHECK_FAILED);
  const d1 = idle.repairDecision({ next: CHECK_FAILED, state: null, consecutive: 0 });
  assert.match(d1.fp, /^[0-9a-f]{16}$/);
  assert.deepEqual(d1, { action: 'repair', fp, kind: 'check' });
  assert.equal(idle.fingerprint(CHECK_FAILED), fp);
  assert.deepEqual(idle.repairDecision({ next: CHECK_FAILED, state: { fp }, consecutive: 0 }), { action: 'skip', why: 'tried' });
  assert.deepEqual(idle.repairDecision({ next: CHECK_FAILED, state: null, consecutive: 3 }), { action: 'skip', why: 'cap' });
  assert.deepEqual(
    idle.repairDecision({ next: 'none: waiting on Josh (2 escalated questions for phase 1; x)', state: null, consecutive: 0 }),
    { action: 'skip', why: 'josh' },
  );
  assert.deepEqual(idle.repairDecision({ next: 'build EZD-1', state: null, consecutive: 0 }), { action: 'skip', why: 'runnable' });
  assert.deepEqual(idle.repairDecision({ next: CI_FAILED, state: null, consecutive: 0 }), { action: 'repair', fp: sha16(CI_FAILED), kind: 'ci' });
  assert.deepEqual(idle.repairDecision({ next: BLOCKED_ONLY, state: null, consecutive: 0 }), { action: 'repair', fp: sha16(BLOCKED_ONLY), kind: 'waiting' });
});

test('EZD-250 T4 fingerprint: launcher code files only, not tests, subfolders or the vault (AC-EZD-250-3)', () => {
  const root = mkTmp();
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };
  put('scripts/a.mjs', 'one\n');
  put('scripts/a.test.mjs', 'one\n');
  put('scripts/sub/b.mjs', 'one\n');
  put('vault/x.md', 'one\n');
  put('vault/tools/t.mjs', 'one\n');
  const first = idle.codeFingerprint(root);
  assert.equal(first.files['scripts/a.mjs'], createHash('sha256').update('one\n').digest('hex'));
  put('scripts/a.mjs', 'two\n');
  const afterCode = idle.codeFingerprint(root);
  assert.notEqual(afterCode.hash, first.hash);
  const differing = Object.keys({ ...first.files, ...afterCode.files }).filter((k) => first.files[k] !== afterCode.files[k]);
  assert.deepEqual(differing, ['scripts/a.mjs']);
  for (const rel of ['scripts/a.test.mjs', 'scripts/sub/b.mjs', 'vault/x.md']) {
    const before = idle.codeFingerprint(root);
    put(rel, 'changed\n');
    assert.equal(idle.codeFingerprint(root).hash, before.hash, rel);
  }
});
