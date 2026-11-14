// EZD-5603b T6 (vault/plans/EZD-5603b.md section 3 P1-P3, section 4; AC-EZD-5603-6, -7). preparePhoto on a stub
// shrinker: type is checked first, then size, neither calls the shrinker; every shrinker failure is
// `unreadable`. Expected values: Decided "Photo checks", "Prepare result"; Q-0637; Q-0652 (b).
import { describe, expect, it, vi } from 'vitest';
import { preparePhoto, type PhotoShrinker } from './photo-prepare';

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const fileOf = (bytes: number, name: string, headBytes: number[]) => {
  const data = new Uint8Array(bytes);
  data.set(headBytes);
  return new File([data], name);
};
const blobOf = (n: number) => new Blob([new Uint8Array(n)], { type: 'image/jpeg' });

describe('EZD-5603b photo-prepare', () => {
  it('T6 type, size and unreadable problems; the ok result keeps the original name and size', async () => {
    const never = vi.fn<PhotoShrinker>();
    const gif = fileOf(
      20,
      'a.gif',
      [...'GIF89a'].map((c) => c.charCodeAt(0)),
    );
    expect(await preparePhoto(gif, never)).toEqual({ ok: false, problem: 'type' });
    const big = fileOf(20_000_001, 'big.jpg', JPEG_HEAD);
    expect(await preparePhoto(big, never)).toEqual({ ok: false, problem: 'size' });
    expect(never).toHaveBeenCalledTimes(0);

    const unreadable = { ok: false, problem: 'unreadable' };
    const small = () => fileOf(100, 'x.jpg', JPEG_HEAD);
    expect(await preparePhoto(small(), async () => ({ ok: false }))).toEqual(unreadable);
    expect(await preparePhoto(small(), () => Promise.reject(new Error('boom')))).toEqual(unreadable);
    expect(
      await preparePhoto(small(), async () => ({
        ok: true,
        jpeg: blobOf(3_500_001),
        width: 10,
        height: 10,
      })),
    ).toEqual(unreadable);

    // A 0-byte JPEG from the shrinker, and a file whose head cannot be read, are unreadable too.
    expect(
      await preparePhoto(small(), async () => ({ ok: true, jpeg: blobOf(0), width: 10, height: 10 })),
    ).toEqual(unreadable);
    const unreadableHead = small();
    Object.defineProperty(unreadableHead, 'slice', {
      value: () => {
        throw new Error('cannot read');
      },
    });
    expect(await preparePhoto(unreadableHead, never)).toEqual(unreadable);
    expect(never).toHaveBeenCalledTimes(0);

    const jpeg = blobOf(1000);
    const shrink = vi.fn<PhotoShrinker>(async () => ({ ok: true, jpeg, width: 10, height: 8 }));
    const result = await preparePhoto(fileOf(2_400_000, 'a.jpg', JPEG_HEAD), shrink);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('not ok');
    expect(result.photo).toMatchObject({ name: 'a.jpg', bytes: 2_400_000 });
    expect(result.photo.jpeg).toBe(jpeg);
    expect(shrink).toHaveBeenCalledTimes(1);
    expect(shrink.mock.calls[0]![1]).toBe('jpeg');
  });
});
