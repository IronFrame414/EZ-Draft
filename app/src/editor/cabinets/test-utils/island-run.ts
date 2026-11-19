// EZD-419 test data: board S03Plan's island run off every wall (end panel, B24, DB24, B24, end panel = 73 1/2"; board
// S04b "island cabinets 73 1/2") with a countertop piece over it, as stored model values.
import type { ObjectValue } from '../../../lib/outbox/model-api';
import type { Objects } from '../../model/patches';

export const FLOOR = '44444444-4444-4444-8444-444444444444';
export const RUN = 'd0000000-0000-4000-8000-000000000001';
export const TOP = 'd0000000-0000-4000-8000-000000000050';
export const ITEM = 'd0000000-0000-4000-8000-000000000060';
export const mid = (n: number) => `d0000000-0000-4000-8000-${String(100 + n).padStart(12, '0')}`;

const box = (code: string, boxType: string, faceLayout: string): ObjectValue => ({
  type: 'cabinet_box',
  schemaVersion: 6,
  data: {
    status: 'new',
    level: FLOOR,
    attributes: {
      code,
      boxType,
      width: 24,
      depth: 24,
      height: 34.5,
      faceLayout,
      hingeSide: 'left',
      finishedEnds: 'none',
      catalogItemId: null,
      finish: null,
    },
  },
});
const endPanel: ObjectValue = {
  type: 'cabinet_panel',
  schemaVersion: 6,
  data: {
    status: 'new',
    level: FLOOR,
    attributes: {
      kind: 'end',
      code: 'EP',
      width: 0.75,
      depth: 24,
      height: 34.5,
      catalogItemId: null,
      finish: null,
    },
  },
};

// The island run off every wall: end panel, B24, DB24, B24, end panel; a top over it (1 1/2" and 12" overhangs).
export function islandModel(withTop = true, topAt = { x: -1.5, y: -1.5 }): Objects {
  const base = [
    endPanel,
    box('B24', 'base', 'drawer_door_1'),
    box('DB24', 'drawer_base', 'drawers_3'),
    box('B24', 'base', 'drawer_door_1'),
    endPanel,
  ];
  const entries: [string, ObjectValue][] = base.map((v, i) => [mid(i + 1), v]);
  const run: ObjectValue = {
    type: 'cabinet_run',
    schemaVersion: 6,
    data: {
      geometry: { hostWallId: null, start: { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
      level: FLOOR,
      attributes: { name: 'Island run', base: base.map((_, i) => mid(i + 1)), upper: [] },
    },
  };
  const floor: ObjectValue = {
    type: 'floor',
    schemaVersion: 6,
    data: { name: 'Floor 1', order: 1 },
  };
  const m = new Map<string, ObjectValue>([[FLOOR, floor], [RUN, run], ...entries]);
  if (withTop) {
    const { x, y } = topAt;
    const outline = [
      { x, y },
      { x: x + 76.5, y },
      { x: x + 76.5, y: y + 37.5 },
      { x, y: y + 37.5 },
    ];
    m.set(TOP, {
      type: 'countertop_piece',
      schemaVersion: 7,
      data: {
        geometry: { outline },
        status: 'new',
        level: FLOOR,
        attributes: {
          label: 'A',
          name: 'Island',
          materialItemId: null,
          thickness: 1.25,
          edges: outline.map(() => ({
            kind: 'exposed',
            overhang: 1.5,
            backsplashHeight: null,
            profileId: null,
          })),
        },
      },
    });
  }
  return m;
}

export const apply = (
  objects: Objects,
  changes: { id: string; value: ObjectValue | null }[],
): Objects => {
  const next = new Map(objects);
  for (const c of changes) {
    if (c.value === null) next.delete(c.id);
    else next.set(c.id, c.value);
  }
  return next;
};
