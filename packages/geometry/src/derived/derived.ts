// EZD-235 Build step 2 (vault/plans/EZD-235.md Decided "D-Pull", "D-Source", "D-Read", "D-Valid", "D-Key", "D-Name",
// "D-Errors", "D-Prune", "D-Stats", "D-Room"; 11 rule 2): one pattern for everything computed from the model. A value
// is computed only inside `get`, cached by the objects and lists its compute read, and recomputed only when one of
// those changed. Pure TypeScript: no DOM, no Node API.
import type { ModelObject } from '../schema';
import { roomAreaSqFt } from '../rooms/area';

export type DerivedObjectType = Exclude<ModelObject['type'], 'floor'>;
export type ObjectOf<T extends DerivedObjectType> = Extract<ModelObject, { type: T }>;

// Answers the same for its whole life; a changed model is a new source object.
export type DerivedSource = {
  object(id: string): ModelObject | null;
  objectsOf<T extends DerivedObjectType>(type: T, level: string): readonly ObjectOf<T>[];
};

export type DerivedDef<V> = {
  readonly name: string;
  compute(read: DerivedSource, key: string): V;
};

export type DerivedStats = {
  computes: Readonly<Record<string, number>>;
  hits: Readonly<Record<string, number>>;
  entries: number;
};

export type DerivedCache = {
  get<V>(def: DerivedDef<V>, key: string, source: DerivedSource): V;
  prune(source: DerivedSource): number;
  stats(): DerivedStats;
};

type Read =
  | { readonly kind: 'object'; readonly id: string; readonly value: ModelObject | null }
  | {
      readonly kind: 'list';
      readonly type: DerivedObjectType;
      readonly level: string;
      readonly items: readonly ModelObject[];
    };

type Entry = { value: unknown; checked: DerivedSource; reads: Read[] };

function readsValid(reads: readonly Read[], source: DerivedSource): boolean {
  for (const r of reads) {
    if (r.kind === 'object') {
      if (source.object(r.id) !== r.value) return false;
    } else {
      const now = source.objectsOf(r.type, r.level);
      if (now.length !== r.items.length) return false;
      for (let i = 0; i < now.length; i++) if (now[i] !== r.items[i]) return false;
    }
  }
  return true;
}

export function createDerivedCache(): DerivedCache {
  const entries = new Map<string, Entry>();
  const defs = new Map<string, DerivedDef<unknown>>();
  const computes: Record<string, number> = {};
  const hits: Record<string, number> = {};
  let running = false;

  return {
    get<V>(def: DerivedDef<V>, key: string, source: DerivedSource): V {
      if (running) throw new Error('derived_nested_get');
      const known = defs.get(def.name);
      if (known === undefined) defs.set(def.name, def as DerivedDef<unknown>);
      else if (known !== (def as DerivedDef<unknown>)) throw new Error('derived_duplicate_name');
      const entryKey = `${def.name}\u0000${key}`;
      const entry = entries.get(entryKey);
      if (entry !== undefined && (entry.checked === source || readsValid(entry.reads, source))) {
        entry.checked = source;
        hits[def.name] = (hits[def.name] ?? 0) + 1;
        return entry.value as V;
      }
      computes[def.name] = (computes[def.name] ?? 0) + 1;
      const reads: Read[] = [];
      const recording: DerivedSource = {
        object(id) {
          const value = source.object(id);
          reads.push({ kind: 'object', id, value });
          return value;
        },
        objectsOf<T extends DerivedObjectType>(type: T, level: string) {
          const items = source.objectsOf(type, level);
          reads.push({ kind: 'list', type, level, items });
          return items;
        },
      };
      running = true;
      try {
        const value = def.compute(recording, key);
        entries.set(entryKey, { value, checked: source, reads });
        return value;
      } catch (error) {
        entries.delete(entryKey);
        throw error;
      } finally {
        running = false;
      }
    },
    prune(source) {
      let deleted = 0;
      for (const [k, entry] of [...entries]) {
        const gone = entry.reads.some((r) => r.kind === 'object' && source.object(r.id) === null);
        if (gone || !(entry.checked === source || readsValid(entry.reads, source))) {
          entries.delete(k);
          deleted++;
        }
      }
      return deleted;
    },
    stats() {
      return { computes: { ...computes }, hits: { ...hits }, entries: entries.size };
    },
  };
}

// The area of a room in whole square feet; null for anything that is not a room.
export const ROOM_AREA: DerivedDef<number | null> = {
  name: 'room-area',
  compute(read, key) {
    const o = read.object(key);
    return o !== null && o.type === 'room' ? roomAreaSqFt(o.data.geometry.boundary) : null;
  },
};
