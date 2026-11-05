// EZD-202 Build step 7 (vault/plans/EZD-202.md section 3 `migrate.ts`, Decided "Version rule"; 03b rule 5;
// AC-EZD-202-3): stored objects move up one schema version per step. A change that keeps every stored object
// valid keeps the version; any other raises CURRENT_SCHEMA_VERSION, adds MIGRATIONS[old] and samples/v<new>.json.
import type { StoredObject } from './index';

export const CURRENT_SCHEMA_VERSION = 1;

// Takes an object at `schema_version` n and returns a new object at n + 1; never mutates its input.
export type MigrateStep = (obj: Readonly<StoredObject>) => StoredObject;

export const MIGRATIONS: Readonly<Record<number, MigrateStep>> = {};

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
