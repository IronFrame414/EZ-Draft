// EZD-5603b Build step 16 (vault/plans/EZD-5603b.md section 3 X1; Decided "Server strip"; Q-0637; R-057): the
// assistant photo is re-encoded on the server so no EXIF, GPS or XMP reaches the provider. sharp keeps no
// metadata unless asked. Nothing is logged or reported: a refused photo is user input, and bytes never enter an
// error.
import sharp from 'sharp';

export const PHOTO_MAX_INPUT_PIXELS = 2_458_624; // 1,568 x 1,568
export const PHOTO_OUTPUT_QUALITY = 90;

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

export async function stripPhoto(
  bytes: Uint8Array,
): Promise<{ ok: true; jpeg: Uint8Array } | { ok: false }> {
  if (bytes.length < JPEG_SIGNATURE.length) return { ok: false };
  if (!JPEG_SIGNATURE.every((b, i) => bytes[i] === b)) return { ok: false };
  try {
    const out = await sharp(bytes, { limitInputPixels: PHOTO_MAX_INPUT_PIXELS })
      .jpeg({ quality: PHOTO_OUTPUT_QUALITY })
      .toBuffer();
    return { ok: true, jpeg: new Uint8Array(out.buffer, out.byteOffset, out.byteLength) };
  } catch {
    return { ok: false };
  }
}
