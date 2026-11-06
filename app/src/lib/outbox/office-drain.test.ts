// EZD-120d U2 (vault/plans/EZD-120d.md sections 3 and 4; AC-EZD-120d-1, -2; Q-0503; Decided "sendBeforeSignOut").
// Fake handles and fake timers; no IndexedDB, no network. Expected values: an empty outbox after the flush is
// `sent`; an entry left, a flush that does not end within `waitMs` (default 10,000 ms) or a list that throws is
// `kept`. A handle passed in is not disposed by the call, and nothing deletes edits.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { v } from '../../../test-harness/outbox/sync-support';
import type { Actor, OutboxEntry } from './outbox';
import { sendBeforeSignOut, type DrainHandle } from './office-drain';

const actor: Actor = { appUserId: 'u1', tenantId: 't1', membershipId: 'm1' };
const entry: OutboxEntry = {
  projectId: 'p',
  id: 'A',
  baseSeq: 0,
  lockEpoch: 0,
  value: v(1),
  rev: 1,
  queuedAt: 1,
};

function handle(o: { flush: () => Promise<void>; list: () => Promise<OutboxEntry[]> }): {
  handle: DrainHandle;
  dispose: ReturnType<typeof vi.fn>;
  drop: ReturnType<typeof vi.fn>;
} {
  const dispose = vi.fn();
  const drop = vi.fn();
  const fake = {
    sync: { flush: vi.fn(o.flush), dispose: vi.fn() },
    storage: { list: vi.fn(o.list), drop, close: vi.fn() },
    dispose,
  };
  return { handle: fake as unknown as DrainHandle, dispose, drop };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('EZD-120d send before sign-out', () => {
  it('U2 answers sent when the flush leaves the list empty', async () => {
    const h = handle({ flush: async () => {}, list: async () => [] });
    expect(await sendBeforeSignOut(actor, h.handle)).toBe('sent');
    expect(h.drop).not.toHaveBeenCalled();
  });

  it('U2 answers kept when an entry is still queued', async () => {
    const h = handle({ flush: async () => {}, list: async () => [entry] });
    expect(await sendBeforeSignOut(actor, h.handle)).toBe('kept');
    expect(h.drop).not.toHaveBeenCalled();
  });

  it('U2 answers kept at 10,000 ms when the flush hangs, and is still pending at 9,999 ms', async () => {
    const h = handle({ flush: () => new Promise<void>(() => {}), list: async () => [entry] });
    let result: string | null = null;
    void sendBeforeSignOut(actor, h.handle).then((r) => {
      result = r;
    });
    await vi.advanceTimersByTimeAsync(9999);
    expect(result).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe('kept');
  });

  it('U2 answers kept when the list throws', async () => {
    const h = handle({
      flush: async () => {},
      list: async () => {
        throw new Error('storage closed');
      },
    });
    expect(await sendBeforeSignOut(actor, h.handle)).toBe('kept');
  });
});
