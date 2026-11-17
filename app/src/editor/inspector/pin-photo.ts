// EZD-220 (03c:15 source_file; Q-0513 photo types; Q-0704 05-screens "A failed photo upload keeps the pin and shows a
// retry state"; Q-0704 03-data-model "File references are checked on save"; AC-EZD-220-2, -3, -4): a pin's photo.
// A JPEG, PNG or HEIC file is sent as a source_file of kind photo: the app starts the row and signs the upload, the
// browser sends the bytes straight to Storage (EZD-132), the app checks the object and stamps the row. Only then does
// the pin take the photo id, as an ordinary model edit (so it queues in the outbox offline), and the save check never
// sees an unfinished upload. A failure keeps the pin as it is; `attempt` remembers how far it got, so Retry sends
// only what is left. The thumbnail is a short-lived link signed from the file row. Browser only.
import { CURRENT_SCHEMA_VERSION, parseStoredObject, type PinData } from '@ezdraft/geometry';
import { checkFile, kindTakes } from '../../lib/imports/upload-files';
import type { SourceContentType } from '../../lib/storage/source-file-kinds';
import { uploadFile, type SignedUpload } from '../../lib/storage/upload';
import type { Change, Objects } from '../model/patches';

export type PhotoCheck =
  | { ok: true; contentType: SourceContentType }
  | { ok: false; reason: 'not_photo' | 'too_large' | 'empty' };

// The file types a pin photo takes: the `photo` kind's (JPEG, PNG, HEIC); the type comes from the extension.
export function checkPinPhoto(name: string, size: number): PhotoCheck {
  const r = checkFile(name, size);
  if (!r.ok) {
    if (r.reason === 'too_large' || r.reason === 'empty') return { ok: false, reason: r.reason };
    return { ok: false, reason: 'not_photo' };
  }
  if (!kindTakes('photo', r.contentType)) return { ok: false, reason: 'not_photo' };
  return { ok: true, contentType: r.contentType };
}

export type PhotoFailure = 'not_authorized' | 'upload_failed';

export class PinPhotoError extends Error {
  readonly code: PhotoFailure;
  constructor(code: PhotoFailure) {
    super(code);
    this.name = 'PinPhotoError';
    this.code = code;
  }
}

// How far one photo got: the started row and its signed upload, and whether the bytes are in Storage.
export type PhotoAttempt = { sourceFileId: string; upload: SignedUpload; sent: boolean } | null;

const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'same-origin',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

// Sends one photo and answers its source_file id once uploaded. `attempt.current` is updated as it goes, so a
// retry with the same holder starts where the failure left off.
export async function uploadPinPhoto(
  projectId: string,
  file: { name: string; blob: Blob; contentType: SourceContentType },
  attempt: { current: PhotoAttempt },
  opts: { fetchImpl?: typeof fetch; retryDelaysMs?: readonly number[] } = {},
): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (attempt.current === null) {
    let started: Response;
    try {
      started = await fetchImpl(
        `/api/projects/${encodeURIComponent(projectId)}/source-files`,
        post({
          kind: 'photo',
          originalName: file.name,
          contentType: file.contentType,
          size: file.blob.size,
        }),
      );
    } catch {
      throw new PinPhotoError('upload_failed');
    }
    if (started.status === 403) throw new PinPhotoError('not_authorized');
    if (started.status !== 201) throw new PinPhotoError('upload_failed');
    const body = (await started.json()) as { sourceFile: { id: string }; upload: SignedUpload };
    attempt.current = { sourceFileId: body.sourceFile.id, upload: body.upload, sent: false };
  }
  const a = attempt.current;
  if (!a.sent) {
    try {
      await uploadFile(a.upload, file.blob, {
        contentType: file.contentType,
        fetchImpl,
        ...(opts.retryDelaysMs === undefined ? {} : { retryDelaysMs: opts.retryDelaysMs }),
      });
    } catch {
      throw new PinPhotoError('upload_failed');
    }
    attempt.current = { ...a, sent: true };
  }
  let done: Response;
  try {
    done = await fetchImpl(
      `/api/source-files/${encodeURIComponent(a.sourceFileId)}/complete`,
      post(),
    );
  } catch {
    throw new PinPhotoError('upload_failed');
  }
  if (done.status === 403) throw new PinPhotoError('not_authorized');
  if (done.status !== 200) throw new PinPhotoError('upload_failed');
  return a.sourceFileId;
}

type PinAttributes = PinData['attributes'];

// The edit that sets some of a pin's attributes; null when the id is not a pin or the result does not parse.
function pinChange(objects: Objects, pinId: string, set: Partial<PinAttributes>): Change | null {
  const key = [...objects.keys()].find((k) => k.toLowerCase() === pinId.toLowerCase());
  const value = key === undefined ? undefined : objects.get(key);
  if (key === undefined || value === undefined || value.type !== 'pin') return null;
  const d = value.data as unknown as PinData;
  const parsed = parseStoredObject({
    id: key,
    type: 'pin',
    schema_version: CURRENT_SCHEMA_VERSION,
    data: { ...d, attributes: { ...d.attributes, ...set } },
  });
  if (!parsed.ok) return null;
  return {
    id: key,
    value: {
      type: 'pin',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: parsed.object.data as unknown as Record<string, unknown>,
    },
  };
}

// The edit that gives a pin its photo (or takes it away with null).
export const pinPhotoChange = (objects: Objects, pinId: string, photoFileId: string | null) =>
  pinChange(objects, pinId, { photoFileId });

// The edit that changes a pin's kind.
export const pinKindChange = (objects: Objects, pinId: string, kind: PinAttributes['kind']) =>
  pinChange(objects, pinId, { kind });

// The thumbnail's short-lived link, or null when the file cannot be read (another company, missing, a failure).
export async function fetchPhotoLink(
  sourceFileId: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`/api/source-files/${encodeURIComponent(sourceFileId)}/link`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (res.status !== 200) return null;
    const body = (await res.json()) as { url?: unknown };
    return typeof body.url === 'string' ? body.url : null;
  } catch {
    return null;
  }
}
