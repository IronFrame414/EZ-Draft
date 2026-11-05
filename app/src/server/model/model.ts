// EZD-120a Build step 6 (vault/plans/EZD-120a.md section 1 M5, M6, Decided "parseSaveRequest", "Error mapping";
// section 3 types; 03b rules 1, 5, 6, 9): server-only helpers for the working copy. Writes go through the
// caller's session client to `save_objects` and `create_checkpoint`, which check the switch and scope again.
import { CURRENT_SCHEMA_VERSION, parseStoredObject, type ObjectIssue } from '@ezdraft/geometry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database, Json } from '../db/database.types';

export type ObjectChange =
  | { id: string; baseSeq: number; deleted: true }
  | {
      id: string;
      baseSeq: number;
      deleted: false;
      type: string;
      schemaVersion: number;
      data: Record<string, unknown>;
    };

export type SaveRequest = { lockEpoch: number; changes: ObjectChange[] };

export type SaveResult =
  | { ok: true; tenantId: string; objects: { id: string; updatedSeq: number }[] }
  | {
      ok: false;
      code: 'permission_denied' | 'project_not_found' | 'invalid_input' | 'stale_lock_epoch';
    }
  | { ok: false; code: 'save_conflict'; conflicts: { id: string; serverSeq: number }[] }
  | { ok: false; code: 'invalid_object'; invalid: ObjectIssue[] };

export type CheckpointResult =
  { ok: true; versionId: string } | { ok: false; code: 'permission_denied' | 'project_not_found' };

// Decided "Seq type": updated_seq is a PostgreSQL integer.
const SEQ_MAX = 2147483647;

const changeSchema = z.discriminatedUnion('deleted', [
  z.strictObject({
    id: z.uuid(),
    baseSeq: z.number().int().min(1).max(SEQ_MAX),
    deleted: z.literal(true),
  }),
  z.strictObject({
    id: z.uuid(),
    baseSeq: z.number().int().min(0).max(SEQ_MAX),
    deleted: z.literal(false),
    type: z.string().regex(/^[a-z][a-z0-9_]*$/),
    schemaVersion: z.number().int().min(1),
    data: z.record(z.string(), z.unknown()),
  }),
]);

const requestSchema = z.strictObject({
  lockEpoch: z.number().int().min(0),
  changes: z.array(changeSchema).min(1),
});

export function parseSaveRequest(body: unknown): SaveRequest | null {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return null;
  const ids = new Set(parsed.data.changes.map((c) => c.id.toLowerCase()));
  if (ids.size !== parsed.data.changes.length) return null;
  return parsed.data;
}

type SavedJson = {
  status: 'saved';
  tenant_id: string;
  objects: { object_id: string; updated_seq: number }[];
};
type ConflictJson = { status: 'conflict'; conflicts: { object_id: string; server_seq: number }[] };
type StaleJson = { status: 'stale_lock_epoch' };

export async function saveObjects(
  client: SupabaseClient<Database>,
  projectId: string,
  req: SaveRequest,
): Promise<SaveResult> {
  // EZD-202 Decided "Save check": every upserted object is parsed before the rpc; any issue refuses the whole
  // save, issues in change order. A parsed object is sent as parsed, at the current schema version.
  const invalid: ObjectIssue[] = [];
  const checked = req.changes.map((c): ObjectChange => {
    if (c.deleted) return c;
    const parsed = parseStoredObject({
      id: c.id,
      type: c.type,
      schema_version: c.schemaVersion,
      data: c.data,
    });
    if (!parsed.ok) {
      invalid.push(parsed.issue);
      return c;
    }
    return { ...c, schemaVersion: CURRENT_SCHEMA_VERSION, data: parsed.object.data };
  });
  if (invalid.length > 0) return { ok: false, code: 'invalid_object', invalid };

  const changes = checked.map((c) =>
    c.deleted
      ? { id: c.id, base_seq: c.baseSeq, deleted: true }
      : {
          id: c.id,
          base_seq: c.baseSeq,
          deleted: false,
          type: c.type,
          schema_version: c.schemaVersion,
          data: c.data,
        },
  );
  const { data, error } = await client.rpc('save_objects', {
    p_project: projectId,
    p_lock_epoch: req.lockEpoch,
    p_changes: changes as Json,
  });
  if (error) {
    // EZD-202 M1: the deferred level check names the object at fault in `details`.
    if (error.code === '23503' && error.message === 'level_not_found') {
      return {
        ok: false,
        code: 'invalid_object',
        invalid: [{ id: error.details, issue: 'level_not_found' }],
      };
    }
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === 'P0002') return { ok: false, code: 'project_not_found' };
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  const result = data as SavedJson | ConflictJson | StaleJson | null;
  if (result?.status === 'saved') {
    return {
      ok: true,
      tenantId: result.tenant_id,
      objects: result.objects.map((o) => ({ id: o.object_id, updatedSeq: o.updated_seq })),
    };
  }
  if (result?.status === 'conflict') {
    return {
      ok: false,
      code: 'save_conflict',
      conflicts: result.conflicts.map((c) => ({ id: c.object_id, serverSeq: c.server_seq })),
    };
  }
  if (result?.status === 'stale_lock_epoch') return { ok: false, code: 'stale_lock_epoch' };
  throw new Error('save_objects_unexpected_result');
}

export async function createCheckpoint(
  client: SupabaseClient<Database>,
  projectId: string,
): Promise<CheckpointResult> {
  const { data, error } = await client.rpc('create_checkpoint', { p_project: projectId });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === 'P0002') return { ok: false, code: 'project_not_found' };
    throw error;
  }
  if (typeof data !== 'string') throw new Error('create_checkpoint_unexpected_result');
  return { ok: true, versionId: data };
}
