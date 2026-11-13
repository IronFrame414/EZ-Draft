// EZD-234 Build (S03 Fixtures, Validation "Moving an appliance shows which utilities must move"; 09e:7; Q-0704
// 05-screens "After an appliance moves, its linked utility points stay put and are listed with kind and distance from
// the appliance's new outline; the list only informs and blocks nothing"; 09q Utilities to move; AC-EZD-234-1, -3):
// new fixture and utility point data, the utility point link and the utilities-to-move list. Pure; never mutates its
// input. Loaded only with the lazy Fixtures module (11 rule 7).
import {
  fixtureOutline,
  pointInRing,
  pointsEqual,
  type FixtureData,
  type FixtureKind,
  type FixtureObject,
  type ModelObject,
  type ObjectStatus,
  type Point,
  type TileShowerData,
  type UtilityKind,
  type UtilityPointData,
  type UtilityPointObject,
  type UtilityToMove,
} from '@ezdraft/geometry';

// Starting sizes in the Fixtures panel, each editable before placing (vault/build/assumptions.md EZD-234).
export const FIXTURE_DEFAULT_SIZES: Readonly<
  Record<FixtureKind, { width: number; depth: number }>
> = {
  toilet: { width: 20, depth: 28 },
  lavatory: { width: 20, depth: 18 },
  tub: { width: 60, depth: 30 },
  shower_prefab: { width: 36, depth: 36 },
  sink: { width: 33, depth: 22 },
  cooktop: { width: 30, depth: 21 },
  range: { width: 30, depth: 26 },
  hood: { width: 30, depth: 20 },
  refrigerator: { width: 36, depth: 30 },
  dishwasher: { width: 24, depth: 24 },
  disposal: { width: 9, depth: 9 },
  washer: { width: 27, depth: 30 },
  dryer: { width: 27, depth: 30 },
  water_heater: { width: 22, depth: 22 },
};

// Where the fixture's front faces on the plan (+y is north, up on screen).
export const FIXTURE_FACINGS = ['down', 'left', 'up', 'right'] as const;
export type FixtureFacing = (typeof FIXTURE_FACINGS)[number];

// The axis runs along the width; the back lies to the left of the axis, so the front faces its right.
const FACING_AXES: Readonly<Record<FixtureFacing, Point>> = {
  down: { x: 1, y: 0 },
  up: { x: -1, y: 0 },
  right: { x: 0, y: 1 },
  left: { x: 0, y: -1 },
};

export function facingAxis(facing: FixtureFacing): Point {
  const a = FACING_AXES[facing];
  return { x: a.x, y: a.y };
}

export function newFixtureData(input: {
  kind: FixtureKind;
  center: Point;
  facing: FixtureFacing;
  width: number;
  depth: number;
  status: ObjectStatus;
  level: string;
}): FixtureData {
  return {
    geometry: { center: { x: input.center.x, y: input.center.y }, axis: facingAxis(input.facing) },
    status: input.status,
    level: input.level,
    attributes: { kind: input.kind, width: input.width, depth: input.depth },
  };
}

// EZD-226 Build (Q-0704; AC-EZD-226-1, -2; vault/build/assumptions.md EZD-226): a new tile shower centred on the
// click. Its front (side 0, footprint[0] to footprint[1]) faces `facing`, as a fixture's front does, so the frame's
// y runs from the front to the back. The curb and the glass piece are along the front; niches, all one size, go the
// first on the back wall (side 2) and the second on the right wall (side 1); a linear drain runs the full length of
// the back wall when the shower is at least as wide as deep, otherwise of the right wall; a center drain sits at the
// middle.
const NICHE_SIDES = [2, 1] as const;

export function newTileShowerData(input: {
  center: Point;
  facing: FixtureFacing;
  width: number;
  depth: number;
  curb: { height: number; width: number } | null;
  nicheCount: number;
  niche: { width: number; height: number; bottomHeight: number };
  bench: { width: number; depth: number; height: number } | null;
  glass: { type: 'fixed' | 'door'; length: number; swing: 'in' | 'out' } | null;
  drain: 'center' | 'linear';
  panSlope: number;
  status: ObjectStatus;
  level: string;
}): TileShowerData {
  const a = facingAxis(input.facing);
  const n = { x: -a.y, y: a.x };
  const c = input.center;
  const hw = input.width / 2;
  const hd = input.depth / 2;
  const at = (u: number, v: number): Point => ({
    x: c.x + a.x * u + n.x * v,
    y: c.y + a.y * u + n.y * v,
  });
  const longBack = input.width >= input.depth;
  return {
    geometry: { footprint: [at(-hw, -hd), at(hw, -hd), at(hw, hd), at(-hw, hd)] },
    status: input.status,
    level: input.level,
    attributes: {
      curb: input.curb === null ? null : { height: input.curb.height, width: input.curb.width },
      niches: NICHE_SIDES.slice(0, Math.max(0, Math.min(2, input.nicheCount))).map((side) => ({
        width: input.niche.width,
        height: input.niche.height,
        bottomHeight: input.niche.bottomHeight,
        side,
      })),
      bench: input.bench === null ? null : { ...input.bench },
      glass:
        input.glass === null
          ? []
          : input.glass.type === 'door'
            ? [{ type: 'door', length: input.glass.length, side: 0, swing: input.glass.swing }]
            : [{ type: 'fixed', length: input.glass.length, side: 0 }],
      panSlope: input.panSlope,
      drain:
        input.drain === 'center'
          ? { type: 'center', at: { x: hw, y: hd } }
          : longBack
            ? { type: 'linear', side: 2, offset: 0, length: input.width }
            : { type: 'linear', side: 1, offset: 0, length: input.depth },
    },
  };
}

