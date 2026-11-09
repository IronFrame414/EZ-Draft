// EZD-299a Build step 8 (vault/plans/EZD-299a.md section 1 S2, section 3; Decided D-Cap, D-Fit, D-Label source,
// D-Saved by, D-Errors; Q-0511 a; Q-0540; Q-0627; 03b rule 1): server-only helpers for the conflict list. Every
// read and write goes through the caller's session client to the EZD-299a definer functions; a function error
// is thrown as the PostgREST error, so the route maps its code.
import { CURRENT_SCHEMA_VERSION, parseStoredObject } from '@ezdraft/geometry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  MAX_RECORD_CHANGES,
  MAX_RECORD_DATA_BYTES,
  objectLabel,
  type MineChange,
  type RecordRequest,
  type SavedValue,
  type SyncConflictItem,
  type SyncConflictParams,
  type SyncConflictReason,
} from '../../lib/conflicts/conflicts';
import type { Database, Json } from '../db/database.types';
import { getT } from '../messages/get-t';
import { deleteChangeSchema, upsertChangeSchema } from '../model/model';

type Client = SupabaseClient<Database>;

const reasonSchema = z.enum(['conflict', 'invalid', 'not_editable']);

const recordSchema = z.strictObject({
  changes: z
    .array(
      z.discriminatedUnion('deleted', [
        deleteChangeSchema.extend({ reason: reasonSchema }),
        upsertChangeSchema.extend({ reason: reasonSchema }),
      ]),
    )
    .min(1)
    .max(MAX_RECORD_CHANGES),
});

const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length;

// The record body: the rules of record_sync_conflicts in camel keys (D-Cap: 1 to 1000 changes, each change's data
// at most 65,536 bytes of JSON; no id twice).
export function parseRecordRequest(body: unknown): RecordRequest | null {
  const parsed = recordSchema.safeParse(body);
  if (!parsed.success) return null;
  const { changes } = parsed.data;
  if (new Set(changes.map((c) => c.id.toLowerCase())).size !== changes.length) return null;
  for (const c of changes) {
    if (!c.deleted && utf8Bytes(JSON.stringify(c.data)) > MAX_RECORD_DATA_BYTES) return null;
  }
  return parsed.data;
}

// D-Fit: the notification payload's byte budget (4096 cap minus 16 for jsonb's added spaces) and label length.
const PAYLOAD_BYTES = 4080;
const LABEL_CODE_POINTS = 100;

export function fitConflictNames(labels: string[]): SyncConflictParams {
  const count = String(labels.length);
  const cut = labels.map((l) => Array.from(l).slice(0, LABEL_CODE_POINTS).join(''));
  let fitted: SyncConflictParams = { count, names: '', more: count };
  for (let i = 0; i < cut.length; i += 1) {
    const names = i === 0 ? cut[0] : `${fitted.names}, ${cut[i]}`;
    const next = { count, names, more: String(labels.length - (i + 1)) };
    if (utf8Bytes(JSON.stringify(next)) > PAYLOAD_BYTES) break;
    fitted = next;
  }
  return fitted;
}

// L-061, as OVERRIDE_READ_CHUNK in model.ts: the most ids one stored-row read names.
const LABEL_READ_CHUNK = 100;

// D-Label source: an upsert is labelled from its own value, a delete from the stored row (null when none), in
// change order, in English (office surface).
export async function labelsFor(
  client: Client,
  projectId: string,
  changes: RecordRequest['changes'],
): Promise<string[]> {
  const deletes = changes.filter((c) => c.deleted).map((c) => c.id);
  const stored = new Map<string, { type: string; data: unknown }>();
  for (let i = 0; i < deletes.length; i += LABEL_READ_CHUNK) {
    const chunk = deletes.slice(i, i + LABEL_READ_CHUNK);
    const { data, error } = await client
      .from('model_object')
      .select('object_id, type, data')
      .eq('project_id', projectId)
      .in('object_id', chunk);
    if (error) throw error;
    for (const row of data)
      stored.set(row.object_id.toLowerCase(), { type: row.type, data: row.data });
  }
  const t = getT('office', 'en');
  return changes.map((c) => {
    const label = objectLabel(
      c.deleted ? (stored.get(c.id.toLowerCase()) ?? null) : { type: c.type, data: c.data },
    );
    return 'text' in label ? label.text : t(label.key, label.params);
  });
}

