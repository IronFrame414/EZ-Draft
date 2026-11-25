// EZD-224b Build step 9 (vault/plans/EZD-224b.md Decided "Client order (`makeCheckpoint`)", "Client order
// (`saveCheckpointThumbnail`)", "Requests", "Report", "Two calls at once"; section 3 Seam; Q-0664): the checkpoint,
// then the thumbnail of the plan as drawn: capture, encode, part a's start route, the signed upload, part a's
// complete route. Neither function throws; a failed thumbnail leaves the checkpoint as it is.
import * as z from 'zod/mini';
import { uploadFile, type SignedUpload } from '../../lib/storage/upload';
import {
  THUMB_CONTENT_TYPE,
  type EncodedThumbnail,
  type ThumbnailCapture,
  type ThumbnailCrop,
  type ThumbnailQuality,
} from '../../lib/thumbnail/thumbnail';
import { encodeThumbnail } from './encode-client';

export type ThumbnailFailureCode = string;

export type ThumbnailOutcome =
  | {
      status: 'saved';
      versionId: string;
      quality: ThumbnailQuality;
      bytes: number;
      crop: ThumbnailCrop;
    }
  | { status: 'empty'; versionId: string }
  | { status: 'too_large'; versionId: string }
  | { status: 'failed'; versionId: string; code: ThumbnailFailureCode };

export type CheckpointOutcome = ThumbnailOutcome | { status: 'failed'; code: string };

export type ThumbnailDeps = {
  fetchImpl?: typeof fetch;
  encode?: (image: ImageData) => Promise<EncodedThumbnail | null>;
  upload?: typeof uploadFile;
  report?: (error: unknown) => void;
};

const CHECKPOINT_BODY = z.object({ version: z.object({ id: z.string().check(z.minLength(1)) }) });
const START_BODY = z.object({
  upload: z.object({
    bucket: z.literal('media'),
    path: z.string().check(z.minLength(1)),
    token: z.string().check(z.minLength(1)),
    url: z.string().check(z.minLength(1)),
  }),
});

const reportDefault = (error: unknown): void =>
  void import('../../lib/errors/capture').then((m) =>
    m.captureBrowserError(error, 'editor.thumbnail'),
  );

type Posted<T> = { ok: true; body: T } | { ok: false; code: string; original: unknown };

// Fetch, then status, then body. Only a thrown fetch is `network_failed`; an expected status whose body does not
// parse is `bad_response`; any other status is the body's `error.code` or `http_<status>`.
async function post<T>(
  fetchImpl: typeof fetch,
  url: string,
  expected: number,
  schema: z.ZodMiniType<T>,
): Promise<Posted<T>> {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: 'POST' });
  } catch (original) {
    return { ok: false, code: 'network_failed', original };
  }
  if (res.status !== expected) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    return {
      ok: false,
      code: typeof code === 'string' ? code : `http_${res.status}`,
      original: undefined,
    };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch (original) {
    return { ok: false, code: 'bad_response', original };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, code: 'bad_response', original: undefined };
  return { ok: true, body: parsed.data };
}

export async function saveCheckpointThumbnail(
  o: { projectId: string; versionId: string; capture: () => Promise<ThumbnailCapture | null> },
  deps: ThumbnailDeps = {},
): Promise<ThumbnailOutcome> {
  const { versionId } = o;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const encode = deps.encode ?? encodeThumbnail;
  const upload = deps.upload ?? uploadFile;
  const report = deps.report ?? reportDefault;
  const reportCode = (code: string, original: unknown) =>
    report(new Error('editor.thumbnail', { cause: new Error(code, { cause: original }) }));
  const fail = (code: string, original: unknown): ThumbnailOutcome => {
    reportCode(code, original);
    return { status: 'failed', versionId, code };
  };

  let capture: ThumbnailCapture | null;
  try {
    capture = await o.capture();
  } catch (original) {
    return fail('capture_failed', original);
  }
  if (capture === null) return { status: 'empty', versionId };

  let encoded: EncodedThumbnail | null;
  try {
    encoded = await encode(capture.image);
  } catch (original) {
    return fail('encode_failed', original);
  }
  if (encoded === null) {
    reportCode('too_large', undefined);
    return { status: 'too_large', versionId };
  }

  const base = `/api/projects/${encodeURIComponent(o.projectId)}/versions/${encodeURIComponent(versionId)}/thumbnail`;
  const started = await post(fetchImpl, base, 200, START_BODY);
  if (!started.ok) return fail(started.code, started.original);

  try {
    const signed: SignedUpload = started.body.upload;
    await upload(signed, new Blob([encoded.bytes], { type: 'image/webp' }), {
      contentType: THUMB_CONTENT_TYPE,
    });
  } catch (original) {
    return fail('upload_failed', original);
  }

  const completeBody = z.object({ thumbnail: z.object({ versionId: z.literal(versionId) }) });
  const completed = await post(fetchImpl, `${base}/complete`, 200, completeBody);
  if (!completed.ok) return fail(completed.code, completed.original);

  return {
    status: 'saved',
    versionId,
    quality: encoded.quality,
    bytes: encoded.bytes.length,
    crop: capture.crop,
  };
}

export async function makeCheckpoint(
  o: { projectId: string; capture: () => Promise<ThumbnailCapture | null> },
  deps: ThumbnailDeps = {},
): Promise<CheckpointOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const made = await post(
    fetchImpl,
    `/api/projects/${encodeURIComponent(o.projectId)}/checkpoints`,
    201,
    CHECKPOINT_BODY,
  );
  if (!made.ok) return { status: 'failed', code: made.code };
  return saveCheckpointThumbnail(
    { projectId: o.projectId, versionId: made.body.version.id, capture: o.capture },
    deps,
  );
}
