// EZD-120d U10 (vault/plans/EZD-120d.md sections 3 and 4; AC-EZD-120d-1, -2; Decided "Office drain"). The drain
// module is loaded with `loadOfficeDrain`: a failed import (a lost chunk) answers null and never rejects, so the
// layout keeps working; a good import answers the module.
import { describe, expect, it } from 'vitest';
import type { FieldDrainHandle } from '../../lib/outbox/field-drain';
import { loadFieldDrain, loadOfficeDrain, watchFieldStart, type FieldSender } from './OutboxDrain';

describe('EZD-120d office drain import', () => {
  it('U10 a rejecting loader answers null without rejecting', async () => {
    await expect(loadOfficeDrain(() => Promise.reject(new Error('chunk')))).resolves.toBeNull();
  });

  it('U10 a resolving loader answers the module', async () => {
    const m = { startDrain: () => null, sendBeforeSignOut: async () => 'sent' };
    await expect(
      loadOfficeDrain(() =>
        Promise.resolve(m as unknown as typeof import('../../lib/outbox/office-drain')),
      ),
    ).resolves.toBe(m);
  });
});

// EZD-1998 (AC-EZD-1998-2): the field sender loads on its own (lib/outbox/field-drain.ts), with the same rule.
describe('EZD-1998 field drain import', () => {
  it('a rejecting loader answers null without rejecting', async () => {
    await expect(loadFieldDrain(() => Promise.reject(new Error('chunk')))).resolves.toBeNull();
  });

  it('a resolving loader answers the module', async () => {
    const m = { startFieldDrain: () => null };
    await expect(
      loadFieldDrain(() =>
        Promise.resolve(m as unknown as typeof import('../../lib/outbox/field-drain')),
      ),
    ).resolves.toBe(m);
  });

  it('office-drain still offers the same field sender', async () => {
    const office = await import('../../lib/outbox/office-drain');
    const field = await import('../../lib/outbox/field-drain');
    expect(office.startFieldDrain).toBe(field.startFieldDrain);
  });
});

// EZD-2025 (audit 2026-11-27 A4, A6; AC-EZD-2025-2, -4 "the start is tried again when the network comes back"):
// watchFieldStart reports starting → ready or failed; after a failure it starts again on the next online event.
describe('EZD-2025 field sender start', () => {
  // The network coming back: `back()` fires the 'online' listeners.
  const fakeOnline = () => {
    const listeners = new Set<() => void>();
    return {
      on: (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      back() {
        for (const l of listeners) l();
      },
      listeners,
    };
  };
  const handle = { sync: { add: async () => ({}) } } as unknown as FieldDrainHandle;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('a sender that starts is ready with its sync', async () => {
    const seen: FieldSender[] = [];
    watchFieldStart(async () => handle, (s) => seen.push(s), fakeOnline().on);
    await flush();
    expect(seen).toEqual([{ sync: handle.sync, state: 'ready' }]);
  });

  it('a sender that cannot start (null or a rejection) is failed', async () => {
    const seen: FieldSender[] = [];
    watchFieldStart(async () => null, (s) => seen.push(s), fakeOnline().on);
    watchFieldStart(() => Promise.reject(new Error('chunk')), (s) => seen.push(s), fakeOnline().on);
    await flush();
    expect(seen).toEqual([
      { sync: null, state: 'failed' },
      { sync: null, state: 'failed' },
    ]);
  });

  it('after a failure the start is tried again when the network comes back', async () => {
    const net = fakeOnline();
    const seen: FieldSender[] = [];
    let tries = 0;
    watchFieldStart(
      async () => (++tries === 1 ? null : handle),
      (s) => seen.push(s),
      net.on,
    );
    await flush();
    expect(tries).toBe(1);
    net.back();
    await flush();
    expect(tries).toBe(2);
    expect(seen.map((s) => s.state)).toEqual(['failed', 'starting', 'ready']);
    // Once ready, coming back online does not start it again.
    net.back();
    await flush();
    expect(tries).toBe(2);
  });

  it('a start still under way is not started twice when the network comes back', async () => {
    const net = fakeOnline();
    let tries = 0;
    watchFieldStart(
      async () => {
        tries += 1;
        return handle;
      },
      () => {},
      net.on,
    );
    net.back();
    await flush();
    expect(tries).toBe(1);
  });

  it('stopped: no more reports and no more online listening', async () => {
    const net = fakeOnline();
    const seen: FieldSender[] = [];
    const stop = watchFieldStart(async () => null, (s) => seen.push(s), net.on);
    stop();
    await flush();
    expect(seen).toEqual([]);
    expect(net.listeners.size).toBe(0);
  });
});
