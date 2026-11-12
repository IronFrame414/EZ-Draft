// EZD-120a U1 (vault/plans/EZD-120a.md section 4; AC-EZD-120a-1, -3). Expected values: Decided
// "parseSaveRequest" (zod strictObject; lockEpoch int >= 0; changes an array, min 1; delete: baseSeq >= 1;
// upsert: baseSeq >= 0, type /^[a-z][a-z0-9_]*$/, schemaVersion >= 1, data an object; a repeated id -> null).
import type { ClosureOverride } from '@ezdraft/geometry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/database.types';
import {
  closureOverrideCheck,
  parseSaveRequest,
  saveObjects,
  type ObjectChange,
  type SaveRequest,
} from './model';

const ID1 = '3f2b8c1e-5a4d-4e6f-8a7b-9c0d1e2f3a4b';
const ID2 = '4a3c9d2f-6b5e-4f70-9b8c-0d1e2f3a4b5c';
const upsertChange = (extra: Record<string, unknown> = {}) => ({
  id: ID1,
  baseSeq: 0,
  deleted: false,
  type: 'wall',
  schemaVersion: 1,
  data: { length: 10 },
  ...extra,
});
const deleteChange = (extra: Record<string, unknown> = {}) => ({
  id: ID1,
  baseSeq: 1,
  deleted: true,
  ...extra,
});
const body = (changes: unknown, extra: Record<string, unknown> = {}) => ({
  lockEpoch: 0,
  changes,
  ...extra,
});

describe('EZD-120a parseSaveRequest', () => {
  it('U1 parses an upsert, a delete and an upper-case uuid', () => {
    const a = parseSaveRequest(body([upsertChange()]));
    expect(a).not.toBeNull();
    expect(a).toEqual(body([upsertChange()]));
    const b = parseSaveRequest(body([deleteChange()], { lockEpoch: 3 }));
    expect(b).toEqual(body([deleteChange()], { lockEpoch: 3 }));
    const c = parseSaveRequest(body([upsertChange({ id: ID1.toUpperCase() })]));
    expect(c).not.toBeNull();
  });

  it('U1 returns null for every refused body', () => {
    const refused: [string, unknown][] = [
      ['empty object', {}],
      ['empty changes', body([])],
      ['extra top-level key', body([upsertChange()], { extra: 1 })],
      ['extra change key', body([upsertChange({ extra: 1 })])],
      ['baseSeq 1.5', body([upsertChange({ baseSeq: 1.5 })])],
      ['delete baseSeq 0', body([deleteChange({ baseSeq: 0 })])],
      ['type Wall', body([upsertChange({ type: 'Wall' })])],
      ['schemaVersion 0', body([upsertChange({ schemaVersion: 0 })])],
      ['data an array', body([upsertChange({ data: [] })])],
      ['repeated id', body([upsertChange(), deleteChange()])],
      [
        'repeated id, three changes',
        body([upsertChange(), upsertChange({ id: ID2 }), upsertChange()]),
      ],
    ];
    for (const [name, input] of refused) expect(parseSaveRequest(input), name).toBeNull();
  });
});

// EZD-205b · MU1, MU2: the closure override check and the stored-row read in saveObjects
// (vault/plans/EZD-205b.md section 1 Decided "Override check", "saveObjects order"; section 3; section 4;
// AC-EZD-205-4). Expected values: Decided "Override check"; Q-0569 (c) (straight-line gap); L-059; L-061.
const SELF = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const T0 = '2026-11-06T12:00:00.000Z';
const T1 = '2026-11-06T12:00:01.000Z';
const O1: ClosureOverride = { who: SELF, when: T0, gap: { x: 0, y: -0.5 } };
const rid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

