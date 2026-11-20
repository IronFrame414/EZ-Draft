// EZD-122 (S20 Controls, Data shown; Q-0700 03 "Revert", 10 permission table; 03b rule 5; AC-EZD-122-1 to -5, -9):
// server helpers for the Versions panel. Reads go through the member's session client (RLS: model_version_select,
// project scope); the two writes go to the definer functions name_snapshot and revert_to_version, which check the
// switch, scope and (for Revert) the lock again. Revert migrates and validates the chosen version's objects here,
// through parseStoredObject, before the function writes them (Q-0700 03).
import { CURRENT_SCHEMA_VERSION, parseStoredObject, type ObjectIssue } from '@ezdraft/geometry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  versionCauseOf,
  VERSIONS_LIST_MAX,
  type VersionDocument,
  type VersionObject,
  type VersionRow,
} from '../../lib/versions/versions';
import type { Database, Json } from '../db/database.types';

type Client = SupabaseClient<Database>;

// Null when the project is not visible to the caller; otherwise its versions, newest first.
export async function listVersions(
  client: Client,
  projectId: string,
): Promise<VersionRow[] | null> {
  const project = await client.from('project').select('id').eq('id', projectId).maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) return null;
  const { data, error } = await client
    .from('model_version')
    .select(
      'id, label, cause, is_snapshot, is_sent, version_no, sent_to, sent_at, created_at, created_by, parent_version_id',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(VERSIONS_LIST_MAX);
  if (error) throw error;
  const authorIds = [
    ...new Set(data.flatMap((r) => (r.created_by === null ? [] : [r.created_by]))),
  ];
  const names = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const people = await client.from('app_user').select('id, name').in('id', authorIds);
    if (people.error) throw people.error;
    for (const p of people.data) names.set(p.id, p.name?.trim() ? p.name.trim() : null);
  }
  return data.map((r) => ({
    id: r.id,
    label: r.label,
    cause: versionCauseOf(r.cause),
    isSnapshot: r.is_snapshot,
    isSent: r.is_sent,
    versionNo: r.version_no,
    sentTo: r.sent_to,
    sentAt: r.sent_at,
    createdAt: r.created_at,
    author: r.created_by === null ? null : (names.get(r.created_by) ?? null),
    parentId: r.parent_version_id,
  }));
}

type StoredDoc = { objects?: unknown };

// One version's objects, migrated to the current schema (03b rule 5). Null when the version is not this project's
// or not visible; objects that fail to parse are listed in `invalid`.
export async function readVersion(
  client: Client,
  projectId: string,
  versionId: string,
): Promise<{ doc: VersionDocument; invalid: ObjectIssue[] } | null> {
  const { data, error } = await client
    .from('model_version')
    .select('id, model_json')
    .eq('project_id', projectId)
    .eq('id', versionId)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return null;
  const raw = (data.model_json as StoredDoc | null)?.objects;
  const objects: VersionObject[] = [];
  const invalid: ObjectIssue[] = [];
  for (const o of Array.isArray(raw) ? raw : []) {
    const r = (o ?? {}) as {
      id?: unknown;
      type?: unknown;
      schema_version?: unknown;
      data?: unknown;
    };
    const parsed = parseStoredObject({
      id: r.id as string,
      type: r.type as string,
      schema_version: r.schema_version as number,
      data: r.data as Json,
    });
    if (!parsed.ok) {
      invalid.push(parsed.issue);
      continue;
    }
    objects.push({
      id: parsed.object.id,
      type: parsed.object.type,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: parsed.object.data as Record<string, unknown>,
    });
  }
  return { doc: { id: data.id, objects }, invalid };
}

// Q-0700 05: trimmed and non-empty, no maximum.
export const snapshotBodySchema = z.strictObject({
  name: z.string().refine((s) => s.trim().length > 0),
});

// The label the panel shows for the chosen version, written after "Revert from" on the new row.
export const revertBodySchema = z.strictObject({
  lockEpoch: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  label: z
    .string()
    .max(200)
    .refine((s) => s.trim().length > 0),
});

export type SnapshotResult =
  | { ok: true; tenantId: string; id: string; label: string }
  | {
      ok: false;
      code:
        | 'permission_denied'
        | 'project_not_found'
        | 'version_not_found'
        | 'invalid_input'
        | 'not_working';
    };

export async function nameSnapshot(
  client: Client,
  projectId: string,
  versionId: string,
  name: string,
): Promise<SnapshotResult> {
  const { data, error } = await client.rpc('name_snapshot', {
    p_project: projectId,
    p_version: versionId,
    p_name: name,
  });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === 'P0002')
      return {
        ok: false,
        code: error.message === 'version_not_found' ? 'version_not_found' : 'project_not_found',
      };
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  const r = data as { status?: string; tenant_id?: string; id?: string; label?: string } | null;
  if (r?.status === 'named' && r.tenant_id && r.id && typeof r.label === 'string')
    return { ok: true, tenantId: r.tenant_id, id: r.id, label: r.label };
  if (r?.status === 'not_working') return { ok: false, code: 'not_working' };
  throw new Error('name_snapshot_unexpected_result');
}

export type RevertResult =
  | { ok: true; tenantId: string; versionId: string; beforeVersionId: string }
  | {
      ok: false;
      code:
        | 'permission_denied'
        | 'project_not_found'
        | 'version_not_found'
        | 'invalid_input'
        | 'stale_lock_epoch';
    }
  | { ok: false; code: 'invalid_object'; invalid: ObjectIssue[] };

export async function revertToVersion(
  client: Client,
  projectId: string,
  versionId: string,
  body: { lockEpoch: number; label: string },
): Promise<RevertResult> {
  const read = await readVersion(client, projectId, versionId);
  if (read === null) return { ok: false, code: 'version_not_found' };
  if (read.invalid.length > 0) return { ok: false, code: 'invalid_object', invalid: read.invalid };
  const objects = read.doc.objects.map((o) => ({
    id: o.id,
    type: o.type,
    schema_version: o.schemaVersion,
    data: o.data,
  }));
  const { data, error } = await client.rpc('revert_to_version', {
    p_project: projectId,
    p_version: versionId,
    p_lock_epoch: body.lockEpoch,
    p_objects: objects as Json,
    p_label: body.label.trim(),
  });
  if (error) {
    if (error.code === '23503' && error.message === 'level_not_found') {
      return {
        ok: false,
        code: 'invalid_object',
        invalid: [{ id: error.details, issue: 'level_not_found' }],
      };
    }
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === 'P0002')
      return {
        ok: false,
        code: error.message === 'version_not_found' ? 'version_not_found' : 'project_not_found',
      };
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  const r = data as {
    status?: string;
    tenant_id?: string;
    version_id?: string;
    before_version_id?: string;
  } | null;
  if (r?.status === 'reverted' && r.tenant_id && r.version_id && r.before_version_id)
    return {
      ok: true,
      tenantId: r.tenant_id,
      versionId: r.version_id,
      beforeVersionId: r.before_version_id,
    };
  if (r?.status === 'stale_lock_epoch') return { ok: false, code: 'stale_lock_epoch' };
  throw new Error('revert_to_version_unexpected_result');
}
