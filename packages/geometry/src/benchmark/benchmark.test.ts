// EZD-236 G1-G5 (vault/plans/EZD-236.md section 4; AC-EZD-236-1, -2). Expected values: Decided "Mix", "Ids",
// "Order", "Names", "Coordinates", "Walls", "Thickness side", "Rooms", "Room data", "Doors", "Windows", "Status"
// and "Determinism"; 11 Budgets (3,000 objects); P202 `OBJECT_STATUSES`, `parseModelDocument`; P203 T1 default
// wall values; `schema/migrate.ts` line 11 (CURRENT_SCHEMA_VERSION 3); P205a `findRoomOutlines`,
// `reconcileRooms`, `sameBoundary`.
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_WALL_LAYERS,
  OBJECT_STATUSES,
  findRoomOutlines,
  parseModelDocument,
  parseStoredObject,
  reconcileRooms,
  sameBoundary,
  type WallObject,
} from '../index';
import { pointsEqual } from '../tolerance';
import {
  BENCHMARK_MIX,
  BENCHMARK_OBJECT_COUNT,
  benchmarkObjectId,
  generateBenchmarkModel,
} from './benchmark';

// The generator's output is read here by its documented shape; `any` keeps the property reads short.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = { id: string; type: string; schema_version: number; data: Record<string, any> };
const model = () => generateBenchmarkModel() as Obj[];
const F1 = benchmarkObjectId(1);
const F2 = benchmarkObjectId(2);
const pt = (x: number, y: number) => ({ x, y });

