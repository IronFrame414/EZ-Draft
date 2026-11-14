// EZD-227 (AC-EZD-227-1, -2, -3; Q-0704; S03:152; Q-0630; 09q Blocking rows 1-4). Expected values are worked by hand:
// wall W1 runs (0,0) to (120,0), 4.5" thick centred on its line (faces at +2.25" left and -2.25" right, wall.ts
// wallFaceLines), a lone wall so its corners are its ends 0" and 120". The blocking is the 09q test size, 24" long at
// 34" to centre. A click at (60,10) is left of the wall (start to end, +y north) and centres the blocking at (60,0),
// spanning 48" to 72". Its outline is 1.5" deep behind the left face: 2.25" to 0.75".
import { describe, expect, it } from 'vitest';
import { buildDrawingList } from '../drawing/build';
import type { DrawingItem } from '../drawing/types';
import { moveSelection } from '../moves/selection';
import { blockingPickShape } from '../selection/shapes';
import {
  CURRENT_SCHEMA_VERSION,
  parseModelDocument,
  parseStoredObject,
  type ModelObject,
} from '../schema';
import { createWallData, type WallObject } from '../walls/wall';
import {
  BLOCKING_DEPTH_IN,
  blockingHostUpdates,
  blockingOutline,
  isBlockingFlagged,
  slideBlocking,
  type BlockingObject,
} from './blocking';

const F1 = '00000000-0000-4000-8000-0000000000f1';
const W1 = '00000000-0000-4000-8000-0000000000a1';
const B1 = '00000000-0000-4000-8000-0000000000b1';

function wall(id: string, start: { x: number; y: number }, end: { x: number; y: number }): WallObject {
  const r = createWallData({ start, end, level: F1, thicknessSide: 'center' });
  if (!r.ok) throw new Error(r.reason);
  return { id, type: 'wall', data: r.data };
}

const w1 = wall(W1, { x: 0, y: 0 }, { x: 120, y: 0 });

// The 09q blocking on W1's left at (60,0), as a click at (60,10) places it (placing: the app's fixture-geometry.ts).
function placed(at = { x: 60, y: 10 }): BlockingObject {
  return {
    id: B1,
    type: 'blocking',
    data: {
      geometry: { center: { x: 60, y: 0 }, hostWallId: W1, axis: null },
      status: 'existing',
      level: F1,
      attributes: { length: 24, heightToCenter: 34, side: at.y < 0 ? 'right' : 'left' },
    },
  };
}

const drawn = (objects: ModelObject[]) =>
  buildDrawingList(
    { objects },
    { level: F1, dimensionTextPt: 6.75, roomHatch: { angleDeg: 45, spacingIn: 6 }, roomLabelPt: 11.25 },
  ).items.filter((i): i is Extract<DrawingItem, { kind: 'line' }> => i.objectId === B1 && i.kind === 'line');