export function newUtilityPointData(input: {
  kind: UtilityKind;
  point: Point;
  status: ObjectStatus;
  level: string;
  volts: 120 | 240 | null;
  amps: number | null;
  servesObjectId: string | null;
}): UtilityPointData {
  const electric = input.kind === 'electric';
  return {
    geometry: { point: { x: input.point.x, y: input.point.y } },
    status: input.status,
    level: input.level,
    attributes: {
      kind: input.kind,
      volts: electric ? input.volts : null,
      amps: electric ? input.amps : null,
      servesObjectId: input.servesObjectId,
    },
  };
}

function segmentDistance(p: Point, s: Point, e: Point): number {
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / len2));
  return Math.hypot(p.x - (s.x + t * dx), p.y - (s.y + t * dy));
}

// Inches from a point to an outline; a point inside the outline reads 0.
export function distanceToOutline(p: Point, ring: readonly Point[]): number {
  if (pointInRing(p, ring)) return 0;
  let best = Infinity;
  for (let i = 0; i < ring.length; i++)
    best = Math.min(best, segmentDistance(p, ring[i]!, ring[(i + 1) % ring.length]!));
  return best;
}

const lower = (id: string) => id.toLowerCase();

const isFixture = (o: ModelObject): o is FixtureObject => o.type === 'fixture';
const isUtilityPoint = (o: ModelObject): o is UtilityPointObject => o.type === 'utility_point';

// The fixture a point serves; an id that names no live fixture reads as no appliance (Q-0704).
export function linkedFixture(
  point: UtilityPointObject,
  objects: readonly ModelObject[],
): FixtureObject | null {
  const id = point.data.attributes.servesObjectId;
  if (id === null) return null;
  return objects.find((o): o is FixtureObject => isFixture(o) && lower(o.id) === lower(id)) ?? null;
}

// The fixture on `level` whose outline holds `p`, the smallest when several do; a new utility point placed there
// links to it (vault/build/assumptions.md EZD-234).
export function fixtureAt(
  objects: readonly ModelObject[],
  p: Point,
  level: string,
): FixtureObject | null {
  let best: FixtureObject | null = null;
  for (const o of objects) {
    if (!isFixture(o) || lower(o.data.level) !== lower(level)) continue;
    if (!pointInRing(p, fixtureOutline(o.data))) continue;
    const area = o.data.attributes.width * o.data.attributes.depth;
    if (best === null || area < best.data.attributes.width * best.data.attributes.depth) best = o;
  }
  return best;
}

const sameAxis = (a: Point, b: Point) => pointsEqual(a, b);

// For each fixture that moved from `before` to `after`, its linked utility points that stayed where they were, with
// the distance from the fixture's new outline. A fixture that did not move, was deleted or has no linked points that
// stayed gives no entry. Fixtures and points are in `after` model order.
export function utilitiesToMove(
  before: readonly ModelObject[],
  after: readonly ModelObject[],
): { fixtureId: string; utilities: UtilityToMove[] }[] {
  const was = new Map(before.map((o) => [lower(o.id), o]));
  const out: { fixtureId: string; utilities: UtilityToMove[] }[] = [];
  for (const f of after) {
    if (!isFixture(f)) continue;
    const old = was.get(lower(f.id));
    if (old === undefined || !isFixture(old)) continue;
    const moved =
      !pointsEqual(old.data.geometry.center, f.data.geometry.center) ||
      !sameAxis(old.data.geometry.axis, f.data.geometry.axis);
    if (!moved) continue;
    const ring = fixtureOutline(f.data);
    const utilities: UtilityToMove[] = [];
    for (const u of after) {
      if (!isUtilityPoint(u)) continue;
      const serves = u.data.attributes.servesObjectId;
      if (serves === null || lower(serves) !== lower(f.id)) continue;
      const prior = was.get(lower(u.id));
      if (prior === undefined || !isUtilityPoint(prior)) continue;
      if (!pointsEqual(prior.data.geometry.point, u.data.geometry.point)) continue;
      utilities.push({
        pointId: u.id,
        kind: u.data.attributes.kind,
        distance: distanceToOutline(u.data.geometry.point, ring),
      });
    }
    if (utilities.length > 0) out.push({ fixtureId: f.id, utilities });
  }
  return out;
}
