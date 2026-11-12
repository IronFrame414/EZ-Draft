// EZD-299 U1-U3 (vault/plans/EZD-299.md section 4; AC-EZD-299-8, -6; Decided D-Present, D-Read, D-Fields, D-Chips,
// D-Why, D-Groups, D-Outdated). Expected values come from the plan's rows (formatLength per EZD-201 E9; 1/64" per
// 03g), never from running the code.
import { createWallData } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { OutboxEntry } from '../outbox/outbox';
import type { LoadedObject } from '../outbox/model-api';
import type { MineChange, SavedValue } from './conflicts';
import {
  conflictRowView,
  countForProject,
  groupConflicts,
  outdatedInputs,
  type ConflictViewInput,
  type ConflictViewReason,
} from './conflict-view';

const P = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const Q = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const R = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const S = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LEVEL = '99999999-9999-4999-8999-999999999999';

type WallOpts = {
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  thickness?: number;
  height?: number;
  bearing?: boolean;
  number?: number;
};

function wallData(o: WallOpts = {}): Record<string, unknown> {
  const made = createWallData({
    start: o.start ?? { x: 0, y: 0 },
    end: o.end ?? { x: 150, y: 0 },
    level: LEVEL,
  });
  if (!made.ok) throw new Error(made.reason);
  const data = made.data as unknown as { attributes: Record<string, unknown> };
  return {
    ...data,
    attributes: {
      ...data.attributes,
      number: o.number ?? 4,
      ...(o.thickness !== undefined ? { thickness: o.thickness } : {}),
      ...(o.height !== undefined ? { height: o.height } : {}),
      ...(o.bearing !== undefined ? { bearing: o.bearing } : {}),
    },
  };
}

type Value = { type: string; schemaVersion: number; data: Record<string, unknown> };
const wall = (o: WallOpts = {}): Value => ({ type: 'wall', schemaVersion: 1, data: wallData(o) });
const mineOf = (v: Value): MineChange => ({ deleted: false, ...v });
const savedOf = (v: Value, seq = 3): SavedValue => ({ updatedSeq: seq, deleted: false, ...v });
const DELETED_MINE: MineChange = { deleted: true };
const DELETED_SAVED: SavedValue = { updatedSeq: 5, deleted: true };

type OpeningOpts = { kind: 'door' | 'window'; number: number; width: number; sill?: number };
const opening = (o: OpeningOpts): Value => ({
  type: 'opening',
  schemaVersion: 1,
  data: {
    geometry: { center: { x: 60, y: 0 }, hostWallId: LEVEL },
    status: 'new',
    level: LEVEL,
    attributes: {
      kind: o.kind,
      number: o.number,
      width: o.width,
      height: 80,
      sillHeight: o.sill ?? 0,
    },
  },
});

function input(over: Partial<ConflictViewInput> & { objectId?: string }): ConflictViewInput {
  const objectId = over.objectId ?? 'w1';
  const projectId = over.projectId ?? P;
  return {
    key: `${projectId}/${objectId}`,
    projectId,
    projectName: null,
    objectId,
    reason: 'conflict',
    mine: null,
    saved: null,
    actions: [],
    savedBy: null,
    savedAt: null,
    clientName: null,
    ...over,
  };
}

const view = (
  mine: MineChange | null,
  saved: SavedValue | null,
  reason: ConflictViewReason = 'conflict',
) => conflictRowView(input({ mine, saved, reason }));

