// EZD-235 fixture (vault/plans/EZD-235.md section 3 "fixture" row; section 4 Fixtures): the 09j Thickness side
// row 2 model with Room area rows 9-10: a 144 x 120 room split by a centre partition into two rooms.
import { NO_NUMBERS, moveWall, type DrawingList, type Point } from '@ezdraft/geometry';
import type { ObjectValue } from '../../../lib/outbox/model-api';
import type { Change, Objects } from '../../model/patches';
import { toModelObjects, wallEditChanges } from '../../tools/model-changes';
import {
  F1,
  applyChanges,
  baseObjects,
  idSeq,
  uid,
  wallsOf,
  withWalls,
} from '../../tools/test-utils/fixtures';

const p = (x: number, y: number): Point => ({ x, y });

export const WEST_ROOM = uid(10);
export const EAST_ROOM = uid(11);
export const EAST_WALL = uid(2);
export const PARTITION = uid(5);

export function twoRoomObjects(): Map<string, ObjectValue> {
  const w = withWalls(
    withWalls(baseObjects(), 1, [p(0, 0), p(144, 0), p(144, 120), p(0, 120)], true),
    5,
    [p(60, 0), p(60, 120)],
    false,
    'center',
  );
  return applyChanges(w, wallEditChanges(w, F1, wallsOf(w), idSeq(10), NO_NUMBERS));
}

export function moveChanges(
  objects: Objects,
  wallId: string,
  delta: { x: number; y: number },
): Change[] {
  const r = moveWall(toModelObjects(objects, F1), wallId, delta);
  if (!r.ok) throw new Error(`moveChanges ${wallId}: ${r.reason}`);
  return wallEditChanges(objects, F1, r.changed, idSeq(20), NO_NUMBERS);
}

export function renamed(value: ObjectValue, name: string): ObjectValue {
  const data = value.data as { attributes?: Record<string, unknown> };
  return {
    ...value,
    data: { ...value.data, attributes: { ...data.attributes, name } },
  };
}

export function label(list: DrawingList | null, id: string): string {
  const hits =
    list === null
      ? []
      : list.items.filter((i) => i.kind === 'text' && i.layer === 'rooms' && i.objectId === id);
  const only = hits[0];
  if (hits.length !== 1 || only === undefined || only.kind !== 'text')
    throw new Error('label ' + id);
  return only.text;
}
