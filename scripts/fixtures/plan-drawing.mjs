// EZD-016b Step 3 (vault/plans/EZD-016b.md): the plan drawing as 2D primitives by layer, in model
// inches. The DXF, the vector PDF and the raster are all drawn from this list.

/**
 * @typedef {[number, number]} Pt
 * @typedef {{ layer: string, type: 'line', a: Pt, b: Pt }} Line
 * @typedef {{ layer: string, type: 'arc', center: Pt, radius: number, startDeg: number, endDeg: number }} Arc
 * @typedef {{ layer: string, type: 'polygon', points: Pt[] }} Polygon
 * @typedef {Line | Arc | Polygon} Primitive
 * @typedef {{ layers: string[], primitives: Primitive[] }} Drawing
 */

/** Layer names (fixture choice, Fixture values table); `0` is the DXF default layer. */
export const LAYERS = Object.freeze(['0', 'WALLS', 'DOORS', 'WINDOWS', 'ROOMS']);

/**
 * @param {import('./room.mjs').Room} room
 * @returns {Drawing}
 */
export function planDrawing(room) {
  const W = room.interior.width;
  const D = room.interior.depth;
  const t = room.wallThickness;
  const openings = [room.door, room.window]
    .map((o) => [o.offset, o.offset + o.width])
    .sort((p, q) => p[0] - q[0]);

  /** @type {Primitive[]} */
  const out = [];
  /** @param {string} layer @param {Pt} a @param {Pt} b */
  const line = (layer, a, b) => out.push({ layer, type: 'line', a, b });

  // WALLS: south interior face (y 0) with breaks at the openings.
  let x = 0;
  for (const [o0, o1] of openings) {
    line('WALLS', [x, 0], [o0, 0]);
    x = o1;
  }
  line('WALLS', [x, 0], [W, 0]);
  // South exterior face (y -t) with the same breaks.
  x = -t;
  for (const [o0, o1] of openings) {
    line('WALLS', [x, -t], [o0, -t]);
    x = o1;
  }
  line('WALLS', [x, -t], [W + t, -t]);
  // Jambs at each break.
  for (const [o0, o1] of openings) {
    line('WALLS', [o0, -t], [o0, 0]);
    line('WALLS', [o1, -t], [o1, 0]);
  }
  // North, west, east: interior then exterior face.
  line('WALLS', [0, D], [W, D]);
  line('WALLS', [-t, D + t], [W + t, D + t]);
  line('WALLS', [0, 0], [0, D]);
  line('WALLS', [-t, -t], [-t, D + t]);
  line('WALLS', [W, 0], [W, D]);
  line('WALLS', [W + t, -t], [W + t, D + t]);

  // DOORS: the leaf drawn open and the swing arc, hinge at the door's west jamb.
  const d = room.door;
  const hinge = /** @type {Pt} */ ([d.offset, 0]);
  line('DOORS', hinge, [d.offset, d.width]);
  out.push({ layer: 'DOORS', type: 'arc', center: hinge, radius: d.width, startDeg: 0, endDeg: d.swingDeg });

  // WINDOWS: interior face, glass at mid-thickness, exterior face.
  const w = room.window;
  for (const y of [0, -t / 2, -t]) line('WINDOWS', [w.offset, y], [w.offset + w.width, y]);

  // ROOMS: the closed interior polygon.
  out.push({
    layer: 'ROOMS',
    type: 'polygon',
    points: [
      [0, 0],
      [W, 0],
      [W, D],
      [0, D],
    ],
  });

  return { layers: [...LAYERS], primitives: out };
}