describe('EZD-205b closure override check', () => {
  it("MU1 closureOverrideCheck: new, changed, unchanged and another user's override", () => {
    const rooms: { id: string; override: ClosureOverride | null }[] = [
      { id: rid(1), override: { ...O1 } },
      { id: rid(2), override: { ...O1 } },
      { id: rid(3), override: { ...O1 } },
      { id: rid(4), override: { ...O1, when: T1 } },
      { id: rid(5), override: { ...O1, gap: { x: 0, y: -0.25 } } },
      { id: rid(6), override: { ...O1, who: OTHER } },
      { id: rid(7), override: { ...O1, who: OTHER } },
      { id: rid(8), override: null },
      { id: rid(9), override: { ...O1, who: SELF.toUpperCase() } },
      { id: rid(10), override: { ...O1, gap: { x: -0.5, y: -0.5 } } },
      { id: rid(11), override: { ...O1, who: OTHER, when: T1 } },
    ];
    const stored = new Map<string, ClosureOverride | null>([
      [rid(2), { ...O1, gap: { ...O1.gap } }],
      [rid(3), null],
      [rid(4), { ...O1, gap: { ...O1.gap } }],
      [rid(5), { ...O1, gap: { ...O1.gap } }],
      [rid(7), { ...O1, who: OTHER, gap: { ...O1.gap } }],
      [rid(8), { ...O1, gap: { ...O1.gap } }],
      [rid(11), { ...O1, who: OTHER, gap: { ...O1.gap } }],
    ]);
    const r = closureOverrideCheck(rooms, stored, SELF);
    const want: [number, number][] = [
      [1, 0.5],
      [3, 0.5],
      [4, 0.5],
      [5, 0.25],
      [9, 0.5],
      [10, 0.7071067811865476],
    ];
    expect(r.overridden.map((o) => o.roomId)).toEqual(want.map(([n]) => rid(n)));
    want.forEach(([n, gapIn], k) => expect(r.overridden[k]!.gapIn, `r${n}`).toBeCloseTo(gapIn, 12));
    expect(r.invalid).toEqual([
      { id: rid(6), issue: 'override_other_user' },
      { id: rid(11), issue: 'override_other_user' },
    ]);
  });

  it('MU2 saveObjects reads stored rooms only for overrides and fails closed on a read error', async () => {
    const PROJECT = rid(100);
    const LEVEL = rid(101);
    const TENANT = rid(102);
    const WALL = rid(103);
    const ROOM = rid(104);
    const wallChange = (data?: Record<string, unknown>): ObjectChange => ({
      id: WALL,
      baseSeq: 0,
      deleted: false,
      type: 'wall',
      schemaVersion: 1,
      data: data ?? {
        geometry: { start: { x: 0, y: 0 }, end: { x: 120, y: 0 } },
        status: 'new',
        level: LEVEL,
        attributes: {
          thickness: 4.5,
          thicknessSide: 'right',
          height: 96,
          topCutToCeiling: false,
          bearing: false,
        },
      },
    });
    const roomChange = (who: string): ObjectChange => ({
      id: ROOM,
      baseSeq: 0,
      deleted: false,
      type: 'room',
      schemaVersion: 3,
      data: {
        geometry: {
          boundary: [
            { x: 0, y: 0 },
            { x: 144, y: 0 },
            { x: 144, y: 120 },
            { x: 0, y: 120 },
            { x: 0, y: 0.5 },
          ],
        },
        status: 'existing',
        level: LEVEL,
        attributes: { name: 'Room 1' },
        closureOverride: { who, when: T0, gap: { x: 0, y: -0.5 } },
      },
    });
    const stub = (read: { data: unknown; error: unknown }) => {
      const inMock = vi.fn(async () => read);
      const from = vi.fn(() => ({ select: () => ({ eq: () => ({ in: inMock }) }) }));
      const rpc = vi.fn(async () => ({
        data: {
          status: 'saved',
          tenant_id: TENANT,
          objects: [{ object_id: WALL, updated_seq: 1 }],
        },
        error: null,
      }));
      return { from, rpc, inMock, client: { from, rpc } as unknown as SupabaseClient<Database> };
    };
    const req = (changes: ObjectChange[]): SaveRequest => ({ lockEpoch: 0, changes });

    const a = stub({ data: [], error: null });
    const ra = await saveObjects(a.client, PROJECT, req([wallChange()]), SELF);
    expect(a.from).not.toHaveBeenCalled();
    expect(a.rpc).toHaveBeenCalledTimes(1);
    expect(ra.ok).toBe(true);
    if (ra.ok) expect(ra.overridden).toEqual([]);

    const E = new Error('ezd205b-read-failed');
    const b = stub({ data: null, error: E });
    await expect(saveObjects(b.client, PROJECT, req([roomChange(SELF)]), SELF)).rejects.toBe(E);
    expect(b.rpc).not.toHaveBeenCalled();

    const c = stub({ data: [], error: null });
    const rc = await saveObjects(c.client, PROJECT, req([roomChange(OTHER)]), SELF);
    expect(rc).toEqual({
      ok: false,
      code: 'invalid_object',
      invalid: [{ id: ROOM, issue: 'override_other_user' }],
    });
    expect(c.from).toHaveBeenCalledWith('model_object');
    expect(c.rpc).not.toHaveBeenCalled();

    const d = stub({ data: [], error: null });
    const rd = await saveObjects(d.client, PROJECT, req([wallChange({}), roomChange(OTHER)]), SELF);
    expect(rd).toEqual({
      ok: false,
      code: 'invalid_object',
      invalid: [{ id: WALL, issue: 'invalid_data' }],
    });
    expect(d.from).not.toHaveBeenCalled();
    expect(d.rpc).not.toHaveBeenCalled();
  });
});
