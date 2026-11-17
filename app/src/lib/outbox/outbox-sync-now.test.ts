// EZD-5605 T5-T9 (vault/plans/EZD-5605.md section 4; D-SendNow; Q-0638 gap 10; AC-EZD-5605-5, -7). An in-memory
// storage and fetch stubs; nothing leaves the process. Expected values: the plan's D-SendNow steps (drain first,
// one batch of at most MAX_CHANGES_PER_SAVE = 100 marked `assistant: true`, all or nothing), the objects route's
// answers (200 `{ objects }`, 409 `save_conflict` with `conflicts`, 403 `permission_denied`).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alwaysLock,
  createMemoryStorage,
  createMutexLock,
  createOnline,
  readCall,
  savedResponse,
  v,
  type SentCall,
} from '../../../test-harness/outbox/sync-support';
import type { Actor, OutboxStorage, SavedObject } from './outbox';
import { createOutboxSync, type OutboxSync, type TabLock } from './outbox-sync';

const actor: Actor = { appUserId: 'u1', tenantId: 't1', membershipId: 'm1' };
const P = '11111111-1111-4111-8111-111111111111';
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const change = (n: number) => ({ id: idOf(n), value: v(n) });
const VALID = { assistant: true as const, stillValid: () => true };

type Answer = (call: SentCall) => Response | Promise<Response>;

let made: OutboxSync[] = [];
afterEach(() => {
  for (const s of made) s.dispose();
  made = [];
});

function setup(
  o: {
    answer?: Answer;
    storage?: OutboxStorage & { entries: Map<string, unknown>; conflicts: Map<string, unknown> };
    online?: boolean;
    lock?: TabLock;
  } = {},
) {
  const storage = o.storage ?? createMemoryStorage();
  const online = createOnline(o.online ?? true);
  const calls: SentCall[] = [];
  const answer: Answer = o.answer ?? ((c) => savedResponse(c));
  const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
    const call = await readCall(input, init);
    calls.push(call);
    return answer(call);
  });
  const onSaved = vi.fn<(p: string, s: SavedObject[]) => void>();
  const sync = createOutboxSync({
    actor,
    storage,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    lock: o.lock ?? alwaysLock,
    online: online.source,
    onSaved,
  });
  made.push(sync);
  const ids = (c: SentCall) => (c.body.changes as unknown as { id: string }[]).map((x) => x.id);
  const flagged = () => calls.filter((c) => 'assistant' in c.body);
  return { storage, online, calls, fetchImpl, onSaved, sync, ids, flagged };
}