describe('EZD-299 conflict row view', () => {
  it('U1 (a) a moved end is a Length change with chips', () => {
    const v = view(mineOf(wall()), savedOf(wall({ end: { x: 144, y: 0 } })));
    expect(v.label).toEqual({ key: 'office.conflicts.object.wall', params: { number: 4 } });
    expect(v.noun).toBe('wall');
    expect(v.icon).toBe('view_column_2');
    expect(v.fields).toEqual(['length']);
    expect(v.yours).toEqual({ kind: 'length', text: `12' 6"` });
    expect(v.saved).toEqual({ kind: 'length', text: `12' 0"` });
    expect(v.why).toBeNull();
    expect(v.hint).toBeNull();
  });

  it('U1 (b) thickness 6 against 4.5', () => {
    const v = view(mineOf(wall({ thickness: 6 })), savedOf(wall({ thickness: 4.5 })));
    expect(v.fields).toEqual(['thickness']);
    expect(v.yours).toEqual({ kind: 'length', text: '6"' });
    expect(v.saved).toEqual({ kind: 'length', text: '4 1/2"' });
  });

  it('U1 (c) every differing field is kept, in order', () => {
    const v = view(
      mineOf(wall({ height: 97 })),
      savedOf(wall({ end: { x: 144, y: 0 }, height: 96 })),
    );
    expect(v.fields).toEqual(['length', 'height']);
    expect(v.yours).toEqual({ kind: 'length', text: `12' 6"` });
    expect(v.saved).toEqual({ kind: 'length', text: `12' 0"` });
  });

  it('U1 (d) a move with the same length is Position, with no chips', () => {
    const v = view(
      mineOf(wall({ start: { x: 12, y: 0 }, end: { x: 162, y: 0 } })),
      savedOf(wall()),
    );
    expect(v.fields).toEqual(['position']);
    expect(v.yours).toBeNull();
    expect(v.saved).toBeNull();
  });

  it('U1 (e) a difference under 1/64 inch is not a difference', () => {
    const v = view(mineOf(wall({ end: { x: 150.01, y: 0 } })), savedOf(wall()));
    expect(v.fields).toEqual(['details']);
  });

  it('U1 (f) a change outside the named fields is Details', () => {
    const v = view(mineOf(wall({ bearing: true })), savedOf(wall({ bearing: false })));
    expect(v.fields).toEqual(['details']);
  });

  it('U1 (g) they deleted a door', () => {
    const v = view(mineOf(opening({ kind: 'door', number: 2, width: 36 })), DELETED_SAVED);
    expect(v.label).toEqual({ key: 'office.conflicts.object.door', params: { number: 2 } });
    expect(v.noun).toBe('door');
    expect(v.icon).toBe('door_front');
    expect(v.fields).toEqual(['width']);
    expect(v.yours).toEqual({ kind: 'length', text: `3' 0"` });
    expect(v.saved).toEqual({ kind: 'deleted' });
    expect(v.why).toBe('they_deleted');
    expect(v.hint).toBe('brings_back');
  });

  it('U1 (h) you deleted a window', () => {
    const v = view(DELETED_MINE, savedOf(opening({ kind: 'window', number: 3, width: 42 })));
    expect(v.label).toEqual({ key: 'office.conflicts.object.window', params: { number: 3 } });
    expect(v.noun).toBe('window');
    expect(v.icon).toBe('window');
    expect(v.fields).toEqual(['width']);
    expect(v.yours).toEqual({ kind: 'deleted' });
    expect(v.saved).toEqual({ kind: 'length', text: `3' 6"` });
    expect(v.why).toBe('you_deleted');
    expect(v.hint).toBe('deletes_theirs');
  });

  it('U1 (i) an invalid change shows Yours only', () => {
    const v = view(mineOf(wall({ height: 96 })), savedOf(wall({ height: 97 })), 'invalid');
    expect(v.fields).toEqual(['height']);
    expect(v.yours).toEqual({ kind: 'length', text: `8' 0"` });
    expect(v.saved).toBeNull();
    expect(v.why).toBe('invalid');
    expect(v.hint).toBeNull();
  });

  it('U1 (j) a not-open change with no saved value is a Length change', () => {
    const v = view(mineOf(wall({ end: { x: 112, y: 0 } })), null, 'not_open');
    expect(v.fields).toEqual(['length']);
    expect(v.yours).toEqual({ kind: 'length', text: `9' 4"` });
    expect(v.saved).toBeNull();
    expect(v.why).toBe('not_open');
  });

  it('U1 (k) nothing on either side is an Object with no fields', () => {
    const v = view(null, null, 'not_open');
    expect(v.label).toMatchObject({ key: 'office.conflicts.object.other' });
    expect(v.icon).toBe('category');
    expect(v.noun).toBe('object');
    expect(v.fields).toEqual([]);
    expect(v.yours).toBeNull();
    expect(v.saved).toBeNull();
    expect(v.why).toBe('not_open');
  });

  it('U1 (l) a negative height reads as unreadable and never throws', () => {
    const run = () => view(mineOf(wall({ height: -1 })), savedOf(wall({ height: 96 })), 'invalid');
    expect(run).not.toThrow();
    const v = run();
    expect(v.fields).toEqual(['height']);
    expect(v.yours).toBeNull();
  });

  it('U1 (m) a sill height change', () => {
    const v = view(
      mineOf(opening({ kind: 'door', number: 2, width: 36, sill: 30 })),
      savedOf(opening({ kind: 'door', number: 2, width: 36, sill: 36 })),
    );
    expect(v.fields).toEqual(['sill_height']);
    expect(v.yours).toEqual({ kind: 'length', text: `2' 6"` });
    expect(v.saved).toEqual({ kind: 'length', text: `3' 0"` });
  });

  it('U1 (n) two rooms are Details, labelled by name', () => {
    const room: Value = {
      type: 'room',
      schemaVersion: 1,
      data: { attributes: { name: 'Room 2' } },
    };
    const v = view(mineOf(room), savedOf(room));
    expect(v.label).toEqual({ text: 'Room 2' });
    expect(v.icon).toBe('rectangle');
    expect(v.fields).toEqual(['details']);
  });

  it('U1 (o) data that is not an object never throws', () => {
    const bad = { type: 'wall', schemaVersion: 1, data: 'x' } as unknown as Value;
    const run = () => view(mineOf(bad), savedOf(bad));
    expect(run).not.toThrow();
    const v = run();
    expect(v.label).toMatchObject({ key: 'office.conflicts.object.other' });
    expect(v.icon).toBe('view_column_2');
    expect(v.fields).toEqual(['details']);
    expect(v.yours).toBeNull();
    expect(v.saved).toBeNull();
  });

  it('U1 copies savedBy, savedAt and clientName from the input', () => {
    const v = conflictRowView(
      input({
        mine: mineOf(wall()),
        saved: savedOf(wall({ thickness: 6 })),
        savedBy: 'Dana Ruiz',
        savedAt: '2026-11-07T14:55:00.000Z',
        clientName: 'Client B',
        projectName: 'Primary bath',
      }),
    );
    expect(v.savedBy).toBe('Dana Ruiz');
    expect(v.savedAt).toBe('2026-11-07T14:55:00.000Z');
    expect(v.clientName).toBe('Client B');
    expect(v.projectName).toBe('Primary bath');
    expect(v.key).toBe(`${P}/w1`);
  });
});

