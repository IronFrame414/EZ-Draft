// EZD-1402 (AC-EZD-1402-2 "a task check and a photo queued offline arrive after reconnect"; 03b Architecture rule 9;
// Q-0503; 11 Operations "browser uploads go straight to Storage with resumable signed uploads"). The real queue on
// fake-indexeddb, a controllable online source and a fetch stub that answers like the field-action routes. Expected
// values: nothing is sent offline; on reconnect the actions go oldest first, a photo's signed upload before its
// record; a sent action leaves the device; a network failure keeps it and the order; a refusal for good keeps it,
// marked; a 401 keeps it queued; every send names the membership.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alwaysLock, createOnline } from '../../../test-harness/outbox/sync-support';
import type { SignedUpload } from '../storage/upload';
import { createFieldQueue } from './field-queue';
import { createFieldSync, deviceId } from './field-sync';
import type { Actor } from './outbox';

const actor: Actor = { appUserId: 'u1', tenantId: 't1', membershipId: 'm1' };
const P = '11111111-1111-4111-8111-111111111111';
const DEVICE = '22222222-2222-4222-8222-222222222222';
const SIGNED: SignedUpload = { bucket: 'media', path: 't/p/field-photos/x.jpg', token: 'tok', url: 'u' };

type Call = { url: string; body: Record<string, unknown>; membership: string | null };

function setup(answer: (call: Call) => Response | Promise<Response> = defaultAnswer) {
  let n = 0;
  const queue = createFieldQueue(actor, () => `00000000-0000-4000-8000-00000000000${++n}`);
  const online = createOnline(false);
  const calls: Call[] = [];
  const order: string[] = [];
  const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      url: String(input),
      body: JSON.parse(String(init?.body ?? 'null')) as Record<string, unknown>,
      membership: headers.get('x-ezdraft-membership'),
    };
    calls.push(call);
    order.push(`${call.url.endsWith('/photo') ? 'photo' : 'record'}:${String(call.body.id)}`);
    return answer(call);
  });
  const upload = vi.fn(async (signed: SignedUpload, blob: Blob, opts: { contentType: string }) => {
    order.push(`upload:${signed.path}:${blob.size}:${opts.contentType}`);
  });
  const sync = createFieldSync({
    actor,
    queue,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    online: online.source,
    upload: upload as never,
    device: DEVICE,
    lock: alwaysLock,
  });
  return { queue, online, calls, order, fetchImpl, upload, sync };
}

function defaultAnswer(call: Call): Response {
  if (call.url.endsWith('/photo')) return Response.json({ upload: SIGNED });
  return Response.json({ status: 'synced', syncedAt: '2026-11-21T00:00:00Z' });
}

