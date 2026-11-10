// EZD-120a Build step 6 (vault/plans/EZD-120a.md section 1 M5, M6, Decided "parseSaveRequest", "Error mapping";
// section 3 types; 03b rules 1, 5, 6, 9): server-only helpers for the working copy. Writes go through the
// caller's session client to `save_objects` and `create_checkpoint`, which check the switch and scope again.
// EZD-120b Build step 9 (vault/plans/EZD-120b.md Decided "loadModel", "Object read", "canEdit"; 03b rules 1, 5):
// `loadModel` reads the project, its lock generation and its live objects through the session client (RLS).
// EZD-205b Build step 9 (vault/plans/EZD-205b.md Decided "Override check", "saveObjects order"; S02 Events;
// Q-0570): a room whose closure override is new or changed must name the saving user; the stored rows are read for
// those rooms only.
// EZD-294 Build step 6 (vault/plans/EZD-294.md Decided "loadModel numbers", "Saved number"; Q-0625 (a); Q-0629 (b)):
// the load answers each key's highest number of live and deleted rows; a save answers each saved object's number.
// EZD-219 Build step 5 (vault/plans/EZD-219.md section 3): the load answers the project's plan scale; `setPlanScale`.
import {
  CURRENT_SCHEMA_VERSION,
  NO_NUMBERS,
  parseStoredObject,
  raiseNumberHighs,
  type ClosureOverride,
  type ObjectIssue,
} from '@ezdraft/geometry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { LoadedObject, ModelLoad } from '../../lib/outbox/model-api';
import { planScaleFromSettings, type PlanScale } from '../../lib/plan/plan-scale';
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

// EZD-299a Build step 7 (vault/plans/EZD-299a.md Decided D-Resolves): `resolves` names the caller's recorded
// refused changes this save settles; the save then answers which of them it removed.
export type SaveRequest = { lockEpoch: number; changes: ObjectChange[]; resolves?: string[] };

export type SaveResult =
  | {
      ok: true;
      tenantId: string;
      objects: { id: string; updatedSeq: number; number?: number }[];
      overridden: { roomId: string; gapIn: number }[];
      resolved?: string[];
    }
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

// EZD-299a Build step 7: the two branches of the change schema, exported for the record route.
export const deleteChangeSchema = z.strictObject({
  id: z.uuid(),
  baseSeq: z.number().int().min(1).max(SEQ_MAX),
  deleted: z.literal(true),
});

export const upsertChangeSchema = z.strictObject({
  id: z.uuid(),
  baseSeq: z.number().int().min(0).max(SEQ_MAX),
  deleted: z.literal(false),
  type: z.string().regex(/^[a-z][a-z0-9_]*$/),
  schemaVersion: z.number().int().min(1),
  data: z.record(z.string(), z.unknown()),
});

const changeSchema = z.discriminatedUnion('deleted', [deleteChangeSchema, upsertChangeSchema]);

const requestSchema = z.strictObject({
  lockEpoch: z.number().int().min(0),
  changes: z.array(changeSchema).min(1),
  resolves: z.array(z.uuid()).min(1).optional(),
});

export function parseSaveRequest(body: unknown): SaveRequest | null {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return null;
  const ids = new Set(parsed.data.changes.map((c) => c.id.toLowerCase()));
  if (ids.size !== parsed.data.changes.length) return null;
  // EZD-299a Decided D-Resolves: 1 to changes.length ids, no repeats (case-insensitive).
  const { resolves } = parsed.data;
  if (resolves !== undefined) {
    if (resolves.length > parsed.data.changes.length) return null;
    if (new Set(resolves.map((r) => r.toLowerCase())).size !== resolves.length) return null;
  }
  return parsed.data;
}

type SavedJson = {
  status: 'saved';
  tenant_id: string;
  objects: { object_id: string; updated_seq: number; number: number | null }[];
  resolved?: string[];
};
type ConflictJson = { status: 'conflict'; conflicts: { object_id: string; server_seq: number }[] };
type StaleJson = { status: 'stale_lock_epoch' };

// Decided "Override check": `stored` is keyed by lower-case id; `null` = a row with no override (or deleted, not a
// room, unreadable); no key = no row.
export function closureOverrideCheck(
  rooms: readonly { id: string; override: ClosureOverride | null }[],
  stored: ReadonlyMap<string, ClosureOverride | null>,
  appUserId: string,
): { invalid: ObjectIssue[]; overridden: { roomId: string; gapIn: number }[] } {
  const invalid: ObjectIssue[] = [];
  const overridden: { roomId: string; gapIn: number }[] = [];
  for (const { id, override } of rooms) {
    if (override === null) continue;
    const s = stored.get(id.toLowerCase());
    const unchanged =
      s !== undefined &&
      s !== null &&
      s.who.toLowerCase() === override.who.toLowerCase() &&
      s.when === override.when &&
      s.gap.x === override.gap.x &&
      s.gap.y === override.gap.y;
    if (unchanged) continue;
    if (override.who.toLowerCase() !== appUserId.toLowerCase())
      invalid.push({ id, issue: 'override_other_user' });
    else overridden.push({ roomId: id, gapIn: Math.hypot(override.gap.x, override.gap.y) });
  }
  return { invalid, overridden };
}

