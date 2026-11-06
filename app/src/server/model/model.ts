// EZD-120a Build step 6 (vault/plans/EZD-120a.md section 1 M5, M6, Decided "parseSaveRequest", "Error mapping";
// section 3 types; 03b rules 1, 5, 6, 9): server-only helpers for the working copy. Writes go through the
// caller's session client to `save_objects` and `create_checkpoint`, which check the switch and scope again.
// EZD-120b Build step 9 (vault/plans/EZD-120b.md Decided "loadModel", "Object read", "canEdit"; 03b rules 1, 5):
// `loadModel` reads the project, its lock generation and its live objects through the session client (RLS).
import { CURRENT_SCHEMA_VERSION, parseStoredObject, type ObjectIssue } from '@ezdraft/geometry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { LoadedObject, ModelLoad } from '../../lib/outbox/model-api';
import type { Database, Json } from '../db/database.types';
import { can, type PermissionContext } from '../permissions';

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

// supabase/config.toml max_rows: the most rows one select returns.
const LOAD_PAGE = 1000;

type ObjectRow = {
  object_id: string;
  type: string;
  schema_version: number;
  data: Json;
  updated_seq: number;
};

export async function loadModel(
  client: SupabaseClient<Database>,
  projectId: string,
  ctx: PermissionContext,
): Promise<ModelLoad | null> {
  const page = async (after: string | null): Promise<ObjectRow[]> => {
    const base = client
      .from('model_object')
      .select('object_id, type, schema_version, data, updated_seq')
      .eq('project_id', projectId)
      .eq('deleted', false);
    const { data, error } = await (after === null ? base : base.gt('object_id', after))
      .order('object_id')
      .limit(LOAD_PAGE);
    if (error) throw error;
    return data;
  };

  const [project, lock, firstPage] = await Promise.all([
    client
      .from('project')
      .select('id, name, tenant_id, customer!project_customer_fk(name)')
      .eq('id', projectId)
      .maybeSingle(),
    client.from('edit_lock').select('lock_epoch').eq('project_id', projectId).maybeSingle(),
    page(null),
  ]);
  if (project.error) throw project.error;
  if (lock.error) throw lock.error;
  if (project.data === null) return null;

  const rows = [...firstPage];
  let last = firstPage;
  while (last.length === LOAD_PAGE) {
    last = await page(last[last.length - 1].object_id);
    rows.push(...last);
  }

  const objects: LoadedObject[] = [];
  const invalid: ObjectIssue[] = [];
  for (const r of rows) {
    const parsed = parseStoredObject({
      id: r.object_id,
      type: r.type,
      schema_version: r.schema_version,
      data: r.data,
    });
    if (!parsed.ok) {
      invalid.push(parsed.issue);
      continue;
    }
    objects.push({
      id: r.object_id,
      updatedSeq: r.updated_seq,
      type: r.type,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: parsed.object.data,
    });
  }

  return {
    project: {
      id: project.data.id,
      name: project.data.name,
      clientName: project.data.customer?.name ?? null,
    },
    viewer: {
      appUserId: ctx.appUserId,
      tenantId: project.data.tenant_id,
      membershipId: ctx.membershipId,
      canEdit: can(ctx, 'edit_model', { projectId }),
    },
    lockEpoch: lock.data?.lock_epoch ?? 0,
    objects,
    invalid,
  };
}
