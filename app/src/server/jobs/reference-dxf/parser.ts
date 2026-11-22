// EZD-901a (phase-09 EZD-901a "The DXF parser chosen in EZD-029 (the same one as EZD-302)"; R26 R16 "one parser for
// imports and references"; docs/architecture.md ### DXF (EZD-029)): the one DXF parser of the app, dxf-parser 1.1.2
// with the HATCH handler EZD-029 wrote for it (spikes/EZD-029-dxf/src/hatch-handler.mjs, carried here as the
// architecture note says). The Polycam import reader (polycam-dxf/read-dxf.ts) and the reference conversion both
// get the parser only through createDxfParser(). Runs in background jobs only (the browser never parses DXF text).
//
// The handler reads what EZD-029's did (handle, layer, space, colour, loops, seed points) and adds what a drawing
// needs to be drawn as drawn: arc edges and bulges in boundary loops, and the pattern definition lines (groups 53,
// 43-46, 79, 49) that DXF stores for a pattern hatch with its angle and scale already applied (DXF Reference, HATCH
// pattern data).
import * as dxfParserModule from 'dxf-parser';

export type HatchPoint = { x: number; y: number };
export type HatchEdge =
  | { type: 'line'; a: HatchPoint; b: HatchPoint }
  | { type: 'arc'; center: HatchPoint; radius: number; startDeg: number; endDeg: number; ccw: boolean };
export type HatchLoop = {
  flags: number;
  polyline: boolean;
  closed: boolean;
  // Polyline loops: vertices with their bulge (0 = straight).
  vertices: Array<HatchPoint & { bulge: number }>;
  // Edge loops: the edges in order (ellipse and spline edges are kept by type only).
  edges: HatchEdge[];
  otherEdges: number;
};
export type HatchPatternLine = {
  angleDeg: number;
  base: HatchPoint;
  offset: HatchPoint;
  dashes: number[];
};
export type HatchEntity = {
  type: 'HATCH';
  handle?: string;
  layer?: string;
  inPaperSpace?: boolean;
  colorIndex?: number;
  // The z of the extrusion direction: -1 is a mirrored (OCS) hatch.
  extrusionZ?: number;
  patternName: string;
  solid: boolean;
  loops: HatchLoop[];
  patternLines: HatchPatternLine[];
  seedPoints: HatchPoint[];
};

type Group = { code: number; value: unknown };
type Scanner = { next(): Group; rewind(n?: number): void; isEOF(): boolean; lastReadGroup: Group };

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v));

// Reads a point whose x is `curr`: the next group must be code + 10; a following code + 20 is z, otherwise the
// scanner is rewound one group (EZD-029 Step 3a "Points").
function readPoint(scanner: Scanner, curr: Group): HatchPoint & { z?: number } {
  const point: HatchPoint & { z?: number } = { x: n(curr.value), y: 0 };
  const y = scanner.next();
  if (y.code !== curr.code + 10) throw new Error('hatch_point_expected');
  point.y = n(y.value);
  const z = scanner.next();
  if (z.code === curr.code + 20) point.z = n(z.value);
  else scanner.rewind();
  return point;
}

class HatchHandler {
  ForEntityName = 'HATCH';

