// EZD-299a Build step 6 (vault/plans/EZD-299a.md section 3 types row; Decided D-Cap, D-Labels, D-Link; Q-0511 b;
// Q-0540; Q-0625; Q-0632 (a)): the conflict list's shared types, caps and object labels. Browser and server; no
// React, no Supabase.
import type { MessageKey } from '../../server/messages/catalog';
import type { MessageParams } from '../messages/types';
import type { ObjectValue } from '../outbox/model-api';

export type SyncConflictReason = 'conflict' | 'invalid' | 'not_editable';

export type MineChange = { deleted: true } | ({ deleted: false } & ObjectValue);

export type RecordedChange = {
  id: string;
  baseSeq: number;
  reason: SyncConflictReason;
} & MineChange;

export type RecordRequest = { changes: RecordedChange[] };

export type SavedValue =
  { updatedSeq: number; deleted: true } | ({ updatedSeq: number; deleted: false } & ObjectValue);

export type SyncConflictItem = {
  id: string;
  projectId: string;
  projectName: string | null;
  objectId: string;
  reason: SyncConflictReason | 'not_open';
  baseSeq: number;
  mine: MineChange | null;
  saved: SavedValue | null;
  savedBy: string | null;
  savedAt: string | null;
  clientName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncConflictParams = { count: string; names: string; more: string };

export type ObjectLabel = { key: MessageKey; params: MessageParams } | { text: string };

// D-Cap: the most changes one record call carries (ten full saves of MAX_CHANGES_PER_SAVE).
export const MAX_RECORD_CHANGES = 1000;
// D-Cap: the most UTF-8 bytes of JSON.stringify(data) one recorded change may carry.
export const MAX_RECORD_DATA_BYTES = 65536;
// D-Link: the query the notification's link adds to the project page to open the list.
export const CONFLICT_LIST_QUERY = 'conflicts=open';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const label = (key: MessageKey, params: MessageParams = {}): ObjectLabel => ({ key, params });

const numbered = (
  attributes: Record<string, unknown>,
  key: MessageKey,
  unnumbered: MessageKey,
): ObjectLabel => {
  const n = attributes.number;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0
    ? label(key, { number: n })
    : label(unnumbered);
};

const named = (name: unknown, unnamed: MessageKey): ObjectLabel =>
  typeof name === 'string' && name !== '' ? { text: name } : label(unnamed);

// D-Labels: read raw, never parsed.
export function objectLabel(value: { type: string; data: unknown } | null): ObjectLabel {
  if (value === null || !isRecord(value.data)) return label('office.conflicts.object.other');
  const data = value.data;
  const attributes = isRecord(data.attributes) ? data.attributes : {};
  switch (value.type) {
    case 'wall':
      return numbered(
        attributes,
        'office.conflicts.object.wall',
        'office.conflicts.object.wall_unnumbered',
      );
    case 'opening':
      if (attributes.kind === 'door')
        return numbered(
          attributes,
          'office.conflicts.object.door',
          'office.conflicts.object.door_unnumbered',
        );
      if (attributes.kind === 'window')
        return numbered(
          attributes,
          'office.conflicts.object.window',
          'office.conflicts.object.window_unnumbered',
        );
      return label('office.conflicts.object.other');
    case 'room':
      return named(attributes.name, 'office.conflicts.object.room_unnamed');
    case 'floor':
      return named(data.name, 'office.conflicts.object.floor_unnamed');
    default:
      return label('office.conflicts.object.other');
  }
}