const jpeg = () => new Blob([new Uint8Array(300)], { type: 'image/jpeg' });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('EZD-1402 field sync', () => {
  it('AC-EZD-1402-2 a task check and a photo queued offline arrive after reconnect, in order', async () => {
    const c = setup();
    await c.sync.add({ projectId: P, kind: 'task_check', ops: { taskId: 'T1', done: true } });
    await c.sync.add({
      projectId: P,
      kind: 'photo_pin',
      ops: { x: 0.25, y: 0.75 },
      photo: { blob: jpeg(), ext: 'jpg' },
    });
    await c.sync.drain();
    expect(c.fetchImpl).not.toHaveBeenCalled();
    expect(await c.queue.list()).toHaveLength(2);

    c.online.set(true);
    await vi.waitFor(async () => expect(await c.queue.list()).toEqual([]));
    const [task, photo] = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
    expect(c.order).toEqual([
      `record:${task}`,
      `photo:${photo}`,
      `upload:${SIGNED.path}:300:image/jpeg`,
      `record:${photo}`,
    ]);
    expect(c.calls[0]!.url).toBe(`/api/projects/${P}/field-actions`);
    expect(c.calls[0]!.body).toEqual({
      id: task,
      deviceId: DEVICE,
      kind: 'task_check',
      ops: { taskId: 'T1', done: true },
      baseVersionId: null,
      queuedAt: expect.any(Number),
      photo: null,
    });
    expect(c.calls[1]).toMatchObject({
      url: `/api/projects/${P}/field-actions/photo`,
      body: { id: photo, kind: 'photo_pin', photo: 'jpg' },
    });
    expect(c.calls[2]!.body).toMatchObject({ id: photo, kind: 'photo_pin', photo: 'jpg' });
    expect(c.calls.every((x) => x.membership === 'm1')).toBe(true);
  });

  it('a photo already stored (upload null) is not uploaded again', async () => {
    const c = setup((call) =>
      call.url.endsWith('/photo') ? Response.json({ upload: null }) : defaultAnswer(call),
    );
    c.online.set(true);
    await c.sync.add({ projectId: P, kind: 'photo_pin', ops: {}, photo: { blob: jpeg(), ext: 'jpg' } });
    await vi.waitFor(async () => expect(await c.queue.list()).toEqual([]));
    expect(c.upload).not.toHaveBeenCalled();
  });

  it('a network failure keeps the action and the order, and sends again on reconnect', async () => {
    let fail = true;
    const c = setup((call) => {
      if (fail) throw new TypeError('offline');
      return defaultAnswer(call);
    });
    c.online.set(true);
    await c.sync.add({ projectId: P, kind: 'task_check', ops: {} });
    await c.sync.add({ projectId: P, kind: 'measurement', ops: {} });
    await vi.waitFor(() => expect(c.fetchImpl).toHaveBeenCalled());
    await c.sync.drain();
    expect((await c.queue.list()).map((a) => [a.kind, a.state])).toEqual([
      ['task_check', 'queued'],
      ['measurement', 'queued'],
    ]);
    // Only the oldest was tried: the failure stopped the drain.
    expect(new Set(c.calls.map((x) => x.body.kind))).toEqual(new Set(['task_check']));
    fail = false;
    c.online.set(true);
    await vi.waitFor(async () => expect(await c.queue.list()).toEqual([]));
    const kinds = c.calls.map((x) => x.body.kind);
    expect(kinds.slice(-2)).toEqual(['task_check', 'measurement']);
    c.sync.dispose();
  });

  it('a refusal for good keeps the action on the device, marked, and the next one still sends', async () => {
    const c = setup((call) =>
      call.body.kind === 'task_check'
        ? Response.json(
            { error: { code: 'permission_denied', message_key: 'error.not_authorized' } },
            { status: 403 },
          )
        : defaultAnswer(call),
    );
    c.online.set(true);
    await c.sync.add({ projectId: P, kind: 'task_check', ops: {} });
    await c.sync.add({ projectId: P, kind: 'measurement', ops: {} });
    await vi.waitFor(async () => {
      const list = await c.queue.list();
      expect(list.map((a) => [a.kind, a.state, a.refusal])).toEqual([
        ['task_check', 'refused', 'permission_denied'],
      ]);
    });
    // A refused action is not sent again.
    await c.sync.drain();
    expect(c.calls.filter((x) => x.body.kind === 'task_check')).toHaveLength(1);
  });

  it('a 401 (signed out or another sign-in) keeps the action queued', async () => {
    const c = setup(() =>
      Response.json({ error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } }, { status: 401 }),
    );
    c.online.set(true);
    await c.sync.add({ projectId: P, kind: 'task_check', ops: {} });
    await vi.waitFor(() => expect(c.fetchImpl).toHaveBeenCalledTimes(1));
    expect((await c.queue.list()).map((a) => a.state)).toEqual(['queued']);
    c.sync.dispose();
  });

  it('subscribers hear each add and each send', async () => {
    const c = setup();
    const heard = vi.fn();
    c.sync.subscribe(heard);
    await c.sync.add({ projectId: P, kind: 'task_check', ops: {} });
    expect(heard).toHaveBeenCalledTimes(1);
    c.online.set(true);
    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(2));
  });

  it('deviceId is made once and kept', () => {
    const kept = new Map<string, string>();
    const store = {
      getItem: (k: string) => kept.get(k) ?? null,
      setItem: (k: string, val: string) => void kept.set(k, val),
    };
    const first = deviceId(store);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(deviceId(store)).toBe(first);
  });
});