  parseEntity(scanner: Scanner): HatchEntity {
    const entity: HatchEntity = {
      type: 'HATCH',
      patternName: '',
      solid: false,
      loops: [],
      patternLines: [],
      seedPoints: [],
    };
    let state: 'head' | 'paths' | 'after' = 'head';
    let loop: HatchLoop | null = null;
    let loopsLeft = 0;
    let edge: Record<string, unknown> | null = null;
    let pattern: HatchPatternLine | null = null;
    let seeds = false;

    const closeEdge = () => {
      if (!loop || !edge) return;
      if (edge.type === 1 && edge.a && edge.b) {
        loop.edges.push({ type: 'line', a: edge.a as HatchPoint, b: edge.b as HatchPoint });
      } else if (edge.type === 2 && edge.center) {
        loop.edges.push({
          type: 'arc',
          center: edge.center as HatchPoint,
          radius: n(edge.radius ?? 0),
          startDeg: n(edge.start ?? 0),
          endDeg: n(edge.end ?? 0),
          ccw: edge.ccw !== 0,
        });
      } else {
        loop.otherEdges += 1;
      }
      edge = null;
    };

    let curr = scanner.next();
    while (!scanner.isEOF()) {
      if (curr.code === 0) break;
      if (state === 'head') {
        switch (curr.code) {
          case 5:
            entity.handle = String(curr.value);
            break;
          case 8:
            entity.layer = String(curr.value);
            break;
          case 62:
            entity.colorIndex = n(curr.value);
            break;
          case 67:
            entity.inPaperSpace = n(curr.value) !== 0;
            break;
          case 10:
            readPoint(scanner, curr);
            break;
          case 210:
            entity.extrusionZ = readPoint(scanner, curr).z ?? 1;
            break;
          case 2:
            entity.patternName = String(curr.value);
            break;
          case 70:
            entity.solid = n(curr.value) === 1;
            break;
          case 91:
            loopsLeft = n(curr.value);
            state = loopsLeft > 0 ? 'paths' : 'after';
            break;
          default:
            break;
        }
      } else if (state === 'paths') {
        if (curr.code === 92) {
          closeEdge();
          const flags = n(curr.value);
          const polyline = (flags & 2) !== 0;
          loop = { flags, polyline, closed: true, vertices: [], edges: [], otherEdges: 0 };
          entity.loops.push(loop);
        } else if (curr.code === 75) {
          closeEdge();
          state = 'after';
        } else if (curr.code === 97) {
          closeEdge();
        } else if (loop && loop.polyline) {
          if (curr.code === 73) loop.closed = n(curr.value) === 1;
          else if (curr.code === 10) {
            const p = readPoint(scanner, curr);
            loop.vertices.push({ x: p.x, y: p.y, bulge: 0 });
          } else if (curr.code === 42 && loop.vertices.length > 0) {
            loop.vertices[loop.vertices.length - 1].bulge = n(curr.value);
          }
        } else if (loop) {
          if (curr.code === 72) {
            closeEdge();
            edge = { type: n(curr.value) };
          } else if (edge) {
            if (curr.code === 10) {
              const r = readPoint(scanner, curr);
              const p = { x: r.x, y: r.y };
              if (edge.type === 1) edge.a = p;
              else edge.center = p;
            } else if (curr.code === 11) {
              const r = readPoint(scanner, curr);
              edge.b = { x: r.x, y: r.y };
            } else if (curr.code === 40) edge.radius = n(curr.value);
            else if (curr.code === 50) edge.start = n(curr.value);
            else if (curr.code === 51) edge.end = n(curr.value);
            else if (curr.code === 73) edge.ccw = n(curr.value);
          }
        }
      } else {
        // After the boundary: pattern definition lines, then the seed points after 98.
        if (curr.code === 98) {
          seeds = true;
        } else if (seeds && curr.code === 10) {
          const p = readPoint(scanner, curr);
          entity.seedPoints.push({ x: p.x, y: p.y });
        } else if (curr.code === 53) {
          pattern = { angleDeg: n(curr.value), base: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, dashes: [] };
          entity.patternLines.push(pattern);
        } else if (pattern && curr.code === 43) pattern.base.x = n(curr.value);
        else if (pattern && curr.code === 44) pattern.base.y = n(curr.value);
        else if (pattern && curr.code === 45) pattern.offset.x = n(curr.value);
        else if (pattern && curr.code === 46) pattern.offset.y = n(curr.value);
        else if (pattern && curr.code === 49) pattern.dashes.push(n(curr.value));
      }
      curr = scanner.next();
    }
    closeEdge();
    return entity;
  }
}

export type DxfParser = {
  parseSync(text: string): unknown;
  registerEntityHandler(handler: new () => unknown): void;
};
type ParserCtor = new () => DxfParser;

// In Node ESM the class is the default import; the named export is undefined at run time (EZD-029).
function parserCtor(): ParserCtor {
  const mod = dxfParserModule as unknown as { default?: unknown; DxfParser?: unknown };
  const candidate =
    (mod.default as { default?: unknown } | undefined)?.default ?? mod.default ?? mod.DxfParser;
  return candidate as ParserCtor;
}

export function createDxfParser(): DxfParser {
  const parser = new (parserCtor())();
  parser.registerEntityHandler(HatchHandler);
  return parser;
}
