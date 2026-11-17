// EZD-224b Build step 3 (vault/plans/EZD-224b.md Decided "Sizes and limit", "Quality steps", "encodeReply",
// "thumbnailSource", "thumbnailCrop"; Q-0664, Q-0667, Q-0736): the plan thumbnail sizes, quality steps, crop and
// worker messages, shared by the editor and the thumbnail worker. No React, no Supabase, no DOM call.

export const THUMB_WIDTH = 440;
export const THUMB_HEIGHT = 256;
export const THUMB_MAX_BYTES = 40960;
export const THUMB_QUALITIES = [80, 70, 60, 50, 40] as const;
export type ThumbnailQuality = (typeof THUMB_QUALITIES)[number];
export const THUMB_CONTENT_TYPE = 'image/webp';
export const CAPTURE_TIMEOUT_MS = 2000;
export const ENCODE_TIMEOUT_MS = 10000;

export type EncodedThumbnail = { bytes: Uint8Array<ArrayBuffer>; quality: ThumbnailQuality };

// Each quality is tried in order, one at a time; the first result under the limit is kept.
export async function pickThumbnail(
  encode: (quality: ThumbnailQuality) => Promise<Uint8Array<ArrayBuffer>>,
): Promise<EncodedThumbnail | null> {
  for (const quality of THUMB_QUALITIES) {
    const bytes = await encode(quality);
    if (bytes.length === 0) throw new Error('thumbnail.encode_empty');
    if (bytes.length < THUMB_MAX_BYTES) return { bytes, quality };
  }
  return null;
}

export type ThumbnailRect = { left: number; top: number; width: number; height: number };
export type CaptureSource = { x: number; y: number; width: number; height: number };

export function thumbnailSource(
  canvas: ThumbnailRect | null,
  region: ThumbnailRect | null,
): CaptureSource | null {
  if (canvas === null || region === null) return null;
  if (!Number.isFinite(region.width) || region.width <= 0) return null;
  if (!Number.isFinite(region.height) || region.height <= 0) return null;
  return {
    x: region.left - canvas.left,
    y: region.top - canvas.top,
    width: region.width,
    height: region.height,
  };
}

export type ThumbnailCrop = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

// Contain: the whole region, scaled by s = min(440 / sw, 256 / sh), centred. The side that sets s is taken as the
// full 440 or 256 so it is exact; no rounding.
export function thumbnailCrop(source: CaptureSource, dpr: number): ThumbnailCrop | null {
  const nums = [dpr, source.x, source.y, source.width, source.height];
  if (!nums.every(Number.isFinite)) return null;
  if (dpr <= 0 || source.width <= 0 || source.height <= 0) return null;
  const sx = source.x * dpr;
  const sy = source.y * dpr;
  const sw = source.width * dpr;
  const sh = source.height * dpr;
  const widthBound = THUMB_WIDTH / sw <= THUMB_HEIGHT / sh;
  const dw = widthBound ? THUMB_WIDTH : (sw * THUMB_HEIGHT) / sh;
  const dh = widthBound ? (sh * THUMB_WIDTH) / sw : THUMB_HEIGHT;
  return { sx, sy, sw, sh, dx: (THUMB_WIDTH - dw) / 2, dy: (THUMB_HEIGHT - dh) / 2, dw, dh };
}

export type ThumbnailCapture = { image: ImageData; crop: ThumbnailCrop };

export type ThumbnailWorkerRequest = { image: ImageData };
export type ThumbnailWorkerReply =
  | { kind: 'encoded'; bytes: ArrayBuffer; quality: ThumbnailQuality }
  | { kind: 'too_large' }
  | { kind: 'error'; message: string };
export type ThumbnailWorkerScope = {
  onmessage: ((event: MessageEvent<ThumbnailWorkerRequest>) => void) | null;
  postMessage(message: ThumbnailWorkerReply, transfer: Transferable[]): void;
};

// The worker's one answer to a request. It never rejects, so the worker always posts a reply.
export async function encodeReply(
  image: ImageData,
  encodeAt: (image: ImageData, quality: ThumbnailQuality) => Promise<ArrayBuffer>,
): Promise<ThumbnailWorkerReply> {
  try {
    const result = await pickThumbnail((q) => encodeAt(image, q).then((b) => new Uint8Array(b)));
    if (result === null) return { kind: 'too_large' };
    return { kind: 'encoded', bytes: result.bytes.buffer as ArrayBuffer, quality: result.quality };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'thumbnail.encode_failed',
    };
  }
}
