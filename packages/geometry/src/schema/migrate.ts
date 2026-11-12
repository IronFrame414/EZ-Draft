// EZD-202 Build step 7 (vault/plans/EZD-202.md section 3 `migrate.ts`, Decided "Version rule"; 03b rule 5;
// AC-EZD-202-3): stored objects move up one schema version per step. A change that keeps every stored object
// valid keeps the version; any other raises CURRENT_SCHEMA_VERSION, adds MIGRATIONS[old] and samples/v<new>.json.
// EZD-203 Build step 5 (vault/plans/EZD-203.md section 1, Decided "Migration of a v1 wall"; Q-0558): v1 to v2
// gives every wall `attributes.layers`.
// EZD-205a Build step 2 (vault/plans/EZD-205a.md section 1, Decided "v2 → v3 step"; Q-0558; Q-0570): v2 to v3
// gives every room `status: 'existing'` and `closureOverride: null`.
// EZD-204a Build step 2 (vault/plans/EZD-204a.md section 1, Decided "v3 → v4 step"; AC-EZD-204-6, -15; Q-0642
// row 2; Q-0641 row 3): v3 to v4 gives every opening `axis: null`, Hinge left and swing left for a door, Not
// rated, no shutter and a typed rough opening.
import { coordsEqual } from '../tolerance';
import type { StoredObject } from './index';

export const CURRENT_SCHEMA_VERSION = 4;

// Takes an object at `schema_version` n and returns a new object at n + 1; never mutates its input.
export type MigrateStep = (obj: Readonly<StoredObject>) => StoredObject;

// The v1 default wall's layers, its own literal so a later default never changes this step.
const V1_WALL_LAYERS = Object.freeze([
  Object.freeze({ material: 'drywall', thickness: 0.5 }),
  Object.freeze({ material: 'stud', thickness: 3.5 }),
  Object.freeze({ material: 'drywall', thickness: 0.5 }),
] as const);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

// Copies `data` and `data.attributes` only (two levels); every other subtree is shared by reference, so untrusted
// data nested any depth reaches the schema and is refused there (EZD-203 security review round 1).
const migrateV1ToV2: MigrateStep = (obj) => {
  const data = obj.data;
  if (obj.type === 'wall' && isRecord(data) && isRecord(data.attributes)) {
    const thickness = data.attributes.thickness;
    if (typeof thickness === 'number' && Number.isFinite(thickness)) {
      const layers = coordsEqual(thickness, 4.5)
        ? V1_WALL_LAYERS.map((layer) => ({ ...layer }))
        : [{ material: 'stud', thickness }];
      return {
        id: obj.id,
        type: obj.type,
        schema_version: 2,
        data: { ...data, attributes: { ...data.attributes, layers } },
      };
    }
  }
  return { id: obj.id, type: obj.type, schema_version: 2, data };
};

// Copies `data` only (one level); every other subtree is shared by reference.
const migrateV2ToV3: MigrateStep = (obj) => {
  const data = obj.data;
  if (obj.type === 'room' && isRecord(data)) {
    return {
      id: obj.id,
      type: obj.type,
      schema_version: 3,
      data: { ...data, status: 'existing', closureOverride: null },
    };
  }
  return { id: obj.id, type: obj.type, schema_version: 3, data };
};

// Copies `data`, `data.geometry` and `data.attributes` only; every other subtree is shared by reference.
const migrateV3ToV4: MigrateStep = (obj) => {
  const data = obj.data;
  if (
    obj.type === 'opening' &&
    isRecord(data) &&
    isRecord(data.geometry) &&
    isRecord(data.attributes)
  ) {
    const d = data.attributes.kind === 'door' ? 'left' : null;
    return {
      id: obj.id,
      type: obj.type,
      schema_version: 4,
      data: {
        ...data,
        geometry: { ...data.geometry, axis: null },
        attributes: {
          ...data.attributes,
          swing: d,
          hand: d,
          impactRating: 'not_rated',
          shutterType: null,
          roughOpeningMode: 'typed',
        },
      },
    };
  }
  return { id: obj.id, type: obj.type, schema_version: 4, data };
};

export const MIGRATIONS: Readonly<Record<number, MigrateStep>> = {
  1: migrateV1ToV2,
  2: migrateV2ToV3,
  3: migrateV3ToV4,
};

// null when the version is not an integer in 1..CURRENT_SCHEMA_VERSION or a step is missing; an object already
// at the current version is returned as is.
export function migrateStoredObject(obj: StoredObject): StoredObject | null {
  const from = obj.schema_version;
  if (!Number.isInteger(from) || from < 1 || from > CURRENT_SCHEMA_VERSION) return null;
  let current: StoredObject = obj;
  for (let v = from; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step === undefined) return null;
    current = step(current);
  }
  return current;
}

export function migrationChainProblems(
  current: number,
  migrationFroms: readonly number[],
  sampleVersions: readonly number[],
): string[] {
  const problems: string[] = [];
  for (let v = 1; v <= current; v++) {
    if (v < current && !migrationFroms.includes(v)) problems.push(`migrate from ${v} missing`);
    if (!sampleVersions.includes(v)) problems.push(`sample of version ${v} missing`);
  }
  const extra = migrationFroms
    .filter((f) => !Number.isInteger(f) || f < 1 || f > current - 1)
    .sort((a, b) => a - b);
  for (const f of extra) problems.push(`migrate from ${f} has no target version`);
  return problems;
}