type RecordJson = { ids: string[]; notification_id: string | null };

export async function recordConflicts(
  client: Client,
  projectId: string,
  req: RecordRequest,
  params: SyncConflictParams,
): Promise<{ ids: string[]; notificationId: string | null }> {
  const changes = req.changes.map((c) =>
    c.deleted
      ? { id: c.id, base_seq: c.baseSeq, reason: c.reason, deleted: true }
      : {
          id: c.id,
          base_seq: c.baseSeq,
          reason: c.reason,
          deleted: false,
          type: c.type,
          schema_version: c.schemaVersion,
          data: c.data,
        },
  );
  const { data, error } = await client.rpc('record_sync_conflicts', {
    p_project: projectId,
    p_changes: changes as Json,
    p_payload: params,
  });
  if (error) throw error;
  const result = data as RecordJson | null;
  if (result === null || !Array.isArray(result.ids))
    throw new Error('record_sync_conflicts_unexpected_result');
  return { ids: result.ids, notificationId: result.notification_id };
}

type ValueJson = {
  deleted: boolean;
  type: string | null;
  schema_version: number | null;
  data: Record<string, unknown> | null;
};

type ItemJson = {
  id: string;
  project_id: string;
  object_id: string;
  reason: SyncConflictReason | 'not_open';
  base_seq: number;
  created_at: string;
  updated_at: string;
  project_name: string | null;
  client_name: string | null;
  mine: ValueJson | null;
  saved: (ValueJson & { updated_seq: number }) | null;
  saved_at: string | null;
  saved_by: string | null;
};

function toMine(v: ValueJson | null): MineChange | null {
  if (v === null) return null;
  if (v.deleted) return { deleted: true };
  return {
    deleted: false,
    type: v.type as string,
    schemaVersion: v.schema_version as number,
    data: v.data as Record<string, unknown>,
  };
}

// Contract GET row: a saved value that is not deleted is read with parseStoredObject (upgraded to the current
// schema version); a parse failure returns the stored value unchanged.
function toSaved(
  v: (ValueJson & { updated_seq: number }) | null,
  objectId: string,
): SavedValue | null {
  if (v === null) return null;
  if (v.deleted) return { updatedSeq: v.updated_seq, deleted: true };
  const type = v.type as string;
  const schemaVersion = v.schema_version as number;
  const data = v.data as Record<string, unknown>;
  const parsed = parseStoredObject({ id: objectId, type, schema_version: schemaVersion, data });
  return parsed.ok
    ? {
        updatedSeq: v.updated_seq,
        deleted: false,
        type,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: parsed.object.data,
      }
    : { updatedSeq: v.updated_seq, deleted: false, type, schemaVersion, data };
}

export async function listConflicts(client: Client): Promise<SyncConflictItem[]> {
  const { data, error } = await client.rpc('list_my_sync_conflicts');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('list_my_sync_conflicts_unexpected_result');
  return (data as unknown as ItemJson[]).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    objectId: r.object_id,
    reason: r.reason,
    baseSeq: r.base_seq,
    mine: toMine(r.mine),
    saved: toSaved(r.saved, r.object_id),
    savedBy: r.saved_by,
    savedAt: r.saved_at,
    clientName: r.client_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function deleteConflict(client: Client, id: string): Promise<boolean> {
  const { data, error } = await client.rpc('delete_my_sync_conflict', { p_id: id });
  if (error) throw error;
  return data === true;
}
