// EZD-236 Build step 1 (vault/plans/EZD-236.md section 1 Decided "Mix", "Coordinates", "Walls", "Thickness side",
// "Rooms", "Room data", "Doors", "Windows", "Status", "Names", "Order", "Ids", "Determinism"; 11 Budgets; Q-0568):
// the benchmark project's whole-home model of 3,000 objects. No randomness, clock or argument.
// EZD-204a Build step 7 (vault/plans/EZD-204a.md section 1, Decided "Benchmark"; EZD-236; Q-0642 row 2): doors and
// windows carry the v4 opening fields at their upgrade values and `axis: null`.
import {
  CURRENT_SCHEMA_VERSION,
  newRoomAttributes,
  OBJECT_STATUSES,
  type OpeningData,
  type Point,
  type RoomData,
  type StoredObject,
  type WallData,
} from '../schema';
import { DEFAULT_WALL_LAYERS, createWallData, wallThickness } from '../walls/wall';

export const BENCHMARK_OBJECT_COUNT = 3000;

export const BENCHMARK_MIX: Readonly<{ floor: 2; wall: 1516; opening: 762; room: 720 }> =
  Object.freeze({ floor: 2, wall: 1516, opening: 762, room: 720 } as const);

export function benchmarkObjectId(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > BENCHMARK_OBJECT_COUNT)
    throw new RangeError('benchmark_id_range');
  return `b0000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

const ROWS = 18;
const COLS = 20;
const CELL = 120;
const WIDTH = CELL * COLS;
const DEPTH = CELL * ROWS;
const HORIZONTAL = (ROWS + 1) * COLS;
const VERTICAL = ROWS * (COLS + 1);
const ROOMS = ROWS * COLS;
const WINDOWS = COLS + 1;
const PER_FLOOR = HORIZONTAL + VERTICAL + ROOMS + ROOMS + WINDOWS;

type ThicknessSide = 'left' | 'right' | 'center';

const DOOR: OpeningData['attributes'] = {
  kind: 'door',
  width: 32,
  height: 80,
  roughOpening: { width: 34, height: 82 },
  sillHeight: 0,
  swing: 'left',
  hand: 'left',
  impactRating: 'not_rated',
  shutterType: null,
  roughOpeningMode: 'typed',
};
const WINDOW: OpeningData['attributes'] = {
  kind: 'window',
  width: 36,
  height: 48,
  roughOpening: { width: 36.5, height: 48.5 },
  sillHeight: 36,
  swing: null,
  hand: null,
  impactRating: 'not_rated',
  shutterType: null,
  roughOpeningMode: 'typed',
};

export function generateBenchmarkModel(): StoredObject[] {
  const objects: StoredObject[] = [];
  const push = (type: string, data: unknown) => {
    objects.push({
      id: benchmarkObjectId(objects.length + 1),
      type,
      schema_version: CURRENT_SCHEMA_VERSION,
      data,
    });
  };
  const status = () => OBJECT_STATUSES[objects.length % 3]!;
  const h = wallThickness(DEFAULT_WALL_LAYERS) / 2;

  push('floor', { name: 'Floor 1', order: 1 });
  push('floor', { name: 'Floor 2', order: 2 });
  const levels = [benchmarkObjectId(1), benchmarkObjectId(2)];
  let roomNumber = 0;

  levels.forEach((level, f) => {
    const base = 2 + f * PER_FLOOR;
    const horizontalId = (r: number, c: number) => benchmarkObjectId(base + r * COLS + c + 1);
    const verticalId = (r: number, c: number) =>
      benchmarkObjectId(base + HORIZONTAL + r * (COLS + 1) + c + 1);

    const wall = (start: Point, end: Point, thicknessSide: ThicknessSide) => {
      const made = createWallData({ start, end, level, thicknessSide });
      if (!made.ok) throw new Error('benchmark_wall_invalid');
      const data: WallData = { ...made.data, status: status() };
      push('wall', data);
    };
    for (let r = 0; r <= ROWS; r++)
      for (let c = 0; c < COLS; c++)
        wall(
          { x: CELL * c, y: CELL * r },
          { x: CELL * (c + 1), y: CELL * r },
          r === 0 ? 'right' : r === ROWS ? 'left' : 'center',
        );
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c <= COLS; c++)
        wall(
          { x: CELL * c, y: CELL * r },
          { x: CELL * c, y: CELL * (r + 1) },
          c === 0 ? 'left' : c === COLS ? 'right' : 'center',
        );

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const W = c === 0 ? 0 : CELL * c + h;
        const E = c === COLS - 1 ? WIDTH : CELL * (c + 1) - h;
        const S = r === 0 ? 0 : CELL * r + h;
        const N = r === ROWS - 1 ? DEPTH : CELL * (r + 1) - h;
        roomNumber += 1;
        const data: RoomData = {
          geometry: {
            boundary: [
              { x: W, y: S },
              { x: E, y: S },
              { x: E, y: N },
              { x: W, y: N },
            ],
          },
          status: 'existing',
          level,
          attributes: newRoomAttributes(`Room ${roomNumber}`),
          closureOverride: null,
        };
        push('room', data);
      }

    const opening = (center: Point, hostWallId: string, attributes: OpeningData['attributes']) => {
      const data: OpeningData = {
        geometry: { center, hostWallId, axis: null },
        status: status(),
        level,
        attributes: { ...attributes, roughOpening: { ...attributes.roughOpening } },
      };
      push('opening', data);
    };
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        opening({ x: CELL * c, y: CELL * r + CELL / 2 }, verticalId(r, c), DOOR);
    for (let c = 0; c < COLS; c++)
      opening({ x: CELL * c + CELL / 2, y: 0 }, horizontalId(0, c), WINDOW);
    opening({ x: WIDTH, y: CELL / 2 }, verticalId(0, COLS), WINDOW);
  });

  return objects;
}
