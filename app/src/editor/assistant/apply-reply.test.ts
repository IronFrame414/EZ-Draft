// EZD-5604a A1-A16 (vault/plans/EZD-5604a.md section 4; AC-EZD-5604-1, -2, -6, -8, -9, -10). Expected values come
// from 09k (Offset maximum, Exact fit, Typed move maximum, Typed length, Door resize, Thickness), the
// samples/v4.json drawing (P5602 T3 refs), P204a (auto rough opening +2", +2.5"), P294 (highest + 1) and
// Q-0637, Q-0638, Q-0640, Q-0641, Q-0642.
import {
  createOpeningData,
  CURRENT_SCHEMA_VERSION,
  NO_NUMBERS,
  parseStoredObject,
  roomAreaSqFt,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import v4 from '../../../../packages/geometry/src/schema/samples/v4.json';
import type { AssistantChange } from '../../lib/assistant/changes';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { parseAssistantReply } from '../../server/assistant/assistant';
import { ASSISTANT_RECORDINGS } from '../../server/ai/test-harness/recordings/anthropic';
import { deleteChanges } from '../edit/edit-changes';
import type { Objects } from '../model/patches';
import { baseObjects, F1, idSeq, uid, withWalls } from '../tools/test-utils/fixtures';
import {
  applyAssistantReply,
  touchedIds,
  type AssistantPreview,
  type OkPreview,
} from './apply-reply';

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const key of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[key]);
  }
  return v;
}

type Stored = { id: string; type: string; schema_version: number; data: Record<string, unknown> };

function v4Objects(): Map<string, ObjectValue> {
  const m = new Map<string, ObjectValue>();
  for (const o of (v4 as unknown as { objects: Stored[] }).objects)
    m.set(o.id, deepFreeze({ type: o.type, schemaVersion: o.schema_version, data: o.data }));
  return m;
}

const V4 = v4Objects();
const FLOOR1 = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const REFS = {
  f1: FLOOR1,
  f2: '3917dda6-80b4-45ae-8bc0-59144aa66585',
  w1: '09b59d6e-533b-46c4-8bb8-16d36a317520',
  w2: 'aaf876ba-3f51-4bdc-a79b-74af4fe95f45',
  w3: 'dd95bb08-124b-4347-9069-a741a3766dc8',
  w4: 'f13937da-4cb2-441d-b2e5-53a53715307b',
  o1: '0236f1bd-ff22-4297-bdbb-98ec96f4ffae',
  o2: '05339e81-17bb-4a72-a80a-f0dba166d978',
  r1: '6a5bae36-e7f4-4459-a3b8-b1528fbd8a21',
};
const FLOOR2_WALL = '5c32e94e-e652-43f5-844f-f635f1ff4cd1';

const R12_REFS = { f1: F1, w1: uid(1), w2: uid(2), w3: uid(3), w4: uid(4) };
const r12 = () =>
  withWalls(
    baseObjects(),
    1,
    [
      { x: 0, y: 0 },
      { x: 144, y: 0 },
      { x: 144, y: 120 },
      { x: 0, y: 120 },
    ],
    true,
  );

function wallOf(objects: Objects, id: string): WallObject {
  const v = objects.get(id)!;
  const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
  if (!r.ok || r.object.type !== 'wall') throw new Error('not a wall');
  return r.object;
}

// R12 with a door on the south wall uid(1) at `c`, ref o1.
function r12Door(c: Point): Map<string, ObjectValue> {
  const m = r12();
  m.set(uid(20), {
    type: 'opening',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: createOpeningData({
      kind: 'door',
      host: wallOf(m, uid(1)),
      center: c,
    }) as unknown as Record<string, unknown>,
  });
  return m;
}

type Run = {
  objects?: Objects;
  floorId?: string;
  refs?: Record<string, string>;
  highs?: typeof NO_NUMBERS;
  newId?: () => string;
};

