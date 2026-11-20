// EZD-412 test data: a two-run L kitchen as stored model values (hand counts in trace-tool.test.ts). Walls 4 1/2"
// thick, their bodies outside the room (model y up): back wall y = 0 from x = 0 to 144, left wall x = 0, right wall
// x = 144. Run "Back wall": four 36" base boxes from the left corner; run "Left return": a 30" and a 33" base box on
// the left wall from y = 24.
import type { Point } from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { Objects } from '../model/patches';

export const CT_FLOOR = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
export const ctId = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const wallValue = (start: Point, end: Point): ObjectValue => ({
  type: 'wall',
  schemaVersion: 6,
  data: {
    geometry: { start, end },
    status: 'new',
    level: CT_FLOOR,
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
});
const boxValue = (code: string, width: number): ObjectValue => ({
  type: 'cabinet_box',
  schemaVersion: 6,
  data: {
    status: 'new',
    level: CT_FLOOR,
    attributes: {
      code,
      boxType: 'base',
      width,
      depth: 24,
      height: 34.5,
      faceLayout: 'drawer_door_1',
      hingeSide: 'left',
      finishedEnds: 'none',
      catalogItemId: null,
      finish: null,
    },
  },
});
const runValue = (
  name: string,
  host: string,
  start: Point,
  axis: Point,
  base: string[],
): ObjectValue => ({
  type: 'cabinet_run',
  schemaVersion: 6,
  data: {
    geometry: { hostWallId: host, start, axis },
    level: CT_FLOOR,
    attributes: { name, base, upper: [] },
  },
});

// The two-run L kitchen as stored model values.
export function twoRunModel(): Objects {
  return new Map<string, ObjectValue>([
    [CT_FLOOR, { type: 'floor', schemaVersion: 6, data: { name: 'Floor 1', order: 1 } }],
    [ctId(1), wallValue({ x: 0, y: 0 }, { x: 144, y: 0 })],
    [ctId(2), wallValue({ x: 0, y: 96 }, { x: 0, y: 0 })],
    [ctId(3), wallValue({ x: 144, y: 0 }, { x: 144, y: 96 })],
    [
      ctId(10),
      runValue('Back wall', ctId(1), { x: 0, y: 0 }, { x: 1, y: 0 }, [
        ctId(11),
        ctId(12),
        ctId(13),
        ctId(14),
      ]),
    ],
    [ctId(11), boxValue('B36', 36)],
    [ctId(12), boxValue('B36', 36)],
    [ctId(13), boxValue('SB36', 36)],
    [ctId(14), boxValue('B36', 36)],
    [
      ctId(20),
      runValue('Left return', ctId(2), { x: 0, y: 24 }, { x: 0, y: 1 }, [ctId(21), ctId(22)]),
    ],
    [ctId(21), boxValue('B30', 30)],
    [ctId(22), boxValue('B33', 33)],
  ]);
}

// EZD-413: a sink (or another fixture) placed on the floor, centred at `center` with its width along +x.
export const fixtureValue = (
  kind: 'sink' | 'cooktop' | 'dishwasher',
  center: Point,
  width: number,
  depth: number,
): ObjectValue => ({
  type: 'fixture',
  schemaVersion: 7,
  data: {
    geometry: { center, axis: { x: 1, y: 0 } },
    status: 'new',
    level: CT_FLOOR,
    attributes: { kind, width, depth },
  },
});
