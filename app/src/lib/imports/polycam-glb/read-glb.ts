// EZD-303 (phase-03 EZD-303 "Store GLB/GLTF; toggleable mesh view; read ceiling heights and slope from it; never
// model data"; 08 Imports "Polycam mesh | GLB / GLTF | Toggleable 3D underlay; ceiling heights can be read from
// it | Reference only, never model data"): reads a glTF 2.0 binary (GLB) into world-space triangles. Plain
// parsing by the Khronos glTF 2.0 specification (GLB file format; accessors; node transforms), no dependency, so
// it runs in the browser (mesh view, EZD-307/312) and in jobs alike. Positions stay in glTF metres with +Y up;
// the plan mapping is in ./ceiling.ts. Only triangle primitives (mode 4) are read; other modes are counted in
// `skippedPrimitives` (R26 R16: never dropped silently). A .gltf with external buffers is not read: the Upload
// step only accepts .glb (vault/build/assumptions.md EZD-303).

export type GlbErrorCode = 'not_glb' | 'unsupported_glb_version' | 'unreadable_glb';

export class GlbReadError extends Error {
  constructor(readonly code: GlbErrorCode) {
    super(code);
    this.name = 'GlbReadError';
  }
}

export type GlbMesh = {
  /** World-space vertex positions, 3 per triangle corner, glTF metres, +Y up. 9 numbers per triangle. */
  triangles: Float64Array;
  triangleCount: number;
  skippedPrimitives: number;
};

const MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

type Accessor = {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  normalized?: boolean;
};
type BufferView = { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number };
type Primitive = { attributes: Record<string, number>; indices?: number; mode?: number };
type GltfNode = {
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
};
type Gltf = {
  asset?: { version?: string };
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives: Primitive[] }[];
  accessors?: Accessor[];
  bufferViews?: BufferView[];
};

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

type Mat4 = number[]; // column-major, as glTF

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

function localMatrix(n: GltfNode): Mat4 {
  if (n.matrix && n.matrix.length === 16) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  // T * R * S (glTF 2.0 "Transformations"), column-major.
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

function readAccessor(gltf: Gltf, bin: DataView, index: number): number[][] {
  const acc = gltf.accessors?.[index];
  if (!acc) throw new GlbReadError('unreadable_glb');
  const comps = COMPONENTS[acc.type];
  const size = COMPONENT_BYTES[acc.componentType];
  if (!comps || !size) throw new GlbReadError('unreadable_glb');
  if (acc.bufferView === undefined) return Array.from({ length: acc.count }, () => new Array(comps).fill(0));
  const view = gltf.bufferViews?.[acc.bufferView];
  if (!view || view.buffer !== 0) throw new GlbReadError('unreadable_glb');
  const stride = view.byteStride ?? comps * size;
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const last = base + stride * (acc.count - 1) + comps * size;
  if (acc.count > 0 && last > bin.byteLength) throw new GlbReadError('unreadable_glb');
  const out: number[][] = [];
  for (let i = 0; i < acc.count; i++) {
    const row: number[] = [];
    for (let c = 0; c < comps; c++) {
      const at = base + i * stride + c * size;
      switch (acc.componentType) {
        case 5126:
          row.push(bin.getFloat32(at, true));
          break;
        case 5125:
          row.push(bin.getUint32(at, true));
          break;
        case 5123:
          row.push(bin.getUint16(at, true));
          break;
        case 5122:
          row.push(bin.getInt16(at, true));
          break;
        case 5121:
          row.push(bin.getUint8(at));
          break;
        default:
          row.push(bin.getInt8(at));
      }
    }
    out.push(row);
  }
  return out;
}

export function readGlb(bytes: Uint8Array): GlbMesh {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || dv.getUint32(0, true) !== MAGIC) throw new GlbReadError('not_glb');
  if (dv.getUint32(4, true) !== 2) throw new GlbReadError('unsupported_glb_version');
  const length = dv.getUint32(8, true);
  if (length > bytes.byteLength) throw new GlbReadError('unreadable_glb');

  let gltf: Gltf | null = null;
  let bin: DataView = new DataView(new ArrayBuffer(0));
  let at = 12;
  while (at + 8 <= length) {
    const chunkLength = dv.getUint32(at, true);
    const chunkType = dv.getUint32(at + 4, true);
    const start = at + 8;
    if (start + chunkLength > length) throw new GlbReadError('unreadable_glb');
    if (chunkType === CHUNK_JSON && !gltf) {
      try {
        gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + chunkLength))) as Gltf;
      } catch {
        throw new GlbReadError('unreadable_glb');
      }
    } else if (chunkType === CHUNK_BIN && bin.byteLength === 0) {
      bin = new DataView(bytes.buffer, bytes.byteOffset + start, chunkLength);
    }
    at = start + chunkLength;
  }
  if (!gltf || typeof gltf !== 'object') throw new GlbReadError('unreadable_glb');

  const out: number[] = [];
  let skippedPrimitives = 0;
  const visit = (nodeIndex: number, parent: Mat4, depth: number) => {
    const node = gltf!.nodes?.[nodeIndex];
    if (!node || depth > 64) throw new GlbReadError('unreadable_glb');
    const world = multiply(parent, localMatrix(node));
    const mesh = node.mesh === undefined ? undefined : gltf!.meshes?.[node.mesh];
    if (node.mesh !== undefined && !mesh) throw new GlbReadError('unreadable_glb');
    for (const prim of mesh?.primitives ?? []) {
      if ((prim.mode ?? 4) !== 4 || prim.attributes.POSITION === undefined) {
        skippedPrimitives++;
        continue;
      }
      const pos = readAccessor(gltf!, bin, prim.attributes.POSITION).map(([x, y, z]) => [
        world[0] * x + world[4] * y + world[8] * z + world[12],
        world[1] * x + world[5] * y + world[9] * z + world[13],
        world[2] * x + world[6] * y + world[10] * z + world[14],
      ]);
      const idx =
        prim.indices === undefined
          ? pos.map((_, i) => i)
          : readAccessor(gltf!, bin, prim.indices).map((r) => r[0]);
      for (let i = 0; i + 2 < idx.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const p = pos[idx[i + k]];
          if (!p) throw new GlbReadError('unreadable_glb');
          out.push(p[0], p[1], p[2]);
        }
      }
    }
    for (const c of node.children ?? []) visit(c, world, depth + 1);
  };

  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const children = new Set((gltf.nodes ?? []).flatMap((n) => n.children ?? []));
  const roots = scene?.nodes ?? (gltf.nodes ?? []).map((_, i) => i).filter((i) => !children.has(i));
  for (const r of roots) visit(r, IDENTITY, 0);

  return { triangles: new Float64Array(out), triangleCount: out.length / 9, skippedPrimitives };
}
