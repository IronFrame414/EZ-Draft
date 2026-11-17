// EZD-5603b Build step 8 (vault/plans/EZD-5603b.md section 1 Decided "Shrink", "Size math"; Q-0637; 11 rule 3):
// the assistant photo shrink, off the main thread. Native decode first; the HEIC decoder (heic-to, LGPL-3.0,
// unmodified, Q-0660 (a)) is loaded only when a HEIC photo fails the native decode. Every throw is { ok: false }.
import {
  encodeWithinLimit,
  scaledSize,
  type PhotoJob,
  type PhotoJobResult,
} from '../lib/assistant/photo-rules';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<PhotoJob>) => void) | null;
  postMessage(m: PhotoJobResult): void;
};

async function decode(file: Blob, kind: PhotoJob['kind']): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    if (kind !== 'heic') throw e;
    const { heicTo } = await import('heic-to/next');
    return heicTo({ blob: file, type: 'bitmap' });
  }
}

async function shrink(job: PhotoJob): Promise<PhotoJobResult> {
  const bitmap = await decode(job.file, job.kind);
  const { width, height } = scaledSize(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (context === null) {
    bitmap.close();
    return { id: job.id, ok: false };
  }
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const jpeg = await encodeWithinLimit((quality) =>
    canvas.convertToBlob({ type: 'image/jpeg', quality }),
  );
  if (jpeg === null) return { id: job.id, ok: false };
  return { id: job.id, ok: true, jpeg, width, height };
}

scope.onmessage = (e) => {
  const job = e.data;
  shrink(job).then(
    (result) => scope.postMessage(result),
    () => scope.postMessage({ id: job.id, ok: false }),
  );
};
