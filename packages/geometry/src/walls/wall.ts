// EZD-203 Build step 7 (vault/plans/EZD-203.md section 3 `walls/wall.ts`, Decided "Default wall", "Wall length
// limits", "createWallData input", "Face offsets", "Thickness side", "Degenerate walls"; Q-0558; Q-0568; Q-0569 (b);
// Q-0570; 09j): the default wall, its measures and finished faces. Model inches, +x east, +y north.
import { MAX_WALL_LENGTH_IN } from '../length';
import type { Point, WallData, WallLayer } from '../schema';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';

export type WallObject = { id: string; type: 'wall'; data: WallData };

export type WallLine = { start: Point; end: Point };

type ThicknessSide = 'left' | 'right' | 'center';

export const DEFAULT_WALL_LAYERS: readonly WallLayer[] = Object.freeze([
  Object.freeze({ material: 'drywall', thickness: 0.5 }),
  Object.freeze({ material: 'stud', thickness: 3.5 }),
  Object.freeze({ material: 'drywall', thickness: 0.5 }),
] as const);

export const DEFAULT_WALL_HEIGHT_IN = 96;

export function wallThickness(layers: readonly WallLayer[]): number {
  return layers.reduce((sum, layer) => sum + layer.thickness, 0);
}

export function wallLength(line: WallLine): number {
  return Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
}

export function wallLengthProblem(length: number): 'zero_length' | 'too_long' | null {
  if (length <= COMPARISON_TOLERANCE_IN) return 'zero_length';
  if (length - MAX_WALL_LENGTH_IN > COMPARISON_TOLERANCE_IN) return 'too_long';
  return null;
}

const finitePoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);

export function createWallData(input: {
  start: Point;
  end: Point;
  level: string;
  thicknessSide?: ThicknessSide;
}):
  | { ok: true; data: WallData }
  | { ok: false; reason: 'invalid_point' | 'zero_length' | 'too_long' } {
  if (!finitePoint(input.start) || !finitePoint(input.end))
    return { ok: false, reason: 'invalid_point' };
  const problem = wallLengthProblem(wallLength(input));
  if (problem !== null) return { ok: false, reason: problem };
  const layers = DEFAULT_WALL_LAYERS.map((layer) => ({ ...layer }));
  return {
    ok: true,
    data: {
      geometry: {
        start: { x: input.start.x, y: input.start.y },
        end: { x: input.end.x, y: input.end.y },
      },
      status: 'existing',
      level: input.level,
      attributes: {
        thickness: wallThickness(layers),
        thicknessSide: input.thicknessSide ?? 'right',
        height: DEFAULT_WALL_HEIGHT_IN,
        topCutToCeiling: false,
        bearing: false,
        layers,
      },
    },
  };
}

const offsetLine = (line: WallLine, n: Point, by: number): WallLine => ({
  start: { x: line.start.x + n.x * by, y: line.start.y + n.y * by },
  end: { x: line.end.x + n.x * by, y: line.end.y + n.y * by },
});

const copyLine = (line: WallLine): WallLine => ({
  start: { x: line.start.x, y: line.start.y },
  end: { x: line.end.x, y: line.end.y },
});

export function wallFaceLines(data: WallData): { left: WallLine; right: WallLine } {
  const { start, end } = data.geometry;
  const line: WallLine = { start, end };
  const length = wallLength(line);
  if (length <= COMPARISON_TOLERANCE_IN) return { left: copyLine(line), right: copyLine(line) };
  const n: Point = { x: -(end.y - start.y) / length, y: (end.x - start.x) / length };
  const t = data.attributes.thickness;
  const side = data.attributes.thicknessSide;
  const leftBy = side === 'right' ? 0 : side === 'left' ? t : t / 2;
  return { left: offsetLine(line, n, leftBy), right: offsetLine(line, n, leftBy - t) };
}

export function thicknessSideFor(
  placement:
    { kind: 'open' } | { kind: 'partition' } | { kind: 'closed'; chain: readonly WallLine[] },
): ThicknessSide {
  if (placement.kind === 'open') return 'right';
  if (placement.kind === 'partition') return 'center';
  const chain = placement.chain;
  let twice = 0;
  for (let i = 0; i < chain.length; i++) {
    const p = chain[i]!.start;
    const q = chain[(i + 1) % chain.length]!.start;
    twice += p.x * q.y - q.x * p.y;
  }
  const area = twice / 2;
  if (area > COMPARISON_TOLERANCE_IN) return 'right';
  if (area < -COMPARISON_TOLERANCE_IN) return 'left';
  return 'right';
}
