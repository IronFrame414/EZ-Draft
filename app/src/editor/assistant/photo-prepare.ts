// EZD-5603b Build step 9 (vault/plans/EZD-5603b.md section 3 P1-P4; Decided "Photo checks", "Prepare result",
// "Shrink", "Worker failure"; Q-0637; L-059): check one picked photo, then shrink it in the photo worker. Never
// throws: every failure is a photo problem.
import {
  PHOTO_MAX_JPEG_BYTES,
  photoProblemOf,
  sniffPhotoKind,
  type PhotoJob,
  type PhotoJobResult,
  type PhotoKind,
  type PhotoProblem,
} from '../../lib/assistant/photo-rules';

export type PhotoShrinker = (
  file: Blob,
  kind: PhotoKind,
) => Promise<{ ok: true; jpeg: Blob; width: number; height: number } | { ok: false }>;

export type PreparedPhoto = { jpeg: Blob; name: string; bytes: number };
export type PhotoPrepareResult =
  { ok: true; photo: PreparedPhoto } | { ok: false; problem: PhotoProblem };

const UNREADABLE: PhotoPrepareResult = { ok: false, problem: 'unreadable' };

export async function preparePhoto(file: File, shrink: PhotoShrinker): Promise<PhotoPrepareResult> {
  let kind: PhotoKind | null;
  try {
    kind = sniffPhotoKind(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  } catch {
    return { ...UNREADABLE };
  }
  const problem = photoProblemOf(file.size, kind);
  if (problem !== null || kind === null) return { ok: false, problem: problem ?? 'type' };
  try {
    const result = await shrink(file, kind);
    if (!result.ok || result.jpeg.size === 0 || result.jpeg.size > PHOTO_MAX_JPEG_BYTES) {
      return { ...UNREADABLE };
    }
    return { ok: true, photo: { jpeg: result.jpeg, name: file.name, bytes: file.size } };
  } catch {
    return { ...UNREADABLE };
  }
}

type ShrinkOutcome = Awaited<ReturnType<PhotoShrinker>>;

export function createPhotoWorkerShrinker(): { shrink: PhotoShrinker; dispose(): void } {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, (outcome: ShrinkOutcome) => void>();

  const failAll = () => {
    const waiting = [...pending.values()];
    pending.clear();
    for (const resolve of waiting) resolve({ ok: false });
  };

  const drop = () => {
    const current = worker;
    worker = null;
    current?.terminate();
    failAll();
  };

  const start = (): Worker => {
    const made = new Worker(new URL('../../workers/assistant-photo.worker.ts', import.meta.url), {
      type: 'module',
    });
    made.onmessage = (e: MessageEvent<PhotoJobResult>) => {
      const result = e.data;
      const resolve = pending.get(result.id);
      if (resolve === undefined) return;
      pending.delete(result.id);
      resolve(
        result.ok
          ? { ok: true, jpeg: result.jpeg, width: result.width, height: result.height }
          : { ok: false },
      );
    };
    made.onerror = () => {
      if (worker === made) drop();
    };
    made.onmessageerror = () => {
      if (worker === made) drop();
    };
    return made;
  };

  const shrink: PhotoShrinker = (file, kind) =>
    new Promise<ShrinkOutcome>((resolve) => {
      try {
        worker ??= start();
        const id = nextId++;
        const job: PhotoJob = { id, file, kind };
        worker.postMessage(job);
        pending.set(id, resolve);
      } catch {
        resolve({ ok: false });
      }
    });

  return { shrink, dispose: drop };
}
