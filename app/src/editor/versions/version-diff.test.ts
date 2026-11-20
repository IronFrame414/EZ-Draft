// EZD-139 D1-D6 (AC-EZD-139-2, -3). Expected values from examples 09p "Visual diff" rows 1-4 and Q-0700 05: compare
// by object id; same id with different data is changed, old only is removed since, working only is added since; an
// identical pair shows 0 changed, 0 removed, 0 added; the diff changes neither version.
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { baseObjects, uid, withWalls } from '../tools/test-utils/fixtures';
import { versionDiff } from './version-diff';

// Wall n running north 8' at x.
const wallAt = (objects: Map<string, ObjectValue>, n: number, x: number) =>
  withWalls(
    objects,
    n,
    [
      { x, y: 0 },
      { x, y: 96 },
    ],
    false,
  );

const freezeAll = (m: Map<string, ObjectValue>) => {
  const deep = (v: unknown): unknown => {
    if (typeof v === 'object' && v !== null) {
      for (const k of Object.keys(v)) deep((v as Record<string, unknown>)[k]);
      Object.freeze(v);
    }
    return v;
  };
  for (const v of m.values()) deep(v);
  return m;
};

const snapshot = (m: Map<string, ObjectValue>) => JSON.stringify([...m]);

describe('EZD-139 version diff (09p Visual diff)', () => {
  it('D1 row 1: wall 4 at x = 0 in the old version, at x = 6" in the working copy → 1 changed', () => {
    const old = wallAt(baseObjects(), 4, 0);
    const working = wallAt(baseObjects(), 4, 6);
    const d = versionDiff(old, working);
    expect(d.changed).toEqual([uid(4)]);
    expect(d.removed).toEqual([]);
    expect(d.added).toEqual([]);
  });

  it('D2 row 2: wall 5 in the old version only → 1 removed since', () => {
    const old = wallAt(baseObjects(), 5, 0);
    const d = versionDiff(old, baseObjects());
    expect(d).toEqual({ changed: [], removed: [uid(5)], added: [] });
  });

  it('D3 row 3: wall 9 in the working copy only → 1 added since', () => {
    const working = wallAt(baseObjects(), 9, 0);
    const d = versionDiff(baseObjects(), working);
    expect(d).toEqual({ changed: [], removed: [], added: [uid(9)] });
  });

  it('D4 row 4: identical versions → 0 changed, 0 removed, 0 added', () => {
    const d = versionDiff(wallAt(baseObjects(), 4, 0), wallAt(baseObjects(), 4, 0));
    expect(d).toEqual({ changed: [], removed: [], added: [] });
  });

  it('D5 same data with object keys in another order is not a change; ids match whatever their case', () => {
    const old = new Map<string, ObjectValue>([
      [uid(1).toUpperCase(), { type: 'floor', schemaVersion: 1, data: { name: 'Floor 1', order: 1 } }],
    ]);
    const working = new Map<string, ObjectValue>([
      [uid(1), { type: 'floor', schemaVersion: 1, data: { order: 1, name: 'Floor 1' } }],
    ]);
    expect(versionDiff(old, working)).toEqual({ changed: [], removed: [], added: [] });
  });

  it('D6 the diff changes neither version (Q-0700 05)', () => {
    const old = freezeAll(wallAt(wallAt(baseObjects(), 4, 0), 5, 48));
    const working = freezeAll(wallAt(wallAt(baseObjects(), 4, 6), 9, 120));
    const before = [snapshot(old), snapshot(working)];
    const d = versionDiff(old, working);
    expect(d).toEqual({ changed: [uid(4)], removed: [uid(5)], added: [uid(9)] });
    expect([snapshot(old), snapshot(working)]).toEqual(before);
    expect(old.size).toBe(3);
    expect(working.size).toBe(3);
  });
});
