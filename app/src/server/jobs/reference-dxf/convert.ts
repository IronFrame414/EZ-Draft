// EZD-901a (phase-09 EZD-901a; S11 Validation "Nothing in the reference is simplified or deleted"; 08 Imports,
// Architect drawings "all linework, layers, blocks, hatches, text, dims, layouts"; R26 R16): converts one architect
// DXF, once, into a binary buffer per layer (format.ts) and a manifest, so the browser never parses DXF text
// (docs/architecture.md DXF "Where parsing runs").
//
// - Every entity of model space and of each paper-space layout is one record on its own layer (a layout other than
//   the active one is the *Paper_SpaceN block, DXF Reference BLOCKS). An INSERT or DIMENSION is one record drawn
//   from its block's entities, through the insert's position, scale, rotation and array.
// - Curves are drawn as runs of short segments (the GPU draws lines), text as glyph pens in the fallback font, solid
//   hatches as triangles and pattern hatches as their pattern lines clipped to the boundary.
// - Not read (R26 R16; architecture "Counting method"): raw count - parsed count per type, plus the ATTRIB
//   sub-records the parser drops, plus parsed entities with no geometry the converter can place (counted as their
//   type). None of them is ever in a layer buffer.
// - One buffer per layer and space, each relative to its space's origin, so a layout's sheet never moves a
//   model's origin (Float32 precision) or lands in the model's snap index.
// - three (hatch triangulation, ShapeUtils) is loaded with import() (11 Performance rule 7; EZD-020).
// - Lengths are model inches ($INSUNITS, as polycam-dxf/read-dxf.ts), relative to their space's origin.
import { DRAWING_FONTS } from '@ezdraft/geometry';
import { decodeDxfBytes, DxfDecodeError } from './decode';
import {
  encodeLayerBuffer,
  REFERENCE_GLYPH_CHARS,
  type EntityTypeName,
  ENTITY_TYPE_CODES,
  type LayerEntityRecord,
} from './format';
import { createDxfParser, type HatchEntity, type HatchLoop, type HatchPoint } from './parser';
import { rawScan } from './raw-scan';

export class ReferenceReadError extends Error {
  constructor(readonly code: 'binary_dxf' | 'unreadable_dxf') {
    super(code);
    this.name = 'ReferenceReadError';
  }
}

export const MANIFEST_VERSION = 1;

export type ReferenceSpace = {
  kind: 'model' | 'paper';
  block: string;
  // The point every coordinate of this space's buffers is measured from (inches).
  origin: { x: number; y: number };
};
export type ReferenceLayerFile = {
  space: number;
  file: string;
  entities: number;
  segments: number;
  triangles: number;
  glyphs: number;
  snapPoints: number;
};
export type ReferenceLayer = {
  name: string;
  color: string;
  visible: boolean;
  // Entities of this layer in the buffer, all spaces together, and per space (manifest `spaces` order).
  entityCount: number;
  bySpace: number[];
  // One buffer per space the layer has entities in, beside the manifest; empty when it has none.
  files: ReferenceLayerFile[];
};
export type ReferenceManifest = {
  version: typeof MANIFEST_VERSION;
  units: { insUnits: number; name: string; inchesPerUnit: number };
  spaces: ReferenceSpace[];
  layers: ReferenceLayer[];
  // Entities not drawn, by DXF type (R26 R16 "N entities of type X not drawn").
  notRead: Record<string, number>;
  // Characters outside the fallback font's atlas (REFERENCE_GLYPH_CHARS); the rest of their text is drawn.
  missingGlyphs: number;
  font: 'dm-mono-400';
};
export type ConvertedReference = {
  manifest: ReferenceManifest;
  // Layer buffer bytes by file name.
  files: Map<string, Uint8Array<ArrayBuffer>>;
};

// $INSUNITS codes (AutoCAD DXF reference, HEADER $INSUNITS) to inches; 0 (unitless) and missing read as inches
// (vault/build/assumptions.md EZD-302).
const UNITS: Record<number, { name: string; k: number }> = {
  0: { name: 'unitless', k: 1 },
  1: { name: 'inches', k: 1 },
  2: { name: 'feet', k: 12 },
  4: { name: 'millimeters', k: 1 / 25.4 },
  5: { name: 'centimeters', k: 1 / 2.54 },
  6: { name: 'meters', k: 1 / 0.0254 },
};

// A full circle is drawn with this many segments; an arc with its share, at least 4 (EZD-901a assumption).
const CIRCLE_SEGMENTS = 72;
// Spline samples per control point.
const SPLINE_SAMPLES_PER_POINT = 8;
// Nested blocks deeper than this are a cycle in the file.
const MAX_BLOCK_DEPTH = 32;
// Snap grid: at most this many cells along the longer side.
const SNAP_GRID_CELLS = 64;
// Pattern hatch: lines per pattern family at most (a huge hatch with a tiny pattern is drawn up to this).
const MAX_PATTERN_LINES = 20000;
// AutoCAD's default MTEXT line spacing, 5/3 of the text height.
const MTEXT_LINE_SPACING = 5 / 3;

