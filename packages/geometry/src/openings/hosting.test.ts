// EZD-204b H1-H5 (vault/plans/EZD-204b.md sections 3, 4; AC-EZD-204-1, -2, -3, -4, -12): openings that a wall
// edit leaves off every wall, and re-hosting on contact. Expected values: AC-1 to AC-4; 04 Selection, undo and flags
// line 86 ("stay put and turn red"); Q-0630 rows 5, 27, 38; Q-0633 G12; 09k On a wall (1/64"); plan Decided
// `openingHostUpdates` (`{1,0}` fallback, level filter).
import { describe, expect, it } from 'vitest';
import { buildDrawingList } from '../drawing';
import type { Point } from '../schema';
import { deepFreeze, ID, LEVEL_1, LEVEL_2, roomWalls, wallObj } from '../walls/test-utils/fixtures';
import { moveWall, type WallObject } from '../walls';
import { openingHostUpdates } from './hosting';
import { createOpeningData, type OpeningObject } from './opening';

const P = (x: number, y: number): Point => ({ x, y });
const E = '00000000-0000-4000-8000-0000000000e1';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const C2 = '00000000-0000-4000-8000-0000000000c2';
const X1 = { x: 1, y: 0 };

type Updates = Parameters<typeof openingHostUpdates>[0];
const updates = (input: Updates): OpeningObject[] => openingHostUpdates(deepFreeze(input));

function door(host: WallObject, center: Point, id: string = ID.D1): OpeningObject {
  return deepFreeze({
    id,
    type: 'opening',
    data: createOpeningData({ kind: 'door', host, center }),
  });
}

function withGeometry(
  o: OpeningObject,
  g: Partial<OpeningObject['data']['geometry']>,
): OpeningObject {
  return deepFreeze({ ...o, data: { ...o.data, geometry: { ...o.data.geometry, ...g } } });
}

const flagged = (host: WallObject, center: Point): OpeningObject =>
  withGeometry(door(host, center), { hostWallId: null, axis: X1 });

function replaceW1(walls: WallObject[], start: Point, end: Point): WallObject[] {
  const w1 = wallObj(ID.W1, start, end, { thicknessSide: 'right' });
  return walls.map((w) => (w.id === ID.W1 ? w1 : w));
}

function zeroWall(): WallObject {
  const w = wallObj(ID.Z, P(5, 5), P(6, 5));
  return { ...w, data: { ...w.data, geometry: { start: P(5, 5), end: P(5, 5) } } };
}

