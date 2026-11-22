// EZD-1402 (03c offline_change; 03b Architecture rule 9; vault/build/assumptions.md EZD-1402): the server side of a
// queued field action. A photo is signed for upload first (start), then the action is recorded (sync), both through
// definer functions under the member's session. Errors map by code; anything else is thrown to the route.
import { z } from 'zod';
import {
  FIELD_ACTION_KINDS,
  FIELD_PHOTO_EXTS,
  type FieldActionKind,
  type FieldPhotoExt,
} from '../../lib/outbox/field-action';
import type { SignedUpload } from '../../lib/storage/upload';
import { roomsSchema } from '../../field-measure/rooms';
import { StorageError, createSignedUpload, type DbClient } from '../storage/objects';

export type FieldActionRefusal =
  'permission_denied' | 'project_not_found' | 'invalid_input' | 'photo_missing';

const UUID = z.uuid();

// The body of POST /api/projects/[id]/field-actions (what the device sends; field-sync.ts).
export const syncBodySchema = z
  .object({
    id: UUID,
    deviceId: UUID,
    kind: z.enum(FIELD_ACTION_KINDS),
    ops: z.record(z.string(), z.unknown()),
    baseVersionId: UUID.nullable(),
    queuedAt: z.number().int().nonnegative(),
    photo: z.enum(FIELD_PHOTO_EXTS).nullable(),
  })
  .strict();

export type SyncBody = z.infer<typeof syncBodySchema>;

// EZD-1417 (S17b Send to office): the ops of a field_measure_send are the rooms sent, each checked as the phone
// saves them (field-measure/rooms.ts); the database applies them to field_measure_session
// (supabase/migrations/20261121230000_field_measure_send.sql).
export const fieldMeasureSendOpsSchema = z.object({ rooms: roomsSchema }).strict();

/**
 * False when a kind's ops are known to be wrong: a field_measure_send whose rooms are not a room list. The route
 * answers 400 after its permission checks; the database itself only checks the rooms are 1 to 40 objects.
 */
export function fieldActionOpsValid(body: Pick<SyncBody, 'kind' | 'ops'>): boolean {
  return (
    body.kind !== 'field_measure_send' || fieldMeasureSendOpsSchema.safeParse(body.ops).success
  );
}

export const photoBodySchema = z
  .object({ id: UUID, kind: z.enum(FIELD_ACTION_KINDS), photo: z.enum(FIELD_PHOTO_EXTS) })
  .strict();

function refusal(error: { code?: string; message?: string }): FieldActionRefusal | null {
  if (error.code === '42501') return 'permission_denied';
  if (error.code === 'P0002') return 'project_not_found';
  if (error.code === '22023') return 'invalid_input';
  if (error.code === 'P0001' && error.message === 'photo_missing') return 'photo_missing';
  return null;
}

export type PhotoStart =
  { ok: true; upload: SignedUpload | null } | { ok: false; code: FieldActionRefusal };

// `upload` is null when the photo is already stored (a resend after the upload went through).
export async function startFieldPhoto(
  client: DbClient,
  projectId: string,
  body: { id: string; kind: FieldActionKind; photo: FieldPhotoExt },
): Promise<PhotoStart> {
  const { data, error } = await client.rpc('start_field_photo', {
    p_project: projectId,
    p_action: body.id,
    p_kind: body.kind,
    p_ext: body.photo,
  });
  if (error) {
    const code = refusal(error);
    if (code === null) throw error;
    return { ok: false, code };
  }
  const parsed = z.object({ path: z.string().min(1), stored: z.boolean() }).safeParse(data);
  if (!parsed.success) throw new Error('start_field_photo_unexpected_result');
  if (parsed.data.stored) return { ok: true, upload: null };
  try {
    return {
      ok: true,
      upload: await createSignedUpload(client, { bucket: 'media', path: parsed.data.path }),
    };
  } catch (e) {
    if (e instanceof StorageError && e.code === 'upload_refused') {
      return { ok: false, code: 'invalid_input' };
    }
    throw e;
  }
}

export type SyncResult =
  | { ok: true; status: 'synced' | 'duplicate'; syncedAt: string; tenantId: string }
  | { ok: false; code: FieldActionRefusal };

export async function syncFieldAction(
  client: DbClient,
  projectId: string,
  body: SyncBody,
): Promise<SyncResult> {
  const { data, error } = await client.rpc('sync_field_action', {
    p_id: body.id,
    p_project: projectId,
    p_device: body.deviceId,
    p_kind: body.kind,
    p_ops: body.ops as never,
    p_base_version: body.baseVersionId as string,
    p_queued_at: new Date(body.queuedAt).toISOString(),
    p_photo: body.photo as string,
  });
  if (error) {
    const code = refusal(error);
    if (code === null) throw error;
    return { ok: false, code };
  }
  const parsed = z
    .object({
      status: z.enum(['synced', 'duplicate']),
      syncedAt: z.string().min(1),
      tenantId: UUID,
    })
    .safeParse(data);
  if (!parsed.success) throw new Error('sync_field_action_unexpected_result');
  return { ok: true, ...parsed.data };
}
