// EZD-299 Build step 4 (vault/plans/EZD-299.md section 3 C1-C3; Decided D-Inputs, D-Outdated, D-Present, D-Read,
// D-Fields, D-Chips, D-Why, D-Groups; Q-0511; Q-0540; Q-0628 (b); Q-0631 (b); Q-0632 (a)): what the conflict list
// shows for each row, its groups and pages, and the older-version rows. Pure, no React; never throws on any data.
import {
  PLAN_DISPLAY_DENOMINATOR,
  coordsEqual,
  formatLength,
  pointsEqual,
  wallLength,
} from '@ezdraft/geometry';
import type { IconName } from '../../components/icon/icon-names.generated';
import type { LoadedObject } from '../outbox/model-api';
import type { DeviceConflictReason, OutboxEntry } from '../outbox/outbox';
import type { ConflictAction } from './conflict-list';
import { objectLabel, type MineChange, type ObjectLabel, type SavedValue } from './conflicts';

export const CONFLICT_PAGE_SIZE = 50;

export type RowAction = ConflictAction | 'reload';

export type ConflictViewReason = DeviceConflictReason | 'outdated';

export type ConflictViewInput = {
  key: string;
  projectId: string;
  projectName: string | null;
  objectId: string;
  reason: ConflictViewReason;
  mine: MineChange | null;
  saved: SavedValue | null;
  actions: readonly RowAction[];
  savedBy: string | null;
  savedAt: string | null;
  clientName: string | null;
};

export type ConflictField =
  'length' | 'thickness' | 'height' | 'width' | 'sill_height' | 'position' | 'details';

export type ConflictNoun = 'wall' | 'door' | 'window' | 'room' | 'floor' | 'object';

export type ChipValue = { kind: 'length'; text: string } | { kind: 'deleted' };

export type ConflictWhy =
  'they_deleted' | 'you_deleted' | 'invalid' | 'outdated' | 'not_open' | 'not_editable';

export type ConflictRowView = {
  key: string;
  projectId: string;
  objectId: string;
  projectName: string | null;
  clientName: string | null;
  label: ObjectLabel;
  noun: ConflictNoun;
  icon: IconName;
  fields: ConflictField[];
  yours: ChipValue | null;
  saved: ChipValue | null;
  why: ConflictWhy | null;
  hint: 'brings_back' | 'deletes_theirs' | null;
  actions: readonly RowAction[];
  savedBy: string | null;
  savedAt: string | null;
};

export type ConflictGroupKind = 'this' | 'other' | 'not_open';

export type ConflictGroupView = { kind: ConflictGroupKind; count: number; rows: ConflictRowView[] };

type Present = { type: string; data: unknown };

type ReadPoint = { x: number; y: number } | null;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// D-Present: a value that is not deleted, as its type and data.
const present = (x: MineChange | SavedValue | null): Present | null =>
  x !== null && x.deleted === false ? { type: x.type, data: x.data } : null;

const recordAt = (v: unknown, key: string): Record<string, unknown> => {
  if (!isRecord(v)) return {};
  const inner = v[key];
  return isRecord(inner) ? inner : {};
};

const attributesOf = (p: Present) => recordAt(p.data, 'attributes');
const geometryOf = (p: Present) => recordAt(p.data, 'geometry');

// D-Read: a length is a finite number >= 0, else null.
const readLength = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

const readPoint = (v: unknown): ReadPoint =>
  isRecord(v) &&
  typeof v.x === 'number' &&
  Number.isFinite(v.x) &&
  typeof v.y === 'number' &&
  Number.isFinite(v.y)
    ? { x: v.x, y: v.y }
    : null;

const sameLength = (a: number | null, b: number | null): boolean =>
  a === null || b === null ? a === b : coordsEqual(a, b);

const samePoint = (a: ReadPoint, b: ReadPoint): boolean =>
  a === null || b === null ? a === b : pointsEqual(a, b);

const wallLengthOf = (p: Present): number | null => {
  const g = geometryOf(p);
  const start = readPoint(g.start);
  const end = readPoint(g.end);
  return start === null || end === null ? null : readLength(wallLength({ start, end }));
};

type LengthField = 'length' | 'thickness' | 'height' | 'width' | 'sill_height';

const LENGTH_FIELDS: readonly LengthField[] = [
  'length',
  'thickness',
  'height',
  'width',
  'sill_height',
];

const readField = (p: Present, field: LengthField): number | null => {
  const a = attributesOf(p);
  switch (field) {
    case 'length':
      return wallLengthOf(p);
    case 'thickness':
      return readLength(a.thickness);
    case 'height':
      return readLength(a.height);
    case 'width':
      return readLength(a.width);
    case 'sill_height':
      return readLength(a.sillHeight);
  }
};

const differs = (mine: Present, saved: Present, field: LengthField) =>
  !sameLength(readField(mine, field), readField(saved, field));

// D-Fields.
function fieldsOf(mine: Present | null, saved: Present | null): ConflictField[] {
  if (mine !== null && saved !== null) {
    if (mine.type !== saved.type) return ['details'];
    const fields: ConflictField[] = [];
    if (mine.type === 'wall') {
      for (const f of ['length', 'thickness', 'height'] as const) {
        if (differs(mine, saved, f)) fields.push(f);
      }
      if (!fields.includes('length')) {
        const gm = geometryOf(mine);
        const gs = geometryOf(saved);
        if (
          !samePoint(readPoint(gm.start), readPoint(gs.start)) ||
          !samePoint(readPoint(gm.end), readPoint(gs.end))
        )
          fields.push('position');
      }
    } else if (mine.type === 'opening') {
      for (const f of ['width', 'height', 'sill_height'] as const) {
        if (differs(mine, saved, f)) fields.push(f);
      }
      const gm = geometryOf(mine);
      const gs = geometryOf(saved);
      if (!samePoint(readPoint(gm.center), readPoint(gs.center)) || gm.hostWallId !== gs.hostWallId)
        fields.push('position');
    }
    return fields.length > 0 ? fields : ['details'];
  }
  const one = mine ?? saved;
  if (one?.type === 'wall') return ['length'];
  if (one?.type === 'opening') return ['width'];
  return [];
}

