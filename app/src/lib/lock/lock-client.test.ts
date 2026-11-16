// EZD-125 (Q-0697 decisions 03, 04; AC-EZD-125-4, -5, -8): the lock client's result types with a stub fetch.
// Expected values: the lock route answers of app/src/app/api/projects/[id]/lock/**/route.ts headers.
import { describe, expect, it, vi } from 'vitest';
import {
  acquireLock,
  cancelRequest,
  fetchLock,
  releaseLock,
  requestEdit,
  respondRequest,
  sendClosingRelease,
} from './lock-client';

const P = '11111111-1111-4111-8111-111111111111';
const answer = (status: number, body: unknown) =>
  vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(body, { status }));
const STATE = {
  lockEpoch: 1,
  holder: { appUserId: 'a', name: 'Ana' },
  since: '2026-11-16T09:42:10.000Z',
  offline: false,
  myRequest: null,
  requests: [],
  now: '2026-11-16T09:43:00.000Z',
};

describe('EZD-125 lock client', () => {
  it('reads the lock state; a bad body is bad_response; a thrown fetch is network_failed', async () => {
    expect(await fetchLock(P, { fetchImpl: answer(200, { lock: STATE }) })).toEqual({
      ok: true,
      lock: STATE,
    });
    expect(await fetchLock(P, { fetchImpl: answer(200, { lock: {} }) })).toEqual({
      ok: false,
      code: 'bad_response',
    });
    const thrown = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await fetchLock(P, { fetchImpl: thrown })).toEqual({
      ok: false,
      code: 'network_failed',
    });
    expect(
      await fetchLock(P, {
        fetchImpl: answer(404, { error: { code: 'project_not_found', message_key: 'x' } }),
      }),
    ).toEqual({ ok: false, code: 'project_not_found' });
  });

  it('AC-EZD-125-4 acquire: 200 is acquired with the epoch; 409 lock_held names the holder', async () => {
    const ok = answer(200, { lock: { lockEpoch: 3, since: 's' } });
    expect(await acquireLock(P, 'tab-1', { fetchImpl: ok })).toEqual({
      ok: true,
      status: 'acquired',
      lockEpoch: 3,
      since: 's',
    });
    expect(ok.mock.calls[0][0]).toBe(`/api/projects/${P}/lock`);
    expect(ok.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"deviceId":"tab-1"}' });
    const held = answer(409, {
      error: { code: 'lock_held', message_key: 'error.lock_held' },
      holder: { appUserId: 'b', name: 'Ben' },
      since: 's',
    });
    expect(await acquireLock(P, 'tab-1', { fetchImpl: held })).toEqual({
      ok: true,
      status: 'held',
      holder: { appUserId: 'b', name: 'Ben' },
      since: 's',
    });
    expect(
      await acquireLock(P, 't', {
        fetchImpl: answer(403, { error: { code: 'permission_denied' } }),
      }),
    ).toEqual({ ok: false, code: 'permission_denied' });
  });

  it('AC-EZD-125-5 request: 201 requested, 200 lock free, 409 codes; cancel and respond', async () => {
    const req = { id: 'r', requestedAt: 'a', deadlineAt: 'b' };
    expect(await requestEdit(P, { fetchImpl: answer(201, { request: req }) })).toEqual({
      ok: true,
      status: 'requested',
      request: req,
    });
    expect(await requestEdit(P, { fetchImpl: answer(200, { lockFree: true }) })).toEqual({
      ok: true,
      status: 'lock_free',
    });
    expect(
      await requestEdit(P, { fetchImpl: answer(409, { error: { code: 'request_pending' } }) }),
    ).toEqual({ ok: false, code: 'request_pending' });
    const del = answer(200, { request: { id: 'r' } });
    expect(await cancelRequest(P, { fetchImpl: del })).toEqual({ ok: true });
    expect(del.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
    expect(
      await respondRequest(P, 'r', 'keep', {
        fetchImpl: answer(200, { status: 'kept', lock: { lockEpoch: 1 } }),
      }),
    ).toEqual({ ok: true, status: 'kept', lockEpoch: 1 });
    expect(
      await respondRequest(P, 'r', 'keep', {
        fetchImpl: answer(409, { error: { code: 'request_not_pending' } }),
      }),
    ).toEqual({ ok: false, code: 'request_not_pending' });
  });

  it('AC-EZD-125-8 release and the keepalive tab-close release', async () => {
    const rel = answer(200, { lock: { lockEpoch: 2 } });
    expect(await releaseLock(P, { reason: 'stop_editing' }, { fetchImpl: rel })).toEqual({
      ok: true,
      lockEpoch: 2,
    });
    expect(rel.mock.calls[0][1]).toMatchObject({ body: '{"reason":"stop_editing"}' });
    const close = answer(200, { lock: { lockEpoch: 2 } });
    sendClosingRelease(P, 7, close);
    expect(close).toHaveBeenCalledTimes(1);
    expect(close.mock.calls[0][0]).toBe(`/api/projects/${P}/lock/release`);
    expect(close.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      keepalive: true,
      body: '{"reason":"closed","lockEpoch":7}',
    });
  });
});
