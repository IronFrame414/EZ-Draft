// EZD-235 Build step 6 (vault/plans/EZD-235.md Decided "D-Parse", "D-List", "D-Binding", "D-RoomArea"; 11 rule 2):
// the open model's derived values: a DerivedSource over the store's objects, and one cache bound to the store.
import {
  ROOM_AREA,
  createDerivedCache,
  parseStoredObject,
  roomAreaSqFt,
  type DerivedDef,
  type DerivedObjectType,
  type DerivedSource,
  type DerivedStats,
  type ModelObject,
  type ObjectOf,
  type RoomObject,
} from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { ModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';

export type ParsedObjects = WeakMap<
  ObjectValue,
  { readonly id: string; readonly object: ModelObject | null }
>;

export type ModelDerived = {
  get<V>(def: DerivedDef<V>, key: string): V;
  roomAreaSqFt: (room: RoomObject) => number;
  prune(): number;
  stats(): DerivedStats;
};

const LISTED: readonly string[] = ['wall', 'opening', 'room'];

export function objectsSource(objects: Objects, parsed: ParsedObjects): DerivedSource {
  const parse = (id: string, value: ObjectValue): ModelObject | null => {
    const seen = parsed.get(value);
    if (seen !== undefined && seen.id === id) return seen.object;
    const r = parseStoredObject({
      id,
      type: value.type,
      schema_version: value.schemaVersion,
      data: value.data,
    });
    const object = r.ok ? r.object : null;
    parsed.set(value, { id, object });
    return object;
  };
  const lists = new Map<string, readonly ModelObject[]>();
  return {
    object(id) {
      const value = objects.get(id);
      return value === undefined ? null : parse(id, value);
    },
    objectsOf<T extends DerivedObjectType>(type: T, level: string): readonly ObjectOf<T>[] {
      if (!LISTED.includes(type)) return [];
      const lower = level.toLowerCase();
      const listKey = `${type}\u0000${lower}`;
      let list = lists.get(listKey);
      if (list === undefined) {
        const out: ModelObject[] = [];
        for (const [id, value] of objects) {
          if (value.type !== type) continue;
          const object = parse(id, value);
          if (object !== null && object.type !== 'floor' && object.data.level.toLowerCase() === lower) {
            out.push(object);
          }
        }
        list = out;
        lists.set(listKey, list);
      }
      return list as readonly ObjectOf<T>[];
    },
  };
}

export function createModelDerived(store: Pick<ModelStore, 'getState'>): ModelDerived {
  const cache = createDerivedCache();
  const parsed: ParsedObjects = new WeakMap();
  let last: { objects: Objects; source: DerivedSource } | null = null;
  const current = (): DerivedSource => {
    const objects = store.getState().objects;
    if (last === null || last.objects !== objects) {
      last = { objects, source: objectsSource(objects, parsed) };
    }
    return last.source;
  };
  return {
    get: (def, key) => cache.get(def, key, current()),
    roomAreaSqFt: (room) => {
      const source = current();
      const stored = source.object(room.id);
      if (stored !== null && stored.type === 'room') {
        return cache.get(ROOM_AREA, room.id, source) ?? roomAreaSqFt(room.data.geometry.boundary);
      }
      return roomAreaSqFt(room.data.geometry.boundary);
    },
    prune: () => cache.prune(current()),
    stats: () => cache.stats(),
  };
}