// D-Present: the noun and icon of a value.
function nounOf(p: Present | null): { noun: ConflictNoun; icon: IconName } {
  switch (p?.type) {
    case 'wall':
      return { noun: 'wall', icon: 'view_column_2' };
    case 'opening': {
      const kind = attributesOf(p).kind;
      if (kind === 'door') return { noun: 'door', icon: 'door_front' };
      if (kind === 'window') return { noun: 'window', icon: 'window' };
      return { noun: 'object', icon: 'category' };
    }
    case 'room':
      return { noun: 'room', icon: 'rectangle' };
    case 'floor':
      return { noun: 'floor', icon: 'layers' };
    default:
      return { noun: 'object', icon: 'category' };
  }
}

// D-Chips: one side's chip for the row's length field.
function chipOf(x: MineChange | SavedValue | null, field: LengthField | null): ChipValue | null {
  if (x === null) return null;
  if (x.deleted) return { kind: 'deleted' };
  const p = present(x);
  if (p === null || field === null) return null;
  const v = readField(p, field);
  return v === null ? null : { kind: 'length', text: formatLength(v, PLAN_DISPLAY_DENOMINATOR) };
}

const isLengthField = (f: ConflictField): f is LengthField =>
  (LENGTH_FIELDS as readonly ConflictField[]).includes(f);

export function conflictRowView(input: ConflictViewInput): ConflictRowView {
  const mine = present(input.mine);
  const saved = present(input.saved);
  const value = mine ?? saved ?? null;
  const { noun, icon } = nounOf(value);
  const fields = fieldsOf(mine, saved);
  const lengthField = fields.find(isLengthField) ?? null;

  let why: ConflictWhy | null = null;
  let hint: ConflictRowView['hint'] = null;
  if (input.reason === 'conflict') {
    if (input.saved?.deleted === true && mine !== null) {
      why = 'they_deleted';
      hint = 'brings_back';
    } else if (input.mine?.deleted === true && saved !== null) {
      why = 'you_deleted';
      hint = 'deletes_theirs';
    }
  } else {
    why = input.reason;
  }

  return {
    key: input.key,
    projectId: input.projectId,
    objectId: input.objectId,
    projectName: input.projectName,
    clientName: input.clientName,
    label: objectLabel(value),
    noun,
    icon,
    fields,
    yours: chipOf(input.mine, lengthField),
    saved: input.reason === 'conflict' ? chipOf(input.saved, lengthField) : null,
    why,
    hint,
    actions: input.actions,
    savedBy: input.savedBy,
    savedAt: input.savedAt,
  };
}

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const groupOf = (input: ConflictViewInput, openProjectId: string): ConflictGroupKind =>
  input.reason === 'not_open'
    ? 'not_open'
    : sameId(input.projectId, openProjectId)
      ? 'this'
      : 'other';

const GROUP_ORDER: readonly ConflictGroupKind[] = ['this', 'other', 'not_open'];

// D-Groups.
export function groupConflicts(
  inputs: readonly ConflictViewInput[],
  openProjectId: string,
  limit: number,
): { groups: ConflictGroupView[]; total: number; more: boolean } {
  const byGroup = new Map<ConflictGroupKind, ConflictViewInput[]>();
  for (const kind of GROUP_ORDER) byGroup.set(kind, []);
  for (const input of inputs) byGroup.get(groupOf(input, openProjectId))?.push(input);
  const groups: ConflictGroupView[] = [];
  let left = Math.max(0, limit);
  for (const kind of GROUP_ORDER) {
    const all = byGroup.get(kind) ?? [];
    const paged = all.slice(0, left);
    left -= paged.length;
    if (paged.length > 0)
      groups.push({ kind, count: all.length, rows: paged.map(conflictRowView) });
  }
  return { groups, total: inputs.length, more: inputs.length > limit };
}

export function countForProject(inputs: readonly ConflictViewInput[], projectId: string): number {
  return inputs.filter((input) => groupOf(input, projectId) === 'this').length;
}

const keyCompare = (a: OutboxEntry, b: OutboxEntry) => {
  const ka = `${a.projectId}/${a.id}`;
  const kb = `${b.projectId}/${b.id}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

// D-Outdated: the changes an older app build queued, newest first.
export function outdatedInputs(
  entries: readonly OutboxEntry[],
  openProjectId: string,
  loaded: readonly LoadedObject[],
): ConflictViewInput[] {
  return [...entries]
    .sort((a, b) => b.queuedAt - a.queuedAt || keyCompare(a, b))
    .map((e) => {
      const found = sameId(e.projectId, openProjectId)
        ? loaded.find((o) => sameId(o.id, e.id))
        : undefined;
      const mine: MineChange =
        e.value === null ? { deleted: true } : { deleted: false, ...e.value };
      const saved: SavedValue | null =
        found === undefined
          ? null
          : {
              updatedSeq: found.updatedSeq,
              deleted: false,
              type: found.type,
              schemaVersion: found.schemaVersion,
              data: found.data,
            };
      return {
        key: `outdated:${e.projectId}/${e.id}`,
        projectId: e.projectId,
        projectName: null,
        objectId: e.id,
        reason: 'outdated',
        mine,
        saved,
        actions: ['reload'],
        savedBy: null,
        savedAt: null,
        clientName: null,
      };
    });
}