const run = (changes: unknown[], o: Run = {}): AssistantPreview =>
  applyAssistantReply({
    objects: o.objects ?? V4,
    floorId: o.floorId ?? FLOOR1,
    changes: changes as AssistantChange[],
    refs: o.refs ?? REFS,
    highs: o.highs ?? NO_NUMBERS,
    newId: o.newId ?? idSeq(100),
  });

const runR12 = (changes: unknown[], o: Run = {}) =>
  run(changes, { objects: r12(), floorId: F1, refs: { ...R12_REFS, o1: uid(20) }, ...o });

function ok(p: AssistantPreview): OkPreview {
  if (!p.ok) throw new Error(`refused: ${p.reason}`);
  return p;
}

const reason = (p: AssistantPreview) => (p.ok ? 'ok' : p.reason);

const valueOf = (p: OkPreview, id: string) => p.changes.find((c) => c.id === id)?.value;
type Attrs = {
  thickness: number;
  width: number;
  height: number;
  shutterType: string | null;
  roughOpeningMode: string;
  roughOpening: { width: number; height: number };
  layers: { material: string; thickness: number }[];
};
const dataOf = (p: OkPreview, id: string) => valueOf(p, id)!.data;
const geometryOf = (p: OkPreview, id: string) =>
  dataOf(p, id).geometry as { start: Point; end: Point; center: Point; hostWallId: string | null };
const attrsOf = (p: OkPreview, id: string) => dataOf(p, id).attributes as Attrs;
const studOf = (p: OkPreview, id: string) =>
  attrsOf(p, id).layers.find((l) => l.material === 'stud')!.thickness;

const recorded = (name: 'add_door' | 'move_wall' | 'delete_window') => {
  const json = ASSISTANT_RECORDINGS[name].exchanges[0]!.response.json as {
    content: { text: string }[];
  };
  return parseAssistantReply(json.content[0]!.text)!.changes;
};

const EMPTY = {
  ok: true,
  changes: [],
  added: [],
  removed: [],
  updated: [],
  touched: [],
  provisional: {},
};

const doorAdd = (extra: Record<string, unknown> = {}) => ({
  op: 'add',
  type: 'door',
  ref: 'n1',
  hostWall: 'w2',
  center: { x: 100, y: 0 },
  ...extra,
});

const moveW3 = {
  op: 'update',
  type: 'wall',
  ref: 'w3',
  start: { x: 132, y: 0 },
  end: { x: 132, y: 96 },
};

