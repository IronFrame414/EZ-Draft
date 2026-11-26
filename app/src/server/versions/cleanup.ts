// EZD-123 (R24 #4; W15; S20 Cleanup sheet; Q-0700 03 "Daily cleanup", 05 "Cleanup sheet", 10 permission table;
// Q-0664; AC-EZD-123-1 to -10): server helpers of the version cleanup.
// - listCleanup: the sheet's rows through the member's session client (RLS model_version_select, project scope):
//   rows already shown (cleanup_shown_at set) that are neither sent nor named, newest first, each with its author,
//   cause, change summary against its parent and a signed preview URL (null when there is no preview, Q-0664).
// - saveCleanupChoices: the definer function save_cleanup_choices (Edit model, scope and the lock checked again).
// - runVersionCleanupWith / enqueueVersionCleanupWith: the daily run, service_role only (the cleanup job handler and
//   the sweep).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  cleanupCounts,
  storedObjects,
  type CleanupList,
  type CleanupRow,
} from '../../lib/versions/cleanup';
import { effectiveValue } from '../../lib/defaults/values';
import type { Database, Json } from '../db/database.types';
import { loadTenantDefaults } from '../defaults/defaults';
import { signedDownloadUrl, StorageError } from '../storage/objects';
import { isThumbnailPathFor } from '../thumbnail/thumbnail';

type Client = SupabaseClient<Database>;

export const CLEANUP_LIST_MAX = 500;

async function previewUrl(
  client: Client,
  projectId: string,
  path: string | null,
): Promise<string | null> {
  if (path === null || !isThumbnailPathFor(path, projectId)) return null;
  try {
    return await signedDownloadUrl(client, { bucket: 'media', path });
  } catch (e) {
    if (e instanceof StorageError && e.code === 'object_not_found') return null;
    throw e;
  }
}

function days(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : fallback;
}

// Null when the project is not visible to the caller.
export async function listCleanup(client: Client, projectId: string): Promise<CleanupList | null> {
  const [project, defaults] = await Promise.all([
    client.from('project').select('id').eq('id', projectId).maybeSingle(),
    loadTenantDefaults(client),
  ]);
  if (project.error) throw project.error;
  if (project.data === null) return null;
  const graceDays = days(effectiveValue('version_cleanup_grace', defaults), 7);
  const ageDays = days(effectiveValue('version_cleanup_age', defaults), 30);

  const { data, error } = await client
    .from('model_version')
    .select(
      'id, label, cause, created_at, created_by, parent_version_id, cleanup_shown_at, preview_path, model_json',
    )
    .eq('project_id', projectId)
    .eq('is_sent', false)
    .eq('is_snapshot', false)
    .not('cleanup_shown_at', 'is', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(CLEANUP_LIST_MAX);
  if (error) throw error;
  if (data.length === 0) return { rows: [], graceDays, ageDays };

  const listed = new Map(data.map((r) => [r.id, r.model_json]));
  const missingParents = [
    ...new Set(
      data.flatMap((r) =>
        r.parent_version_id !== null && !listed.has(r.parent_version_id)
          ? [r.parent_version_id]
          : [],
      ),
    ),
  ];
  const authorIds = [
    ...new Set(data.flatMap((r) => (r.created_by === null ? [] : [r.created_by]))),
  ];
  const [parents, people] = await Promise.all([
    missingParents.length > 0
      ? client
          .from('model_version')
          .select('id, model_json')
          .eq('project_id', projectId)
          .in('id', missingParents)
      : Promise.resolve({ data: [] as { id: string; model_json: Json }[], error: null }),
    authorIds.length > 0
      ? client.from('app_user').select('id, name').in('id', authorIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[], error: null }),
  ]);
  if (parents.error) throw parents.error;
  if (people.error) throw people.error;
  const docs = new Map<string, Json>(listed);
  for (const p of parents.data) docs.set(p.id, p.model_json);
  const names = new Map<string, string | null>();
  for (const p of people.data) names.set(p.id, p.name?.trim() ? p.name.trim() : null);

  const urls = await Promise.all(data.map((r) => previewUrl(client, projectId, r.preview_path)));
  const rows: CleanupRow[] = data.map((r, i) => {
    const parentDoc = r.parent_version_id === null ? undefined : docs.get(r.parent_version_id);
    return {
      id: r.id,
      createdAt: r.created_at,
      author: r.created_by === null ? null : (names.get(r.created_by) ?? null),
      cause: r.cause,
      label: r.label,
      summary: cleanupCounts(
        parentDoc === undefined ? null : storedObjects(parentDoc),
        storedObjects(r.model_json),
      ),
      shownAt: r.cleanup_shown_at as string,
      previewUrl: urls[i],
    };
  });
  return { rows, graceDays, ageDays };
}

