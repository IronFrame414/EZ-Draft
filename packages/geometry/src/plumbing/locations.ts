// EZD-729 Build (AC-EZD-729-1; 00 Job 3 "A permit submittal needs: ... plumbing locations"; Q-0179 "v1 adds
// plumbing sheets (supply and drain locations ...)"; vault/build/assumptions.md EZD-729): the supply and drain
// locations a placed sink gets. They are worked out from the sink each time, never stored, so they follow the sink
// when it moves and leave with it. The plan draws each as the utility point's 6" diamond (EZD-234) on the Plumbing
// layer. Pure.
import { utilityMark, type DrawingItem } from '../drawing';
import type { FixtureObject } from '../fixtures/fixtures';
import type { FixtureKind } from '../schema/fixture';
import type { Point } from '../schema/common';

// The layer-membership type of a derived plumbing location (the Plumbing layer, with the sink's Phase layer).
export const PLUMBING_LOCATION_TYPE = 'plumbing_location';

export type PlumbingLocationKind = 'hot' | 'cold' | 'drain';

export type PlumbingLocation = { fixtureId: string; kind: PlumbingLocationKind; point: Point };

// Inches along the fixture's width from its centre, on its back edge; + is along `axis`. Facing the sink from the
// front, `axis` points to the right, so hot (left) is -8 and cold (right) +8; the drain is on the centre line.
const SUPPLY_OFFSET_IN = 8;
const LAYOUT: Partial<Record<FixtureKind, readonly [PlumbingLocationKind, number][]>> = {
  sink: [
    ['hot', -SUPPLY_OFFSET_IN],
    ['drain', 0],
    ['cold', SUPPLY_OFFSET_IN],
  ],
};

export function plumbingLocations(fixture: FixtureObject): PlumbingLocation[] {
  const layout = LAYOUT[fixture.data.attributes.kind];
  if (layout === undefined) return [];
  const { center: c, axis: a } = fixture.data.geometry;
  const n = { x: -a.y, y: a.x };
  const back = fixture.data.attributes.depth / 2;
  return layout.map(([kind, u]) => ({
    fixtureId: fixture.id,
    kind,
    point: { x: c.x + a.x * u + n.x * back, y: c.y + a.y * u + n.y * back },
  }));
}

// The plan lines of a fixture's plumbing locations: each a diamond, in the fixture's status colour.
export function plumbingLocationItems(fixture: FixtureObject): DrawingItem[] {
  return plumbingLocations(fixture).flatMap(({ point }) => {
    const ring = utilityMark(point);
    return ring.map((from, i) => ({
      layer: fixture.data.status,
      objectId: fixture.id,
      kind: 'line' as const,
      role: 'beyond' as const,
      from,
      to: ring[(i + 1) % 4]!,
    }));
  });
}
