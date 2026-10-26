// EZD-132 T1-T7 (vault/plans/EZD-132.md section 4): the storage lists, the resumable endpoint, the TUS upload
// helper over the fake server (app/test-utils/storage/fake-tus.ts, no network) and the download-link lifetime
// bounds. Expected values: section 1 Decided rows (resumableEndpoint, TUS create, TUS send, Retry, Resume
// across calls, Upload refusals, Lifetimes), Step 4-7 signatures, docs/architecture.md Storage buckets and
// paths, 03c source_file kinds. X = randomBytes(7340155) = 6,291,456 + 1,048,699; only hashes and lengths are
// compared.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFakeTus } from '../../../test-utils/storage/fake-tus';
import { storagePathSchema } from '../../server/jobs/storage-path';
import { signedDownloadUrl, StorageError, type DbClient } from '../../server/storage';
import { STORAGE_BUCKETS } from './buckets';
import { resumableEndpoint } from './endpoint';
import { SOURCE_FILE_KINDS } from './source-file-kinds';
import { uploadFile, UploadError, type SignedUpload } from './upload';

const UNIT_URL = 'http://127.0.0.1:54321/storage/v1/upload/resumable/sign';
const X_BYTES = 7340155;
const CHUNK = 6291456;
const TAIL = 1048699;
const CONTENT_TYPE = 'application/pdf';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function signed(): SignedUpload {
  return {
    bucket: 'sources',
    path: `${randomUUID()}/${randomUUID()}/${randomUUID()}`,
    token: randomUUID(),
    url: UNIT_URL,
  };
}

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected a rejection');
}

function metadata(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (header ?? '').split(',')) {
    const [key, value] = pair.trim().split(' ');
    if (key) out[key] = Buffer.from(value ?? '', 'base64').toString('utf8');
  }
  return out;
}

// A client stub that records every call made through it at any depth (T7: no request).
function recordingClient(): { client: DbClient; calls: string[] } {
  const calls: string[] = [];
  const make = (path: string): unknown =>
    new Proxy(function stub() {}, {
      get: (_t, prop) => (prop === 'then' ? undefined : make(`${path}.${String(prop)}`)),
      apply: () => {
        calls.push(path);
        return make(`${path}()`);
      },
    });
  return { client: make('client') as DbClient, calls };
}