const uuid = z.uuid();

// Q-0700 05: a snapshot name is trimmed and non-empty, with no maximum.
export const cleanupBodySchema = z
  .strictObject({
    lockEpoch: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    keep: z
      .array(
        z.strictObject({
          id: uuid,
          name: z.string().refine((s) => s.trim().length > 0),
        }),
      )
      .max(CLEANUP_LIST_MAX),
    remove: z.array(uuid).max(CLEANUP_LIST_MAX),
  })
  .refine((b) => {
    const ids = [...b.keep.map((k) => k.id.toLowerCase()), ...b.remove.map((r) => r.toLowerCase())];
    return new Set(ids).size === ids.length;
  });

export type CleanupBody = z.infer<typeof cleanupBodySchema>;

export type SaveCleanupResult =
  | { ok: true; tenantId: string; kept: string[]; deleted: string[] }
  | {
      ok: false;
      code: 'permission_denied' | 'project_not_found' | 'invalid_input' | 'stale_lock_epoch';
    };

export async function saveCleanupChoices(
  client: Client,
  projectId: string,
  body: CleanupBody,
): Promise<SaveCleanupResult> {
  const { data, error } = await client.rpc('save_cleanup_choices', {
    p_project: projectId,
    p_lock_epoch: body.lockEpoch,
    p_keep: body.keep.map((k) => ({ id: k.id, name: k.name.trim() })),
    p_delete: body.remove,
  });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === 'P0002') return { ok: false, code: 'project_not_found' };
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  const r = data as {
    status?: string;
    tenant_id?: string;
    kept?: string[];
    deleted?: string[];
  } | null;
  if (r?.status === 'saved' && r.tenant_id && Array.isArray(r.kept) && Array.isArray(r.deleted))
    return { ok: true, tenantId: r.tenant_id, kept: r.kept, deleted: r.deleted };
  if (r?.status === 'stale_lock_epoch') return { ok: false, code: 'stale_lock_epoch' };
  throw new Error('save_cleanup_choices_unexpected_result');
}

export type CleanupRun = { deleted: string[]; due: string[] };

// The daily run for one company at the given run time; with dryRun it lists and writes nothing.
export async function runVersionCleanupWith(
  db: Client,
  tenantId: string,
  at: string,
  dryRun: boolean,
): Promise<CleanupRun> {
  const { data, error } = await db.rpc('run_version_cleanup', {
    p_tenant: tenantId,
    p_now: at,
    p_dry_run: dryRun,
  });
  if (error) throw new Error('version_cleanup_failed');
  const r = data as { deleted?: unknown; due?: unknown } | null;
  const ids = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return { deleted: ids(r?.deleted), due: ids(r?.due) };
}

// The sweep's pass: queues the day's cleanup job per company once the day's run time has come.
export async function enqueueVersionCleanupWith(db: Client, now?: Date): Promise<number> {
  const { data, error } = await db.rpc(
    'enqueue_version_cleanup',
    now === undefined ? {} : { p_now: now.toISOString() },
  );
  if (error) throw new Error('version_cleanup_enqueue_failed');
  return Number(data ?? 0);
}
