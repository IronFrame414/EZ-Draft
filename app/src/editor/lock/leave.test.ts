// EZD-125 (Q-0681 (a); Q-0697 decisions 04; S06 Decision 12; AC-EZD-125-8): Stop editing's order and the
// tab-close decision, with fakes. Expected values: the order drain, checkpoint, release (Q-0697 04), a failed
// checkpoint keeps the lock (S06 Decision 12; 03b rule 7), and no release while entries are queued (03b rule 9).
import { describe, expect, it, vi } from 'vitest';
import { stopEditing } from './leave';
import type { CheckpointOutcome } from '../thumbnail/checkpoint';

const deps = (o: { left?: number; made?: CheckpointOutcome; release?: boolean } = {}) => {
  const order: string[] = [];
  return {
    order,
    d: {
      drain: vi.fn(async () => {
        order.push('drain');
      }),
      queued: vi.fn(async () => o.left ?? 0),
      checkpoint: vi.fn(async () => {
        order.push('checkpoint');
        return o.made ?? ({ status: 'empty', versionId: 'v' } as CheckpointOutcome);
      }),
      release: vi.fn(async () => {
        order.push('release');
        return o.release === false
          ? ({ ok: false, code: 'not_lock_holder' } as const)
          : ({ ok: true, lockEpoch: 2 } as const);
      }),
    },
  };
};

describe('EZD-125 leaving the editor', () => {
  it('AC-EZD-125-8 Stop editing drains, makes a checkpoint, then releases', async () => {
    const { order, d } = deps();
    expect(await stopEditing(d)).toEqual({ ok: true, lockEpoch: 2 });
    expect(order).toEqual(['drain', 'checkpoint', 'release']);
  });

  it('AC-EZD-125-8 a checkpoint that was not made keeps the lock and returns its error', async () => {
    const { order, d } = deps({ made: { status: 'failed', code: 'http_500' } });
    expect(await stopEditing(d)).toEqual({ ok: false, step: 'checkpoint', code: 'http_500' });
    expect(order).toEqual(['drain', 'checkpoint']);
  });

  it('a checkpoint made with a failed thumbnail still releases', async () => {
    const { order, d } = deps({
      made: { status: 'failed', versionId: 'v', code: 'upload_failed' },
    });
    expect((await stopEditing(d)).ok).toBe(true);
    expect(order).toEqual(['drain', 'checkpoint', 'release']);
  });

  it('edits still queued after the drain keep the lock; a refused release is returned', async () => {
    const left = deps({ left: 1 });
    expect(await stopEditing(left.d)).toEqual({
      ok: false,
      step: 'drain',
      code: 'unsaved_changes',
    });
    expect(left.order).toEqual(['drain']);
    const refused = deps({ release: false });
    expect(await stopEditing(refused.d)).toEqual({
      ok: false,
      step: 'release',
      code: 'not_lock_holder',
    });
  });
});