describe('EZD-236 benchmark generator', () => {
  it('EZD-236 G1 mix: 3,000 objects, 2 floors, 1,516 walls, 762 openings, 720 rooms', () => {
    const objects = model();
    expect(objects).toHaveLength(3000);
    expect(BENCHMARK_OBJECT_COUNT).toBe(3000);
    expect(BENCHMARK_MIX).toEqual({ floor: 2, wall: 1516, opening: 762, room: 720 });
    expect(Object.isFrozen(BENCHMARK_MIX)).toBe(true);
    const counts: Record<string, number> = {};
    for (const o of objects) counts[o.type] = (counts[o.type] ?? 0) + 1;
    expect(counts).toEqual({ ...BENCHMARK_MIX });
    const kinds = objects
      .filter((o) => o.type === 'opening')
      .map((o) => o.data.attributes.kind as string);
    expect(kinds.filter((k) => k === 'door')).toHaveLength(720);
    expect(kinds.filter((k) => k === 'window')).toHaveLength(42);
    for (const level of [F1, F2]) {
      const on = objects.filter((o) => o.type !== 'floor' && o.data.level === level);
      expect(on.filter((o) => o.type === 'wall')).toHaveLength(758);
      expect(on.filter((o) => o.type === 'room')).toHaveLength(360);
      expect(on.filter((o) => o.type === 'opening')).toHaveLength(381);
    }
  });

  it('EZD-236 G2 validates: the whole document and every object parse against the schema', () => {
    const objects = generateBenchmarkModel();
    const doc = parseModelDocument({ objects });
    expect(doc.ok).toBe(true);
    if (doc.ok) expect(doc.document.objects).toHaveLength(3000);
    for (const o of objects) expect(parseStoredObject(o).ok).toBe(true);
  });

  it('EZD-236 G3 deterministic ids: same output each call, in a new array, ids 1 to 3000', () => {
    const a = generateBenchmarkModel();
    const b = generateBenchmarkModel();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(new Set(a.map((o) => o.id)).size).toBe(3000);
    expect(a[0]!.id).toBe('b0000000-0000-4000-8000-000000000001');
    expect(a[2999]!.id).toBe('b0000000-0000-4000-8000-000000000bb8');
    for (const o of a) expect(o.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
    for (const n of [0, 3001, 1.5])
      expect(() => benchmarkObjectId(n)).toThrow(
        expect.objectContaining({ name: 'RangeError', message: 'benchmark_id_range' }),
      );
  });

  it('EZD-236 G4 geometry: floors, walls, sides, openings, rooms and statuses as decided', () => {
    const o = model();
    expect(o[0]!.data).toEqual({ name: 'Floor 1', order: 1 });
    expect(o[1]!.data).toEqual({ name: 'Floor 2', order: 2 });

    const walls = o.filter((x) => x.type === 'wall');
    for (const w of walls) {
      const { start, end } = w.data.geometry;
      expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(120, 9);
      for (const p of [start, end]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(2400);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(2160);
      }
      expect(w.data.attributes.thickness).toBe(4.5);
      expect(w.data.attributes.height).toBe(96);
      expect(w.data.attributes.topCutToCeiling).toBe(false);
      expect(w.data.attributes.bearing).toBe(false);
      expect(w.data.attributes.layers).toEqual(DEFAULT_WALL_LAYERS);
    }
    expect(o[2]!.data.attributes.thicknessSide).toBe('right');
    expect(o[22]!.data.attributes.thicknessSide).toBe('center');
    expect(o[362]!.data.attributes.thicknessSide).toBe('left');
    expect(o[382]!.data.attributes.thicknessSide).toBe('left');
    expect(o[402]!.data.attributes.thicknessSide).toBe('right');
    for (const level of [F1, F2]) {
      const sides = walls
        .filter((w) => w.data.level === level)
        .map((w) => w.data.attributes.thicknessSide as string);
      expect(sides.filter((s) => s === 'right')).toHaveLength(38);
      expect(sides.filter((s) => s === 'left')).toHaveLength(38);
      expect(sides.filter((s) => s === 'center')).toHaveLength(682);
    }

    // Openings: floor f occupies positions base.. with 758 walls, 360 rooms, 360 doors, 21 windows.
    for (const f of [0, 1]) {
      const base = 2 + f * 1499;
      const level = f === 0 ? F1 : F2;
      const hosts = new Set<string>();
      const wallAt = (i: number) => o[base + i]!;
      for (let j = 0; j < 360; j++) {
        const r = Math.floor(j / 20);
        const c = j % 20;
        const door = o[base + 1118 + j]!;
        expect(door.type).toBe('opening');
        expect(door.data.level).toBe(level);
        expect(door.data.attributes).toEqual({
          kind: 'door',
          width: 32,
          height: 80,
          roughOpening: { width: 34, height: 82 },
          sillHeight: 0,
        });
        expect(door.data.geometry.center).toEqual(pt(120 * c, 120 * r + 60));
        const host = wallAt(380 + r * 21 + c);
        expect(door.data.geometry.hostWallId).toBe(host.id);
        expect(host.type).toBe('wall');
        expect(host.data.level).toBe(level);
        const hs = host.data.geometry;
        expect(
          pointsEqual(
            door.data.geometry.center,
            pt((hs.start.x + hs.end.x) / 2, (hs.start.y + hs.end.y) / 2),
          ),
        ).toBe(true);
        hosts.add(host.id);
      }
      for (let k = 0; k < 21; k++) {
        const win = o[base + 1478 + k]!;
        expect(win.type).toBe('opening');
        expect(win.data.level).toBe(level);
        expect(win.data.attributes).toEqual({
          kind: 'window',
          width: 36,
          height: 48,
          roughOpening: { width: 36.5, height: 48.5 },
          sillHeight: 36,
        });
        const center = k < 20 ? pt(120 * k + 60, 0) : pt(2400, 60);
        expect(win.data.geometry.center).toEqual(center);
        const host = wallAt(k < 20 ? k : 380 + 20);
        expect(win.data.geometry.hostWallId).toBe(host.id);
        const hs = host.data.geometry;
        expect(
          pointsEqual(center, pt((hs.start.x + hs.end.x) / 2, (hs.start.y + hs.end.y) / 2)),
        ).toBe(true);
        hosts.add(host.id);
      }
      expect(hosts.size).toBe(381);
    }

    // Rooms.
    const rooms = o.filter((x) => x.type === 'room');
    rooms.forEach((r, i) => {
      expect(r.data.attributes.name).toBe(`Room ${i + 1}`);
      expect(r.data.status).toBe('existing');
      expect(r.data.closureOverride).toBeNull();
    });
    expect(o[760]!.data.geometry.boundary).toEqual([
      pt(0, 0),
      pt(117.75, 0),
      pt(117.75, 117.75),
      pt(0, 117.75),
    ]);
    expect(o[781]!.data.geometry.boundary).toEqual([
      pt(122.25, 122.25),
      pt(237.75, 122.25),
      pt(237.75, 237.75),
      pt(122.25, 237.75),
    ]);
    expect(o[1119]!.data.geometry.boundary).toEqual([
      pt(2282.25, 2042.25),
      pt(2400, 2042.25),
      pt(2400, 2160),
      pt(2282.25, 2160),
    ]);

    // Status.
    expect(o[2]!.data.status).toBe('new');
    expect(o[3]!.data.status).toBe('existing');
    expect(o[4]!.data.status).toBe('demo');
    expect(OBJECT_STATUSES).toEqual(['existing', 'demo', 'new']);
    o.forEach((x, i) => {
      if (x.type === 'wall' || x.type === 'opening')
        expect(x.data.status).toBe(OBJECT_STATUSES[i % 3]);
    });
  });

  it(
    'EZD-236 G5 rooms match the walls: one outline per stored room and nothing to reconcile',
    { timeout: 30_000 },
    () => {
      const parsed = parseModelDocument({ objects: generateBenchmarkModel() });
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const objects = parsed.document.objects;
      const walls = objects.filter((x): x is WallObject => x.type === 'wall');
      for (const level of [F1, F2]) {
        const outlines = findRoomOutlines(walls, level);
        expect(outlines).toHaveLength(360);
        const stored = objects.filter(
          (x) => x.type === 'room' && x.data.level.toLowerCase() === level,
        );
        expect(stored).toHaveLength(360);
        for (const out of outlines) {
          const hits = stored.filter(
            (s) => s.type === 'room' && sameBoundary(out.boundary, s.data.geometry.boundary),
          );
          expect(hits).toHaveLength(1);
        }
        const newId = () => {
          throw new Error('newId must not be called');
        };
        expect(reconcileRooms(objects, level, newId)).toEqual({
          create: [],
          update: [],
          delete: [],
        });
      }
    },
  );
});
