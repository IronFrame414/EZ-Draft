// EZD-224 Build step 5 (vault/plans/EZD-224.md Decided; 03 Q-0664): checkpoint thumbnails. Start checks and signs one
// upload, complete records it, and the card reads a 900 s signed link. Session client only; errors map by code.
import type { SignedUpload } from '../../lib/storage/upload';
import {
  StorageError,
  createSignedUpload,
  signedDownloadUrl,
  type DbClient,
} from '../storage/objects';

export const THUMBNAIL_LIMIT_BYTES = 40960;

type RpcRefusalCode =
  | 'permission_denied'
  | 'project_not_found'
  | 'version_not_found'
  | 'thumbnail_invalid';

export type ThumbnailStartResult =
  | { ok: true; upload: SignedUpload }
  | { ok: false; code: RpcRefusalCode };
export type ThumbnailCompleteResult =
  | { ok: true; path: string }
  | { ok: false; code: RpcRefusalCode };
export type ThumbnailUrlResult =
  | { ok: true; url: string }
  | { ok: false; code: 'project_not_found' | 'thumbnail_not_found' };

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const THUMB_PATH = new RegExp(`^${UUID}/${UUID}/thumb/${UUID}\\.webp$`);

export function isThumbnailPathFor(path: string, projectId: string): boolean {
  return THUMB_PATH.test(path) && path.split('/')[1] === projectId.toLowerCase();
}

function refusal(error: { code?: string; message?: string }): RpcRefusalCode | null {
  if (error.code === '42501') return 'permission_denied';
  if (error.code === 'P0002') {
    return error.message === 'version_not_found' ? 'version_not_found' : 'project_not_found';
  }
  if (error.code === 'P0001' && error.message === 'thumbnail_invalid') return 'thumbnail_invalid';
  return null;
}

async function callRpc(
  client: DbClient,
  fn: 'start_checkpoint_thumbnail' | 'set_checkpoint_thumbnail',
  projectId: string,
  versionId: string,
): Promise<{ ok: true; path: string } | { ok: false; code: RpcRefusalCode }> {
  const { data, error } = await client.rpc(fn, { p_project: projectId, p_version: versionId });
  if (error) {
    const code = refusal(error);
    if (code === null) throw error;
    return { ok: false, code };
  }
  if (typeof data !== 'string') throw new Error(`${fn}_unexpected_result`);
  return { ok: true, path: data };
}

export async function startCheckpointThumbnail(
  client: DbClient,
  projectId: string,
  versionId: string,
): Promise<ThumbnailStartResult> {
  const started = await callRpc(client, 'start_checkpoint_thumbnail', projectId, versionId);
  if (!started.ok) return started;
  try {
    const upload = await createSignedUpload(client, { bucket: 'media', path: started.path });
    return { ok: true, upload };
  } catch (e) {
    if (e instanceof StorageError && e.code === 'upload_refused') {
      return { ok: false, code: 'version_not_found' };
    }
    throw e;
  }
}

export async function completeCheckpointThumbnail(
  client: DbClient,
  projectId: string,
  versionId: string,
): Promise<ThumbnailCompleteResult> {
  return callRpc(client, 'set_checkpoint_thumbnail', projectId, versionId);
}

export async function projectThumbnailUrl(
  client: DbClient,
  projectId: string,
): Promise<ThumbnailUrlResult> {
  const { data, error } = await client
    .from('project')
    .select('thumbnail_path')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return { ok: false, code: 'project_not_found' };
  const path: unknown = data.thumbnail_path;
  if (typeof path !== 'string' || !isThumbnailPathFor(path, projectId)) {
    return { ok: false, code: 'thumbnail_not_found' };
  }
  try {
    return { ok: true, url: await signedDownloadUrl(client, { bucket: 'media', path }) };
  } catch (e) {
    if (e instanceof StorageError && e.code === 'object_not_found') {
      return { ok: false, code: 'thumbnail_not_found' };
    }
    throw e;
  }
}
