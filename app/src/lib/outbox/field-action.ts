// EZD-1402 (phase-14 EZD-1402 "typed field actions (measurement, task check, photo pin, field-measure send) and their
// photo blobs"; 03c offline_change; 03b Architecture rule 9): the field actions a device queues without the edit
// lock, and the pure parts of the queue: order, the count and size readout. No IndexedDB here (field-queue.ts).
import type { PermissionKey } from '../permissions/catalog';

export const FIELD_ACTION_KINDS = [
  'measurement',
  'task_check',
  'photo_pin',
  'field_measure_send',
  // EZD-1409 (S17 Task row "add photo: Attaches a photo to the task. Photo notes"): ops { taskId } with one photo.
  'task_photo',
] as const;
export type FieldActionKind = (typeof FIELD_ACTION_KINDS)[number];

// The photo types the media bucket takes for field photos (JPEG, PNG; supabase migration 20261121210000).
export const FIELD_PHOTO_EXTS = ['jpg', 'png'] as const;
export type FieldPhotoExt = (typeof FIELD_PHOTO_EXTS)[number];
export const FIELD_PHOTO_TYPES: Readonly<Record<FieldPhotoExt, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
};
// The media bucket's size limit (20261102201341_set_media_bucket_limits.sql).
export const FIELD_PHOTO_MAX_BYTES = 5_000_000;

// The switch each kind needs (10 Permissions), as private.field_action_permission.
export const FIELD_ACTION_PERMISSION: Readonly<Record<FieldActionKind, PermissionKey>> = {
  task_check: 'check_off_tasks',
  photo_pin: 'photo_notes',
  task_photo: 'photo_notes',
  measurement: 'send_field_measurement',
  field_measure_send: 'send_field_measurement',
};

// queued: waiting to send. refused: the server refused it for good (kept on the device, never dropped; 03b rule 9).
export type FieldActionState = 'queued' | 'refused';

export type FieldAction = {
  id: string;
  projectId: string;
  kind: FieldActionKind;
  ops: Record<string, unknown>;
  baseVersionId: string | null;
  queuedAt: number;
  photo: { blob: Blob; ext: FieldPhotoExt } | null;
  state: FieldActionState;
  refusal: string | null;
};

export type NewFieldAction = Pick<FieldAction, 'projectId' | 'kind' | 'ops'> & {
  baseVersionId?: string | null;
  photo?: { blob: Blob; ext: FieldPhotoExt } | null;
};

export function photoExtOf(type: string): FieldPhotoExt | null {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  return null;
}

// Oldest first; equal times by id, so the order is the same on every read.
export function byQueuedAt(a: FieldAction, b: FieldAction): number {
  return a.queuedAt - b.queuedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// The JSON size of the action's record plus its photo's bytes.
export function actionBytes(a: FieldAction): number {
  const record = {
    id: a.id,
    projectId: a.projectId,
    kind: a.kind,
    ops: a.ops,
    baseVersionId: a.baseVersionId,
    queuedAt: a.queuedAt,
  };
  return new TextEncoder().encode(JSON.stringify(record)).length + (a.photo?.blob.size ?? 0);
}

export type QueueReadout = { count: number; bytes: number };

// The count and size readout (phase-14 EZD-1402) of the actions still on this device, refused ones included.
export function readout(actions: readonly FieldAction[]): QueueReadout {
  return {
    count: actions.length,
    bytes: actions.reduce((sum, a) => sum + actionBytes(a), 0),
  };
}
