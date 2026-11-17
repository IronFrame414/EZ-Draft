// EZD-224b T-U1 to T-U5 (vault/plans/EZD-224b.md section 4; AC-EZD-224-1, -5). Expected values: Q-0664 (440 x 256,
// quality steps 80/70/60/50/40, kept only under 40,960 bytes), Q-0667 (the visible region, contained), the plan's
// Decided "Quality steps", "encodeReply", "thumbnailSource", "thumbnailCrop". Node has no ImageData, so IMG is a cast.
import { describe, expect, test, vi } from 'vitest';
import {
  encodeReply,
  pickThumbnail,
  thumbnailCrop,
  thumbnailSource,
  type ThumbnailQuality,
} from './thumbnail';

const IMG = {
  data: new Uint8ClampedArray(16),
  width: 2,
  height: 2,
  colorSpace: 'srgb',
} as unknown as ImageData;

function stubEncode(sizes: Partial<Record<ThumbnailQuality, number>>, fallback = 41000) {
  const calls: number[] = [];
  const encode = vi.fn(async (q: ThumbnailQuality) => {
    calls.push(q);
    return new Uint8Array(sizes[q] ?? fallback);
  });
  return { encode, calls };
}

describe('EZD-224b thumbnail pure rules', () => {
  test('EZD-224b T-U1 quality steps stop at the first result under the limit', async () => {
    const a = stubEncode({ 80: 12000 });
    const ra = await pickThumbnail(a.encode);
    expect(ra?.quality).toBe(80);
    expect(ra?.bytes.length).toBe(12000);
    expect(a.calls).toEqual([80]);

    const b = stubEncode({ 80: 52000, 70: 44000, 60: 38000 });
    const rb = await pickThumbnail(b.encode);
    expect(rb?.quality).toBe(60);
    expect(rb?.bytes.length).toBe(38000);
    expect(b.calls).toEqual([80, 70, 60]);
  });

  test('EZD-224b T-U2 the limit is under 40,960 bytes, and all five over it give null', async () => {
    const a = stubEncode({ 80: 40960, 70: 40959 });
    const ra = await pickThumbnail(a.encode);
    expect(ra?.quality).toBe(70);
    expect(ra?.bytes.length).toBe(40959);

    const b = stubEncode({}, 41000);
    expect(await pickThumbnail(b.encode)).toBeNull();
    expect(b.calls).toEqual([80, 70, 60, 50, 40]);
  });

  test('EZD-224b T-U3 an empty encode is an error and encodeReply never rejects', async () => {
    const a = stubEncode({ 80: 0 });
    await expect(pickThumbnail(a.encode)).rejects.toThrow('thumbnail.encode_empty');
    expect(a.calls).toEqual([80]);

    const b = await encodeReply(IMG, async () => new ArrayBuffer(0));
    expect(b).toEqual({ kind: 'error', message: 'thumbnail.encode_empty' });

    const buf = new ArrayBuffer(38000);
    const c = await encodeReply(IMG, async (_i: ImageData, q: number) =>
      q === 80 ? buf : new ArrayBuffer(1),
    );
    expect(c.kind).toBe('encoded');
    if (c.kind === 'encoded') {
      expect(c.quality).toBe(80);
      expect(c.bytes).toBeInstanceOf(ArrayBuffer);
      expect(c.bytes.byteLength).toBe(38000);
      expect(c.bytes).toBe(buf);
    }

    const d = await encodeReply(IMG, async () => new ArrayBuffer(41000));
    expect(d).toEqual({ kind: 'too_large' });

    const e = await encodeReply(IMG, async () => {
      throw new Error('boom');
    });
    expect(e).toEqual({ kind: 'error', message: 'boom' });
  });

  test('EZD-224b T-U4 the crop contains the visible region in 440 x 256, no rounding', () => {
    const a = thumbnailCrop({ x: 336, y: 92, width: 880, height: 860 }, 2);
    expect(a).not.toBeNull();
    expect(a!.sx).toBe(672);
    expect(a!.sy).toBe(184);
    expect(a!.sw).toBe(1760);
    expect(a!.sh).toBe(1720);
    expect(a!.dh).toBe(256);
    expect(a!.dy).toBe(0);
    expect(a!.dw).toBeCloseTo(261.953488, 6);
    expect(a!.dx).toBeCloseTo(89.023256, 6);

    const b = thumbnailCrop({ x: 0, y: 0, width: 1200, height: 400 }, 1);
    expect(b).not.toBeNull();
    expect(b!.dw).toBe(440);
    expect(b!.dx).toBe(0);
    expect(b!.dh).toBeCloseTo(146.666667, 6);
    expect(b!.dy).toBeCloseTo(54.666667, 6);

    expect(thumbnailCrop({ x: 0, y: 0, width: 0, height: 400 }, 1)).toBeNull();
    expect(thumbnailCrop({ x: 0, y: 0, width: 1200, height: 400 }, 0)).toBeNull();
    expect(thumbnailCrop({ x: 0, y: 0, width: 1200, height: Number.NaN }, 1)).toBeNull();
  });

  test('EZD-224b T-U5 the source is the region relative to the canvas', () => {
    const region = { left: 16, top: 92, width: 1568, height: 862 };
    expect(thumbnailSource({ left: 0, top: 0, width: 1600, height: 1000 }, region)).toEqual({
      x: 16,
      y: 92,
      width: 1568,
      height: 862,
    });
    expect(thumbnailSource({ left: 10, top: 20, width: 1600, height: 1000 }, region)).toEqual({
      x: 6,
      y: 72,
      width: 1568,
      height: 862,
    });
    expect(thumbnailSource({ left: 0, top: 0, width: 1600, height: 1000 }, null)).toBeNull();
    expect(thumbnailSource(null, region)).toBeNull();
    expect(
      thumbnailSource({ left: 0, top: 0, width: 1600, height: 1000 }, { ...region, width: 0 }),
    ).toBeNull();
    expect(
      thumbnailSource(
        { left: 0, top: 0, width: 1600, height: 1000 },
        { ...region, height: Number.POSITIVE_INFINITY },
      ),
    ).toBeNull();
  });
});