type P = { x: number; y: number };
// Affine transform: x' = a x + c y + e, y' = b x + d y + f.
type T = { a: number; b: number; c: number; d: number; e: number; f: number };
const IDENTITY: T = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const mul = (m: T, n: T): T => ({
  a: m.a * n.a + m.c * n.b,
  b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d,
  d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e,
  f: m.b * n.e + m.d * n.f + m.f,
});
const translate = (x: number, y: number): T => ({ ...IDENTITY, e: x, f: y });
const scale = (x: number, y: number): T => ({ ...IDENTITY, a: x, d: y });
const rotate = (rad: number): T => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { a: c, b: s, c: -s, d: c, e: 0, f: 0 };
};
// OCS with extrusion (0, 0, -1): the arbitrary axis algorithm gives x mirrored (DXF Reference, OCS).
const MIRROR_X: T = { ...IDENTITY, a: -1 };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const point = (v: unknown): P | null => {
  if (!v || typeof v !== 'object') return null;
  const x = num((v as { x?: unknown }).x);
  const y = num((v as { y?: unknown }).y);
  return x === null || y === null ? null : { x, y };
};

type RawEntity = Record<string, unknown> & { type?: unknown; layer?: unknown };
type RawBlock = { name?: string; position?: unknown; entities?: RawEntity[] };

// One layer's geometry in one space while it is built (absolute inches).
class LayerBuild {
  constructor(readonly space: number) {}
  segs: number[] = [];
  tris: number[] = [];
  glyphs: number[] = [];
  snaps: number[] = [];
  records: Array<LayerEntityRecord & { order: number }> = [];
}

// Where the current entity's geometry goes, with the transform it is drawn through.
class Pen {
  constructor(
    readonly layer: LayerBuild,
    readonly t: T,
    readonly ctx: Ctx,
  ) {}
  with(t: T): Pen {
    return new Pen(this.layer, mul(this.t, t), this.ctx);
  }
  map(p: P): P {
    const { a, b, c, d, e, f } = this.t;
    return { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f };
  }
  seg(p: P, q: P): void {
    const a = this.map(p);
    const b = this.map(q);
    this.layer.segs.push(a.x, a.y, b.x, b.y);
    this.ctx.grow(this.layer.space, a);
    this.ctx.grow(this.layer.space, b);
  }
  path(points: P[], closed: boolean): void {
    for (let i = 0; i + 1 < points.length; i++) this.seg(points[i], points[i + 1]);
    if (closed && points.length > 2) this.seg(points[points.length - 1], points[0]);
  }
  tri(p: P, q: P, r: P): void {
    for (const v of [p, q, r]) {
      const m = this.map(v);
      this.layer.tris.push(m.x, m.y);
      this.ctx.grow(this.layer.space, m);
    }
  }
  snap(p: P): void {
    const m = this.map(p);
    this.layer.snaps.push(m.x, m.y);
  }
  // One line of text: pens from `at` along `rotRad`, with the fallback font's advances.
  text(value: string, at: P, height: number, rotRad: number, widthFactor: number): void {
    const font = DRAWING_FONTS['dm-mono-400'];
    const dir = { x: Math.cos(rotRad), y: Math.sin(rotRad) };
    const up = { x: -dir.y, y: dir.x };
    // Size and angle of the text after the transform (an insert may scale or turn it).
    const o = this.map(at);
    const ux = this.map({ x: at.x + dir.x, y: at.y + dir.y });
    const uy = this.map({ x: at.x + up.x, y: at.y + up.y });
    const angle = Math.atan2(ux.y - o.y, ux.x - o.x);
    const em = height * Math.hypot(uy.x - o.x, uy.y - o.y);
    let pen = 0;
    for (const ch of value) {
      const cp = ch.codePointAt(0)!;
      const adv = font.advances[cp];
      if (!GLYPHS.has(ch) || adv === undefined) this.ctx.missingGlyphs += 1;
      else if (ch !== ' ') {
        const p = this.map({ x: at.x + dir.x * pen, y: at.y + dir.y * pen });
        this.layer.glyphs.push(p.x, p.y, em, angle, cp);
        this.ctx.grow(this.layer.space, p);
      }
      pen += ((adv ?? font.notdefAdvance) / font.unitsPerEm) * height * widthFactor;
    }
  }
}

function textWidth(value: string, height: number, widthFactor: number): number {
  const font = DRAWING_FONTS['dm-mono-400'];
  let w = 0;
  for (const ch of value) w += font.advances[ch.codePointAt(0)!] ?? font.notdefAdvance;
  return (w / font.unitsPerEm) * height * widthFactor;
}

type Three = typeof import('three');

const GLYPHS = new Set(REFERENCE_GLYPH_CHARS);

class Ctx {
  // Lowest x and y drawn per space.
  min = new Map<number, P>();
  missingGlyphs = 0;
  constructor(
    readonly blocks: Map<string, RawBlock>,
    readonly three: Three,
  ) {}
  grow(space: number, p: P): void {
    const m = this.min.get(space);
    if (!m) this.min.set(space, { x: p.x, y: p.y });
    else {
      if (p.x < m.x) m.x = p.x;
      if (p.y < m.y) m.y = p.y;
    }
  }
}

