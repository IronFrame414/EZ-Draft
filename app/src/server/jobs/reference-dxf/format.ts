// EZD-901a (phase-09 EZD-901a "entities are converted per layer into binary geometry buffers (lines, hatch fills,
// text drawn in one bundled fallback font) plus a per-layer snap index"; EZD-901b loads them in a Web Worker, so this
// file imports nothing): the layout of one layer's buffer in one space (model space or a layout). Little-endian,
// every section 4-byte aligned. Coordinates are inches relative to the space's origin in the manifest (Float32
// keeps 1/64" over a 3 km site only that way).
//
// Header, 16 words:
//   0 magic 0x4c52455a ("EZRL"), 1 version, 2 entities, 3 segments, 4 triangles, 5 glyphs, 6 snap points,
//   7 snap grid columns, 8 snap grid rows, 9 reserved, 10 snap origin x (f32), 11 snap origin y (f32),
//   12 snap cell size (f32), 13-15 reserved.
// Then in order:
//   entities   8 u32 each: type, space, first segment, segments, first triangle, triangles, first glyph, glyphs.
//              One record per entity of the layer in this space, in file order.
//   segments   4 f32 each: x0 y0 x1 y1 (linework: lines, arcs, curves, polylines, block and dimension linework,
//              hatch pattern lines).
//   triangles  6 f32 each: x0 y0 x1 y1 x2 y2 (solid hatch fills, SOLID and 3DFACE).
//   glyphs     5 f32 each: pen x, pen y (on the baseline), em size, rotation in radians, code point. Drawn in the
//              fallback font, DM Mono 400 (DRAWING_FONTS 'dm-mono-400'), whose advances placed the pens. Only the
//              characters of REFERENCE_GLYPH_CHARS (the plan's glyph atlas) are written; others are counted.
//   snap cells (columns x rows + 1) u32: the first snap point of each grid cell, row-major, then the total.
//   snap points 2 f32 each, grouped by cell: endpoints, vertices, centres and insertion points.

// The characters the plan's glyph atlas draws (editor/plan/glyph-atlas.ts ATLAS_CHARS: U+0020-U+007E and '·';
// glyph-atlas.test.ts holds the two lists equal). A character outside it is counted, never written.
export const REFERENCE_GLYPH_CHARS: string = (() => {
  let s = '';
  for (let cp = 0x20; cp <= 0x7e; cp++) s += String.fromCodePoint(cp);
  return s + '·';
})();

export const LAYER_BUFFER_MAGIC = 0x4c52455a;
export const LAYER_BUFFER_VERSION = 1;
export const HEADER_WORDS = 16;
export const ENTITY_WORDS = 8;

// Entity type codes in the entity table.
export const ENTITY_TYPE_CODES = {
  LINE: 1,
  ARC: 2,
  CIRCLE: 3,
  ELLIPSE: 4,
  LWPOLYLINE: 5,
  POLYLINE: 6,
  SPLINE: 7,
  TEXT: 8,
  MTEXT: 9,
  INSERT: 10,
  HATCH: 11,
  DIMENSION: 12,
  SOLID: 13,
  '3DFACE': 14,
  POINT: 15,
} as const;
export type EntityTypeName = keyof typeof ENTITY_TYPE_CODES;
const TYPE_BY_CODE = new Map<number, EntityTypeName>(
  Object.entries(ENTITY_TYPE_CODES).map(([k, v]) => [v, k as EntityTypeName]),
);

export type LayerEntityRecord = {
  type: EntityTypeName;
  space: number;
  segStart: number;
  segCount: number;
  triStart: number;
  triCount: number;
  glyphStart: number;
  glyphCount: number;
};

export type SnapGrid = { originX: number; originY: number; cellSize: number; cols: number; rows: number };

export type LayerBuffer = {
  entities: LayerEntityRecord[];
  segments: Float32Array;
  triangles: Float32Array;
  glyphs: Float32Array;
  snapGrid: SnapGrid;
  snapCells: Uint32Array;
  snapPoints: Float32Array;
};

