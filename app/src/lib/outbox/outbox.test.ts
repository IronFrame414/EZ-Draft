// EZD-120b U3 (vault/plans/EZD-120b.md section 4; AC-EZD-120b-1). Expected values: Decided "Batch" (100 a
// request, oldest project first, a null value with baseSeq 0 is dropped) and "classifySave".
import { describe, expect, it } from 'vitest';
import { v } from '../../../test-harness/outbox/sync-support';
import { classifySave, pickBatch, type OutboxEntry } from './outbox';

const entry = (over: Partial<OutboxEntry> & { id: string }): OutboxEntry => ({
  projectId: 'p1',
  baseSeq: 0,
  lockEpoch: 0,
  value: v(1),
  rev: 1,
  queuedAt: 0,
  ...over,
});

const refused = (code: string) => ({ kind: 'refused', code });

describe('EZD-120b outbox rules', () => {
  it('U3 takes 100 entries of the oldest project and drops a null value with baseSeq 0', () => {
    const many = Array.from({ length: 101 }, (_, i) =>
      entry({ id: `e${String(i).padStart(3, '0')}`, queuedAt: i }),
    );
    const first = pickBatch(many);
    expect(first?.send).toHaveLength(100);
    const sentIds = new Set(first?.send.map((e) => e.id));
    const second = pickBatch(many.filter((e) => !sentIds.has(e.id)));
    expect(second?.send).toHaveLength(1);

    const two = pickBatch([
      entry({ id: 'a', projectId: 'p1', queuedAt: 5, lockEpoch: 3 }),
      entry({ id: 'b', projectId: 'p2', queuedAt: 1, lockEpoch: 7 }),
    ]);
    expect(two?.projectId).toBe('p2');
    expect(two?.lockEpoch).toBe(7);
    expect(two?.send.map((e) => e.id)).toEqual(['b']);

    const nulls = entry({ id: 'n', value: null, baseSeq: 0, queuedAt: 1 });
    const live = entry({ id: 'l', queuedAt: 2 });
    const mixed = pickBatch([nulls, live]);
    expect(mixed?.drop.map((e) => e.id)).toEqual(['n']);
    expect(mixed?.send.map((e) => e.id)).toEqual(['l']);
  });

  it('U3 classifies each answer', () => {
    const objects = [{ id: 'x', updatedSeq: 3 }];
    expect(classifySave(200, { objects })).toEqual({ kind: 'saved', objects });
    const body = (code: string) => ({ error: { code } });
    expect(classifySave(400, body('invalid_input'))).toEqual(refused('invalid_input'));
    expect(classifySave(401, body('not_signed_in'))).toEqual(refused('not_signed_in'));
    expect(classifySave(403, body('permission_denied'))).toEqual(refused('permission_denied'));
    expect(classifySave(404, body('project_not_found'))).toEqual(refused('project_not_found'));
    expect(classifySave(409, body('save_conflict'))).toEqual(refused('save_conflict'));
    expect(classifySave(409, body('stale_lock_epoch'))).toEqual(refused('stale_lock_epoch'));
    expect(classifySave(500, body('db_unavailable'))).toEqual({ kind: 'failed' });
    expect(classifySave(502, null)).toEqual({ kind: 'failed' });
  });
});

// EZD-294 O1 (vault/plans/EZD-294.md section 4 and step 8; AC-EZD-294-2).
describe('EZD-294 saved numbers in classifySave', () => {
  it('EZD-294 O1 classifySave keeps a saved number', () => {
    const objects = [
      { id: 'a', updatedSeq: 2, number: 6 },
      { id: 'b', updatedSeq: 1 },
    ];
    expect(classifySave(200, { objects })).toEqual({ kind: 'saved', objects });
    for (const bad of [0, 1.5, '6', null]) {
      expect(
        classifySave(200, { objects: [{ id: 'a', updatedSeq: 2, number: bad }] }),
        String(bad),
      ).toEqual({ kind: 'failed' });
    }
  });
});

// EZD-299a T14 (vault/plans/EZD-299a.md section 3 outbox row; AC-EZD-299-14).
describe('EZD-299a app_outdated answer', () => {
  it('EZD-299a T14 a 409 app_outdated is a refusal with that code', () => {
    expect(classifySave(409, { error: { code: 'app_outdated' } })).toEqual({
      kind: 'refused',
      code: 'app_outdated',
    });
  });
});

// EZD-299b T2 (vault/plans/EZD-299b.md section 4; AC-EZD-299-16; Decided D-Classify).
describe('EZD-299b classifySave lists', () => {
  it('EZD-299b T2 adds conflicts and invalid only for the matching answer and shape', () => {
    expect(
      classifySave(409, {
        error: { code: 'save_conflict' },
        conflicts: [{ id: 'a', serverSeq: 2 }],
      }),
    ).toStrictEqual({
      kind: 'refused',
      code: 'save_conflict',
      conflicts: [{ id: 'a', serverSeq: 2 }],
    });
    expect(classifySave(409, { error: { code: 'save_conflict' }, conflicts: 'x' })).toStrictEqual({
      kind: 'refused',
      code: 'save_conflict',
    });
    expect(
      classifySave(400, {
        error: { code: 'invalid_object' },
        invalid: [{ id: 'b', issue: 'invalid_data' }],
      }),
    ).toStrictEqual({
      kind: 'refused',
      code: 'invalid_object',
      invalid: [{ id: 'b', issue: 'invalid_data' }],
    });
    expect(
      classifySave(400, { error: { code: 'invalid_object' }, invalid: [{ id: 1 }] }),
    ).toStrictEqual({ kind: 'refused', code: 'invalid_object' });
    expect(
      classifySave(409, {
        error: { code: 'app_outdated' },
        conflicts: [{ id: 'a', serverSeq: 2 }],
      }),
    ).toStrictEqual({ kind: 'refused', code: 'app_outdated' });
  });
});
