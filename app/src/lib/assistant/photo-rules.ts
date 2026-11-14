// EZD-5603b Build step 7 (vault/plans/EZD-5603b.md section 3 R1-R7; Decided "Photo checks", "Signatures", "Size
// math", "Size text"; Q-0637; Q-0652 (b)): the assistant photo rules, pure, shared by the photo worker and the
// editor. The kind is read from the file's first bytes; `File.type` and the name are never used.
export const PHOTO_MAX_FILE_BYTES = 20_000_000;
export const PHOTO_MAX_EDGE = 1_568;
export const PHOTO_MAX_JPEG_BYTES = 3_500_000;
export const PHOTO_JPEG_QUALITIES: readonly number[] = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35];
export const HEIC_BRANDS: readonly string[] = [
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'mif1',
  'msf1',
];
export const PHOTO_ACCEPT =
  'image/jpeg,image/png,image/heic,image/heif,image/webp,.jpg,.jpeg,.png,.heic,.heif,.webp';

export type PhotoKind = 'jpeg' | 'png' | 'webp' | 'heic';
export type PhotoProblem = 'type' | 'size' | 'unreadable';
export type PhotoJob = { id: number; file: Blob; kind: PhotoKind };
export type PhotoJobResult =
  { id: number; ok: true; jpeg: Blob; width: number; height: number } | { id: number; ok: false };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function bytesAre(head: Uint8Array, at: number, expected: readonly number[]): boolean {
  if (head.length < at + expected.length) return false;
  return expected.every((b, i) => head[at + i] === b);
}

function asciiAt(head: Uint8Array, at: number, length: number): string | null {
  if (head.length < at + length) return null;
  return String.fromCharCode(...head.subarray(at, at + length));
}

export function sniffPhotoKind(head: Uint8Array): PhotoKind | null {
  if (bytesAre(head, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (bytesAre(head, 0, PNG_SIGNATURE)) return 'png';
  if (asciiAt(head, 0, 4) === 'RIFF' && asciiAt(head, 8, 4) === 'WEBP') return 'webp';
  const brand = asciiAt(head, 8, 4);
  if (asciiAt(head, 4, 4) === 'ftyp' && brand !== null && HEIC_BRANDS.includes(brand))
    return 'heic';
  return null;
}

export function photoProblemOf(size: number, kind: PhotoKind | null): 'type' | 'size' | null {
  if (kind === null) return 'type';
  if (size > PHOTO_MAX_FILE_BYTES) return 'size';
  return null;
}

export function scaledSize(width: number, height: number): { width: number; height: number } {
  const s = Math.min(1, PHOTO_MAX_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * s)),
    height: Math.max(1, Math.round(height * s)),
  };
}

export async function encodeWithinLimit(
  encode: (quality: number) => Promise<Blob>,
): Promise<Blob | null> {
  for (const quality of PHOTO_JPEG_QUALITIES) {
    const blob = await encode(quality);
    if (blob.size <= PHOTO_MAX_JPEG_BYTES) return blob;
  }
  return null;
}

export function formatPhotoMb(bytes: number): string {
  return (Math.max(bytes, 100_000) / 1_000_000).toFixed(1);
}