// L-061: the most ids one stored-row read names.
const OVERRIDE_READ_CHUNK = 100;

export async function saveObjects(
  client: SupabaseClient<Database>,
  projectId: string,
  req: SaveRequest,
  appUserId: string,
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

  // EZD-205b Decided "saveObjects order": the stored rows of rooms with an override, read before the rpc.
  const rooms = checked.flatMap((c) =>
    !c.deleted && c.type === 'room' && c.data.closureOverride !== null
      ? [{ id: c.id, override: c.data.closureOverride as ClosureOverride }]
      : [],
  );
  let overridden: { roomId: string; gapIn: number }[] = [];
  if (rooms.length > 0) {
    const stored = new Map<string, ClosureOverride | null>();
    for (let i = 0; i < rooms.length; i += OVERRIDE_READ_CHUNK) {
      const chunk = rooms.slice(i, i + OVERRIDE_READ_CHUNK).map((r) => r.id);
      const { data, error } = await client
        .from('model_object')
        .select('object_id, type, schema_version, data, deleted')
        .eq('project_id', projectId)
        .in('object_id', chunk);
      if (error) throw error;
      for (const row of data) {
        const key = row.object_id.toLowerCase();
        if (row.deleted) {
          stored.set(key, null);
          continue;
        }
        const parsed = parseStoredObject({
          id: row.object_id,
          type: row.type,
          schema_version: row.schema_version,
          data: row.data,
        });
        stored.set(
          key,
          parsed.ok && parsed.object.type === 'room' ? parsed.object.data.closureOverride : null,
        );
      }
    }
    const check = closureOverrideCheck(rooms, stored, appUserId);
    if (check.invalid.length > 0)
      return { ok: false, code: 'invalid_object', invalid: check.invalid };
    overridden = check.overridden;
  }

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
  // EZD-299a Build step 7: a save that settles recorded refused changes removes them in the same transaction.
  const { data, error } =
    req.resolves === undefined
      ? await client.rpc('save_objects', {
          p_project: projectId,
          p_lock_epoch: req.lockEpoch,
          p_changes: changes as Json,
        })
      : await client.rpc('save_objects_resolving', {
          p_project: projectId,
          p_lock_epoch: req.lockEpoch,
          p_changes: changes as Json,
          p_resolves: req.resolves,
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
      objects: result.objects.map((o) =>
        typeof o.number === 'number'
          ? { id: o.object_id, updatedSeq: o.updated_seq, number: o.number }
          : { id: o.object_id, updatedSeq: o.updated_seq },
      ),
      overridden,
      ...(result.resolved === undefined ? {} : { resolved: result.resolved }),
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

// EZD-219 step 5: the project's plan scale through set_plan_scale (definer; 42501, P0002, 22023).
export async function setPlanScale(
  client: SupabaseClient<Database>,
  projectId: string,
  scale: PlanScale,
): Promise<
  { ok: true } | { ok: false; code: 'permission_denied' | 'project_not_found' | 'invalid_input' }
> {
  const { error } = await client.rpc('set_plan_scale', { p_project: projectId, p_scale: scale });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === 'P0002') return { ok: false, code: 'project_not_found' };
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  return { ok: true };
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

type NumberRow = { object_id: string; type: string; number: unknown; kind: string | null };

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

  // Decided "loadModel numbers": the number and kind of each deleted wall and opening, paged as `page()`.
  const deletedPage = async (after: string | null): Promise<NumberRow[]> => {
    const base = client
      .from('model_object')
      .select('object_id, type, number:data->attributes->number, kind:data->attributes->>kind')
      .eq('project_id', projectId)
      .eq('deleted', true)
      .in('type', ['wall', 'opening']);
    const { data, error } = await (after === null ? base : base.gt('object_id', after))
      .order('object_id')
      .limit(LOAD_PAGE);
    if (error) throw error;
    return data as unknown as NumberRow[];
  };

  const [project, lock, firstPage, firstDeleted] = await Promise.all([
    client
      .from('project')
      .select('id, name, tenant_id, settings, customer!project_customer_fk(name)')
      .eq('id', projectId)
      .maybeSingle(),
    client.from('edit_lock').select('lock_epoch').eq('project_id', projectId).maybeSingle(),
    page(null),
    deletedPage(null),
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

  const deleted = [...firstDeleted];
  let lastDeleted = firstDeleted;
  while (lastDeleted.length === LOAD_PAGE) {
    lastDeleted = await deletedPage(lastDeleted[lastDeleted.length - 1].object_id);
    deleted.push(...lastDeleted);
  }

  const numberHighs = raiseNumberHighs(NO_NUMBERS, [
    ...rows.map((r) => ({ type: r.type, data: r.data })),
    ...deleted.map((r) => ({
      type: r.type,
      data: { attributes: { kind: r.kind, number: r.number } },
    })),
  ]);

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
      planScale: planScaleFromSettings(project.data.settings),
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
    numberHighs,
  };
}
