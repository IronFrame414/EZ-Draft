// EZD-413 (S04b Controls "Cutout | Canvas tool bar | Place a sink or cooktop cutout; link to the fixture/appliance
// cutout size from catalog"; phase-04 EZD-413 "sink and cooktop cutouts with a typed W × D (default from the fixture
// under them)"; AC-EZD-413-2 "a typed 30" × 16" cutout draws at that size"; vault/build/assumptions.md EZD-413): a
// cutout's corners, whether it fits its piece, placing and resizing one, and the sink or cooktop under a click. Area
// and exposed edge are measured on the outline, so a cutout changes neither. Pure.
import { pointInRing } from '../rooms/area';
import type {
  CountertopCutout,
  CountertopCutoutKind,
  CountertopPieceData,
  FixtureData,
  ModelObject,
  Point,
} from '../schema';
import { COUNTERTOP_CUTOUTS_MAX } from '../schema';

const EPS = 1e-9;

// The W × D a cutout takes on a top with no sink or cooktop under it, until one is typed (decimal inches).
export const COUNTERTOP_CUTOUT_DEFAULT_SIZE: Record<
  CountertopCutoutKind,
  { width: number; depth: number }
> = {
  sink: { width: 30, depth: 16 },
  cooktop: { width: 30, depth: 21 },
};

// The four corners, counter-clockwise from back left when `axis` points +x: center ± axis·W/2 ± side·D/2.
export function cutoutCorners(c: Pick<CountertopCutout, 'center' | 'axis' | 'width' | 'depth'>): Point[] {
  const u = c.axis;
  const v = { x: -u.y, y: u.x };
  const hw = c.width / 2;
  const hd = c.depth / 2;
  const at = (s: number, t: number): Point => ({
    x: c.center.x + u.x * s * hw + v.x * t * hd,
    y: c.center.y + u.y * s * hw + v.y * t * hd,
  });
  return [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)];
}

function properCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < -EPS && o(c, d, a) * o(c, d, b) < -EPS;
}

// A cutout fits a piece when the whole rectangle is on the top: every corner inside the outline and no side of the
// outline running through it.
export function cutoutFitsPiece(outline: readonly Point[], c: CountertopCutout): boolean {
  if (!(c.width > 0) || !(c.depth > 0)) return false;
  const cs = cutoutCorners(c);
  if (!cs.every((p) => pointInRing(p, outline))) return false;
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % n]!;
    if (pointInRing(a, cs)) return false;
    for (let j = 0; j < 4; j++) if (properCross(a, b, cs[j]!, cs[(j + 1) % 4]!)) return false;
  }
  return true;
}

// The piece with the cutout added; null when it does not fit or the piece holds the most cutouts already.
export function placeCountertopCutout(
  piece: CountertopPieceData,
  cutout: CountertopCutout,
): CountertopPieceData | null {
  const list = piece.attributes.cutouts ?? [];
  if (list.length >= COUNTERTOP_CUTOUTS_MAX) return null;
  if (!cutoutFitsPiece(piece.geometry.outline, cutout)) return null;
  return { ...piece, attributes: { ...piece.attributes, cutouts: [...list, { ...cutout }] } };
}

// The piece with cutout `id` set to `width` × `depth` about its center; null when there is no such cutout or the new
// size does not fit.
export function resizeCountertopCutout(
  piece: CountertopPieceData,
  id: string,
  width: number,
  depth: number,
): CountertopPieceData | null {
  const list = piece.attributes.cutouts ?? [];
  const key = id.toLowerCase();
  const i = list.findIndex((c) => c.id.toLowerCase() === key);
  if (i < 0) return null;
  const next = { ...list[i]!, width, depth };
  if (!cutoutFitsPiece(piece.geometry.outline, next)) return null;
  return {
    ...piece,
    attributes: { ...piece.attributes, cutouts: list.map((c, j) => (j === i ? next : c)) },
  };
}

// The direction a cutout's width runs on a bare top: along the side of the outline nearest the click (so a sink's
// width runs along the front), pointed toward +x (or +y on a side running north-south).
export function cutoutAxisAt(outline: readonly Point[], at: Point): Point {
  const n = outline.length;
  let best: Point = { x: 1, y: 0 };
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % n]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len2 = ex * ex + ey * ey;
    if (!(len2 > EPS)) continue;
    const t = Math.max(0, Math.min(1, ((at.x - a.x) * ex + (at.y - a.y) * ey) / len2));
    const d = Math.hypot(at.x - (a.x + ex * t), at.y - (a.y + ey * t));
    if (d < bestD - 1e-6) {
      bestD = d;
      const len = Math.sqrt(len2);
      best = { x: ex / len, y: ey / len };
    }
  }
  if (best.x < -EPS || (Math.abs(best.x) <= EPS && best.y < 0)) best = { x: -best.x, y: -best.y };
  return { x: Math.abs(best.x) < EPS ? 0 : best.x, y: Math.abs(best.y) < EPS ? 0 : best.y };
}

const CUTOUT_FIXTURE_KINDS: Record<string, CountertopCutoutKind> = {
  sink: 'sink',
  cooktop: 'cooktop',
};

export type CutoutFixture = { id: string; kind: CountertopCutoutKind; data: FixtureData };

// The sink or cooktop placed on floor `level` whose outline holds `p` (the last placed wins); null with none.
export function cutoutFixtureAt(
  objects: readonly ModelObject[],
  level: string,
  p: Point,
): CutoutFixture | null {
  const key = level.toLowerCase();
  let found: CutoutFixture | null = null;
  for (const o of objects) {
    if (o.type !== 'fixture' || o.data.level.toLowerCase() !== key) continue;
    const kind = CUTOUT_FIXTURE_KINDS[o.data.attributes.kind];
    if (kind === undefined) continue;
    const { center, axis } = o.data.geometry;
    const { width, depth } = o.data.attributes;
    if (pointInRing(p, cutoutCorners({ center, axis, width, depth })))
      found = { id: o.id, kind, data: o.data };
  }
  return found;
}

// The cutout a sink or cooktop makes: its kind, center, direction and W × D, linked to it.
export function cutoutFromFixture(id: string, fixture: CutoutFixture): CountertopCutout {
  const { center, axis } = fixture.data.geometry;
  return {
    id,
    kind: fixture.kind,
    center: { x: center.x, y: center.y },
    axis: { x: axis.x, y: axis.y },
    width: fixture.data.attributes.width,
    depth: fixture.data.attributes.depth,
    fixtureId: fixture.id,
  };
}
