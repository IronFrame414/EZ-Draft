// EZD-030 spike: wall face outline with opening holes and a sloped top (vault/plans/EZD-030.md Step 1).
// Pure TypeScript, no package imports: held to the geometry package's rules (02 Stack Geometry core).
// All lengths are decimal inches (03 Architecture rule 5). Wall-local frame:
// x along the wall from its start (0..length), y up from the floor, z through the thickness (0..thickness).

export interface WallOpening {
  kind: 'door' | 'window';
  // offset = x of the opening's near edge; sill = y of its bottom edge (0 for a door).
  offset: number;
  width: number;
  height: number;
  sill: number;
}

// Ceiling plane height at x = heightAtStart + x * rise / run (rise may be negative: falling slope).
export interface WallCeiling {
  heightAtStart: number;
  rise: number;
  run: number;
}

export interface WallInput {
  length: number;
  thickness: number;
  ceiling: WallCeiling;
  openings: WallOpening[];
}

// (x, y) points
export interface WallFace {
  outer: Array<[number, number]>;
  holes: Array<Array<[number, number]>>;
}

export function topHeightAt(wall: WallInput, x: number): number {
  const { heightAtStart, rise, run } = wall.ceiling;
  return heightAtStart + (x * rise) / run;
}

// An opening that touches the floor (sill 0, the door) is cut as a notch in the outer outline, because a
// hole that touches the outer contour gives a broken triangulation (plan Risks). Every other opening is a hole.
// Outer runs counter-clockwise: along the floor (with the notches), up the end, down the sloped top.
export function wallFace(wall: WallInput): WallFace {
  const atFloor = wall.openings
    .filter((o) => o.sill <= 0)
    .sort((a, b) => a.offset - b.offset);
  const raised = wall.openings.filter((o) => o.sill > 0);

  const outer: Array<[number, number]> = [[0, 0]];
  for (const o of atFloor) {
    const x0 = o.offset;
    const x1 = o.offset + o.width;
    outer.push([x0, 0], [x0, o.height], [x1, o.height], [x1, 0]);
  }
  outer.push([wall.length, 0], [wall.length, topHeightAt(wall, wall.length)], [0, topHeightAt(wall, 0)]);

  const holes = raised.map((o): Array<[number, number]> => {
    const x0 = o.offset;
    const x1 = o.offset + o.width;
    const y0 = o.sill;
    const y1 = o.sill + o.height;
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
  });

  return { outer, holes };
}
