// EZD-404 test data: board S04's back wall run, a 3" filler (1/2" scribe), B15, DW24, SB36, B18 and B21 (chain
// 3 + 15 + 24 + 36 + 18 + 21 = 117"), two 30" uppers, on a 117 1/2" wall (AC-EZD-407-1), as stored model values.
import { moveWall, type ModelObject } from '@ezdraft/geometry';
import type { ObjectValue } from '../../../lib/outbox/model-api';
import type { Objects } from '../../model/patches';
import { modelObjects } from '../cabinet-view';

export const CAB_FLOOR = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
export const CAB_WALL = 'aaf876ba-3f51-4bdc-a79b-74af4fe95f45';
export const CAB_RUN = 'c0000000-0000-4000-8000-000000000001';
export const cabId = (n: number) => `c0000000-0000-4000-8000-${String(100 + n).padStart(12, '0')}`;

const member = (attributes: Record<string, unknown>) => ({
  status: 'new',
  level: CAB_FLOOR,
  attributes,
});
const boxValue = (
  code: string,
  boxType: string,
  width: number,
  faceLayout: string,
): ObjectValue => ({
  type: 'cabinet_box',
  schemaVersion: 6,
  data: member({
    code,
    boxType,
    width,
    depth: boxType === 'wall' ? 12 : 24,
    height: boxType === 'wall' ? 30 : 34.5,
    faceLayout,
    hingeSide: 'left',
    finishedEnds: 'none',
    catalogItemId: null,
    finish: null,
  }),
});

// [id, value] in run order: base 1..6, uppers 7..8.
export function boardRunEntries(): [string, ObjectValue][] {
  const base: ObjectValue[] = [
    {
      type: 'cabinet_filler',
      schemaVersion: 6,
      data: member({
        code: 'F3',
        width: 3,
        depth: 24,
        height: 34.5,
        scribe: 0.5,
        catalogItemId: null,
        finish: null,
      }),
    },
    boxValue('B15', 'base', 15, 'drawer_door_1'),
    boxValue('DW24', 'appliance_panel', 24, 'panel'),
    boxValue('SB36', 'sink_base', 36, 'false_drawer_doors_2'),
    boxValue('B18', 'base', 18, 'drawer_door_1'),
    boxValue('B21', 'base', 21, 'drawer_door_1'),
  ];
  const upper = [boxValue('W1530', 'wall', 15, 'door_1'), boxValue('W3030', 'wall', 30, 'doors_2')];
  const entries: [string, ObjectValue][] = [...base, ...upper].map((v, i) => [cabId(i + 1), v]);
  const run: ObjectValue = {
    type: 'cabinet_run',
    schemaVersion: 6,
    data: {
      geometry: { hostWallId: CAB_WALL, start: { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
      level: CAB_FLOOR,
      attributes: {
        name: 'Back wall run',
        base: base.map((_, i) => cabId(i + 1)),
        upper: upper.map((_, i) => cabId(base.length + i + 1)),
      },
    },
  };
  return [[CAB_RUN, run], ...entries];
}

export function boardModel(): Objects {
  const wall: ObjectValue = {
    type: 'wall',
    schemaVersion: 6,
    data: {
      geometry: { start: { x: 0, y: 0 }, end: { x: 117.5, y: 0 } },
      status: 'new',
      level: CAB_FLOOR,
      attributes: {
        thickness: 4.5,
        thicknessSide: 'right',
        height: 96,
        topCutToCeiling: false,
        bearing: false,
        layers: [
          { material: 'drywall', thickness: 0.5 },
          { material: 'stud', thickness: 3.5 },
          { material: 'drywall', thickness: 0.5 },
        ],
      },
    },
  };
  const floor: ObjectValue = {
    type: 'floor',
    schemaVersion: 6,
    data: { name: 'Floor 1', order: 1 },
  };
  return new Map<string, ObjectValue>([[CAB_FLOOR, floor], [CAB_WALL, wall], ...boardRunEntries()]);
}

// EZD-410: the board model after its back wall is moved by `delta` with walls/move.ts (the run stays where it stands),
// as the screen reads it.
export function boardModelWallMoved(delta: { x: number; y: number }): ModelObject[] {
  const objects = modelObjects(boardModel());
  const r = moveWall(objects, CAB_WALL, delta);
  if (!r.ok) throw new Error(r.reason);
  const changed = new Map<string, ModelObject>(r.changed.map((w) => [w.id, w]));
  return objects.map((o) => changed.get(o.id) ?? o);
}
