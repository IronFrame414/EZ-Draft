// EZD-132 Step 8 (vault/plans/EZD-132.md Decided Client, Target check, Error mapping, Storage calls,
// Lifetimes): the server's Storage object helpers. Callers pass their own client (a route passes
// createSessionClient(), so the Storage policies of Step 2 apply; never the secret key; 03 rule 1). Every
// target is parsed with storagePathSchema before any request. Download links live 900 s by default
// (Q-0232; 11 Operations: files are served through short-lived signed links). Errors carry a stable code only.
import type { SupabaseClient } from '@supabase/supabase-js';
import { resumableEndpoint } from '../../lib/storage/endpoint';
import type { SignedUpload } from '../../lib/storage/upload';
import type { Database } from '../db/database.types';
import { readPublicDbEnv } from '../db/env';
import { storagePathSchema, type StoragePath } from '../jobs/storage-path';

export const SIGNED_DOWNLOAD_SECONDS = 900;

export type StorageErrorCode =
  | 'invalid_input'
  | 'invalid_expiry'
  | 'project_not_found'
  | 'source_file_not_found'
  | 'object_not_found'
  | 'upload_refused'
  | 'upload_missing'
  | 'upload_size_mismatch'
  | 'storage_unavailable';

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode) {
    super(code);
    this.name = 'StorageError';
    this.code = code;
  }
}

export type DbClient = SupabaseClient<Database>;

function parseTarget(target: StoragePath): StoragePath {
  const parsed = storagePathSchema.safeParse(target);
  if (!parsed.success) throw new StorageError('invalid_input');
  return parsed.data;
}

// supabase-js reports the HTTP status as `statusCode` (string) or `status` (number); null when neither.
function statusOf(error: unknown): number | null {
  const e = error as { statusCode?: unknown; status?: unknown };
  const raw = e.statusCode ?? e.status;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const REFUSED = new Set([400, 403, 409]);

export async function createSignedUpload(
  client: DbClient,
  target: StoragePath,
): Promise<SignedUpload> {
  const { bucket, path } = parseTarget(target);
  const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
  if (error) {
    const status = statusOf(error);
    throw new StorageError(
      status !== null && REFUSED.has(status) ? 'upload_refused' : 'storage_unavailable',
    );
  }
  return { bucket, path, token: data.token, url: resumableEndpoint(readPublicDbEnv().url) };
}

export async function signedDownloadUrl(
  client: DbClient,
  target: StoragePath,
  opts: { expiresIn?: number } = {},
): Promise<string> {
  const expiresIn = opts.expiresIn ?? SIGNED_DOWNLOAD_SECONDS;
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > SIGNED_DOWNLOAD_SECONDS) {
    throw new StorageError('invalid_expiry');
  }
  const { bucket, path } = parseTarget(target);
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) {
    const status = statusOf(error);
    throw new StorageError(
      status === 404 || (status !== null && REFUSED.has(status))
        ? 'object_not_found'
        : 'storage_unavailable',
    );
  }
  return data.signedUrl;
}

export async function statObject(
  client: DbClient,
  target: StoragePath,
): Promise<{ size: number } | null> {
  const { bucket, path } = parseTarget(target);
  const { data, error } = await client.storage.from(bucket).info(path);
  if (error) {
    if (statusOf(error) === 404) return null;
    throw new StorageError('storage_unavailable');
  }
  // The pinned types mark size optional; an answer without it is treated as no usable answer.
  if (typeof data.size !== 'number') throw new StorageError('storage_unavailable');
  return { size: data.size };
}

export async function readObject(
  client: DbClient,
  target: StoragePath,
): Promise<Uint8Array | null> {
  const { bucket, path } = parseTarget(target);
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error) {
    if (statusOf(error) === 404) return null;
    throw new StorageError('storage_unavailable');
  }
  return new Uint8Array(await data.arrayBuffer());
}

// Resolves when Storage answers, also when a policy removed nothing; the result is not inspected.
export async function removeObject(client: DbClient, target: StoragePath): Promise<void> {
  const { bucket, path } = parseTarget(target);
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) throw new StorageError('storage_unavailable');
}