describe('EZD-5604a apply and check', () => {
  it('A1 EZD-5604a done when: recordings apply on v4', () => {
    const door = ok(run(recorded('add_door')));
    const id = uid(100);
    expect(door.changes).toHaveLength(1);
    expect(door.added).toEqual([id]);
    expect(dataOf(door, id)).toEqual({
      geometry: { center: { x: 100, y: 0 }, hostWallId: REFS.w2, axis: null },
      status: 'existing',
      level: FLOOR1,
      attributes: {
        kind: 'door',
        width: 36,
        height: 80,
        roughOpening: { width: 38, height: 82.5 },
        sillHeight: 0,
        swing: 'left',
        hand: 'left',
        impactRating: 'not_rated',
        shutterType: null,
        roughOpeningMode: 'auto',
        number: 1,
      },
    });
    expect(door.provisional).toEqual({ [id]: 1 });
    expect(door.touched).toEqual([id, REFS.w2]);

    const move = ok(run(recorded('move_wall')));
    expect(move.changes.map((c) => c.id)).toEqual([REFS.w1, REFS.w3, REFS.w4, REFS.r1]);
    expect(move.updated).toEqual([REFS.w1, REFS.w3, REFS.w4, REFS.r1]);
    expect(move.added).toEqual([]);
    expect(geometryOf(move, REFS.w1)).toEqual({ start: { x: 120, y: 108 }, end: { x: 0, y: 108 } });
    expect(geometryOf(move, REFS.w3).end).toEqual({ x: 120, y: 108 });
    expect(geometryOf(move, REFS.w4).start).toEqual({ x: 0, y: 108 });
    const boundary = (dataOf(move, REFS.r1).geometry as { boundary: Point[] }).boundary;
    expect(roomAreaSqFt(boundary)).toBe(90);

    const del = ok(run(recorded('delete_window')));
    expect(del.changes).toEqual([{ id: REFS.o1, value: null }]);
    expect(del.removed).toEqual([REFS.o1]);
    expect(del.touched).toEqual([REFS.o1, REFS.w3]);
  });

  it('A2 refs', () => {
    const upd = (ref: string, type = 'wall') => ({ op: 'update', type, ref, height: 90 });
    expect(run([upd('w9')])).toEqual({ ok: false, reason: 'unknown_ref' });
    expect(run([upd('constructor')])).toEqual({ ok: false, reason: 'unknown_ref' });
    expect(run([doorAdd({ hostWall: 'f2' })])).toEqual({ ok: false, reason: 'wrong_type' });
    expect(run([{ op: 'update', type: 'door', ref: 'w1', width: 30 }])).toEqual({
      ok: false,
      reason: 'wrong_type',
    });
    expect(
      run([
        doorAdd({ hostWall: 'n1', ref: 'n2' }),
        { op: 'add', type: 'wall', ref: 'n1', start: { x: 0, y: 500 }, end: { x: 120, y: 500 } },
      ]),
    ).toEqual({ ok: false, reason: 'unknown_ref' });
    expect(
      run([
        { op: 'add', type: 'wall', ref: 'w1', start: { x: 0, y: 500 }, end: { x: 120, y: 500 } },
      ]),
    ).toEqual({ ok: false, reason: 'duplicate_ref' });
    const rm = { op: 'remove', type: 'window', ref: 'o1' };
    expect(run([rm, rm])).toEqual({ ok: false, reason: 'duplicate_ref' });
    expect(run([upd('w9')], { refs: { ...REFS, w9: crypto.randomUUID() } })).toEqual({
      ok: false,
      reason: 'unknown_ref',
    });
    expect(run([...recorded('add_door'), upd('w9')])).toEqual({ ok: false, reason: 'unknown_ref' });
  });

  it('A3 sent floor only', () => {
    expect(
      reason(
        run([
          {
            op: 'add',
            type: 'wall',
            ref: 'n1',
            floor: 'f2',
            start: { x: 0, y: 500 },
            end: { x: 120, y: 500 },
          },
        ]),
      ),
    ).toBe('other_floor');
    expect(
      reason(
        run([{ op: 'update', type: 'wall', ref: 'w9', height: 90 }], {
          refs: { ...REFS, w9: FLOOR2_WALL },
        }),
      ),
    ).toBe('other_floor');
    expect(reason(run(recorded('delete_window'), { floorId: REFS.o1 }))).toBe('other_floor');
  });

  it('A4 placement as the Door tool', () => {
    const add = (center: Point, width?: number) => ({
      op: 'add',
      type: 'door',
      ref: 'n1',
      hostWall: 'w1',
      center,
      ...(width === undefined ? {} : { width }),
    });
    const placed = ok(runR12([add({ x: 126, y: 0 })]));
    expect(geometryOf(placed, uid(100)).center).toEqual({ x: 126, y: 0 });
    expect(reason(runR12([add({ x: 126.0625, y: 0 })]))).toBe('opening_position');
    expect(reason(runR12([add({ x: 100, y: 1 })]))).toBe('opening_position');

    const w36 = withWalls(
      baseObjects(),
      1,
      [
        { x: 0, y: 0 },
        { x: 36, y: 0 },
      ],
      false,
    );
    const w36Run = (c: unknown) =>
      run([c], { objects: w36, floorId: F1, refs: { f1: F1, w1: uid(1) } });
    expect(reason(w36Run(add({ x: 18, y: 0 }, 36)))).toBe('ok');
    expect(reason(w36Run(add({ x: 18.03125, y: 0 }, 36.0625)))).toBe('opening_position');

    expect(reason(runR12([add({ x: 70, y: 0 })], { objects: r12Door({ x: 54, y: 0 }) }))).toBe(
      'opening_position',
    );
  });

  it('A5 thickness and layers', () => {
    const upd = (f: Record<string, unknown>) =>
      runR12([{ op: 'update', type: 'wall', ref: 'w1', ...f }]);
    const thick = ok(upd({ thickness: 6.5 }));
    expect(studOf(thick, uid(1))).toBe(5.5);
    expect(attrsOf(thick, uid(1)).thickness).toBe(6.5);
    expect(reason(upd({ thickness: 1 }))).toBe('invalid_value');
    expect(studOf(ok(upd({ thickness: 1.0625 })), uid(1))).toBe(0.0625);
    const layers = ok(
      upd({
        layers: [
          { material: 'drywall', thickness: 0.5 },
          { material: 'stud', thickness: 5.5 },
          { material: 'drywall', thickness: 0.5 },
        ],
      }),
    );
    expect(attrsOf(layers, uid(1)).thickness).toBe(6.5);
    expect(
      reason(
        upd({
          layers: [
            { material: 'drywall', thickness: 0.5 },
            { material: 'stud', thickness: 5.5 },
          ],
        }),
      ),
    ).toBe('invalid_value');
    const same = ok(upd({ thickness: 4.5 }));
    expect(valueOf(same, uid(1))).toBeUndefined();
  });

  it('A6 wall length and moves', () => {
    const add = (end: Point, start: Point = { x: 0, y: 500 }) => ({
      op: 'add',
      type: 'wall',
      ref: 'n1',
      start,
      end,
    });
    expect(reason(run([add({ x: 2400, y: 500 })]))).toBe('ok');
    expect(reason(run([add({ x: 2400.0625, y: 500 })]))).toBe('wall_length');
    expect(reason(run([add({ x: 0, y: 500 })]))).toBe('wall_length');
    const move = (x: number) =>
      runR12([{ op: 'update', type: 'wall', ref: 'w2', start: { x, y: 0 }, end: { x, y: 120 } }]);
    const moved = ok(move(2400));
    expect(geometryOf(moved, uid(1)).end).toEqual({ x: 2400, y: 0 });
    expect(geometryOf(moved, uid(3)).start).toEqual({ x: 2400, y: 120 });
    expect(reason(move(2400.0625))).toBe('wall_length');
  });

  it('A7 wall end along its line', () => {
    const upd = (f: Record<string, unknown>) =>
      runR12([{ op: 'update', type: 'wall', ref: 'w1', ...f }]);
    const longer = ok(upd({ end: { x: 150, y: 0 } }));
    expect(geometryOf(longer, uid(1)).end).toEqual({ x: 150, y: 0 });
    expect(geometryOf(longer, uid(2)).start).toEqual({ x: 150, y: 0 });
    expect(geometryOf(longer, uid(3)).start).toEqual({ x: 150, y: 120 });
    expect(reason(upd({ end: { x: 144, y: 10 } }))).toBe('wall_reshape');
    expect(reason(upd({ start: { x: 0, y: 5 }, end: { x: 150, y: 0 } }))).toBe('wall_reshape');
  });

  it('A8 door resize', () => {
    const upd = (objects: Objects, f: Record<string, unknown>) =>
      runR12([{ op: 'update', type: 'door', ref: 'o1', ...f }], { objects });
    const narrower = ok(upd(r12Door({ x: 54, y: 0 }), { width: 32 }));
    expect(geometryOf(narrower, uid(20)).center).toEqual({ x: 52, y: 0 });
    expect(reason(upd(r12Door({ x: 118, y: 0 }), { width: 48 }))).toBe('opening_position');
    const both = ok(upd(r12Door({ x: 54, y: 0 }), { width: 32, center: { x: 60, y: 0 } }));
    expect(geometryOf(both, uid(20)).center).toEqual({ x: 60, y: 0 });
    expect(attrsOf(both, uid(20)).width).toBe(32);
  });

  it('A9 remove acts as Delete', () => {
    const p = ok(run([{ op: 'remove', type: 'wall', ref: 'w2' }]));
    expect(p.changes).toEqual(deleteChanges(V4, FLOOR1, [REFS.w2], idSeq(100)));
    expect(geometryOf(p, REFS.o2).hostWallId).toBeNull();
    expect(p.removed).toContain(REFS.w2);
  });

  it('A10 rough opening', () => {
    const ro = (p: OkPreview, id: string) => ({
      mode: attrsOf(p, id).roughOpeningMode,
      ...attrsOf(p, id).roughOpening,
    });
    const id = uid(100);
    expect(ro(ok(run([doorAdd({ roughOpening: { width: 40, height: 84 } })])), id)).toEqual({
      mode: 'typed',
      width: 40,
      height: 84,
    });
    expect(ro(ok(run([doorAdd({ width: 32 })])), id)).toEqual({
      mode: 'auto',
      width: 34,
      height: 82.5,
    });
    expect(ro(ok(run([doorAdd({ roughOpening: { width: 38, height: 82.5 } })])), id)).toEqual({
      mode: 'typed',
      width: 38,
      height: 82.5,
    });

    const auto = new Map(V4);
    const o2 = V4.get(REFS.o2)!;
    const o2Attrs = o2.data.attributes as Record<string, unknown>;
    auto.set(REFS.o2, {
      ...o2,
      data: {
        ...o2.data,
        attributes: {
          ...o2Attrs,
          roughOpening: { width: 38, height: 82.5 },
          roughOpeningMode: 'auto',
        },
      },
    });
    const updO2 = (objects: Objects, f: Record<string, unknown>) =>
      ok(run([{ op: 'update', type: 'door', ref: 'o2', ...f }], { objects }));
    expect(
      ro(updO2(auto, { width: 32, roughOpening: { width: 38, height: 82.5 } }), REFS.o2),
    ).toEqual({ mode: 'auto', width: 34, height: 82.5 });
    expect(ro(updO2(auto, { roughOpening: { width: 40, height: 84 } }), REFS.o2)).toEqual({
      mode: 'typed',
      width: 40,
      height: 84,
    });
    expect(ro(updO2(V4, { width: 32 }), REFS.o2)).toEqual({ mode: 'typed', width: 38, height: 82 });
  });

  it('A11 full save set of 100', () => {
    const adds = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        op: 'add',
        type: 'wall',
        ref: `n${i}`,
        start: { x: 0, y: 1000 + 100 * i },
        end: { x: 24, y: 1000 + 100 * i },
      }));
    const none = ok(run([moveW3]));
    expect(none.changes.map((c) => c.id)).toEqual([REFS.w3, REFS.w2, REFS.w1, REFS.r1, REFS.o1]);
    expect(geometryOf(none, REFS.o1).hostWallId).toBeNull();
    expect(ok(run([moveW3, ...adds(95)])).changes).toHaveLength(100);
    expect(run([moveW3, ...adds(96)])).toEqual({ ok: false, reason: 'too_many' });
  });

  it('A12 provisional numbers and Existing', () => {
    const p = ok(
      run(
        [
          { op: 'add', type: 'wall', ref: 'n1', start: { x: 0, y: 500 }, end: { x: 120, y: 500 } },
          { op: 'add', type: 'door', ref: 'n2', hostWall: 'n1', center: { x: 60, y: 500 } },
          { op: 'add', type: 'window', ref: 'n3', hostWall: 'w4', center: { x: 0, y: 48 } },
        ],
        { highs: { wall: 4, door: 2, window: 1 } },
      ),
    );
    expect(p.added).toHaveLength(3);
    const [wall, door, win] = p.added as [string, string, string];
    expect(p.provisional).toEqual({ [wall]: 5, [door]: 3, [win]: 2 });
    for (const id of p.added) expect(dataOf(p, id).status).toBe('existing');
    expect(geometryOf(p, door).hostWallId).toBe(wall);
  });

  it('A13 moved window re-hosts', () => {
    const p = ok(
      run([moveW3, { op: 'update', type: 'window', ref: 'o1', center: { x: 132, y: 48 } }]),
    );
    expect(p.changes.map((c) => c.id)).toEqual([REFS.w3, REFS.w2, REFS.w1, REFS.r1, REFS.o1]);
    expect(dataOf(p, REFS.o1).geometry).toEqual({
      center: { x: 132, y: 48 },
      hostWallId: REFS.w3,
      axis: null,
    });
  });

  it('A14 input unchanged and fails closed', () => {
    const clone = structuredClone(V4);
    const refsBefore = new Map(V4);
    const check = () => {
      for (const [id, v] of refsBefore) expect(V4.get(id)).toBe(v);
      expect(V4).toEqual(clone);
    };
    for (const name of ['add_door', 'move_wall', 'delete_window'] as const) {
      run(recorded(name));
      check();
    }
    run([...recorded('add_door'), { op: 'update', type: 'wall', ref: 'w9', height: 90 }]);
    check();
    expect(
      run(
        [{ op: 'add', type: 'wall', ref: 'n1', start: { x: 0, y: 500 }, end: { x: 120, y: 500 } }],
        {
          newId: () => {
            throw new Error('x');
          },
        },
      ),
    ).toEqual({ ok: false, reason: 'invalid_result' });
    check();
  });

  it('A15 touchedIds', () => {
    const o2 = V4.get(REFS.o2)!;
    const flagged = {
      ...o2,
      data: { ...o2.data, geometry: { ...(o2.data.geometry as object), hostWallId: null } },
    };
    expect(touchedIds(V4, [{ id: REFS.o2, value: flagged }])).toEqual([REFS.o2, REFS.w2]);
    expect(touchedIds(V4, [{ id: REFS.w1, value: null }])).toEqual([REFS.w1]);
  });

  it('A16 wrong kind, empty and combined', () => {
    const win = { op: 'add', type: 'window', ref: 'n1', hostWall: 'w4', center: { x: 0, y: 48 } };
    expect(reason(run([{ ...win, swing: 'left' }]))).toBe('invalid_value');
    expect(reason(run([doorAdd({ sillHeight: 0 })]))).toBe('invalid_value');
    expect(reason(run([doorAdd({ shutterType: 'colonial' })]))).toBe('invalid_value');
    const shutter = ok(run([doorAdd({ impactRating: 'shutter', shutterType: 'colonial' })]));
    expect(attrsOf(shutter, uid(100)).shutterType).toBe('colonial');

    expect(run([])).toEqual(EMPTY);
    expect(run([{ op: 'update', type: 'wall', ref: 'w1', height: 96 }])).toEqual(EMPTY);

    const combined = ok(
      runR12([
        {
          op: 'update',
          type: 'wall',
          ref: 'w1',
          start: { x: 0, y: 6 },
          end: { x: 144, y: 6 },
          thickness: 6.5,
        },
      ]),
    );
    expect(geometryOf(combined, uid(1))).toEqual({ start: { x: 0, y: 6 }, end: { x: 144, y: 6 } });
    expect(studOf(combined, uid(1))).toBe(5.5);

    const updO2 = (f: Record<string, unknown>) =>
      run([{ op: 'update', type: 'door', ref: 'o2', ...f }]);
    const taller = ok(updO2({ height: 84 }));
    expect(attrsOf(taller, REFS.o2).height).toBe(84);
    expect(geometryOf(taller, REFS.o2).center).toEqual({ x: 60, y: 0 });
    expect(updO2({ sillHeight: 0 })).toEqual(EMPTY);
    expect(reason(updO2({ sillHeight: 10 }))).toBe('invalid_value');

    const flaggedO1 = new Map(V4);
    const o1 = V4.get(REFS.o1)!;
    flaggedO1.set(REFS.o1, {
      ...o1,
      data: {
        ...o1.data,
        geometry: { ...(o1.data.geometry as object), hostWallId: null, axis: { x: 0, y: 1 } },
      },
    });
    const free = ok(
      run([{ op: 'update', type: 'window', ref: 'o1', center: { x: 300, y: 300 }, width: 30 }], {
        objects: flaggedO1,
      }),
    );
    expect(geometryOf(free, REFS.o1).center).toEqual({ x: 300, y: 300 });
    expect(geometryOf(free, REFS.o1).hostWallId).toBeNull();
    expect(attrsOf(free, REFS.o1).width).toBe(30);
  });
});