export function encodeLayerBuffer(b: LayerBuffer): Uint8Array<ArrayBuffer> {
  const cells = b.snapGrid.cols * b.snapGrid.rows + 1;
  if (b.snapCells.length !== cells) throw new Error('snap_cells_length');
  const words =
    HEADER_WORDS +
    b.entities.length * ENTITY_WORDS +
    b.segments.length +
    b.triangles.length +
    b.glyphs.length +
    cells +
    b.snapPoints.length;
  const buf = new ArrayBuffer(words * 4);
  const u = new Uint32Array(buf);
  const f = new Float32Array(buf);
  u[0] = LAYER_BUFFER_MAGIC;
  u[1] = LAYER_BUFFER_VERSION;
  u[2] = b.entities.length;
  u[3] = b.segments.length / 4;
  u[4] = b.triangles.length / 6;
  u[5] = b.glyphs.length / 5;
  u[6] = b.snapPoints.length / 2;
  u[7] = b.snapGrid.cols;
  u[8] = b.snapGrid.rows;
  f[10] = b.snapGrid.originX;
  f[11] = b.snapGrid.originY;
  f[12] = b.snapGrid.cellSize;
  let w = HEADER_WORDS;
  for (const e of b.entities) {
    u[w++] = ENTITY_TYPE_CODES[e.type];
    u[w++] = e.space;
    u[w++] = e.segStart;
    u[w++] = e.segCount;
    u[w++] = e.triStart;
    u[w++] = e.triCount;
    u[w++] = e.glyphStart;
    u[w++] = e.glyphCount;
  }
  f.set(b.segments, w);
  w += b.segments.length;
  f.set(b.triangles, w);
  w += b.triangles.length;
  f.set(b.glyphs, w);
  w += b.glyphs.length;
  u.set(b.snapCells, w);
  w += cells;
  f.set(b.snapPoints, w);
  return new Uint8Array(buf);
}

export class LayerBufferError extends Error {
  constructor(readonly code: 'bad_magic' | 'bad_version' | 'bad_length' | 'bad_type') {
    super(code);
    this.name = 'LayerBufferError';
  }
}

export function decodeLayerBuffer(bytes: Uint8Array): LayerBuffer {
  if (bytes.byteLength < HEADER_WORDS * 4 || bytes.byteLength % 4 !== 0) {
    throw new LayerBufferError('bad_length');
  }
  // Copied so the views start on a 4-byte boundary whatever the source's offset.
  const buf = bytes.slice().buffer;
  const u = new Uint32Array(buf);
  const f = new Float32Array(buf);
  if (u[0] !== LAYER_BUFFER_MAGIC) throw new LayerBufferError('bad_magic');
  if (u[1] !== LAYER_BUFFER_VERSION) throw new LayerBufferError('bad_version');
  const [entityCount, segs, tris, glyphs, snaps, cols, rows] = [u[2], u[3], u[4], u[5], u[6], u[7], u[8]];
  const cells = cols * rows + 1;
  const words = HEADER_WORDS + entityCount * ENTITY_WORDS + segs * 4 + tris * 6 + glyphs * 5 + cells + snaps * 2;
  if (words !== u.length) throw new LayerBufferError('bad_length');
  const entities: LayerEntityRecord[] = [];
  let w = HEADER_WORDS;
  for (let i = 0; i < entityCount; i++) {
    const type = TYPE_BY_CODE.get(u[w]);
    if (!type) throw new LayerBufferError('bad_type');
    entities.push({
      type,
      space: u[w + 1],
      segStart: u[w + 2],
      segCount: u[w + 3],
      triStart: u[w + 4],
      triCount: u[w + 5],
      glyphStart: u[w + 6],
      glyphCount: u[w + 7],
    });
    w += ENTITY_WORDS;
  }
  const take = (len: number) => {
    const out = f.slice(w, w + len);
    w += len;
    return out;
  };
  const segments = take(segs * 4);
  const triangles = take(tris * 6);
  const glyphArr = take(glyphs * 5);
  const snapCells = u.slice(w, w + cells);
  w += cells;
  const snapPoints = take(snaps * 2);
  return {
    entities,
    segments,
    triangles,
    glyphs: glyphArr,
    snapGrid: { originX: f[10], originY: f[11], cellSize: f[12], cols, rows },
    snapCells,
    snapPoints,
  };
}