describe('EZD-132 storage library', () => {
  const X = new Uint8Array(randomBytes(X_BYTES));
  const file = () => new Blob([X]);

  it('EZD-132 T1 resumableEndpoint builds the direct resumable address', () => {
    expect(resumableEndpoint('http://127.0.0.1:54321')).toBe(
      'http://127.0.0.1:54321/storage/v1/upload/resumable/sign',
    );
    expect(resumableEndpoint('https://abcd1234.supabase.co')).toBe(
      'https://abcd1234.storage.supabase.co/storage/v1/upload/resumable/sign',
    );
    expect(resumableEndpoint('https://abcd1234.supabase.co/')).toBe(
      'https://abcd1234.storage.supabase.co/storage/v1/upload/resumable/sign',
    );
  });

  it('EZD-132 T2 bucket and source file kind lists', () => {
    expect([...STORAGE_BUCKETS]).toEqual([...storagePathSchema.shape.bucket.options]);
    expect([...SOURCE_FILE_KINDS]).toEqual([
      'polycam_dxf',
      'polycam_glb',
      'pdf',
      'supplier_pdf',
      'dxf',
      'image',
      'order_report',
      'photo',
      'panel_photo',
      'field_measure',
    ]);
  });

  it('EZD-132 T3 happy path: one create, two chunks, progress, no API key', async () => {
    const fake = createFakeTus();
    const upload = signed();
    const progress: Array<[number, number]> = [];
    await uploadFile(upload, file(), {
      contentType: CONTENT_TYPE,
      retryDelaysMs: [],
      fetchImpl: fake.fetchImpl,
      onProgress: (sent, total) => progress.push([sent, total]),
    });

    expect(fake.requests.map((r) => r.method)).toEqual(['POST', 'PATCH', 'PATCH']);
    const [post, p1, p2] = fake.requests;
    expect(post.url).toBe(UNIT_URL);
    expect(post.headers['upload-length']).toBe(String(X_BYTES));
    expect(post.headers['x-signature']).toBe(upload.token);
    expect(metadata(post.headers['upload-metadata'])).toEqual({
      bucketName: upload.bucket,
      objectName: upload.path,
      contentType: CONTENT_TYPE,
    });
    expect(p1.url).toBe(fake.location);
    expect(p2.url).toBe(fake.location);
    expect(p1.headers['upload-offset']).toBe('0');
    expect(p2.headers['upload-offset']).toBe(String(CHUNK));
    expect(p1.bodyBytes).toBe(CHUNK);
    expect(p2.bodyBytes).toBe(TAIL);
    expect(progress).toEqual([
      [CHUNK, X_BYTES],
      [X_BYTES, X_BYTES],
    ]);
    for (const r of fake.requests) {
      expect(r.headers).not.toHaveProperty('apikey');
      expect(r.headers).not.toHaveProperty('authorization');
    }
  });

  it('EZD-132 T4 a dropped chunk is retried from the server offset', async () => {
    const fake = createFakeTus({ failPatch: { n: 2, keepBytes: 1048576 } });
    await uploadFile(signed(), file(), {
      contentType: CONTENT_TYPE,
      retryDelaysMs: [0],
      fetchImpl: fake.fetchImpl,
    });

    const afterFail = fake.requests.slice(3);
    expect(afterFail.map((r) => r.method)).toEqual(['HEAD', 'PATCH']);
    expect(afterFail[1].headers['upload-offset']).toBe('7340032');
    expect(afterFail[1].bodyBytes).toBe(123);
    expect(sha(fake.stored())).toBe(sha(X));
  });

  it('EZD-132 T5 an interrupted upload resumes in a later call', async () => {
    const fake = createFakeTus({ failPatch: { n: 2, keepBytes: 0 } });
    const upload = signed();
    const err = await caught(
      uploadFile(upload, file(), {
        contentType: CONTENT_TYPE,
        retryDelaysMs: [],
        fetchImpl: fake.fetchImpl,
      }),
    );
    expect(err).toBeInstanceOf(UploadError);
    const e = err as UploadError;
    expect(e.code).toBe('upload_interrupted');
    expect(e.offset).toBe(CHUNK);
    expect(e.resumeUrl).toBe(fake.location);

    const before = fake.requests.length;
    await uploadFile(upload, file(), {
      contentType: CONTENT_TYPE,
      retryDelaysMs: [],
      fetchImpl: fake.fetchImpl,
      resumeUrl: e.resumeUrl ?? undefined,
    });
    const second = fake.requests.slice(before);
    expect(second.map((r) => r.method)).toEqual(['HEAD', 'PATCH']);
    expect(second[1].bodyBytes).toBe(TAIL);
    expect(sha(fake.stored())).toBe(sha(X));
  });

  it('EZD-132 T6 upload refusals', async () => {
    // Empty file: refused before any request.
    const empty = createFakeTus();
    const e1 = await caught(
      uploadFile(signed(), new Blob([]), { contentType: CONTENT_TYPE, fetchImpl: empty.fetchImpl }),
    );
    expect(e1).toBeInstanceOf(UploadError);
    expect((e1 as UploadError).code).toBe('upload_empty');
    expect(empty.requests).toHaveLength(0);

    // Bad content type: refused before any request, no status.
    const badType = createFakeTus();
    const e2 = await caught(
      uploadFile(signed(), file(), { contentType: 'Bad Type', fetchImpl: badType.fetchImpl }),
    );
    expect(e2).toBeInstanceOf(UploadError);
    expect((e2 as UploadError).code).toBe('upload_rejected');
    expect((e2 as UploadError).status).toBeNull();
    expect(badType.requests).toHaveLength(0);

    // PATCH answered 403: rejected with that status and not retried.
    const forbidden = createFakeTus({ patchStatus: { n: 1, status: 403 } });
    const e3 = await caught(
      uploadFile(signed(), file(), { contentType: CONTENT_TYPE, fetchImpl: forbidden.fetchImpl }),
    );
    expect(e3).toBeInstanceOf(UploadError);
    expect((e3 as UploadError).code).toBe('upload_rejected');
    expect((e3 as UploadError).status).toBe(403);
    expect(forbidden.requests.map((r) => r.method)).not.toContain('HEAD');

    // HEAD answered 404 on resume: the upload has expired.
    const gone = createFakeTus({ headStatus: 404 });
    const e4 = await caught(
      uploadFile(signed(), file(), {
        contentType: CONTENT_TYPE,
        fetchImpl: gone.fetchImpl,
        resumeUrl: `${UNIT_URL}/upload-1`,
      }),
    );
    expect(e4).toBeInstanceOf(UploadError);
    expect((e4 as UploadError).code).toBe('upload_expired');
    expect((e4 as UploadError).resumeUrl).toBeNull();

    // 204 without Upload-Offset: rejected with status 204.
    const noOffset = createFakeTus({ omitOffsetOnPatch: 1 });
    const e5 = await caught(
      uploadFile(signed(), file(), { contentType: CONTENT_TYPE, fetchImpl: noOffset.fetchImpl }),
    );
    expect(e5).toBeInstanceOf(UploadError);
    expect((e5 as UploadError).code).toBe('upload_rejected');
    expect((e5 as UploadError).status).toBe(204);
  });

  it('EZD-132 T7 download link lifetime outside 1-900 s is refused with no request', async () => {
    const target = {
      bucket: 'sources' as const,
      path: `${randomUUID()}/${randomUUID()}/${randomUUID()}`,
    };
    for (const expiresIn of [0, 901, 1.5]) {
      const { client, calls } = recordingClient();
      const err = await caught(signedDownloadUrl(client, target, { expiresIn }));
      expect(err, String(expiresIn)).toBeInstanceOf(StorageError);
      expect((err as StorageError).code, String(expiresIn)).toBe('invalid_expiry');
      expect(calls, String(expiresIn)).toEqual([]);
    }
  });
});
