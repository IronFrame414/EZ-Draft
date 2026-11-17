// EZD-224b T-U8 and T-U13 (vault/plans/EZD-224b.md section 4; AC-EZD-224-5). Expected values: the plan's Decided
// "Frame capture" and "WebGL read"; CAPTURE_TIMEOUT_MS 2,000 (11 Budgets: 20 x 100 ms). Fake timers, no real waits.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createFrameCapture, drawThumbnail, type ThumbnailContext } from './frame-capture';
import type { ThumbnailCrop } from '../../lib/thumbnail/thumbnail';

const IMG = {
  data: new Uint8ClampedArray(16),
  width: 2,
  height: 2,
  colorSpace: 'srgb',
} as unknown as ImageData;

const CROP: ThumbnailCrop = {
  sx: 672,
  sy: 184,
  sw: 1760,
  sh: 1720,
  dx: (440 - (1760 * 256) / 1720) / 2,
  dy: 0,
  dw: (1760 * 256) / 1720,
  dh: 256,
};

type Call = { name: string; args: unknown[] };

describe('EZD-224b frame capture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('EZD-224b T-U8 one pending request, read only in a frame, 2,000 ms limit, dispose', async () => {
    // (a) and (f)
    const invA = vi.fn();
    const a = createFrameCapture<number>({ invalidate: invA, timeoutMs: 2000 });
    const p1 = a.request(() => 7);
    const p2 = a.request(() => 9);
    expect(p2).toBe(p1);
    expect(invA).toHaveBeenCalledTimes(1);
    a.onFrame();
    await expect(p1).resolves.toBe(7);
    const p3 = a.request(() => 3);
    expect(p3).not.toBe(p1);
    expect(invA).toHaveBeenCalledTimes(2);
    a.onFrame();
    await expect(p3).resolves.toBe(3);

    // (b)
    const invB = vi.fn();
    const readB = vi.fn(() => 1);
    const b = createFrameCapture<number>({ invalidate: invB, timeoutMs: 2000 });
    b.onFrame();
    expect(readB).not.toHaveBeenCalled();
    expect(invB).not.toHaveBeenCalled();

    // (c)
    const readC = vi.fn(() => 1);
    const c = createFrameCapture<number>({ invalidate: vi.fn(), timeoutMs: 2000 });
    let state = 'pending';
    const pc = c.request(readC);
    pc.catch((e: Error) => {
      state = e.message;
    });
    vi.advanceTimersByTime(1999);
    await Promise.resolve();
    expect(state).toBe('pending');
    vi.advanceTimersByTime(1);
    await expect(pc).rejects.toThrow('plan.capture_timeout');
    c.onFrame();
    expect(readC).not.toHaveBeenCalled();

    // (d)
    const invD = vi.fn();
    const readD = vi.fn(() => 1);
    const readD2 = vi.fn(() => 2);
    const d = createFrameCapture<number>({ invalidate: invD, timeoutMs: 2000 });
    const pd = d.request(readD);
    d.dispose();
    await expect(pd).rejects.toThrow('plan.detached');
    expect(readD).not.toHaveBeenCalled();
    await expect(d.request(readD2)).rejects.toThrow('plan.detached');
    expect(readD2).not.toHaveBeenCalled();
    expect(invD).toHaveBeenCalledTimes(1);

    // (e)
    const e = new Error('read failed');
    const ce = createFrameCapture<number>({ invalidate: vi.fn(), timeoutMs: 2000 });
    const pe = ce.request(() => {
      throw e;
    });
    ce.onFrame();
    await expect(pe).rejects.toBe(e);
  });

  test('EZD-224b T-U13 compose fills, smooths, draws the crop, then reads 440 x 256', () => {
    const calls: Call[] = [];
    const ctx = {
      set fillStyle(v: unknown) {
        calls.push({ name: 'fillStyle', args: [v] });
      },
      set imageSmoothingEnabled(v: unknown) {
        calls.push({ name: 'imageSmoothingEnabled', args: [v] });
      },
      set imageSmoothingQuality(v: unknown) {
        calls.push({ name: 'imageSmoothingQuality', args: [v] });
      },
      fillRect: (...args: unknown[]) => calls.push({ name: 'fillRect', args }),
      drawImage: (...args: unknown[]) => calls.push({ name: 'drawImage', args }),
      getImageData: (...args: unknown[]) => {
        calls.push({ name: 'getImageData', args });
        return IMG;
      },
    } as unknown as ThumbnailContext;
    const SRC = {} as CanvasImageSource;

    const out = drawThumbnail(ctx, SRC, CROP, '#f6f7f9');
    expect(out).toBe(IMG);
    expect(calls.map((c) => c.name)).toEqual([
      'fillStyle',
      'fillRect',
      'imageSmoothingEnabled',
      'imageSmoothingQuality',
      'drawImage',
      'getImageData',
    ]);
    expect(calls[0]!.args).toEqual(['#f6f7f9']);
    expect(calls[1]!.args).toEqual([0, 0, 440, 256]);
    expect(calls[2]!.args).toEqual([true]);
    expect(calls[3]!.args).toEqual(['high']);
    const draw = calls[4]!.args;
    expect(draw[0]).toBe(SRC);
    const nums = draw.slice(1) as number[];
    const want = [672, 184, 1760, 1720, 89.023256, 0, 261.953488, 256];
    expect(nums).toHaveLength(8);
    want.forEach((w, i) => expect(nums[i]).toBeCloseTo(w, 6));
    expect(calls[5]!.args).toEqual([0, 0, 440, 256]);
  });
});
