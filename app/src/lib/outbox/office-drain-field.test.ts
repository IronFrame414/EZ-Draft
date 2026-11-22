// EZD-1402 (Q-0503 "Sign out first sends queued edits; if it cannot, it warns and asks"; 03b rule 9 "One outbox"):
// sign-out also sends the queued field actions. Fake handles; no IndexedDB, no network. Expected values: `sent` only
// when both the edits and the field actions are gone; a field action left (sent or refused) is `kept`; a field
// handle passed in is drained and not disposed.
import { describe, expect, it, vi } from 'vitest';
import type { FieldAction } from './field-action';
import type { Actor } from './outbox';
import { sendBeforeSignOut, type DrainHandle, type FieldDrainHandle } from './office-drain';

const actor: Actor = { appUserId: 'u1', tenantId: 't1', membershipId: 'm1' };

const model = (): DrainHandle =>
  ({
    sync: { flush: vi.fn(async () => {}), dispose: vi.fn() },
    storage: { list: vi.fn(async () => []), close: vi.fn() },
    dispose: vi.fn(),
  }) as unknown as DrainHandle;

function field(left: number) {
  const drain = vi.fn(async () => {});
  const dispose = vi.fn();
  const handle = {
    sync: { drain },
    queue: { list: vi.fn(async () => Array.from({ length: left }, () => ({}) as FieldAction)) },
    dispose,
  } as unknown as FieldDrainHandle;
  return { handle, drain, dispose };
}

describe('EZD-1402 sign-out sends field actions', () => {
  it('both emptied: sent; the field handle is drained and kept', async () => {
    const f = field(0);
    expect(await sendBeforeSignOut(actor, model(), 1000, f.handle)).toBe('sent');
    expect(f.drain).toHaveBeenCalledTimes(1);
    expect(f.dispose).not.toHaveBeenCalled();
  });

  it('a field action still on the device: kept', async () => {
    expect(await sendBeforeSignOut(actor, model(), 1000, field(1).handle)).toBe('kept');
  });
});