describe('EZD-204b hosting', () => {
  it('EZD-204b done when: moving a wall away flags the opening red', () => {
    const walls = deepFreeze(roomWalls(144, 120));
    const d = door(walls[0]!, P(72, 0));
    const moved = moveWall(deepFreeze([...walls, d]), ID.W1, { x: 0, y: -6 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) throw new Error('moveWall refused');
    const after = walls.map((w) => moved.changed.find((c) => c.id === w.id) ?? w);

    const got = updates({ level: LEVEL_1, walls: after, previousWalls: walls, openings: [d] });
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual({
      ...d,
      data: { ...d.data, geometry: { center: P(72, 0), hostWallId: null, axis: X1 } },
    });

    const list = buildDrawingList(
      { objects: [...after, got[0]!] },
      { level: LEVEL_1, dimensionTextPt: 10.5, roomHatch: null, roomLabelPt: 11.25 },
    );
    const items = list.items.filter((i) => i.objectId === ID.D1);
    expect(items).toHaveLength(3);
    for (const i of items) expect(i.layer).toBe('flagged');
    expect(list.omitted.some((o) => o.id === ID.D1)).toBe(false);
  });

  it('EZD-204b H2 an opening still on its wall is not flagged', () => {
    const walls = deepFreeze(roomWalls(144, 120));
    const d = door(walls[0]!, P(72, 0));
    const slid = replaceW1(walls, P(6, 0), P(150, 0));
    expect(updates({ level: LEVEL_1, walls: slid, previousWalls: walls, openings: [d] })).toEqual(
      [],
    );
    const nudged = replaceW1(walls, P(0, -0.015625), P(144, -0.015625));
    expect(updates({ level: LEVEL_1, walls: nudged, previousWalls: walls, openings: [d] })).toEqual(
      [],
    );
  });

  it('EZD-204b H3 the flag stays until the opening is on a wall', () => {
    const walls = deepFreeze(roomWalls(144, 120));
    const d = flagged(walls[0]!, P(72, 0));
    expect(d.data.attributes.swing).toBe('left');
    const away = replaceW1(walls, P(0, -6), P(144, -6));
    expect(updates({ level: LEVEL_1, walls: away, previousWalls: away, openings: [d] })).toEqual(
      [],
    );

    const back = updates({ level: LEVEL_1, walls, previousWalls: walls, openings: [d] });
    expect(back).toHaveLength(1);
    expect(back[0]!.id).toBe(ID.D1);
    expect(back[0]!.data.geometry.hostWallId).toBe(ID.W1);
    expect(back[0]!.data.geometry.axis).toBeNull();
    expect(back[0]!.data.attributes.swing).toBe('left');
  });

  it('EZD-204b H4 re-host ties, overlap, reversed wall, deleted host', () => {
    const c2 = wallObj(C2, P(0, 0), P(144, 0));
    const c1 = wallObj(C1, P(0, 0), P(144, 0));

    // (a) two walls under the door: the first id wins.
    const a = updates({
      level: LEVEL_1,
      walls: [c2, c1],
      previousWalls: [c2, c1],
      openings: [flagged(c1, P(72, 0))],
    });
    expect(a).toHaveLength(1);
    expect(a[0]!.data.geometry.hostWallId).toBe(C1);

    // (b) the span is held by another opening on that wall.
    const e = door(c1, P(72, 0), E);
    expect(
      updates({
        level: LEVEL_1,
        walls: [c1],
        previousWalls: [c1],
        openings: [flagged(c1, P(80, 0)), e],
      }),
    ).toEqual([]);

    // (c) a reversed wall turns the swing.
    const rev = wallObj(C1, P(144, 0), P(0, 0));
    const cd = flagged(rev, P(72, 0));
    expect(cd.data.attributes.swing).toBe('left');
    const c = updates({ level: LEVEL_1, walls: [rev], previousWalls: [rev], openings: [cd] });
    expect(c).toHaveLength(1);
    expect(c[0]!.data.geometry.hostWallId).toBe(C1);
    expect(c[0]!.data.attributes.swing).toBe('right');
    expect(c[0]!.data.geometry.axis).toBeNull();

    // (d) the host wall is deleted.
    const room = deepFreeze(roomWalls(144, 120));
    const dd = door(room[0]!, P(72, 0));
    const d = updates({
      level: LEVEL_1,
      walls: room.filter((w) => w.id !== ID.W1),
      previousWalls: room,
      openings: [dd],
    });
    expect(d).toHaveLength(1);
    expect(d[0]!.data.geometry.hostWallId).toBeNull();
    expect(d[0]!.data.geometry.axis).toEqual(X1);
  });

  it('EZD-204b H5 empty input, other floor and zero-length host', () => {
    const room = deepFreeze(roomWalls(144, 120));

    // (a)
    expect(updates({ level: LEVEL_1, walls: room, previousWalls: room, openings: [] })).toEqual([]);

    // (b) no walls at all.
    const b = updates({
      level: LEVEL_1,
      walls: [],
      previousWalls: [],
      openings: [door(room[0]!, P(72, 0))],
    });
    expect(b).toHaveLength(1);
    expect(b[0]!.data.geometry.hostWallId).toBeNull();
    expect(b[0]!.data.geometry.axis).toEqual(X1);

    // (c) an opening on another floor is not touched.
    const d = door(room[0]!, P(72, 0));
    const upper: OpeningObject = deepFreeze({ ...d, data: { ...d.data, level: LEVEL_2 } });
    expect(
      updates({
        level: LEVEL_1,
        walls: replaceW1(room, P(0, -6), P(144, -6)),
        previousWalls: room,
        openings: [upper],
      }),
    ).toEqual([]);

    // (d) a zero-length host.
    const zero = deepFreeze(zeroWall());
    const z = updates({
      level: LEVEL_1,
      walls: [zero],
      previousWalls: [zero],
      openings: [door(zero, P(5, 5))],
    });
    expect(z).toHaveLength(1);
    expect(z[0]!.data.geometry.hostWallId).toBeNull();
    expect(z[0]!.data.geometry.axis).toEqual(X1);
  });
});