describe('EZD-227 grab-bar blocking', () => {
  it('AC-1 shows in plan: its outline behind the left face with both diagonals, in its status layer', () => {
    const b = placed();
    expect(BLOCKING_DEPTH_IN).toBe(1.5);
    const ring = [
      { x: 48, y: 2.25 },
      { x: 72, y: 2.25 },
      { x: 72, y: 0.75 },
      { x: 48, y: 0.75 },
    ];
    expect(blockingOutline(b, w1)).toEqual(ring);
    const lines = drawn([w1, b]);
    expect(lines).toHaveLength(6);
    expect(lines.every((l) => l.layer === 'existing' && l.role === 'beyond')).toBe(true);
    expect(lines.map((l) => [l.from, l.to])).toEqual([
      [ring[0], ring[1]],
      [ring[1], ring[2]],
      [ring[2], ring[3]],
      [ring[3], ring[0]],
      [ring[0], ring[2]],
      [ring[1], ring[3]],
    ]);
    // The right side lies behind the right face, -2.25" to -0.75".
    expect(blockingOutline(placed({ x: 60, y: -3 }), w1)).toEqual([
      { x: 48, y: -2.25 },
      { x: 72, y: -2.25 },
      { x: 72, y: -0.75 },
      { x: 48, y: -0.75 },
    ]);
    const shape = blockingPickShape(b, w1);
    expect(shape?.kind).toBe('quad');
    expect(shape?.area).toBeCloseTo(36, 9);
  });

  it('AC-1 slides along its wall and stops at the corner', () => {
    const b = placed();
    const slide = (target: { x: number; y: number }) =>
      slideBlocking({ blocking: b, objects: [w1], target, captureIn: 12 }).data.geometry;
    expect(slide({ x: 90, y: 1 })).toEqual({ center: { x: 90, y: 0 }, hostWallId: W1, axis: null });
    // 110" would put its end past 120"; it stops with its end at the corner: 108".
    expect(slide({ x: 110, y: 0 }).center).toEqual({ x: 108, y: 0 });
    expect(slide({ x: -2, y: 0 }).center).toEqual({ x: 12, y: 0 });
  });

  it('AC-1 cannot be dragged off its wall: off every wall it keeps its last spot on the wall', () => {
    const b = placed();
    const g = slideBlocking({ blocking: b, objects: [w1], target: { x: 60, y: 100 }, captureIn: 12 })
      .data.geometry;
    expect(g).toEqual({ center: { x: 60, y: 0 }, hostWallId: W1, axis: null });
  });

  it('AC-1 a lone move with its wall not selected slides it along the wall', () => {
    const b = placed();
    const r = moveSelection([w1, b], [B1], { x: 30, y: 5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toHaveLength(1);
    expect((r.changed[0] as BlockingObject).data.geometry.center).toEqual({ x: 90, y: 0 });
  });

  it('AC-1 stays where it stands when its wall moves unselected, flagged Not on a wall (09q Blocking row 4)', () => {
    const b = placed();
    const r = moveSelection([w1, b], [W1], { x: 0, y: 24 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed.map((o) => o.id)).toEqual([W1]);
    const moved = r.changed[0] as WallObject;
    const [after] = blockingHostUpdates({
      level: F1,
      walls: [moved],
      previousWalls: [w1],
      blockings: [b],
    });
    expect(after?.data.geometry).toEqual({ center: { x: 60, y: 0 }, hostWallId: null, axis: { x: 1, y: 0 } });
    expect(after?.data.attributes).toEqual(b.data.attributes);
    expect(isBlockingFlagged(after!)).toBe(true);
    // Drawn red where it stands, along its last wall direction.
    const lines = drawn([moved, after!]);
    expect(lines).toHaveLength(6);
    expect(lines.every((l) => l.layer === 'flagged')).toBe(true);
    expect(blockingOutline(after!, null)).toEqual([
      { x: 48, y: 1.5 },
      { x: 72, y: 1.5 },
      { x: 72, y: 0 },
      { x: 48, y: 0 },
    ]);
    // A wall that touches it again takes it back.
    const [back] = blockingHostUpdates({
      level: F1,
      walls: [w1],
      previousWalls: [moved],
      blockings: [after!],
    });
    expect(back?.data.geometry).toEqual({ center: { x: 60, y: 0 }, hostWallId: W1, axis: null });
    expect(back?.data.attributes.side).toBe('left');
  });

  it('AC-1 moves with its wall when both are selected, and stays hosted', () => {
    const b = placed();
    const r = moveSelection([w1, b], [W1, B1], { x: 0, y: 24 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const moved = r.changed.find((o) => o.id === W1) as WallObject;
    const mb = r.changed.find((o) => o.id === B1) as BlockingObject;
    expect(mb.data.geometry).toEqual({ center: { x: 60, y: 24 }, hostWallId: W1, axis: null });
    expect(
      blockingHostUpdates({ level: F1, walls: [moved], previousWalls: [w1], blockings: [mb] }),
    ).toEqual([]);
  });

  it('AC-2 is a model object in the model_json object list', () => {
    const b = placed();
    const stored = { id: B1, type: 'blocking', schema_version: CURRENT_SCHEMA_VERSION, data: b.data };
    const one = parseStoredObject(stored);
    expect(one.ok && one.object.type).toBe('blocking');
    const doc = parseModelDocument({
      objects: [
        { id: F1, type: 'floor', schema_version: CURRENT_SCHEMA_VERSION, data: { name: 'Floor 1', order: 1 } },
        { id: W1, type: 'wall', schema_version: CURRENT_SCHEMA_VERSION, data: w1.data },
        stored,
      ],
    });
    expect(doc.ok).toBe(true);
    if (doc.ok) expect(doc.document.objects.map((o) => o.type)).toEqual(['floor', 'wall', 'blocking']);
  });

  it('AC-3 height and length are required and above 0; side is left or right only', () => {
    const b = placed();
    const parse = (attributes: Record<string, unknown>) =>
      parseStoredObject({
        id: B1,
        type: 'blocking',
        schema_version: CURRENT_SCHEMA_VERSION,
        data: { ...b.data, attributes },
      }).ok;
    expect(parse({ length: 24, heightToCenter: 34, side: 'left' })).toBe(true);
    expect(parse({ length: 24, heightToCenter: 34, side: 'right' })).toBe(true);
    expect(parse({ length: 24, heightToCenter: 34, side: 'center' })).toBe(false);
    expect(parse({ length: 24, side: 'left' })).toBe(false);
    expect(parse({ heightToCenter: 34, side: 'left' })).toBe(false);
    expect(parse({ length: 24, heightToCenter: -1, side: 'left' })).toBe(false);
  });
});
