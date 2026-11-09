// EZD-120b Build step 4 (vault/plans/EZD-120b.md section 3 outbox and storage rows; Decided "Batch",
// "Request", "classifySave"; 03b rules 6, 9; Q-0503): the device outbox's types and the pure rules the sync
// uses. No React, no IndexedDB; the storage is passed in (outbox-idb.ts in the browser).
import type { Change } from '../../editor/model/patches';
import type { LoadedObject, ObjectValue } from './model-api';

// EZD-120d: the header every save carries, so the route can refuse a save from a different signed-in person.
export const MEMBERSHIP_HEADER = 'x-ezdraft-membership';

export type Actor = { appUserId: string; tenantId: string; membershipId: string };

export type OutboxEntry = {
  projectId: string;
  id: string;
  baseSeq: number;
  lockEpoch: number;
  value: ObjectValue | null;
  rev: number;
  queuedAt: number;
};

export type RefusedCode =
  | 'invalid_input'
  | 'invalid_object'
  | 'not_signed_in'
  | 'permission_denied'
  | 'project_not_found'
  | 'stale_lock_epoch'
  | 'save_conflict'
  // EZD-299a Build step 13 (Q-0626): a save from an older app build.
  | 'app_outdated';

// EZD-299b Build step 2 (vault/plans/EZD-299b.md section 3 types row; Decided D-Key, D-Move, D-Server; Q-0631 (b)):
// a change the server refused for good, kept on the device in the conflict list.
export type DeviceConflictReason = 'conflict' | 'invalid' | 'not_editable' | 'not_open';

export type DeviceConflict = {
  projectId: string;
  objectId: string;
  reason: DeviceConflictReason;
  baseSeq: number;
  serverSeq: number | null;
  lockEpoch: number;
  value: ObjectValue | null;
  refusedAt: number;
  state: 'listed' | 'requeued';
  server: 'pending' | 'recorded' | 'device';
  serverId: string | null;
};

export type ConflictKey = { projectId: string; objectId: string };

export type ConflictMove = {
  entry: OutboxEntry;
  reason: DeviceConflictReason;
  serverSeq: number | null;
};

export type ConflictServerUpdate = ConflictKey & {
  refusedAt: number;
  server: 'recorded' | 'device';
  serverId: string | null;
  reason?: DeviceConflictReason;
};

export type ConflictOrphan = ConflictKey & { serverId: string | null };

// EZD-299b Decided D-Guard: a delete guarded by the refusal it was read at (absent deletes what is stored).
export type ConflictDelete = ConflictKey & { refusedAt?: number | null };

export type SaveOutcome =
  | { kind: 'saved'; objects: { id: string; updatedSeq: number }[] }
  | {
      kind: 'refused';
      code: RefusedCode;
      // EZD-299b Decided D-Classify: the objects a save conflict or a schema check named.
      conflicts?: { id: string; serverSeq: number }[];
      invalid?: { id: string; issue: string }[];
    }
  | { kind: 'failed' };

export type Batch = {
  projectId: string;
  lockEpoch: number;
  send: OutboxEntry[];
  drop: OutboxEntry[];
};

export type OutboxStorage = {
  put(projectId: string, lockEpoch: number, changes: Change[], now: number): Promise<void>;
  list(): Promise<OutboxEntry[]>;
  commit(
    projectId: string,
    sent: OutboxEntry[],
    saved: { id: string; updatedSeq: number }[],
  ): Promise<void>;
  drop(entries: OutboxEntry[]): Promise<void>;
  replaceMirror(projectId: string, objects: LoadedObject[]): Promise<void>;
  // EZD-299b section 3 storage row: the conflict list on the device.
  moveToConflicts(moves: ConflictMove[], now: number): Promise<void>;
  listConflicts(): Promise<DeviceConflict[]>;
  setConflictServer(updates: ConflictServerUpdate[]): Promise<ConflictOrphan[]>;
  deleteConflicts(keys: ConflictDelete[]): Promise<ConflictKey[]>;
  requeue(row: DeviceConflict, baseSeq: number, now: number): Promise<{ kept: boolean }>;
  setMirror(
    projectId: string,
    objectId: string,
    value: ObjectValue | null,
    updatedSeq: number,
  ): Promise<void>;
  close(): void;
};

