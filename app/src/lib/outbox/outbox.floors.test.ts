// EZD-6001 U13 (vault/plans/EZD-6001.md section 4; Decided D-Batch; model_object_level_check (a): an object must name
// a saved floor; ARCH Patch store "at most 100 changes"): a floor upsert is sent first, whatever its id.
import { describe, expect, it } from 'vitest';
import { v } from '../../../test-harness/outbox/sync-support';
import { pickBatch, type OutboxEntry } from './outbox';

const wall = { type: 'wall', schemaVersion: 1, data: {} };
const entry = (over: Partial<OutboxEntry> & { id: string }): OutboxEntry => ({
  projectId: 'p1',
  baseSeq: 1,
  lockEpoch: 0,
  value: wall,
  rev: 1,
  queuedAt: 5,
  ...over,
});

describe('EZD-6001 outbox floors first', () => {
  it('EZD-6001 U13 the first batch of 100 starts with the floor upsert', () => {
    const walls = Array.from({ length: 150 }, (_, i) =>
      entry({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}` }),
    );
    const floorId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const batch = pickBatch([...walls, entry({ id: floorId, value: v(2) })]);
    expect(batch?.send).toHaveLength(100);
    expect(batch?.send[0]?.id).toBe(floorId);
    expect(batch?.send[1]?.id).toBe('00000000-0000-4000-8000-000000000001');
  });
});
