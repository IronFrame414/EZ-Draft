// EZD-235 D1-D5 (vault/plans/EZD-235.md section 4): the derived-value cache. Expected values are the plan's rows.
import { describe, expect, it } from 'vitest';
import type { ModelObject, Point } from '../schema';
import { F2, FA, roomObj, uid, wallObj } from '../rooms/test-utils/fixtures';
import { ROOM_AREA, createDerivedCache, type DerivedDef, type DerivedSource } from './derived';

const P = (x: number, y: number): Point => ({ x, y });
const RECT = (w: number, d: number): Point[] => [P(0, 0), P(w, 0), P(w, d), P(0, d)];

const X: DerivedDef<string | null> = {
  name: 'x',
  compute: (read, key) => {
    const o = read.object(key);
    return o !== null && o.type === 'room' ? o.data.attributes.name : null;
  },
};

function fakeSource(objects: readonly ModelObject[]): DerivedSource {
  return {
    object: (id) => objects.find((o) => o.id === id) ?? null,
    objectsOf: (type, level) =>
      objects.filter(
        (o) =>
          o.type === type &&
          o.data.level.toLowerCase() === level.toLowerCase(),
      ) as never,
  };
}

function renamedRoom<T extends ReturnType<typeof roomObj>>(r: T, name: string): T {
  return { ...r, data: { ...r.data, attributes: { ...r.data.attributes, name } } };
}

describe('EZD-235 derived cache', () => {
  const A = roomObj(uid(1), RECT(144, 120), 'A');
  const B = roomObj(uid(2), RECT(120, 120), 'B');

  it('EZD-235 D1 hit, change and lazy: recomputed only when a read object changes and only when asked', () => {
    const cache = createDerivedCache();
    const Bp = renamedRoom(B, 'B1');
    const s1 = fakeSource([A, B]);
    cache.get(X, uid(1), s1);
    cache.get(X, uid(1), s1);
    expect(cache.stats()).toEqual({ computes: { x: 1 }, hits: { x: 1 }, entries: 1 });

    cache.get(X, uid(1), fakeSource([A, Bp]));
    expect(cache.stats().computes.x).toBe(1);
    expect(cache.stats().hits.x).toBe(2);

    // s3 [A1, B1] is made but never asked; s4 [A2, B1] is asked.
    fakeSource([renamedRoom(A, 'A1'), Bp]);
    const s4 = fakeSource([renamedRoom(A, 'A2'), Bp]);
    expect(cache.get(X, uid(1), s4)).toBe('A2');
    expect(cache.stats().computes.x).toBe(2);

    const Y: DerivedDef<string | null> = { name: 'y', compute: X.compute };
    cache.get(Y, uid(1), s4);
    expect(cache.stats().computes).toEqual({ x: 2, y: 1 });
    expect(cache.stats().entries).toBe(2);
  });

  it('EZD-235 D2 list reads: same items in the same order stay valid', () => {
    const w1 = wallObj(uid(11), P(0, 0), P(144, 0), 'right', FA);
    const w2 = wallObj(uid(12), P(0, 0), P(144, 0), 'right', F2);
    const w3 = wallObj(uid(13), P(0, 120), P(144, 120), 'right', FA);
    const w1p = wallObj(uid(11), P(0, 0), P(144, 0), 'right', FA.toUpperCase());
    const W: DerivedDef<number> = {
      name: 'w',
      compute: (read) => read.objectsOf('wall', FA).length,
    };
    const cache = createDerivedCache();
    const s4Objects: ModelObject[] = [w3, w1, w2];
    const steps: [ModelObject[], number, number][] = [
      [[w1], 1, 1],
      [[w1, w2], 1, 1],
      [[w1, w2, w3], 2, 2],
      [s4Objects, 3, 2],
      [s4Objects, 3, 2],
      [[w1p, w3], 4, 2],
    ];
    for (const [objs, computes, value] of steps) {
      expect(cache.get(W, '', fakeSource(objs))).toBe(value);
      expect(cache.stats().computes.w).toBe(computes);
    }
  });

  it('EZD-235 D3 errors: a throwing compute caches nothing; nested get and a duplicate name throw', () => {
    const cache = createDerivedCache();
    const s = fakeSource([A, B]);
    let calls = 0;
    const T: DerivedDef<number> = {
      name: 't',
      compute: () => {
        calls += 1;
        if (calls === 1) throw new Error('boom');
        return 5;
      },
    };
    expect(() => cache.get(T, '', s)).toThrow('boom');
    expect(cache.stats().computes.t).toBe(1);
    expect(cache.stats().entries).toBe(0);
    expect(cache.get(T, '', s)).toBe(5);
    expect(cache.stats().computes.t).toBe(2);
    expect(cache.stats().entries).toBe(1);

    const N: DerivedDef<string | null> = { name: 'n', compute: () => cache.get(X, uid(1), s) };
    expect(() => cache.get(N, '', s)).toThrow('derived_nested_get');
    expect(cache.stats().computes.n).toBe(1);
    expect(cache.stats().computes.x).toBeUndefined();
    expect(cache.get(X, uid(1), s)).toBe('A');
    expect(cache.stats().computes.x).toBe(1);

    expect(() => cache.get({ name: 'x', compute: () => 0 }, uid(1), s)).toThrow(
      'derived_duplicate_name',
    );
    expect(cache.stats().computes.x).toBe(1);
  });

  it('EZD-235 D4 prune drops entries whose objects are gone or changed and keeps the rest', () => {
    const cache = createDerivedCache();
    const s1 = fakeSource([A, B]);
    cache.get(X, uid(1), s1);
    cache.get(X, uid(2), s1);
    const s2 = fakeSource([B]);
    expect(cache.prune(s2)).toBe(1);
    expect(cache.stats().entries).toBe(1);
    expect(cache.prune(s2)).toBe(0);
    const s3 = fakeSource([renamedRoom(B, 'B1')]);
    expect(cache.prune(s3)).toBe(1);
    expect(cache.stats().entries).toBe(0);
    expect(cache.stats().computes.x).toBe(2);
    expect(cache.get(X, uid(9), s3)).toBeNull();
    expect(cache.stats().entries).toBe(1);
    expect(cache.stats().computes.x).toBe(3);
    expect(cache.prune(s3)).toBe(1);
    expect(cache.stats().entries).toBe(0);
    expect(cache.stats().computes.x).toBe(3);
  });

  it('EZD-235 D5 ROOM_AREA gives whole square feet for a room and null for anything else', () => {
    const s = fakeSource([
      roomObj(uid(1), RECT(144, 120), 'R1'),
      roomObj(uid(2), RECT(147, 120), 'R2'),
      roomObj(uid(3), RECT(2400, 2400), 'R3'),
      wallObj(uid(4), P(0, 0), P(144, 0)),
    ]);
    const cache = createDerivedCache();
    const got = [uid(1), uid(2), uid(3), uid(4), uid(99), ''].map((k) =>
      cache.get(ROOM_AREA, k, s),
    );
    expect(got).toEqual([120, 123, 40000, null, null, null]);
    expect(ROOM_AREA.name).toBe('room-area');
  });
});
