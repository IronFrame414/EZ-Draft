// EZD-224b T-U9 (vault/plans/EZD-224b.md section 4; AC-EZD-224-1). Expected values: the plan's Decided "Encode
// client"; Q-0664 (the 40,960 limit); Q-0736 (10,000 ms). A fake worker stands in for the module worker.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { encodeThumbnail, type ThumbnailWorker } from './encode-client';

const IMG = {
  data: new Uint8ClampedArray(16),
  width: 2,
  height: 2,
  colorSpace: 'srgb',
} as unknown as ImageData;

type Fake = {
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  onmessage: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onmessageerror: ((e: unknown) => void) | null;
};

function makeFake(): Fake {
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function start(fake: Fake, timeoutMs = 10000) {
  const p = encodeThumbnail(IMG, {
    createWorker: () => fake as unknown as ThumbnailWorker,
    timeoutMs,
  });
  // Attach a handler now so a rejection before the test awaits it is never unhandled.
  p.catch(() => {});
  return p;
}

const encoded = (bytes: unknown, quality: number) => ({
  data: { kind: 'encoded', bytes, quality },
});

describe('EZD-224b encode client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('EZD-224b T-U9 one worker per call, one settle, a strict check on the reply', async () => {
    // (a)
    const fa = makeFake();
    const pa = start(fa);
    await flush();
    expect(fa.postMessage).toHaveBeenCalledTimes(1);
    expect(fa.postMessage.mock.calls[0]).toHaveLength(1);
    expect(fa.postMessage.mock.calls[0]![0]).toEqual({ image: IMG });
    expect((fa.postMessage.mock.calls[0]![0] as { image: unknown }).image).toBe(IMG);
    fa.onmessage!(encoded(new ArrayBuffer(38000), 70));
    const ra = await pa;
    expect(ra?.quality).toBe(70);
    expect(ra?.bytes.length).toBe(38000);
    expect(fa.terminate).toHaveBeenCalledTimes(1);

    // (b)
    const fb = makeFake();
    const pb = start(fb);
    await flush();
    fb.onmessage!({ data: { kind: 'too_large' } });
    expect(await pb).toBeNull();
    expect(fb.terminate).toHaveBeenCalledTimes(1);

    // (c)
    const fc = makeFake();
    const pc = start(fc);
    await flush();
    fc.onmessage!({ data: { kind: 'error', message: 'x' } });
    await expect(pc).rejects.toThrow('thumbnail.encode_failed');
    expect(fc.terminate).toHaveBeenCalledTimes(1);

    // (d)
    const fd = makeFake();
    const pd = start(fd);
    await flush();
    fd.onerror!(new Event('error'));
    await expect(pd).rejects.toThrow('thumbnail.encode_failed');
    fd.onmessage!(encoded(new ArrayBuffer(38000), 70));
    expect(fd.terminate).toHaveBeenCalledTimes(1);

    // (e) 40,960 bytes is not under the limit
    const fe = makeFake();
    const pe = start(fe);
    await flush();
    fe.onmessage!(encoded(new ArrayBuffer(40960), 80));
    await expect(pe).rejects.toThrow('thumbnail.encode_failed');
    expect(fe.terminate).toHaveBeenCalledTimes(1);

    // (f)
    const ff = makeFake();
    let outcome = 'pending';
    const pf = start(ff);
    pf.then(
      () => {
        outcome = 'resolved';
      },
      (e: Error) => {
        outcome = e.message;
      },
    );
    await flush();
    vi.advanceTimersByTime(9999);
    await flush();
    expect(outcome).toBe('pending');
    vi.advanceTimersByTime(1);
    await expect(pf).rejects.toThrow('thumbnail.encode_timeout');
    expect(ff.terminate).toHaveBeenCalledTimes(1);

    // (g) the worker could not be made: nothing to end
    const pg = encodeThumbnail(IMG, {
      createWorker: () => {
        throw new Error('no worker');
      },
      timeoutMs: 10000,
    });
    await expect(pg).rejects.toThrow('thumbnail.encode_failed');

    // (h) to (k): each a bad reply
    const cases: Array<(f: Fake) => void> = [
      (f) => f.onmessage!(encoded(new ArrayBuffer(0), 80)), // (h)
      (f) => f.onmessage!(encoded(new ArrayBuffer(100), 75)), // (i)
      (f) => f.onmessage!(encoded(new Uint8Array(100), 80)), // (j)
      (f) => f.onmessageerror!(new MessageEvent('messageerror')), // (k)
    ];
    for (const fire of cases) {
      const f = makeFake();
      const p = start(f);
      await flush();
      fire(f);
      await expect(p).rejects.toThrow('thumbnail.encode_failed');
      expect(f.terminate).toHaveBeenCalledTimes(1);
    }

    // (l) postMessage throws
    const fl = makeFake();
    fl.postMessage.mockImplementation(() => {
      throw new Error('DataCloneError');
    });
    const pl = start(fl);
    await expect(pl).rejects.toThrow('thumbnail.encode_failed');
    expect(fl.terminate).toHaveBeenCalledTimes(1);
  });
});
