// EZD-132 Step 7 (vault/plans/EZD-132.md Decided TUS create, TUS send, Retry, Resume across calls, Upload
// refusals; AC-EZD-132-4; R-017 #1, #3): a browser upload goes straight to Storage with a signed resumable
// upload (TUS 1.0.0 over fetch), never through the app server (03 rule 1; 11 Operations). The signed token
// travels as x-signature; no API key or Authorization header is sent. A dropped connection is retried from
// the offset Storage confirms, and an interrupted upload carries its resume address so a later call can
// finish it. Imported by browser and server.
import type { StorageBucket } from './buckets';

export type SignedUpload = { bucket: StorageBucket; path: string; token: string; url: string };

export const RESUMABLE_CHUNK_BYTES = 6291456;

export const DEFAULT_RETRY_DELAYS_MS = [0, 1000, 3000, 5000] as const;

export type UploadErrorCode =
  'upload_empty' | 'upload_interrupted' | 'upload_rejected' | 'upload_expired';

export class UploadError extends Error {
  readonly code: UploadErrorCode;
  readonly status: number | null;
  readonly resumeUrl: string | null;
  readonly offset: number;

  constructor(
    code: UploadErrorCode,
    details: { status?: number | null; resumeUrl?: string | null; offset?: number } = {},
  ) {
    super(code);
    this.name = 'UploadError';
    this.code = code;
    this.status = details.status ?? null;
    this.resumeUrl = details.resumeUrl ?? null;
    this.offset = details.offset ?? 0;
  }
}

export type UploadOptions = {
  contentType: string;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  resumeUrl?: string;
  retryDelaysMs?: readonly number[];
  fetchImpl?: typeof fetch;
};

const TUS_VERSION = '1.0.0';
const CONTENT_TYPE_RE = /^[a-z0-9]+\/[a-z0-9.+-]+$/;

const encode = (value: string) => btoa(value);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Retryable: a thrown fetch, a server error, a conflict or a lock (Decided Retry).
const isRetryableStatus = (status: number) => status >= 500 || status === 409 || status === 423;

function uploadOffsetOf(response: Response): number | null {
  const raw = response.headers.get('Upload-Offset');
  if (raw === null || raw.trim() === '' || !/^\d+$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

// A thrown fetch is reported as a retryable network failure.
class NetworkFailure extends Error {}

export async function uploadFile(
  upload: SignedUpload,
  file: Blob,
  opts: UploadOptions,
): Promise<void> {
  const size = file.size;
  if (size === 0) throw new UploadError('upload_empty');
  if (!CONTENT_TYPE_RE.test(opts.contentType)) throw new UploadError('upload_rejected');

  const fetchImpl = opts.fetchImpl ?? fetch;
  const delays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const signature = { 'Tus-Resumable': TUS_VERSION, 'x-signature': upload.token };

  let location: string | null = opts.resumeUrl ?? null;
  let offset = 0;
  let failures = 0;
  // After a retryable failure, or when resuming, the next step is a HEAD for the server's offset.
  let needHead = location !== null;

  const send = (input: string, init: RequestInit): Promise<Response> =>
    fetchImpl(input, init).catch(() => {
      throw new NetworkFailure();
    });

  // A retryable failure waits for the next delay, or ends the upload with its resume address.
  const retryOrFail = async (): Promise<void> => {
    if (failures < delays.length) {
      await sleep(delays[failures]);
      failures += 1;
      needHead = location !== null;
      return;
    }
    throw new UploadError('upload_interrupted', { resumeUrl: location, offset });
  };

  const createUpload = async (): Promise<void> => {
    let response: Response;
    try {
      response = await send(upload.url, {
        method: 'POST',
        headers: {
          ...signature,
          'Upload-Length': String(size),
          'Upload-Metadata': [
            `bucketName ${encode(upload.bucket)}`,
            `objectName ${encode(upload.path)}`,
            `contentType ${encode(opts.contentType)}`,
          ].join(','),
        },
      });
    } catch {
      return retryOrFail();
    }
    if (response.status === 201) {
      const header = response.headers.get('Location');
      if (!header) throw new UploadError('upload_rejected', { status: 201 });
      location = new URL(header, upload.url).toString();
      return;
    }
    if (isRetryableStatus(response.status)) return retryOrFail();
    throw new UploadError('upload_rejected', { status: response.status });
  };

  const readServerOffset = async (): Promise<void> => {
    let response: Response;
    try {
      response = await send(location as string, { method: 'HEAD', headers: signature });
    } catch {
      return retryOrFail();
    }
    if (response.status === 404 || response.status === 410) {
      throw new UploadError('upload_expired', { offset });
    }
    if (response.status >= 400) {
      if (isRetryableStatus(response.status)) return retryOrFail();
      throw new UploadError('upload_rejected', { status: response.status, resumeUrl: location });
    }
    const serverOffset = uploadOffsetOf(response);
    if (serverOffset === null) {
      throw new UploadError('upload_rejected', { status: response.status, resumeUrl: location });
    }
    offset = serverOffset;
    needHead = false;
  };

  const sendChunk = async (): Promise<void> => {
    const end = Math.min(offset + RESUMABLE_CHUNK_BYTES, size);
    let response: Response;
    try {
      response = await send(location as string, {
        method: 'PATCH',
        headers: {
          ...signature,
          'Upload-Offset': String(offset),
          'Content-Type': 'application/offset+octet-stream',
        },
        body: file.slice(offset, end),
      });
    } catch {
      return retryOrFail();
    }
    if (response.status === 204) {
      const confirmed = uploadOffsetOf(response);
      if (confirmed === null) {
        throw new UploadError('upload_rejected', { status: 204, resumeUrl: location, offset });
      }
      offset = confirmed;
      failures = 0;
      opts.onProgress?.(offset, size);
      return;
    }
    if (response.status === 404 || response.status === 410) {
      throw new UploadError('upload_expired', { offset });
    }
    if (isRetryableStatus(response.status)) return retryOrFail();
    throw new UploadError('upload_rejected', {
      status: response.status,
      resumeUrl: location,
      offset,
    });
  };

  while (offset < size) {
    if (location === null) {
      await createUpload();
      continue;
    }
    if (needHead) {
      await readServerOffset();
      continue;
    }
    await sendChunk();
  }
}
