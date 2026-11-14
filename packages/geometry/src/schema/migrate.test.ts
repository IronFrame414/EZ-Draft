// EZD-202 G8-G9 (vault/plans/EZD-202.md section 3 migrate.ts, section 4; AC-EZD-202-3). Expected values: AC-3
// (every stored sample migrates to the current version and parses; the sample is never mutated) and section 3
// (the exact `migrationChainProblems` strings and their order).
import { describe, expect, test } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  migrateStoredObject,
  migrationChainProblems,
} from './migrate';
import { parseStoredObject, type StoredObject } from './index';
import v1 from './samples/v1.json';
import v2 from './samples/v2.json';
import v3 from './samples/v3.json';
import v4 from './samples/v4.json';
import v5 from './samples/v5.json';

const STORED_SAMPLES: Record<number, { objects: StoredObject[] }> = {
  1: v1 as unknown as { objects: StoredObject[] },
  2: v2 as unknown as { objects: StoredObject[] },
  3: v3 as unknown as { objects: StoredObject[] },
  4: v4 as unknown as { objects: StoredObject[] },
  5: v5 as unknown as { objects: StoredObject[] },
};

const keys = (r: Record<number, unknown>) => Object.keys(r).map(Number);

describe('EZD-202 schema migration', () => {
  test('G8 chain: every stored sample migrates to the current version and parses; none is changed', () => {
    for (const [, sample] of Object.entries(STORED_SAMPLES)) {
      const before = JSON.parse(JSON.stringify(sample)) as typeof sample;
      for (const obj of sample.objects) {
        const migrated = migrateStoredObject(obj);
        expect(migrated).not.toBeNull();
        expect(migrated?.schema_version).toBe(CURRENT_SCHEMA_VERSION);
        expect(parseStoredObject(migrated as StoredObject).ok).toBe(true);
      }
      expect(sample).toEqual(before);
    }
    expect(CURRENT_SCHEMA_VERSION).toBe(5);
    expect(
      migrationChainProblems(CURRENT_SCHEMA_VERSION, keys(MIGRATIONS), keys(STORED_SAMPLES)),
    ).toEqual([]);
  });

  test('G9 guard: the chain checker names every gap', () => {
    expect(migrationChainProblems(2, [], [1])).toEqual([
      'migrate from 1 missing',
      'sample of version 2 missing',
    ]);
    expect(migrationChainProblems(1, [1], [1])).toEqual(['migrate from 1 has no target version']);
    expect(migrationChainProblems(2, [1], [1, 2])).toEqual([]);
  });
});
