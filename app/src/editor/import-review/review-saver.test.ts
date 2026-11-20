// EZD-309 (phase-03 EZD-309 "each review action is saved as a per-item change, batched every 2 seconds"): the save
// queue sends one batch 2 s after the first unsent change, one request at a time, latest state per item, and
// keeps a failed batch for the next try.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewMode } from '../../lib/imports/review';
import {
  createReviewSaver,
  patchSender,
  SAVE_EVERY_MS,
  type SaveBody,
  type SendResult,
} from './review-saver';

const build =
  (state: Record<string, 'accepted' | 'rejected'>) =>
  (ids: readonly string[], mode: ReviewMode | null): SaveBody => ({
    mode,
    changes: [...ids].sort().map((id) => ({ item_id: id, decision: state[id] ?? null, fix: null })),
  });

describe('EZD-309 review save queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends nothing before 2 s, then one batch with each item’s latest state', async () => {
    const state: Record<string, 'accepted' | 'rejected'> = {};
    const send = vi.fn(async (): Promise<SendResult> => 'saved');
    const saver = createReviewSaver({ build: build(state), send });
    state.w1 = 'accepted';
    saver.mark(['w1']);
    await vi.advanceTimersByTimeAsync(1000);
    state.w2 = 'rejected';
    state.w1 = 'rejected';
    saver.mark(['w2', 'w1'], 'by_room');
    await vi.advanceTimersByTimeAsync(SAVE_EVERY_MS - 1001);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      {
        mode: 'by_room',
        changes: [
          { item_id: 'w1', decision: 'rejected', fix: null },
          { item_id: 'w2', decision: 'rejected', fix: null },
        ],
      },
      false,
    );
    expect(saver.pending()).toEqual({ ids: [], mode: null });
  });

  it('keeps one request in flight; changes made meanwhile go in the next batch', async () => {
    let release: (r: SendResult) => void = () => {};
    const send = vi.fn<(b: SaveBody, k: boolean) => Promise<SendResult>>(
      () => new Promise<SendResult>((r) => (release = r)),
    );
    const saver = createReviewSaver({ build: build({}), send });
    saver.mark(['w1']);
    await vi.advanceTimersByTimeAsync(SAVE_EVERY_MS);
    saver.mark(['w2']);
    await vi.advanceTimersByTimeAsync(SAVE_EVERY_MS * 3);
    expect(send).toHaveBeenCalledTimes(1);
    release('saved');
    await vi.advanceTimersByTimeAsync(SAVE_EVERY_MS);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual({
      mode: null,
      changes: [{ item_id: 'w2', decision: null, fix: null }],
    });
  });

  it('a failed batch is tried again 2 s later; a refusal stops the queue', async () => {
    const results: SendResult[] = ['retry', 'saved'];
    const send = vi.fn(async () => results.shift() ?? 'saved');
    const onRetry = vi.fn();
    const saver = createReviewSaver({ build: build({}), send, onRetry });
    saver.mark(['w1']);
    await vi.advanceTimersByTimeAsync(SAVE_EVERY_MS);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(saver.pending().ids).toEqual(['w1']);
    await vi.advanceTimersByTimeAsync(SAVE_EVERY_MS);
    expect(send).toHaveBeenCalledTimes(2);
    expect(saver.pending().ids).toEqual([]);

    const refused = vi.fn(async (): Promise<SendResult> => ({ refused: 409 }));
    const onRefused = vi.fn();
    const s2 = createReviewSaver({ build: build({}), send: refused, onRefused });
    s2.mark(['w1']);
    await vi.advanceTimersByTimeAsync(SAVE_EVERY_MS);
    expect(onRefused).toHaveBeenCalledWith(409);
    s2.mark(['w2']);
    await vi.advanceTimersByTimeAsync(SAVE_EVERY_MS * 2);
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('flushNow sends at once with keepalive (page hide)', async () => {
    const send = vi.fn<(b: SaveBody, k: boolean) => Promise<SendResult>>(async () => 'saved');
    const saver = createReviewSaver({ build: build({}), send });
    saver.mark(['w1']);
    saver.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toBe(true);
    await vi.advanceTimersByTimeAsync(SAVE_EVERY_MS);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('patchSender maps answers: 200 saved, 409 refused, 500 retry', async () => {
    const fetchImpl = vi.fn<(u: string, i?: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    );
    const send = patchSender('p', 'j', fetchImpl as unknown as typeof fetch);
    const body: SaveBody = {
      mode: null,
      changes: [{ item_id: 'w1', decision: 'accepted', fix: null }],
    };
    expect(await send(body, false)).toBe('saved');
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/projects/p/imports/j');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'PATCH', keepalive: false });
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual(body);
    fetchImpl.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    expect(await send(body, true)).toEqual({ refused: 409 });
    fetchImpl.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    expect(await send(body, true)).toBe('retry');
  });
});
