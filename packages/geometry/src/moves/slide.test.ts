// EZD-212a · SL1 to SL3 (vault/plans/EZD-212a.md section 4; AC-EZD-212-4): dragging an opening along its wall, onto
// another wall, and a flagged one following the cursor. Expected values: Q-0630 row 11; Q-0633 G12 (capture within
// 10 px, inclusive as Q-0570); P204b `hostCorners` tee faces, `openingHostUpdates`; plan Decided "`placeOnWall`",
// "`slideOpening`"; L-052 (non-finite input).
import { describe, expect, it } from 'vitest';
import { openingHostUpdates } from '../openings/hosting';
import type { OpeningObject } from '../openings/opening';
import type { ModelObject, Point } from '../schema';
import type { WallObject } from '../walls/wall';
import { deepFreeze, ID, LEVEL_1, partition, roomWalls } from '../walls/test-utils/fixtures';
import { slideOpening } from './slide';
import { flaggedObj, openingObj } from './test-utils/fixtures';

const { W1, W2, D1 } = ID;
const P = (x: number, y: number): Point => ({ x, y });

const room = () => roomWalls(144, 120);
const wallOf = (objs: readonly ModelObject[], id: string): WallObject => {
  const w = objs.find((o) => o.id === id && o.type === 'wall');
  if (!w) throw new Error(`no wall ${id}`);
  return w as WallObject;
};
const doorOnW1 = (x: number) => openingObj(D1, 'door', wallOf(room(), W1), P(x, 0));
const expectPoint = (got: Point, x: number, y: number, label: string) => {
  expect(got.x, `${label}.x`).toBeCloseTo(x, 9);
  expect(got.y, `${label}.y`).toBeCloseTo(y, 9);
};
const slide = (
  opening: OpeningObject,
  objects: readonly ModelObject[],
  target: Point,
  captureIn = 10,
) => slideOpening({ opening, objects, target, captureIn });

describe('EZD-212a slideOpening', () => {
  it('EZD-212a slideOpening slides on its host within the capture', () => {
    const door = doorOnW1(54);
    const objs: ModelObject[] = deepFreeze([...room(), door]);
    expectPoint(slide(door, objs, P(60, 10)), 60, 0, 'at the capture');
    expectPoint(slide(door, objs, P(60, 10.5)), 54, 0, 'past the capture');
    expectPoint(slide(door, objs, P(150, -3)), 126, 0, 'host first');

    const teeDoor = doorOnW1(100);
    const tee: ModelObject[] = deepFreeze([...room(), partition(60), teeDoor]);
    expectPoint(slide(teeDoor, tee, P(50, 2)), 39.75, 0, 'west bay');
  });

  it('EZD-212a slideOpening re-hosts near another wall', () => {
    const door = doorOnW1(54);
    const walls = room();
    const objs: ModelObject[] = deepFreeze([...walls, door]);
    const c = slide(door, objs, P(140, 50));
    expectPoint(c, 144, 50, 'on W2');

    const moved: OpeningObject = {
      ...door,
      data: { ...door.data, geometry: { ...door.data.geometry, center: { x: c.x, y: c.y } } },
    };
    const updates = openingHostUpdates({
      level: LEVEL_1,
      walls,
      previousWalls: walls,
      openings: [moved],
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.data.geometry.hostWallId).toBe(W2);
  });

  it('EZD-212a a flagged door follows the cursor until on a wall', () => {
    const walls = room();
    const flagged = flaggedObj(openingObj(D1, 'door', wallOf(walls, W1), P(72, 60)), P(1, 0));
    const objs: ModelObject[] = deepFreeze([...walls, flagged]);
    expectPoint(slide(flagged, objs, P(80, 70)), 80, 70, 'follows');
    expectPoint(slide(flagged, objs, P(80, 115)), 80, 120, 'onto W3');
    expectPoint(slide(flagged, objs, P(NaN, 0)), 72, 60, 'NaN target');
    expectPoint(slide(flagged, objs, P(80, 70), -1), 72, 60, 'negative capture');
  });
});