function arcPoints(c: P, r: number, a0: number, a1: number): P[] {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += 2 * Math.PI;
  const steps = Math.max(4, Math.ceil((sweep / (2 * Math.PI)) * CIRCLE_SEGMENTS));
  const out: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (sweep * i) / steps;
    out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return out;
}

// The points of a polyline with bulges (bulge = tan(included angle / 4), DXF Reference LWPOLYLINE group 42).
function bulgePath(vs: Array<P & { bulge?: number }>, closed: boolean): P[] {
  const out: P[] = [];
  const count = closed ? vs.length : vs.length - 1;
  for (let i = 0; i < count; i++) {
    const p = vs[i];
    const q = vs[(i + 1) % vs.length];
    if (out.length === 0) out.push(p);
    const b = num(p.bulge) ?? 0;
    if (b === 0) {
      out.push(q);
      continue;
    }
    const theta = 4 * Math.atan(b);
    const chord = Math.hypot(q.x - p.x, q.y - p.y);
    if (chord === 0) continue;
    const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const h = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
    // The centre is to the left of p→q for a counter-clockwise arc of less than half a turn.
    const nx = -(q.y - p.y) / chord;
    const ny = (q.x - p.x) / chord;
    const side = (Math.abs(theta) < Math.PI ? 1 : -1) * Math.sign(theta);
    const c = { x: mid.x + nx * h * side, y: mid.y + ny * h * side };
    const a0 = Math.atan2(p.y - c.y, p.x - c.x);
    const steps = Math.max(2, Math.ceil((Math.abs(theta) / (2 * Math.PI)) * CIRCLE_SEGMENTS));
    for (let s = 1; s <= steps; s++) {
      const a = a0 + (theta * s) / steps;
      out.push(s === steps ? q : { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    }
  }
  if (closed && out.length > 1) out.pop();
  return out;
}

// A non-rational B-spline by de Boor's algorithm; a spline without usable knots is drawn through its points.
function splinePoints(e: RawEntity): P[] {
  const ctrl = ((e.controlPoints as unknown[]) ?? []).map(point).filter((p): p is P => p !== null);
  const fit = ((e.fitPoints as unknown[]) ?? []).map(point).filter((p): p is P => p !== null);
  const knots = ((e.knotValues as unknown[]) ?? []).map(num).filter((k): k is number => k !== null);
  const degree = num(e.degreeOfSplineCurve) ?? 3;
  if (ctrl.length > degree && knots.length === ctrl.length + degree + 1) {
    const lo = knots[degree];
    const hi = knots[ctrl.length];
    const samples = Math.max(16, ctrl.length * SPLINE_SAMPLES_PER_POINT);
    const out: P[] = [];
    for (let i = 0; i <= samples; i++) {
      const u = i === samples ? hi : lo + ((hi - lo) * i) / samples;
      let k = degree;
      while (k < ctrl.length - 1 && u >= knots[k + 1]) k++;
      const d = ctrl.slice(k - degree, k + 1).map((p) => ({ ...p }));
      for (let r = 1; r <= degree; r++) {
        for (let j = degree; j >= r; j--) {
          const i0 = j + k - degree;
          const den = knots[i0 + degree - r + 1] - knots[i0];
          const alpha = den === 0 ? 0 : (u - knots[i0]) / den;
          d[j] = { x: (1 - alpha) * d[j - 1].x + alpha * d[j].x, y: (1 - alpha) * d[j - 1].y + alpha * d[j].y };
        }
      }
      out.push(d[degree]);
    }
    return out;
  }
  return fit.length >= 2 ? fit : ctrl;
}

// MTEXT formatting codes removed, paragraphs split (AutoCAD MTEXT inline codes); %% control codes (%%c, %%d,
// %%p symbols, %%nnn character codes, the %%u, %%o and %%k underline, overline and strike toggles) and \U+XXXX
// escapes (characters outside the file's code page) decoded for both TEXT and MTEXT.
function plainText(raw: string, mtext: boolean): string[] {
  let s = raw
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/%%[uUoOkK]/g, '')
    .replace(/%%(\d{3})/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/%%%/g, '%');
  if (!mtext) return [s];
  s = s
    .replace(/\\P/g, '\n')
    .replace(/\\~/g, ' ')
    .replace(/\\[ACFHQTWfhqtwp][^;\\]*;/g, '')
    .replace(/\\S([^;]*);/g, (_m, g: string) => g.replace(/[#^]/g, '/'))
    .replace(/\\[LlOoKkNn]/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/[{}]/g, '');
  return s.split('\n');
}

// Entities stored in their object coordinate system (DXF Reference, OCS); the others are in world coordinates.
const OCS_TYPES = new Set(['ARC', 'CIRCLE', 'LWPOLYLINE', 'POLYLINE', 'INSERT', 'TEXT', 'SOLID', 'HATCH']);

function entityMirror(e: RawEntity): boolean {
  const z =
    num(e.extrusionDirectionZ) ??
    num(e.extrusionZ) ??
    num((e.extrusionDirection as { z?: unknown } | undefined)?.z);
  return z !== null && z < 0;
}

// Point-in-polygon by ray crossing.
function inside(p: P, poly: P[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function loopPoints(loop: HatchLoop): P[] {
  if (loop.polyline) return bulgePath(loop.vertices, true);
  const out: P[] = [];
  const push = (p: HatchPoint) => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-9) out.push({ x: p.x, y: p.y });
  };
  for (const edge of loop.edges) {
    if (edge.type === 'line') {
      push(edge.a);
      push(edge.b);
    } else {
      const s = (edge.startDeg * Math.PI) / 180;
      const t = (edge.endDeg * Math.PI) / 180;
      // A clockwise edge (group 73 = 0) stores its angles negated and runs clockwise from start to end, which is
      // the counter-clockwise arc from -end to -start, reversed (DXF Reference HATCH arc edge).
      const pts = edge.ccw
        ? arcPoints(edge.center, edge.radius, s, t)
        : arcPoints(edge.center, edge.radius, -t, -s).reverse();
      for (const p of pts) push(p);
    }
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) <= 1e-9) out.pop();
  }
  return out;
}

function drawHatch(pen: Pen, e: HatchEntity): boolean {
  const loops = e.loops.map(loopPoints).filter((l) => l.length >= 3);
  if (loops.length === 0) return false;
  if (e.solid || e.patternLines.length === 0) {
    const { ShapeUtils, Vector2 } = pen.ctx.three;
    // Nesting: a loop inside an odd number of others is a hole of the smallest loop around it.
    const area = (l: P[]) => Math.abs(ShapeUtils.area(l.map((p) => new Vector2(p.x, p.y))));
    const order = loops.map((l, i) => ({ l, i, a: area(l) })).sort((x, y) => y.a - x.a);
    const depth = order.map((o) => order.filter((p) => p !== o && p.a > o.a && inside(o.l[0], p.l)).length);
    order.forEach((o, k) => {
      if (depth[k] % 2 !== 0) return;
      const holes = order.filter(
        (h, m) => depth[m] === depth[k] + 1 && h.a < o.a && inside(h.l[0], o.l),
      );
      const contour = o.l.map((p) => new Vector2(p.x, p.y));
      const holeVs = holes.map((h) => h.l.map((p) => new Vector2(p.x, p.y)));
      const all = [...contour, ...holeVs.flat()];
      for (const [i, j, m] of ShapeUtils.triangulateShape(contour, holeVs)) {
        pen.tri(all[i], all[j], all[m]);
      }
    });
    return true;
  }
  // Pattern hatch: each pattern line family, clipped to the boundary by the even-odd rule.
  const edges: Array<[P, P]> = [];
  for (const l of loops) for (let i = 0; i < l.length; i++) edges.push([l[i], l[(i + 1) % l.length]]);
  const all = loops.flat();
  for (const pl of e.patternLines) {
    const ang = (pl.angleDeg * Math.PI) / 180;
    const d = { x: Math.cos(ang), y: Math.sin(ang) };
    const nrm = { x: -d.y, y: d.x };
    const step = pl.offset.x * nrm.x + pl.offset.y * nrm.y;
    if (Math.abs(step) < 1e-9) continue;
    let lo = Infinity;
    let hi = -Infinity;
    for (const q of all) {
      const v = ((q.x - pl.base.x) * nrm.x + (q.y - pl.base.y) * nrm.y) / step;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const k0 = Math.ceil(lo);
    const k1 = Math.floor(hi);
    const dashLen = pl.dashes.reduce((s, v) => s + Math.abs(v), 0);
    for (let k = k0; k <= k1 && k - k0 < MAX_PATTERN_LINES; k++) {
      const o = { x: pl.base.x + pl.offset.x * k, y: pl.base.y + pl.offset.y * k };
      const ts: number[] = [];
      for (const [a, b] of edges) {
        const ea = (a.x - o.x) * nrm.x + (a.y - o.y) * nrm.y;
        const eb = (b.x - o.x) * nrm.x + (b.y - o.y) * nrm.y;
        if ((ea > 0) === (eb > 0) || ea === eb) continue;
        const s = ea / (ea - eb);
        const x = a.x + (b.x - a.x) * s;
        const y = a.y + (b.y - a.y) * s;
        ts.push((x - o.x) * d.x + (y - o.y) * d.y);
      }
      ts.sort((x, y) => x - y);
      for (let i = 0; i + 1 < ts.length; i += 2) {
        const at = (t: number) => ({ x: o.x + d.x * t, y: o.y + d.y * t });
        if (pl.dashes.length === 0 || dashLen === 0) {
          pen.seg(at(ts[i]), at(ts[i + 1]));
          continue;
        }
        // Dashes start at the family line's own origin o, which already includes k times the offset.
        let t = Math.floor(ts[i] / dashLen) * dashLen;
        while (t < ts[i + 1]) {
          for (const dash of pl.dashes) {
            const len = Math.abs(dash);
            const a = Math.max(t, ts[i]);
            const b = Math.min(t + len, ts[i + 1]);
            if (dash > 0 && b > a) pen.seg(at(a), at(b));
            t += len;
            if (t >= ts[i + 1]) break;
          }
        }
      }
    }
  }
  return true;
}

// Draws one entity through the pen. Returns false when it has nothing the converter can place.
function draw(pen: Pen, e: RawEntity, depth: number): boolean {
  const type = typeof e.type === 'string' ? e.type : '';
  const p = OCS_TYPES.has(type) && entityMirror(e) ? pen.with(MIRROR_X) : pen;
  switch (type) {
    case 'LINE': {
      const vs = (e.vertices as unknown[]) ?? [];
      const a = point(vs[0]);
      const b = point(vs[1]);
      if (!a || !b) return false;
      p.seg(a, b);
      p.snap(a);
      p.snap(b);
      return true;
    }
    case 'ARC':
    case 'CIRCLE': {
      const c = point(e.center);
      const r = num(e.radius);
      if (!c || r === null) return false;
      const a0 = type === 'ARC' ? num(e.startAngle) : 0;
      const a1 = type === 'ARC' ? num(e.endAngle) : 2 * Math.PI;
      if (a0 === null || a1 === null) return false;
      const pts = arcPoints(c, r, a0, type === 'CIRCLE' ? a0 + 2 * Math.PI : a1);
      p.path(pts, false);
      p.snap(c);
      if (type === 'ARC') {
        p.snap(pts[0]);
        p.snap(pts[pts.length - 1]);
      }
      return true;
    }
    case 'ELLIPSE': {
      const c = point(e.center);
      const m = point(e.majorAxisEndPoint);
      const ratio = num(e.axisRatio);
      if (!c || !m || ratio === null) return false;
      const s = num(e.startAngle) ?? 0;
      let t = num(e.endAngle) ?? 2 * Math.PI;
      while (t <= s) t += 2 * Math.PI;
      const steps = Math.max(4, Math.ceil(((t - s) / (2 * Math.PI)) * CIRCLE_SEGMENTS));
      const pts: P[] = [];
      for (let i = 0; i <= steps; i++) {
        const u = s + ((t - s) * i) / steps;
        pts.push({
          x: c.x + m.x * Math.cos(u) - m.y * ratio * Math.sin(u),
          y: c.y + m.y * Math.cos(u) + m.x * ratio * Math.sin(u),
        });
      }
      p.path(pts, false);
      p.snap(c);
      return true;
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const raw = (e.vertices as unknown[]) ?? [];
      const vs = raw
        .map((v) => {
          const q = point(v);
          return q ? { ...q, bulge: num((v as { bulge?: unknown }).bulge) ?? 0 } : null;
        })
        .filter((v): v is P & { bulge: number } => v !== null);
      if (vs.length < 2) return false;
      const closed = e.shape === true;
      p.path(bulgePath(vs, closed), closed);
      for (const v of vs) p.snap(v);
      return true;
    }
    case 'SPLINE': {
      const pts = splinePoints(e);
      if (pts.length < 2) return false;
      p.path(pts, false);
      p.snap(pts[0]);
      p.snap(pts[pts.length - 1]);
      return true;
    }
    case 'TEXT': {
      const start = point(e.startPoint);
      const h = num(e.textHeight);
      if (!start || h === null || typeof e.text !== 'string') return false;
      const [line] = plainText(e.text, false);
      const wf = num(e.xScale) ?? 1;
      const rot = ((num(e.rotation) ?? 0) * Math.PI) / 180;
      const halign = num(e.halign) ?? 0;
      const valign = num(e.valign) ?? 0;
      // Aligned text sits on the second alignment point (DXF Reference TEXT groups 72, 73, 11).
      const anchor = halign !== 0 || valign !== 0 ? (point(e.endPoint) ?? start) : start;
      const w = textWidth(line, h, wf);
      const dx = halign === 1 || halign === 4 ? -w / 2 : halign === 2 ? -w : 0;
      const dy = valign === 2 || halign === 4 ? -h / 2 : valign === 3 ? -h : 0;
      const at = {
        x: anchor.x + dx * Math.cos(rot) - dy * Math.sin(rot),
        y: anchor.y + dx * Math.sin(rot) + dy * Math.cos(rot),
      };
      p.text(line, at, h, rot, wf);
      p.snap(anchor);
      return true;
    }
    case 'MTEXT': {
      const at = point(e.position);
      const h = num(e.height);
      if (!at || h === null || typeof e.text !== 'string') return false;
      const dirv = point(e.directionVector);
      // MTEXT group 50 is in radians (DXF Reference MTEXT); a direction vector wins over it.
      const rot = dirv ? Math.atan2(dirv.y, dirv.x) : (num(e.rotation) ?? 0);
      const lines = plainText(e.text, true);
      const attach = num(e.attachmentPoint) ?? 1;
      const col = (attach - 1) % 3;
      const row = Math.floor((attach - 1) / 3);
      const block = h + (lines.length - 1) * h * MTEXT_LINE_SPACING;
      const widest = Math.max(...lines.map((l) => textWidth(l, h, 1)));
      lines.forEach((line, i) => {
        // Baseline of line i below the top of the text block; the block is placed by its attachment point.
        const lx = -(col * widest) / 2;
        const ly = (row * block) / 2 - h - i * h * MTEXT_LINE_SPACING;
        p.text(
          line,
          { x: at.x + lx * Math.cos(rot) - ly * Math.sin(rot), y: at.y + lx * Math.sin(rot) + ly * Math.cos(rot) },
          h,
          rot,
          1,
        );
      });
      p.snap(at);
      return true;
    }
    case 'INSERT': {
      const block = p.ctx.blocks.get(String(e.name ?? ''));
      const at = point(e.position);
      if (!block || !at || depth >= MAX_BLOCK_DEPTH) return false;
      const base = point(block.position) ?? { x: 0, y: 0 };
      const sx = num(e.xScale) ?? 1;
      const sy = num(e.yScale) ?? 1;
      const rot = ((num(e.rotation) ?? 0) * Math.PI) / 180;
      const cols = Math.max(1, num(e.columnCount) ?? 1);
      const rows = Math.max(1, num(e.rowCount) ?? 1);
      const cs = num(e.columnSpacing) ?? 0;
      const rs = num(e.rowSpacing) ?? 0;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const t = mul(
            mul(mul(translate(at.x, at.y), rotate(rot)), translate(i * cs, j * rs)),
            mul(scale(sx, sy), translate(-base.x, -base.y)),
          );
          const inner = p.with(t);
          for (const child of block.entities ?? []) draw(inner, child, depth + 1);
          p.snap({ x: at.x + i * cs, y: at.y + j * rs });
        }
      }
      return true;
    }
    case 'DIMENSION': {
      // The dimension's look is its anonymous block (*Dn), drawn in world coordinates.
      const block = p.ctx.blocks.get(String(e.block ?? ''));
      if (block && depth < MAX_BLOCK_DEPTH) {
        const at = point(e.insertionPoint) ?? { x: 0, y: 0 };
        const inner = p.with(translate(at.x, at.y));
        for (const child of block.entities ?? []) draw(inner, child, depth + 1);
      } else {
        const mid = point(e.middleOfText);
        const value =
          typeof e.text === 'string' && e.text !== '' && e.text !== '<>'
            ? e.text
            : num(e.actualMeasurement) !== null
              ? String(num(e.actualMeasurement))
              : null;
        if (!mid || value === null) return false;
        p.text(value, mid, 1, 0, 1);
      }
      for (const key of ['linearOrAngularPoint1', 'linearOrAngularPoint2', 'anchorPoint']) {
        const q = point(e[key]);
        if (q) p.snap(q);
      }
      return true;
    }
    case 'HATCH':
      return drawHatch(p, e as unknown as HatchEntity);
    case 'SOLID': {
      const pts = ((e.points as unknown[]) ?? []).map(point).filter((q): q is P => q !== null);
      if (pts.length < 3) return false;
      // SOLID corners are stored 1, 2, 4, 3; with three corners the fourth repeats the third (DXF Reference SOLID).
      p.tri(pts[0], pts[1], pts[2]);
      const same = pts[3] && pts[3].x === pts[2].x && pts[3].y === pts[2].y;
      if (pts.length >= 4 && !same) p.tri(pts[1], pts[3], pts[2]);
      return true;
    }
    case '3DFACE': {
      const pts = ((e.vertices as unknown[]) ?? []).map(point).filter((q): q is P => q !== null);
      if (pts.length < 3) return false;
      p.tri(pts[0], pts[1], pts[2]);
      if (pts.length >= 4) p.tri(pts[0], pts[2], pts[3]);
      return true;
    }
    case 'POINT': {
      const q = point(e.position);
      if (!q) return false;
      p.snap(q);
      return true;
    }
    default:
      return false;
  }
}

function hex(color: unknown): string {
  const c = num(color);
  return c === null ? '#ffffff' : `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
}

const isPaperBlock = (name: string) => /^\*paper_space\d*$/i.test(name);

// The file's text by the one decoding rule (decode.ts).
export function decodeReferenceDxf(bytes: Uint8Array): string {
  try {
    return decodeDxfBytes(bytes);
  } catch (e) {
    if (e instanceof DxfDecodeError) throw new ReferenceReadError('binary_dxf');
    throw e;
  }
}

export type ParsedDxf = {
  header?: Record<string, unknown>;
  entities?: RawEntity[];
  blocks?: Record<string, RawBlock>;
  tables?: { layer?: { layers?: Record<string, { name?: string; color?: unknown; visible?: unknown; frozen?: unknown }> } };
};

// The parsed drawing (one parser, createDxfParser). Throws ReferenceReadError for a binary or unreadable file.
export function parseReferenceDxf(text: string): ParsedDxf {
  let parsed: ParsedDxf | null;
  try {
    parsed = createDxfParser().parseSync(text) as ParsedDxf | null;
  } catch {
    throw new ReferenceReadError('unreadable_dxf');
  }
  if (!parsed || !Array.isArray(parsed.entities)) throw new ReferenceReadError('unreadable_dxf');
  return parsed;
}

// The top-level entities of each space: model space and the active layout from ENTITIES, other layouts from their
// *Paper_SpaceN blocks.
export function referenceSpaces(parsed: ParsedDxf): {
  spaces: ReferenceSpace[];
  entities: Array<{ entity: RawEntity; space: number }>;
} {
  const spaces: ReferenceSpace[] = [{ kind: 'model', block: '*Model_Space', origin: { x: 0, y: 0 } }];
  const blocks = parsed.blocks ?? {};
  const paperNames = Object.keys(blocks).filter(isPaperBlock);
  const active = paperNames.find((n) => /^\*paper_space$/i.test(n)) ?? '*Paper_Space';
  const others = paperNames.filter((n) => n !== active).sort();
  const hasPaper = (parsed.entities ?? []).some((e) => e.inPaperSpace === true);
  if (paperNames.length > 0 || hasPaper) spaces.push({ kind: 'paper', block: active, origin: { x: 0, y: 0 } });
  for (const name of others) spaces.push({ kind: 'paper', block: name, origin: { x: 0, y: 0 } });
  const entities: Array<{ entity: RawEntity; space: number }> = [];
  for (const e of parsed.entities ?? []) entities.push({ entity: e, space: e.inPaperSpace === true ? 1 : 0 });
  others.forEach((name, i) => {
    for (const e of blocks[name].entities ?? []) entities.push({ entity: e, space: 2 + i });
  });
  return { spaces, entities };
}

export async function convertReferenceDxf(bytes: Uint8Array): Promise<ConvertedReference> {
  const text = decodeReferenceDxf(bytes);
  const parsed = parseReferenceDxf(text);
  const raw = rawScan(text);

  const insUnits = num(parsed.header?.['$INSUNITS']) ?? 0;
  const unit = UNITS[insUnits] ?? UNITS[0];
  const blocks = new Map<string, RawBlock>(Object.entries(parsed.blocks ?? {}));
  const ctx = new Ctx(blocks, await import('three'));
  const root = scale(unit.k, unit.k);

  // Layers: the LAYER table first, in file order, then any layer only an entity names.
  const table = parsed.tables?.layer?.layers ?? {};
  const layerInfo = new Map<string, { color: string; visible: boolean }>();
  for (const [name, l] of Object.entries(table)) {
    layerInfo.set(name, { color: hex(l.color), visible: l.visible !== false && l.frozen !== true });
  }
  // Builds by layer, then by space.
  const builds = new Map<string, Map<number, LayerBuild>>();
  const buildOf = (name: string, space: number) => {
    let bySpace = builds.get(name);
    if (!bySpace) {
      bySpace = new Map();
      builds.set(name, bySpace);
    }
    let b = bySpace.get(space);
    if (!b) {
      b = new LayerBuild(space);
      bySpace.set(space, b);
    }
    if (!layerInfo.has(name)) layerInfo.set(name, { color: '#ffffff', visible: true });
    return b;
  };

  // Parsed counts by type over ENTITIES and every block, as the raw scan counts them.
  const parsedByType: Record<string, number> = {};
  const countParsed = (list: RawEntity[] | undefined) => {
    for (const e of list ?? []) {
      const t = typeof e.type === 'string' ? e.type : 'UNKNOWN';
      parsedByType[t] = (parsedByType[t] ?? 0) + 1;
    }
  };
  countParsed(parsed.entities);
  for (const b of blocks.values()) countParsed(b.entities);

  const notRead: Record<string, number> = {};
  const bump = (t: string, by = 1) => {
    if (by > 0) notRead[t] = (notRead[t] ?? 0) + by;
  };
  for (const [t, count] of Object.entries(raw.byType)) bump(t, count - (parsedByType[t] ?? 0));
  bump('ATTRIB', raw.subRecords.ATTRIB ?? 0);

  const { spaces, entities } = referenceSpaces(parsed);
  entities.forEach(({ entity, space }, order) => {
    const type = typeof entity.type === 'string' ? entity.type : 'UNKNOWN';
    const layerName = typeof entity.layer === 'string' ? entity.layer : '0';
    if (!(type in ENTITY_TYPE_CODES)) {
      bump(type);
      return;
    }
    const b = buildOf(layerName, space);
    const start = { s: b.segs.length / 4, t: b.tris.length / 6, g: b.glyphs.length / 5, n: b.snaps.length };
    const drawn = draw(new Pen(b, root, ctx), entity, 0);
    if (!drawn) {
      // Roll back anything a partly drawn entity left.
      b.segs.length = start.s * 4;
      b.tris.length = start.t * 6;
      b.glyphs.length = start.g * 5;
      b.snaps.length = start.n;
      bump(type);
      return;
    }
    b.records.push({
      order,
      type: type as EntityTypeName,
      space,
      segStart: start.s,
      segCount: b.segs.length / 4 - start.s,
      triStart: start.t,
      triCount: b.tris.length / 6 - start.t,
      glyphStart: start.g,
      glyphCount: b.glyphs.length / 5 - start.g,
    });
  });

  spaces.forEach((sp, i) => {
    const m = ctx.min.get(i);
    if (m) sp.origin = { x: m.x, y: m.y };
  });
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const layers: ReferenceLayer[] = [];
  let index = 0;
  for (const [name, info] of layerInfo) {
    const layer: ReferenceLayer = {
      name,
      color: info.color,
      visible: info.visible,
      entityCount: 0,
      bySpace: spaces.map(() => 0),
      files: [],
    };
    const bySpace = [...(builds.get(name) ?? new Map<number, LayerBuild>()).values()].sort(
      (x, y) => x.space - y.space,
    );
    for (const b of bySpace) {
      if (b.records.length === 0) continue;
      const file = `layer-${index}-${b.space}.bin`;
      files.set(file, packLayer(b, spaces[b.space].origin));
      layer.entityCount += b.records.length;
      layer.bySpace[b.space] = b.records.length;
      layer.files.push({
        space: b.space,
        file,
        entities: b.records.length,
        segments: b.segs.length / 4,
        triangles: b.tris.length / 6,
        glyphs: b.glyphs.length / 5,
        snapPoints: b.snaps.length / 2,
      });
    }
    layers.push(layer);
    index += 1;
  }

  return {
    manifest: {
      version: MANIFEST_VERSION,
      units: { insUnits, name: unit.name, inchesPerUnit: unit.k },
      spaces,
      layers,
      notRead,
      missingGlyphs: ctx.missingGlyphs,
      font: 'dm-mono-400',
    },
    files,
  };
}

// Packs one layer's entities of one space: records in file order, each record's geometry moved with it;
// coordinates relative to the space's origin; snap points bucketed into the grid.
function packLayer(b: LayerBuild, origin: P): Uint8Array<ArrayBuffer> {
  const recs = [...b.records].sort((x, y) => x.space - y.space || x.order - y.order);
  const segs: number[] = [];
  const tris: number[] = [];
  const glyphs: number[] = [];
  const out: LayerEntityRecord[] = [];
  for (const r of recs) {
    const s = segs.length / 4;
    const t = tris.length / 6;
    const g = glyphs.length / 5;
    for (let i = r.segStart; i < r.segStart + r.segCount; i++) {
      segs.push(b.segs[i * 4] - origin.x, b.segs[i * 4 + 1] - origin.y, b.segs[i * 4 + 2] - origin.x, b.segs[i * 4 + 3] - origin.y);
    }
    for (let i = r.triStart; i < r.triStart + r.triCount; i++) {
      for (let v = 0; v < 3; v++) tris.push(b.tris[i * 6 + v * 2] - origin.x, b.tris[i * 6 + v * 2 + 1] - origin.y);
    }
    for (let i = r.glyphStart; i < r.glyphStart + r.glyphCount; i++) {
      const k = i * 5;
      glyphs.push(b.glyphs[k] - origin.x, b.glyphs[k + 1] - origin.y, b.glyphs[k + 2], b.glyphs[k + 3], b.glyphs[k + 4]);
    }
    out.push({
      type: r.type,
      space: r.space,
      segStart: s,
      segCount: r.segCount,
      triStart: t,
      triCount: r.triCount,
      glyphStart: g,
      glyphCount: r.glyphCount,
    });
  }

  // Snap grid over the layer's snap points.
  const pts: P[] = [];
  for (let i = 0; i < b.snaps.length; i += 2) pts.push({ x: b.snaps[i] - origin.x, y: b.snaps[i + 1] - origin.y });
  let grid = { originX: 0, originY: 0, cellSize: 1, cols: 0, rows: 0 };
  let cells = new Uint32Array(1);
  let sorted = new Float32Array(0);
  if (pts.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const q of pts) {
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x);
      maxY = Math.max(maxY, q.y);
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const cellSize = Math.max(1, Math.max(w, h) / SNAP_GRID_CELLS);
    const cols = Math.floor(w / cellSize) + 1;
    const rows = Math.floor(h / cellSize) + 1;
    grid = { originX: minX, originY: minY, cellSize, cols, rows };
    const cellOf = (p: P) =>
      Math.min(rows - 1, Math.floor((p.y - minY) / cellSize)) * cols +
      Math.min(cols - 1, Math.floor((p.x - minX) / cellSize));
    const counts = new Uint32Array(cols * rows + 1);
    for (const p of pts) counts[cellOf(p) + 1] += 1;
    for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
    cells = counts.slice();
    const fill = counts.slice();
    sorted = new Float32Array(pts.length * 2);
    for (const p of pts) {
      const at = fill[cellOf(p)]++;
      sorted[at * 2] = p.x;
      sorted[at * 2 + 1] = p.y;
    }
  }
  return encodeLayerBuffer({
    entities: out,
    segments: Float32Array.from(segs),
    triangles: Float32Array.from(tris),
    glyphs: Float32Array.from(glyphs),
    snapGrid: grid,
    snapCells: cells,
    snapPoints: sorted,
  });
}
