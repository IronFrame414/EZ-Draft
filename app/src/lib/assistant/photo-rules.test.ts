// EZD-5603b T1-T5 (vault/plans/EZD-5603b.md section 3 R1-R7, section 4; AC-EZD-5603-6, -7). Pure functions of the
// assistant photo rules. Expected values: Decided "Signatures", "Size math", "Size text", "Photo checks" of the
// plan; Q-0637 (1,568 pixels, 3,500,000 bytes); Q-0652 (b) (20 MB = 20,000,000 bytes).
import { describe, expect, it } from 'vitest';
import {
  HEIC_BRANDS,
  PHOTO_ACCEPT,
  PHOTO_JPEG_QUALITIES,
  PHOTO_MAX_EDGE,
  PHOTO_MAX_FILE_BYTES,
  PHOTO_MAX_JPEG_BYTES,
  encodeWithinLimit,
  formatPhotoMb,
  photoProblemOf,
  scaledSize,
  sniffPhotoKind,
} from './photo-rules';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const zeros = (n: number) => new Array<number>(n).fill(0);
const head = (...parts: number[][]) => new Uint8Array(parts.flat());
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const blobOf = (n: number) => new Blob([new Uint8Array(n)], { type: 'image/jpeg' });

describe('EZD-5603b photo-rules', () => {
  it('T1 sniffPhotoKind reads the first bytes, never the name or the type', () => {
    expect(sniffPhotoKind(head([0xff, 0xd8, 0xff, 0xe0], zeros(8)))).toBe('jpeg');
    expect(sniffPhotoKind(head(PNG, zeros(4)))).toBe('png');
    expect(sniffPhotoKind(head(ascii('RIFF'), zeros(4), ascii('WEBP')))).toBe('webp');
    expect(sniffPhotoKind(head(zeros(4), ascii('ftyp'), ascii('heic')))).toBe('heic');
    expect(sniffPhotoKind(head(zeros(4), ascii('ftyp'), ascii('heix')))).toBe('heic');
    expect(sniffPhotoKind(head(zeros(4), ascii('ftyp'), ascii('mif1')))).toBe('heic');
    expect(sniffPhotoKind(head(ascii('GIF89a'), zeros(6)))).toBeNull();
    expect(sniffPhotoKind(head(ascii('%PDF-1.7'), zeros(4)))).toBeNull();
    expect(sniffPhotoKind(head(ascii('<svg xmlns=')))).toBeNull();
    expect(sniffPhotoKind(new Uint8Array(0))).toBeNull();
    expect(sniffPhotoKind(head([0xff, 0xd8]))).toBeNull();
    // The constants of section 3 R1 (Decided "Signatures").
    expect([...HEIC_BRANDS].sort()).toEqual(
      ['heic', 'heim', 'heis', 'hevc', 'hevx', 'heix', 'mif1', 'msf1'].sort(),
    );
    for (const brand of HEIC_BRANDS) {
      expect(sniffPhotoKind(head(zeros(4), ascii('ftyp'), ascii(brand))), brand).toBe('heic');
    }
    expect(PHOTO_ACCEPT).toBe(
      'image/jpeg,image/png,image/heic,image/heif,image/webp,.jpg,.jpeg,.png,.heic,.heif,.webp',
    );
    expect(PHOTO_MAX_FILE_BYTES).toBe(20_000_000);
    expect(PHOTO_MAX_EDGE).toBe(1_568);
    expect(PHOTO_MAX_JPEG_BYTES).toBe(3_500_000);
    expect([...PHOTO_JPEG_QUALITIES]).toEqual([0.85, 0.75, 0.65, 0.55, 0.45, 0.35]);
  });

  it('T2 photoProblemOf: type first, then 20,000,000 bytes (not more)', () => {
    expect(photoProblemOf(20_000_000, 'jpeg')).toBeNull();
    expect(photoProblemOf(20_000_001, 'jpeg')).toBe('size');
    expect(photoProblemOf(25_000_000, null)).toBe('type');
    expect(photoProblemOf(0, null)).toBe('type');
    expect(photoProblemOf(1, 'png')).toBeNull();
  });

  it('T3 scaledSize: longest side 1,568 at most, never up, never below 1', () => {
    expect(scaledSize(4032, 3024)).toEqual({ width: 1568, height: 1176 });
    expect(scaledSize(3024, 4032)).toEqual({ width: 1176, height: 1568 });
    expect(scaledSize(1568, 1568)).toEqual({ width: 1568, height: 1568 });
    expect(scaledSize(1000, 800)).toEqual({ width: 1000, height: 800 });
    expect(scaledSize(1569, 1)).toEqual({ width: 1568, height: 1 });
    expect(scaledSize(10000, 3)).toEqual({ width: 1568, height: 1 });
  });

  it('T4 encodeWithinLimit: the first quality at 3,500,000 bytes or less wins; none gives null', async () => {
    const sizes: Record<number, number> = { 0.85: 3_500_001, 0.75: 3_500_000 };
    const callsA: number[] = [];
    const a = await encodeWithinLimit(async (q) => {
      callsA.push(q);
      return blobOf(sizes[q] ?? 1);
    });
    expect(a?.size).toBe(3_500_000);
    expect(callsA).toEqual([0.85, 0.75]);

    const callsB: number[] = [];
    const b = await encodeWithinLimit(async (q) => {
      callsB.push(q);
      return blobOf(4_000_000);
    });
    expect(b).toBeNull();
    expect(callsB).toEqual([0.85, 0.75, 0.65, 0.55, 0.45, 0.35]);

    const callsC: number[] = [];
    const c = await encodeWithinLimit(async (q) => {
      callsC.push(q);
      return blobOf(10);
    });
    expect(c?.size).toBe(10);
    expect(callsC).toEqual([0.85]);

    await expect(encodeWithinLimit(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });

  it('T5 formatPhotoMb: decimal megabytes, one place, at least 0.1', () => {
    expect(formatPhotoMb(2_400_000)).toBe('2.4');
    expect(formatPhotoMb(50_000)).toBe('0.1');
    expect(formatPhotoMb(19_960_000)).toBe('20.0');
  });
});
