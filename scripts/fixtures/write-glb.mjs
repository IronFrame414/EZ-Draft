// EZD-016b Step 4.5 (vault/plans/EZD-016b.md): glTF 2.0 binary (GLB) of the room's interior
// surfaces with the sloped ceiling. 12-byte header, JSON chunk, BIN chunk, each padded to 4 bytes.
// Metres, +Y up (Khronos glTF 2.0, "Coordinate system and units"): plan (x, y, h) inches ->
// glTF (0.0254 x, 0.0254 h, -0.0254 y). 11 quads, no shared vertices (44 vertices, 22 triangles),
// normals into the room, counter-clockwise seen from inside. Opening side faces are not modelled.
import { ceilingHeight } from './room.mjs';

export const METRES_PER_INCH = 0.0254;
export const GENERATOR = 'EZ Draft fixtures EZD-016b';

/** @typedef {[number, number, number]} P3 plan point (x, y, h) in inches */

/**
 * The 11 quads in plan coordinates, each [a, b, c, d] counter-clockwise seen from inside.
 * @param {import('./room.mjs').Room} room
 * @returns {P3[][]}
 */
export function roomQuads(room) {
  const W = room.interior.width;
  const D = room.interior.depth;
  const h = (/** @type {number} */ x) => ceilingHeight(room, x);
  /** @type {P3[][]} */
  const quads = [
    // floor
    [
      [0, 0, 0],
      [W, 0, 0],
      [W, D, 0],
      [0, D, 0],
    ],
    // ceiling
    [
      [0, 0, h(0)],
      [0, D, h(0)],
      [W, D, h(W)],
      [W, 0, h(W)],
    ],
    // west wall
    [
      [0, 0, 0],
      [0, D, 0],
      [0, D, h(0)],
      [0, 0, h(0)],
    ],
    // east wall
    [
      [W, D, 0],
      [W, 0, 0],
      [W, 0, h(W)],
      [W, D, h(W)],
    ],
    // north wall
    [
      [0, D, 0],
      [W, D, 0],
      [W, D, h(W)],
      [0, D, h(0)],
    ],
  ];
  // South wall (y 0): 6 quads around the door and window holes. top null = up to the ceiling.
  const d = room.door;
  const w = room.window;
  const d0 = d.offset;
  const d1 = d.offset + d.width;
  const w0 = w.offset;
  const w1 = w.offset + w.width;
  /** @type {[number, number, number, number | null][]} x0, x1, bottom, top */
  const south = [
    [0, d0, 0, null],
    [d0, d1, d.height, null],
    [d1, w0, 0, null],
    [w0, w1, 0, w.sill],
    [w0, w1, w.head, null],
    [w1, W, 0, null],
  ];
  for (const [x0, x1, lo, hi] of south) {
    quads.push([
      [x1, 0, lo],
      [x0, 0, lo],
      [x0, 0, hi ?? h(x0)],
      [x1, 0, hi ?? h(x1)],
    ]);
  }
  return quads;
}

/** @param {P3} p @returns {number[]} glTF metres */
const toGltf = ([x, y, h]) => [METRES_PER_INCH * x, METRES_PER_INCH * h, -METRES_PER_INCH * y];

/**
 * @param {import('./room.mjs').Room} room
 * @returns {Buffer}
 */
export function writeGlb(room) {
  const quads = roomQuads(room);
  const n = quads.length * 4;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const idx = new Uint16Array(quads.length * 6);
  quads.forEach((q, qi) => {
    const g = q.map(toGltf);
    const u = [g[1][0] - g[0][0], g[1][1] - g[0][1], g[1][2] - g[0][2]];
    const v = [g[2][0] - g[0][0], g[2][1] - g[0][1], g[2][2] - g[0][2]];
    const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(c[0], c[1], c[2]);
    g.forEach((p, k) => {
      const i = qi * 4 + k;
      pos.set(p, i * 3);
      nor.set(
        c.map((e) => (e / len === 0 ? 0 : e / len)),
        i * 3,
      );
    });
    const b = qi * 4;
    idx.set([b, b + 1, b + 2, b, b + 2, b + 3], qi * 6);
  });

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const e = pos[i * 3 + k];
      if (e < min[k]) min[k] = e;
      if (e > max[k]) max[k] = e;
    }
  }
  const clean = (/** @type {number[]} */ a) => a.map((e) => (e === 0 ? 0 : e));

  const posBytes = Buffer.from(pos.buffer);
  const norBytes = Buffer.from(nor.buffer);
  const idxBytes = Buffer.from(idx.buffer);
  const pad4 = (/** @type {number} */ len) => (4 - (len % 4)) % 4;
  const bin = Buffer.concat([
    posBytes,
    norBytes,
    idxBytes,
    Buffer.alloc(pad4(idxBytes.length)),
  ]);

  const json = {
    asset: { version: '2.0', generator: GENERATOR },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        name: 'room',
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, mode: 4 }],
      },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length, byteLength: norBytes.length, target: 34962 },
      {
        buffer: 0,
        byteOffset: posBytes.length + norBytes.length,
        byteLength: idxBytes.length,
        target: 34963,
      },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min: clean(min), max: clean(max) },
      { bufferView: 1, componentType: 5126, count: n, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: idx.length, type: 'SCALAR' },
    ],
  };
  let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(pad4(jsonBytes.length), 0x20)]);

  const header = Buffer.alloc(12);
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const chunk = (/** @type {Buffer} */ data, /** @type {number} */ type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  return Buffer.concat([header, chunk(jsonBytes, 0x4e4f534a), chunk(bin, 0x004e4942)]);
}