// Build choice (Decided "Batch"): the most changes one save request carries.
export const MAX_CHANGES_PER_SAVE = 100;

// Decided "Batch": queue order is queuedAt, then project id, then object id.
const byQueue = (a: OutboxEntry, b: OutboxEntry) =>
  a.queuedAt - b.queuedAt ||
  (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Decided "Batch": the oldest entry's project and lock generation, at most MAX_CHANGES_PER_SAVE; a delete of an
// object the server never saved (baseSeq 0) is dropped, not sent (P120a parseSaveRequest).
export function pickBatch(entries: OutboxEntry[]): Batch | null {
  const sorted = [...entries].sort(byQueue);
  const first = sorted[0];
  if (first === undefined) return null;
  const send: OutboxEntry[] = [];
  const drop: OutboxEntry[] = [];
  for (const e of sorted) {
    if (send.length + drop.length >= MAX_CHANGES_PER_SAVE) break;
    if (e.projectId !== first.projectId || e.lockEpoch !== first.lockEpoch) continue;
    if (e.value === null && e.baseSeq === 0) drop.push(e);
    else send.push(e);
  }
  return { projectId: first.projectId, lockEpoch: first.lockEpoch, send, drop };
}

const REFUSED_CODES: readonly RefusedCode[] = [
  'invalid_input',
  'invalid_object',
  'not_signed_in',
  'permission_denied',
  'project_not_found',
  'stale_lock_epoch',
  'save_conflict',
  'app_outdated',
];

// The code each refusing status answers with when its body names none of the known codes.
const STATUS_CODES: Record<number, RefusedCode> = {
  400: 'invalid_input',
  401: 'not_signed_in',
  403: 'permission_denied',
  404: 'project_not_found',
  409: 'save_conflict',
};

const isRefusedCode = (c: unknown): c is RefusedCode =>
  typeof c === 'string' && (REFUSED_CODES as readonly string[]).includes(c);

const isSavedList = (o: unknown): o is { id: string; updatedSeq: number }[] =>
  Array.isArray(o) &&
  o.every(
    (x: unknown) =>
      typeof x === 'object' &&
      x !== null &&
      typeof (x as { id?: unknown }).id === 'string' &&
      typeof (x as { updatedSeq?: unknown }).updatedSeq === 'number',
  );

const isConflictList = (o: unknown): o is { id: string; serverSeq: number }[] =>
  Array.isArray(o) &&
  o.every(
    (x: unknown) =>
      typeof x === 'object' &&
      x !== null &&
      typeof (x as { id?: unknown }).id === 'string' &&
      typeof (x as { serverSeq?: unknown }).serverSeq === 'number',
  );

const isInvalidList = (o: unknown): o is { id: string; issue: string }[] =>
  Array.isArray(o) &&
  o.every(
    (x: unknown) =>
      typeof x === 'object' &&
      x !== null &&
      typeof (x as { id?: unknown }).id === 'string' &&
      typeof (x as { issue?: unknown }).issue === 'string',
  );

export function classifySave(status: number, body: unknown): SaveOutcome {
  if (status === 200) {
    const objects = (body as { objects?: unknown } | null)?.objects;
    return isSavedList(objects) ? { kind: 'saved', objects } : { kind: 'failed' };
  }
  const fallback = STATUS_CODES[status];
  if (fallback === undefined) return { kind: 'failed' };
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  const refusedCode = isRefusedCode(code) ? code : fallback;
  // EZD-299b Decided D-Classify: the lists only for their own status and code; else the key is absent.
  if (status === 409 && refusedCode === 'save_conflict') {
    const conflicts = (body as { conflicts?: unknown } | null)?.conflicts;
    if (isConflictList(conflicts)) return { kind: 'refused', code: refusedCode, conflicts };
  }
  if (status === 400 && refusedCode === 'invalid_object') {
    const invalid = (body as { invalid?: unknown } | null)?.invalid;
    if (isInvalidList(invalid)) return { kind: 'refused', code: refusedCode, invalid };
  }
  return { kind: 'refused', code: refusedCode };
}
