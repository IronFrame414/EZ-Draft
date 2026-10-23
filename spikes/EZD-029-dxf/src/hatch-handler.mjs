// EZD-029 own HATCH handler for dxf-parser (vault/plans/EZD-029.md Step 3a): dxf-parser 1.1.2 ships no
// HATCH handler, so this one is registered through `registerEntityHandler`. Loop shape of
// dxf-parser's dist/entities/solid.js: read groups until the first code 0, which stays in
// `scanner.lastReadGroup`. Group codes from the DXF Reference HATCH entity. ParseHelpers is not
// reachable from Node, so points and common codes are read here.

/**
 * @typedef {{ x: number, y: number, z?: number }} Point
 * @typedef {{ flags: number, polyline: boolean, closed: boolean, vertices: Array<{ x: number, y: number }>, edgeTypes: number[] }} HatchLoop
 * @typedef {{ code: number, value: any }} Group
 * @typedef {{ next(): Group, rewind(n?: number): void, isEOF(): boolean, lastReadGroup: Group }} Scanner
 */

/**
 * Reads a point whose x is `curr`: the next group must be code + 10, a following code + 20 gives z,
 * otherwise the scanner is rewound one group (Step 3a "Points").
 * @param {Scanner} scanner
 * @param {Group} curr
 * @returns {Point}
 */
function readPoint(scanner, curr) {
  const point = { x: curr.value, y: 0 };
  const y = scanner.next();
  if (y.code !== curr.code + 10) throw new Error('hatch_point_expected');
  point.y = y.value;
  const z = scanner.next();
  if (z.code === curr.code + 20) point.z = z.value;
  else scanner.rewind();
  return point;
}

export class HatchHandler {
  constructor() {
    this.ForEntityName = 'HATCH';
  }

  /**
   * @param {Scanner} scanner
   * @param {Group} curr the `0 HATCH` group
   */
  parseEntity(scanner, curr) {
    /** @type {Record<string, any>} */
    const entity = {
      type: curr.value,
      patternName: '',
      solid: false,
      associative: false,
      /** @type {HatchLoop[]} */ loops: [],
      /** @type {Array<{ x: number, y: number }>} */ seedPoints: [],
    };
    /** @type {'head' | 'paths' | 'after'} */
    let state = 'head';
    /** @type {HatchLoop | null} */
    let loop = null;
    // Edge loop: the next 10/20 is the start point of a line edge (group 72 = 1).
    let lineEdgeStart = false;
    let seeds = false;

    curr = scanner.next();
    while (!scanner.isEOF()) {
      if (curr.code === 0) break;
      if (state === 'head') {
        switch (curr.code) {
          case 5:
            entity.handle = curr.value;
            break;
          case 6:
            entity.lineType = curr.value;
            break;
          case 8:
            entity.layer = curr.value;
            break;
          case 330:
            entity.ownerHandle = curr.value;
            break;
          case 62:
            entity.colorIndex = curr.value;
            break;
          case 370:
            entity.lineweight = curr.value;
            break;
          case 67:
            entity.inPaperSpace = curr.value !== 0;
            break;
          case 10:
            entity.elevationPoint = readPoint(scanner, curr);
            break;
          case 210:
            entity.extrusionDirection = readPoint(scanner, curr);
            break;
          case 2:
            entity.patternName = curr.value;
            break;
          case 70:
            entity.solid = curr.value === 1;
            break;
          case 71:
            entity.associative = curr.value === 1;
            break;
          case 91:
            state = 'paths';
            break;
          default:
            break;
        }
      } else if (state === 'paths') {
        if (curr.code === 75) {
          state = 'after';
        } else if (curr.code === 92) {
          const flags = curr.value;
          const polyline = (flags & 2) !== 0;
          loop = { flags, polyline, closed: !polyline, vertices: [], edgeTypes: [] };
          lineEdgeStart = false;
          entity.loops.push(loop);
        } else if (loop && loop.polyline) {
          if (curr.code === 73) loop.closed = curr.value === 1;
          else if (curr.code === 10) {
            const p = readPoint(scanner, curr);
            loop.vertices.push({ x: p.x, y: p.y });
          }
          // 72 has-bulge, 93 vertex count, 42 bulge and every other code are ignored.
        } else if (loop) {
          if (curr.code === 72) {
            loop.edgeTypes.push(curr.value);
            lineEdgeStart = curr.value === 1;
          } else if (curr.code === 10 && lineEdgeStart) {
            const p = readPoint(scanner, curr);
            loop.vertices.push({ x: p.x, y: p.y });
            lineEdgeStart = false;
          }
          // Every other code in an edge loop, including arc, ellipse and spline points, is ignored.
        }
      } else {
        // state 'after': only 98 and the 10/20 seed points after it are read.
        if (curr.code === 98) seeds = true;
        else if (seeds && curr.code === 10) {
          const p = readPoint(scanner, curr);
          entity.seedPoints.push({ x: p.x, y: p.y });
        }
      }
      curr = scanner.next();
    }
    return entity;
  }
}
