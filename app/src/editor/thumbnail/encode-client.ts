// EZD-224b Build step 8 (vault/plans/EZD-224b.md Decided "Encode client", "Worker"; 11 rule 3; Q-0664; Q-0736):
// one module worker per encode, settled once by the first event, ended on every settle.
import {
  ENCODE_TIMEOUT_MS,
  THUMB_MAX_BYTES,
  THUMB_QUALITIES,
  type EncodedThumbnail,
  type ThumbnailQuality,
  type ThumbnailWorkerRequest,
} from '../../lib/thumbnail/thumbnail';

export type ThumbnailWorker = Pick<
  Worker,
  'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'
>;

export function createThumbnailWorker(): ThumbnailWorker {
  return new Worker(new URL('../../workers/thumbnail.worker.ts', import.meta.url), {
    type: 'module',
  });
}

function acceptedReply(data: unknown): EncodedThumbnail | null | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const reply = data as { kind?: unknown; bytes?: unknown; quality?: unknown };
  if (reply.kind === 'too_large') return null;
  if (reply.kind !== 'encoded') return undefined;
  if (!(reply.bytes instanceof ArrayBuffer)) return undefined;
  if (reply.bytes.byteLength < 1 || reply.bytes.byteLength >= THUMB_MAX_BYTES) return undefined;
  if (!(THUMB_QUALITIES as readonly unknown[]).includes(reply.quality)) return undefined;
  return { bytes: new Uint8Array(reply.bytes), quality: reply.quality as ThumbnailQuality };
}

export function encodeThumbnail(
  image: ImageData,
  deps: { createWorker?: () => ThumbnailWorker; timeoutMs?: number } = {},
): Promise<EncodedThumbnail | null> {
  return new Promise<EncodedThumbnail | null>((resolve, reject) => {
    let worker: ThumbnailWorker;
    try {
      worker = (deps.createWorker ?? createThumbnailWorker)();
    } catch (cause) {
      reject(new Error('thumbnail.encode_failed', { cause }));
      return;
    }
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      finish();
    };
    const fail = () => settle(() => reject(new Error('thumbnail.encode_failed')));

    worker.onmessage = (event: MessageEvent) => {
      const result = acceptedReply(event.data);
      if (result === undefined) fail();
      else settle(() => resolve(result));
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    // The handlers above run only after this line, so `timer` is set before any settle.
    const timer = setTimeout(
      () => settle(() => reject(new Error('thumbnail.encode_timeout'))),
      deps.timeoutMs ?? ENCODE_TIMEOUT_MS,
    );
    try {
      const request: ThumbnailWorkerRequest = { image };
      worker.postMessage(request);
    } catch {
      fail();
    }
  });
}
