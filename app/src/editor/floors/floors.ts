// EZD-6001 Build step 1 (vault/plans/EZD-6001.md Decided D-List, D-Open, D-Store, D-Add, D-Rename, D-Delete,
// D-Case; Q-0509; Q-0508; Q-0690 (a)): the project's floors read from the model, the open floor the canvas shows,
// and the changes that add, rename and delete a floor. The chosen floor is held for this editor session only: every
// open starts on the lowest floor. No DOM.
import { CURRENT_SCHEMA_VERSION, parseStoredObject } from '@ezdraft/geometry';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Change, Objects } from '../model/patches';
import { idKey } from '../shared/ids';

export type FloorEntry = { id: string; name: string; order: number };

// D-List: every stored floor that parses, by `order` then id.
export function listFloors(objects: Objects): FloorEntry[] {
  const out: FloorEntry[] = [];
  for (const [id, value] of objects) {
    if (value.type !== 'floor') continue;
    const r = parseStoredObject({
      id,
      type: value.type,
      schema_version: value.schemaVersion,
      data: value.data,
    });
    if (!r.ok || r.object.type !== 'floor') continue;
    out.push({ id, name: r.object.data.name, order: r.object.data.order });
  }
  return out.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function findFloor(objects: Objects, id: string): FloorEntry | undefined {
  const want = idKey(id);
  return listFloors(objects).find((f) => idKey(f.id) === want);
}

// D-Open: the chosen floor when it is still a floor (in its stored spelling), else the lowest floor, else null.
export function resolveOpenFloor(objects: Objects, chosen: string | null): string | null {
  const floors = listFloors(objects);
  if (chosen !== null) {
    const want = idKey(chosen);
    const hit = floors.find((f) => idKey(f.id) === want);
    if (hit !== undefined) return hit.id;
  }
  return floors[0]?.id ?? null;
}

// D-Delete: every other object whose raw `data.level` names the floor, parsed or not (as the server's level check
// reads it), ids ascending.
export function objectsOnFloor(objects: Objects, floorId: string): string[] {
  const want = idKey(floorId);
  const ids: string[] = [];
  for (const [id, value] of objects) {
    if (value.type === 'floor') continue;
    const level = (value.data as { level?: unknown } | null)?.level;
    if (typeof level === 'string' && idKey(level) === want) ids.push(id);
  }
  return ids.sort();
}

// D-Add: one more than the highest floor order, or 1 with no floor.
export function nextFloorOrder(objects: Objects): number {
  let high = 0;
  for (const f of listFloors(objects)) if (f.order > high) high = f.order;
  return high + 1;
}

export function addFloorChange(objects: Objects, id: string, name: string): Change {
  return {
    id,
    value: {
      type: 'floor',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { name, order: nextFloorOrder(objects) },
    },
  };
}

// D-Rename: null (no edit) for an empty name, the same name or an id that is not a floor.
export function renameFloorChange(objects: Objects, id: string, name: string): Change | null {
  const trimmed = name.trim();
  const floor = findFloor(objects, id);
  if (floor === undefined || trimmed === '' || trimmed === floor.name) return null;
  return {
    id: floor.id,
    value: {
      type: 'floor',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { name: trimmed, order: floor.order },
    },
  };
}

// D-Delete: the floor's objects, then the floor; null for an id that is not a floor or for the only floor.
export function deleteFloorChanges(objects: Objects, floorId: string): Change[] | null {
  const floors = listFloors(objects);
  const want = idKey(floorId);
  const floor = floors.find((f) => idKey(f.id) === want);
  if (floor === undefined || floors.length <= 1) return null;
  return [
    ...objectsOnFloor(objects, floor.id).map((id) => ({ id, value: null })),
    { id: floor.id, value: null },
  ];
}

export type FloorViewState = { chosenId: string | null };

export type FloorView = StoreApi<FloorViewState> & { setOpenFloor(id: string | null): void };

// What the controllers and panels read: the chosen floor and its changes.
export type FloorChoice = Pick<FloorView, 'getState' | 'subscribe'>;

// D-Store: never saved, never sent; a same-value set tells no one.
export function createFloorView(): FloorView {
  const store = createStore<FloorViewState>(() => ({ chosenId: null }));
  return Object.assign(store, {
    setOpenFloor(id: string | null) {
      if (store.getState().chosenId === id) return;
      store.setState({ chosenId: id });
    },
  });
}

// The chosen floor id of an optional floor view (null = the lowest floor).
export const chosenFloor = (floors: FloorChoice | undefined | null): string | null =>
  floors?.getState().chosenId ?? null;
