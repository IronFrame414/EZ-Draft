// EZD-5603b T15 (vault/plans/EZD-5603b.md section 3 X1, section 4; AC-EZD-5603-7). stripPhoto re-encodes a JPEG
// without EXIF, GPS or XMP and refuses anything that is not a JPEG sharp can decode within 1,568 x 1,568 pixels.
// Expected values: Q-0637 (the server strips location data); the plan's probe 2026-11-09 (sharp 0.35.5: output
// exif and xmp undefined; 1,569 x 1,568 refused; 1,568 x 1,568 passes). The input is made in the test.
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  PNG_SIGNATURE,
  XMP_CANARY,
  corruptJpeg,
  gpsJpeg,
  solidJpeg,
} from '../../../test-harness/assistant-photo';
import { PHOTO_MAX_INPUT_PIXELS, PHOTO_OUTPUT_QUALITY, stripPhoto } from './photo';

const has = (bytes: Uint8Array, text: string) => Buffer.from(bytes).includes(Buffer.from(text, 'latin1'));

describe('EZD-5603b photo strip', () => {
  it('T15 stripPhoto drops EXIF and XMP, and refuses what is not a decodable JPEG within 1,568 x 1,568', async () => {
    expect(PHOTO_MAX_INPUT_PIXELS).toBe(2_458_624);
    expect(PHOTO_OUTPUT_QUALITY).toBe(90);

    const input = new Uint8Array(await gpsJpeg());
    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();
    expect(before.xmp).toBeDefined();
    expect(has(input, 'Exif\0\0')).toBe(true);
    expect(has(input, XMP_CANARY)).toBe(true);

    const out = await stripPhoto(input);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('not ok');
    const after = await sharp(out.jpeg).metadata();
    expect(after.format).toBe('jpeg');
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(has(out.jpeg, 'Exif\0\0')).toBe(false);
    expect(has(out.jpeg, XMP_CANARY)).toBe(false);

    expect(await stripPhoto(Uint8Array.from([...PNG_SIGNATURE, 1, 2, 3, 4, 5, 6, 7, 8]))).toEqual({
      ok: false,
    });
    expect(await stripPhoto(corruptJpeg())).toEqual({ ok: false });
    expect(await stripPhoto(new Uint8Array(0))).toEqual({ ok: false });
    expect(await stripPhoto(new Uint8Array(await solidJpeg(1569, 1568)))).toEqual({ ok: false });
    const edge = await stripPhoto(new Uint8Array(await solidJpeg(1568, 1568)));
    expect(edge.ok).toBe(true);
  });
});