describe('EZD-299 conflict groups', () => {
  const A = input({ objectId: 'a', mine: mineOf(wall()), saved: savedOf(wall({ thickness: 6 })) });
  const B = input({
    projectId: Q,
    objectId: 'b',
    projectName: 'Primary bath',
    mine: mineOf(wall()),
  });
  const C = input({ projectId: R, objectId: 'c', reason: 'not_open', mine: mineOf(wall()) });
  const D = input({
    key: `outdated:${P}/d`,
    objectId: 'd',
    reason: 'outdated',
    mine: mineOf(wall()),
    actions: ['reload'],
  });
  const E = input({ projectId: S, objectId: 'e', reason: 'not_open', mine: mineOf(wall()) });
  const all = [A, B, C, D, E];
  const keys = (rows: { key: string }[]) => rows.map((r) => r.key);

  it('U2 groups in order this, other, not_open; open id compared in lower case', () => {
    const r = groupConflicts(all, P.toUpperCase(), 50);
    expect(r.groups.map((g) => g.kind)).toEqual(['this', 'other', 'not_open']);
    expect(r.groups.map((g) => g.count)).toEqual([2, 1, 2]);
    expect(keys(r.groups[0].rows)).toEqual([A.key, D.key]);
    expect(keys(r.groups[1].rows)).toEqual([B.key]);
    expect(keys(r.groups[2].rows)).toEqual([C.key, E.key]);
    expect(r.total).toBe(5);
    expect(r.more).toBe(false);
    expect(countForProject(all, P.toUpperCase())).toBe(2);
  });

  it('U2 a page of 3 leaves the not_open group out and counts the full groups', () => {
    const r = groupConflicts(all, P, 3);
    expect(r.groups.map((g) => g.kind)).toEqual(['this', 'other']);
    expect(keys(r.groups[0].rows)).toEqual([A.key, D.key]);
    expect(keys(r.groups[1].rows)).toEqual([B.key]);
    expect(r.groups[1].count).toBe(1);
    expect(r.total).toBe(5);
    expect(r.more).toBe(true);
  });

  it('U2 an empty list and a limit of 0', () => {
    expect(groupConflicts([], P, 50)).toEqual({ groups: [], total: 0, more: false });
    const zero = groupConflicts(all, P, 0);
    expect(zero.groups).toEqual([]);
    expect(zero.total).toBe(5);
    expect(zero.more).toBe(true);
  });
});

describe('EZD-299 outdated inputs', () => {
  const e1: OutboxEntry = {
    projectId: P,
    id: 'w1',
    baseSeq: 1,
    lockEpoch: 0,
    value: wall({ height: 97 }),
    rev: 1,
    queuedAt: 2,
  };
  const e2: OutboxEntry = {
    projectId: Q,
    id: 'x',
    baseSeq: 1,
    lockEpoch: 0,
    value: null,
    rev: 1,
    queuedAt: 3,
  };
  const loadedW1: LoadedObject = { id: 'w1', updatedSeq: 4, ...wall({ height: 96 }) };

  it('U3 newest first, prefixed keys, mine and saved as the plan gives', () => {
    expect(outdatedInputs([], P, [loadedW1])).toEqual([]);
    const r = outdatedInputs([e1, e2], P, [loadedW1]);
    expect(r.map((x) => x.key)).toEqual([`outdated:${Q}/x`, `outdated:${P}/w1`]);
    const [x, w1] = r;
    expect(x.mine).toEqual({ deleted: true });
    expect(x.saved).toBeNull();
    expect(w1.saved).toEqual({
      updatedSeq: 4,
      deleted: false,
      type: 'wall',
      schemaVersion: 1,
      data: loadedW1.data,
    });
    expect(w1.mine).toEqual({ deleted: false, ...wall({ height: 97 }) });
    for (const row of r) {
      expect(row.reason).toBe('outdated');
      expect(row.actions).toEqual(['reload']);
      expect(row.projectName).toBeNull();
      expect(row.savedBy).toBeNull();
      expect(row.savedAt).toBeNull();
      expect(row.clientName).toBeNull();
    }
    const v = conflictRowView(w1);
    expect(v.fields).toEqual(['height']);
    expect(v.saved).toBeNull();
    expect(v.why).toBe('outdated');
  });
});