describe('EZD-5605 OutboxSync.sendNow', () => {
  it('T5 drains the queued hand changes first, then sends the change alone marked as AI', async () => {
    const t = setup();
    await t.sync.enqueue(P, 0, [change(1), change(2)]);
    const r = await t.sync.sendNow(P, 0, [change(3), change(4), change(5)], VALID);

    expect(t.calls).toHaveLength(2);
    expect('assistant' in t.calls[0]!.body).toBe(false);
    expect(t.ids(t.calls[0]!).sort()).toEqual([idOf(1), idOf(2)]);
    expect((t.calls[1]!.body as { assistant?: unknown }).assistant).toBe(true);
    expect(t.ids(t.calls[1]!)).toEqual([idOf(3), idOf(4), idOf(5)]);
    expect(r).toEqual({
      kind: 'saved',
      objects: [idOf(3), idOf(4), idOf(5)].map((id) => ({ id, updatedSeq: 1 })),
    });
    expect(await t.storage.list()).toEqual([]);
    expect(t.onSaved).toHaveBeenCalledTimes(2);
    expect(t.onSaved.mock.calls[1]![1]).toEqual(r.kind === 'saved' ? r.objects : null);
    expect(t.sync.getState().status).toBe('saved');
  });

  it('T6 a refusal drops the change, lists no conflict and leaves later drains running', async () => {
    let next: Answer = () =>
      Response.json(
        {
          error: { code: 'save_conflict', message_key: 'error.save_conflict' },
          conflicts: [{ id: idOf(3), serverSeq: 4 }],
        },
        { status: 409 },
      );
    const t = setup({ answer: (c) => next(c) });
    const conflict = await t.sync.sendNow(P, 0, [change(3), change(4)], VALID);
    expect(conflict).toEqual({
      kind: 'refused',
      code: 'save_conflict',
      conflicts: [{ id: idOf(3), serverSeq: 4 }],
    });
    expect(await t.storage.list()).toEqual([]);
    expect(await t.storage.listConflicts()).toEqual([]);
    expect(t.sync.getState().problem).toBeNull();

    next = () =>
      Response.json(
        { error: { code: 'permission_denied', message_key: 'error.not_authorized' } },
        { status: 403 },
      );
    const denied = await t.sync.sendNow(P, 0, [change(5)], VALID);
    expect(denied).toEqual({ kind: 'refused', code: 'permission_denied' });
    expect(await t.storage.list()).toEqual([]);
    expect(await t.storage.listConflicts()).toEqual([]);
    expect(t.sync.getState().problem).toBeNull();

    next = (c) => savedResponse(c);
    await t.sync.enqueue(P, 0, [change(6)]);
    await t.sync.flush();
    expect(t.ids(t.calls.at(-1)!)).toEqual([idOf(6)]);
    expect(await t.storage.list()).toEqual([]);
  });

  it('T7 nothing is sent when offline, the drain stops, the size is 0 or over 100, a refusal blocks, or no lock', async () => {
    // (a) offline
    const a = setup({ online: false });
    expect(await a.sync.sendNow(P, 0, [change(1)], VALID)).toEqual({ kind: 'unsaved' });
    expect(a.fetchImpl).not.toHaveBeenCalled();

    // (b) the drain's fetch throws: the hand change stays, the AI change is not sent
    const b = setup({
      answer: () => {
        throw new Error('network');
      },
    });
    await b.sync.enqueue(P, 0, [change(1)]);
    expect(await b.sync.sendNow(P, 0, [change(2)], VALID)).toEqual({ kind: 'unsaved' });
    expect(b.flagged()).toEqual([]);
    expect((await b.storage.list()).map((e) => e.id)).toEqual([idOf(1)]);

    // (c), (d) 0 and 101 changes: no storage call at all
    const storage = createMemoryStorage();
    const put = vi.spyOn(storage, 'put');
    const list = vi.spyOn(storage, 'list');
    const c = setup({ storage });
    expect(await c.sync.sendNow(P, 0, [], VALID)).toEqual({ kind: 'unsaved' });
    const many = Array.from({ length: 101 }, (_, i) => change(i + 1));
    expect(await c.sync.sendNow(P, 0, many, VALID)).toEqual({ kind: 'unsaved' });
    expect(put).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(c.fetchImpl).not.toHaveBeenCalled();

    // (e) a hand save already refused (problem set): blocked until retry()
    const e = setup({
      answer: () =>
        Response.json(
          { error: { code: 'invalid_input', message_key: 'error.invalid_input' } },
          { status: 400 },
        ),
    });
    await e.sync.enqueue(P, 0, [change(1)]);
    await e.sync.flush();
    expect(e.sync.getState().problem).toBe('invalid_input');
    expect(await e.sync.sendNow(P, 0, [change(2)], VALID)).toEqual({ kind: 'unsaved' });
    expect(e.flagged()).toEqual([]);

    // (f) another tab holds the lock
    const lock = createMutexLock();
    let release: () => void = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    const holding = lock.tryRun('x', () => held);
    const f = setup({ lock });
    expect(await f.sync.sendNow(P, 0, [change(1)], VALID)).toEqual({ kind: 'unsaved' });
    expect(f.fetchImpl).not.toHaveBeenCalled();
    release();
    await holding;
  });

  it('T7 exactly 100 changes go in one request', async () => {
    const t = setup();
    const hundred = Array.from({ length: 100 }, (_, i) => change(i + 1));
    const r = await t.sync.sendNow(P, 0, hundred, VALID);
    expect(r.kind).toBe('saved');
    expect(t.calls).toHaveLength(1);
    expect(t.ids(t.calls[0]!)).toHaveLength(100);
  });

  it('T8 stillValid false after the drain: cancelled, nothing sent, nothing left', async () => {
    const t = setup();
    await t.sync.enqueue(P, 0, [change(1)]);
    let valid = true;
    // The preview goes stale while the drain's request is out.
    t.fetchImpl.mockImplementationOnce(async (input: unknown, init?: RequestInit) => {
      const call = await readCall(input, init);
      t.calls.push(call);
      valid = false;
      return savedResponse(call);
    });
    const r = await t.sync.sendNow(P, 0, [change(2)], {
      assistant: true,
      stillValid: () => valid,
    });
    expect(r).toEqual({ kind: 'cancelled' });
    expect(t.calls).toHaveLength(1);
    expect(t.flagged()).toEqual([]);
    expect(await t.storage.list()).toEqual([]);
  });

  it('T9 a storage throw is a storage failure; a commit throw after 200 still answers saved and retry() replays it', async () => {
    const s1 = createMemoryStorage();
    vi.spyOn(s1, 'put').mockRejectedValueOnce(new Error('quota'));
    const a = setup({ storage: s1 });
    expect(await a.sync.sendNow(P, 0, [change(1)], VALID)).toEqual({ kind: 'unsaved' });
    expect(a.sync.getState()).toMatchObject({ status: 'error', problem: 'storage_failed' });
    expect(a.fetchImpl).not.toHaveBeenCalled();

    const s2 = createMemoryStorage();
    const commit = vi.spyOn(s2, 'commit').mockRejectedValueOnce(new Error('quota'));
    const b = setup({ storage: s2 });
    const r = await b.sync.sendNow(P, 0, [change(1)], VALID);
    expect(r).toEqual({ kind: 'saved', objects: [{ id: idOf(1), updatedSeq: 1 }] });
    expect(b.sync.getState()).toMatchObject({ status: 'error', problem: 'storage_failed' });
    expect((await s2.list()).map((e) => e.id)).toEqual([idOf(1)]);
    b.sync.retry();
    await vi.waitFor(async () => expect(await s2.list()).toEqual([]));
    expect(commit).toHaveBeenCalledTimes(2);
    expect(b.flagged()).toHaveLength(1);
  });
});
