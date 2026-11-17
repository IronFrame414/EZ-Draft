// EZD-234 Build (S03 Fixtures; Q-0704 03-data-model rows 1, 2; AC-EZD-234-1, -3): the fixture and utility point
// object types and a fixture's outline, which the plan draws and picks by. Placing and the utilities-to-move list run
// only after a user action, so they live in the app's lazy Fixtures module (app/src/editor/tools/fixture-geometry.ts).
import type { Point } from '../schema';
import type { FixtureData } from '../schema/fixture';
import type { UtilityPointData } from '../schema/utility-point';

export type FixtureObject = { id: string; type: 'fixture'; data: FixtureData };
export type UtilityPointObject = { id: string; type: 'utility_point'; data: UtilityPointData };

// Corners in order: back left, back right, front right, front left (walking the axis).
export function fixtureOutline(data: {
  geometry: { center: Point; axis: Point };
  attributes: { width: number; depth: number };
}): [Point, Point, Point, Point] {
  const { center: c, axis: a } = data.geometry;
  const hw = data.attributes.width / 2;
  const hd = data.attributes.depth / 2;
  const n = { x: -a.y, y: a.x };
  const at = (u: number, v: number): Point => ({
    x: c.x + a.x * u + n.x * v,
    y: c.y + a.y * u + n.y * v,
  });
  return [at(-hw, hd), at(hw, hd), at(hw, -hd), at(-hw, -hd)];
}

// One utility point of a moved appliance that stayed put, with its distance from the appliance's new outline.
export type UtilityToMove = {
  pointId: string;
  kind: UtilityPointData['attributes']['kind'];
  distance: number;
};
