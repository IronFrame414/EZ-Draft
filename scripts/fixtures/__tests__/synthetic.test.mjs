// EZD-016b T1-T6, T9 (vault/plans/EZD-016b.md, Tests). node:test, run by the root glob
// scripts/**/*.test.mjs, unfiltered. Expected values are read from the committed, hand-written
// fixtures/synthetic/*.expected.json; every check runs on the freshly generated file and on the
// committed one. Readers are the app's own stack: dxf-parser, pdfjs-dist (legacy build) and three's
// GLTFLoader (02 Stack). They are imported inside the tests, so a missing reader fails T2-T5 only.
// Spawned children drop NODE_TEST_CONTEXT and get 180 s (EZD-002 deviations (1), (2)).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const SCRIPT = path.join(repo, 'scripts', 'fixtures', 'generate-synthetic.mjs');
const SYNTHETIC = path.join(repo, 'fixtures', 'synthetic');

const DXF = 'room-12x10.dxf';
const VECTOR = 'room-12x10-vector.pdf';
const SCANNED = 'room-12x10-scanned.pdf';
const GLB = 'room-12x10-sloped.glb';
const FIXTURES = [DXF, VECTOR, SCANNED, GLB];
const GENERATED_BY = 'scripts/fixtures/generate-synthetic.mjs';

/** @param {string} name */
const expected = (name) =>
  JSON.parse(readFileSync(path.join(SYNTHETIC, `${name}.expected.json`), 'utf8'));
/** @param {Buffer} b */
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// Every key T2-T5 read from each expected file (T6).
const REQUIRED_KEYS = {
  [DXF]: [
    'units',
    'header',
    'layers',
    'entityCount',
    'entitiesByLayer',
    'lines',
    'arc',
    'roomPolygon',
    'wallsTotalLineLengthIn',
    'extents',
    'semantic',
  ],
  [VECTOR]: [
    'pageCount',
    'view',
    'textItems',
    'imagePaintOps',
    'mapping',
    'straightSegmentCount',
    'wallLineWidth',
    'wallSegments',
    'otherLineWidth',
    'otherSegments',
    'curveCount',
    'curve',
    'calibration',
    'structure',
  ],
  [SCANNED]: [
    'pageCount',
    'view',
    'textItems',
    'imagePaintOps',
    'pathOps',
    'imageTransform',
    'image',
    'black',
    'white',
    'blackProbes',
    'whiteProbes',
  ],
  [GLB]: [
    'metresPerInch',
    'header',
    'chunkTypes',
    'assetVersion',
    'meshCount',
    'primitiveCount',
    'mode',
    'attributes',
    'vertexCount',
    'indexCount',
    'triangleCount',
    'positionMin',
    'positionMax',
    'interior',
    'surfaceAreasSqIn',
    'totalAreaSqIn',
    'ceiling',
    'southWallOpenings',
    'holeGrid',
    'holeInsetIn',
  ],
};
const REQUIRED_TOLERANCES = {
  [DXF]: ['lengthIn', 'areaSqIn', 'wallsTotalLengthIn'],
  [VECTOR]: ['paperPt'],
  [SCANNED]: ['rasterPx'],
  [GLB]: ['metres', 'inches', 'areaSqIn', 'pitchPer12', 'slopeDeg', 'normalDot'],
};

/** @param {number} actual @param {number} want @param {number} tol @param {string} what */
function near(actual, want, tol, what) {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - want) <= tol,
    `${what}: got ${actual}, want ${want} (±${tol})`,
  );
}
/** @param {number[]} a @param {number[]} b @param {number} tol */
const samePt = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
/** Unordered set of undirected segments, each matched once, within tol. */
function sameSegments(actual, want, tol, what) {
  assert.equal(actual.length, want.length, `${what}: segment count`);
  const left = [...actual];
  for (const [a, b] of want) {
    const i = left.findIndex(
      ([p, q]) => (samePt(p, a, tol) && samePt(q, b, tol)) || (samePt(p, b, tol) && samePt(q, a, tol)),
    );
    assert.ok(i >= 0, `${what}: no segment ${JSON.stringify([a, b])}`);
    left.splice(i, 1);
  }
}
const dist = (/** @type {number[]} */ a, /** @type {number[]} */ b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ---------- readers (imported lazily) ----------

async function parseDxf(file) {
  const { default: DxfParser } = await import('dxf-parser');
  return new DxfParser().parseSync(readFileSync(file, 'utf8'));
}

async function readPdf(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(file));
  const task = pdfjs.getDocument({ data, verbosity: 0, disableFontFace: true, isEvalSupported: false });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const text = await page.getTextContent();
    const ops = await page.getOperatorList();
    return { OPS: pdfjs.OPS, numPages: doc.numPages, view: [...page.view], text, ops };
  } finally {
    await task.destroy();
  }
}

/** Walks an operator list: stroked straight segments and curves after the CTM, image paints. */
function walkOps({ OPS, ops }) {
  const names = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));
  const strokeOps = new Set([
    OPS.stroke,
    OPS.closeStroke,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ]);
  const pathOpNames = new Set([
    'constructPath',
    'moveTo',
    'lineTo',
    'curveTo',
    'curveTo2',
    'curveTo3',
    'closePath',
    'rectangle',
    'stroke',
    'closeStroke',
    'fill',
    'eoFill',
    'fillStroke',
    'eoFillStroke',
    'closeFillStroke',
    'closeEOFillStroke',
    'endPath',
    'rawFillPath',
  ]);
  let ctm = [1, 0, 0, 1, 0, 0];
  let lw = 1;
  const stack = [];
  const mul = (m, n) => [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
  const apply = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  const segments = [];
  const curves = [];
  const images = [];
  let pathOps = 0;
  ops.fnArray.forEach((fn, i) => {
    const name = names[fn];
    const args = ops.argsArray[i];
    if (pathOpNames.has(name)) pathOps++;
    if (/^paint.*Image/.test(name ?? '')) images.push({ name, ctm: [...ctm] });
    if (fn === OPS.save) stack.push([ctm, lw]);
    else if (fn === OPS.restore) [ctm, lw] = stack.pop() ?? [ctm, lw];
    else if (fn === OPS.transform) ctm = mul(args, ctm);
    else if (fn === OPS.setLineWidth) lw = args[0];
    else if (fn === OPS.constructPath && strokeOps.has(args[0])) {
      const buf = args[1][0] ?? [];
      let cur = null;
      let start = null;
      for (let k = 0; k < buf.length; ) {
        const op = buf[k++];
        if (op === 0) {
          cur = start = apply(buf[k], buf[k + 1]);
          k += 2;
        } else if (op === 1) {
          const p = apply(buf[k], buf[k + 1]);
          segments.push({ a: cur, b: p, lw });
          cur = p;
          k += 2;
        } else if (op === 2) {
          const p = apply(buf[k + 4], buf[k + 5]);
          curves.push({ from: cur, to: p, lw });
          cur = p;
          k += 6;
        } else if (op === 3) {
          const p = apply(buf[k + 2], buf[k + 3]);
          curves.push({ from: cur, to: p, lw });
          cur = p;
          k += 4;
        } else if (op === 4) {
          if (cur && start && !samePt(cur, start, 0)) segments.push({ a: cur, b: start, lw });
          cur = start;
        } else {
          throw new Error(`unknown path op ${op}`);
        }
      }
    }
  });
  return { segments, curves, images, pathOps };
}

/** The bytes of the single image XObject stream: { start, end } offsets into the file. */
function imageStream(bytes) {
  const s = bytes.toString('latin1');
  const at = s.indexOf('/Subtype /Image');
  assert.ok(at >= 0, 'no /Subtype /Image');
  const dictStart = s.lastIndexOf(' 0 obj', at);
  const dictEnd = s.indexOf('stream\n', at);
  const dict = s.slice(dictStart, dictEnd);
  const len = Number(/\/Length (\d+)/.exec(dict)?.[1]);
  assert.ok(Number.isInteger(len), 'image /Length');
  const start = dictEnd + 'stream\n'.length;
  return { dict, start, end: start + len };
}

async function loadGlb(file) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const b = readFileSync(file);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return new GLTFLoader().parseAsync(ab, '');
}

// ---------- T2-T5 checks ----------

async function checkDxf(file) {
  const e = expected(DXF);
  const tol = e.tolerances.lengthIn;
  const dxf = await parseDxf(file);

  assert.equal(dxf.header.$ACADVER, e.header.$ACADVER);
  assert.equal(dxf.header.$INSUNITS, e.header.$INSUNITS);
  assert.deepEqual(Object.keys(dxf.tables.layer.layers).sort(), [...e.layers].sort());
  assert.equal(dxf.entities.length, e.entityCount);

  const byLayer = {};
  for (const ent of dxf.entities) {
    byLayer[ent.layer] ??= {};
    byLayer[ent.layer][ent.type] = (byLayer[ent.layer][ent.type] ?? 0) + 1;
  }
  assert.deepEqual(byLayer, e.entitiesByLayer);

  const linesOf = (layer) =>
    dxf.entities
      .filter((x) => x.type === 'LINE' && x.layer === layer)
      .map((x) => x.vertices.map((v) => [v.x, v.y]));
  for (const [layer, want] of Object.entries(e.lines)) {
    sameSegments(linesOf(layer), want, tol, `${layer} lines`);
  }

  const arcs = dxf.entities.filter((x) => x.type === 'ARC');
  assert.equal(arcs.length, 1);
  const arc = arcs[0];
  const deg = (r) => (r * 180) / Math.PI;
  assert.equal(arc.layer, e.arc.layer);
  assert.ok(samePt([arc.center.x, arc.center.y], e.arc.center, tol), 'arc centre');
  near(arc.radius, e.arc.radius, tol, 'arc radius');
  near(deg(arc.startAngle), e.arc.startAngleDeg, 1e-9, 'arc start angle');
  near(deg(arc.endAngle), e.arc.endAngleDeg, 1e-9, 'arc end angle');

  const polys = dxf.entities.filter((x) => x.type === 'POLYLINE');
  assert.equal(polys.length, 1);
  const poly = polys[0];
  assert.equal(poly.layer, e.roomPolygon.layer);
  assert.equal(poly.shape, e.roomPolygon.closed, 'polyline closed (flag 70 = 1)');
  const pv = poly.vertices.map((v) => [v.x, v.y]);
  assert.equal(pv.length, e.roomPolygon.vertices.length);
  pv.forEach((p, i) => assert.ok(samePt(p, e.roomPolygon.vertices[i], tol), `polygon vertex ${i}`));
  let area2 = 0;
  let perimeter = 0;
  pv.forEach((p, i) => {
    const q = pv[(i + 1) % pv.length];
    area2 += p[0] * q[1] - q[0] * p[1];
    perimeter += dist(p, q);
  });
  const area = Math.abs(area2) / 2;
  near(area, e.roomPolygon.areaSqIn, e.tolerances.areaSqIn, 'shoelace area sq in');
  near(area / 144, e.roomPolygon.areaSqFt, e.tolerances.areaSqIn / 144, 'area sq ft');
  near(perimeter, e.roomPolygon.perimeterIn, tol * pv.length, 'perimeter');

  const walls = linesOf('WALLS');
  near(
    walls.reduce((s, [a, b]) => s + dist(a, b), 0),
    e.wallsTotalLineLengthIn,
    e.tolerances.wallsTotalLengthIn,
    'total WALLS line length',
  );

  const pts = [
    ...dxf.entities.filter((x) => x.type === 'LINE').flatMap((x) => x.vertices.map((v) => [v.x, v.y])),
    ...pv,
    [arc.center.x + arc.radius * Math.cos(arc.startAngle), arc.center.y + arc.radius * Math.sin(arc.startAngle)],
    [arc.center.x + arc.radius * Math.cos(arc.endAngle), arc.center.y + arc.radius * Math.sin(arc.endAngle)],
  ];
  const min = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))];
  const max = [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
  assert.ok(samePt(min, e.extents.min, tol), `extents min ${min}`);
  assert.ok(samePt(max, e.extents.max, tol), `extents max ${max}`);

  // Semantic block: walls from the room polygon's edges and the parallel WALLS exterior faces.
  const minX = Math.min(...pv.map((p) => p[0]));
  const maxX = Math.max(...pv.map((p) => p[0]));
  const minY = Math.min(...pv.map((p) => p[1]));
  const maxY = Math.max(...pv.map((p) => p[1]));
  const sides = {
    S: { axis: 1, at: minY, out: -1 },
    N: { axis: 1, at: maxY, out: 1 },
    W: { axis: 0, at: minX, out: -1 },
    E: { axis: 0, at: maxX, out: 1 },
  };
  for (const w of e.semantic.walls) {
    const s = sides[w.side];
    const edge = pv
      .map((p, i) => [p, pv[(i + 1) % pv.length]])
      .find(([p, q]) => Math.abs(p[s.axis] - s.at) <= tol && Math.abs(q[s.axis] - s.at) <= tol);
    assert.ok(edge, `room edge on ${w.side}`);
    near(dist(edge[0], edge[1]), w.interiorLengthIn, tol, `${w.side} interior length`);
    const parallel = walls.filter(([a, b]) => Math.abs(a[s.axis] - b[s.axis]) <= tol);
    assert.ok(
      parallel.some(([a]) => Math.abs(a[s.axis] - s.at) <= tol),
      `${w.side} interior face line`,
    );
    const outside = parallel
      .map(([a]) => (a[s.axis] - s.at) * s.out)
      .filter((d) => d > tol);
    near(Math.min(...outside), w.thicknessIn, tol, `${w.side} wall thickness`);
  }
  const door = e.semantic.door;
  const ds = sides[door.wall];
  const leaf = linesOf('DOORS');
  assert.equal(leaf.length, 1);
  const [la, lb] = samePt(leaf[0][0], door.hinge, tol) ? leaf[0] : [leaf[0][1], leaf[0][0]];
  assert.ok(samePt(la, door.hinge, tol), 'door leaf starts at the hinge');
  near(la[ds.axis], ds.at, tol, 'hinge on the door wall');
  near(la[1 - ds.axis] - (ds.axis === 1 ? minX : minY), door.offsetIn, tol, 'door offset');
  near(dist(la, lb), door.widthIn, tol, 'door width (leaf length)');
  assert.ok(samePt([arc.center.x, arc.center.y], door.hinge, tol), 'swing centred on the hinge');
  near(arc.radius, door.widthIn, tol, 'swing radius = door width');
  near(deg(arc.endAngle - arc.startAngle), door.swingDeg, 1e-9, 'swing angle');
  const mid = (arc.startAngle + arc.endAngle) / 2;
  const mp = [arc.center.x + arc.radius * Math.cos(mid), arc.center.y + arc.radius * Math.sin(mid)];
  assert.equal(door.swingsInto, 'room');
  assert.ok(
    mp[0] > minX && mp[0] < maxX && mp[1] > minY && mp[1] < maxY,
    'swing arc lies inside the room',
  );
  const win = e.semantic.window;
  const wsd = sides[win.wall];
  const thickness = e.semantic.walls.find((w) => w.side === win.wall).thicknessIn;
  const wl = linesOf('WINDOWS');
  for (const [a, b] of wl) {
    for (const p of [a, b]) {
      const d = (p[wsd.axis] - wsd.at) * wsd.out;
      assert.ok(d >= -tol && d <= thickness + tol, 'window line within the wall');
    }
  }
  const along = wl.flatMap(([a, b]) => [a[1 - wsd.axis], b[1 - wsd.axis]]);
  near(Math.min(...along) - (wsd.axis === 1 ? minX : minY), win.offsetIn, tol, 'window offset');
  near(Math.max(...along) - Math.min(...along), win.widthIn, tol, 'window width');
}

async function checkVectorPdf(file) {
  const e = expected(VECTOR);
  const tol = e.tolerances.paperPt;
  const pdf = await readPdf(file);
  assert.equal(pdf.numPages, e.pageCount);
  assert.deepEqual(pdf.view, e.view);
  assert.equal(pdf.text.items.length, e.textItems);
  const { segments, curves, images } = walkOps(pdf);
  assert.equal(images.length, e.imagePaintOps, 'image paint operators');
  assert.equal(segments.length, e.straightSegmentCount, 'stroked straight segments');
  const walls = segments.filter((s) => s.lw === e.wallLineWidth);
  const other = segments.filter((s) => s.lw === e.otherLineWidth);
  assert.equal(walls.length + other.length, segments.length, 'every segment has a known width');
  sameSegments(walls.map((s) => [s.a, s.b]), e.wallSegments, tol, 'wall segments (1.5 pt)');
  sameSegments(other.map((s) => [s.a, s.b]), e.otherSegments, tol, 'door and window segments (0.5 pt)');

  assert.equal(curves.length, e.curveCount, 'curves');
  const c = curves[0];
  assert.ok(samePt(c.from, e.curve.from, tol), `curve start ${c.from}`);
  assert.ok(samePt(c.to, e.curve.to, tol), `curve end ${c.to}`);
  near(dist(c.from, e.curve.center), e.curve.radiusPt, tol, 'curve start radius');
  near(dist(c.to, e.curve.center), e.curve.radiusPt, tol, 'curve end radius');
  assert.equal(c.lw, e.curve.lineWidth, 'curve line width');

  const ends = segments.flatMap((s) => [s.a, s.b]);
  for (const cal of e.calibration) {
    assert.ok(ends.some((p) => samePt(p, cal.from, tol)), `calibration point ${cal.from}`);
    assert.ok(ends.some((p) => samePt(p, cal.to, tol)), `calibration point ${cal.to}`);
    near(dist(cal.from, cal.to), cal.lengthPt, tol, 'calibration length pt');
    near(dist(cal.from, cal.to) / e.mapping.ptPerIn, cal.lengthIn, tol / e.mapping.ptPerIn, 'calibration in');
  }
  // Mapping: X = originX + ptPerIn * x, Y = originY + ptPerIn * y; the interior SW corner is the origin.
  assert.ok(ends.some((p) => samePt(p, e.mapping.originPt, tol)), 'origin point drawn');

  checkPdfStructure(readFileSync(file), e.structure);
}

function checkPdfStructure(bytes, structure) {
  const s = bytes.toString('latin1');
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n?$/.exec(s)?.[1]);
  assert.ok(Number.isInteger(startxref), 'startxref');
  assert.equal(s.slice(startxref, startxref + 4), 'xref', 'startxref points at xref');
  const m = /^xref\n0 (\d+)\n/.exec(s.slice(startxref));
  assert.ok(m, 'xref subsection header');
  const count = Number(m[1]);
  let pos = startxref + m[0].length;
  let inUse = 0;
  for (let i = 0; i < count; i++) {
    const entry = s.slice(pos, pos + 20);
    pos += 20;
    const em = /^(\d{10}) (\d{5}) ([nf]) ?\r?\n$/.exec(entry);
    assert.ok(em, `xref entry ${i} is 20 bytes`);
    if (em[3] === 'n') {
      inUse++;
      const off = Number(em[1]);
      assert.equal(s.slice(off, off + `${i} 0 obj`.length), `${i} 0 obj`, `xref offset of object ${i}`);
    }
  }
  assert.equal(inUse > 0, structure.xrefOffsetsPointAtObjects);
  assert.match(s, new RegExp(`/Size ${count}\\b`), 'trailer /Size');
  assert.match(s, /\/Root \d+ 0 R/, 'trailer /Root');
  assert.equal(s.includes('/Encrypt'), structure.encrypt, '/Encrypt');
}

async function checkScannedPdf(file) {
  const e = expected(SCANNED);
  const pdf = await readPdf(file);
  assert.equal(pdf.numPages, e.pageCount);
  assert.deepEqual(pdf.view, e.view);
  assert.equal(pdf.text.items.length, e.textItems);
  const { images, pathOps } = walkOps(pdf);
  assert.equal(images.length, e.imagePaintOps, 'image paint operators');
  assert.equal(pathOps, e.pathOps, 'path-construct, stroke or fill operators');
  assert.deepEqual(images[0].ctm, e.imageTransform, 'image transform');

  const bytes = readFileSync(file);
  const s = bytes.toString('latin1');
  const img = e.image;
  assert.equal(s.split('/Subtype /Image').length - 1, img.subtypeImageCount, '/Subtype /Image count');
  const { dict, start, end } = imageStream(bytes);
  assert.match(dict, new RegExp(`/Width ${img.width}\\b`));
  assert.match(dict, new RegExp(`/Height ${img.height}\\b`));
  assert.ok(dict.includes(`/ColorSpace /${img.colorSpace}`), '/ColorSpace');
  assert.match(dict, new RegExp(`/BitsPerComponent ${img.bitsPerComponent}\\b`));
  assert.ok(dict.includes(`/Filter /${img.filter}`), '/Filter');
  assert.equal(img.width * img.height, img.inflatedLength);
  assert.equal(img.width, (e.view[2] / 72) * img.pxPerInch, 'width = page inches x px per inch');
  assert.equal(img.height, (e.view[3] / 72) * img.pxPerInch, 'height = page inches x px per inch');

  const pixels = zlib.inflateSync(bytes.subarray(start, end));
  assert.equal(pixels.length, img.inflatedLength, 'inflated length');
  const { room } = await import('../room.mjs');
  const { rasterizePlan } = await import('../raster.mjs');
  const raster = rasterizePlan(room);
  assert.equal(raster.width, img.width);
  assert.equal(raster.height, img.height);
  assert.ok(pixels.equals(Buffer.from(raster.data)), 'inflated stream equals rasterizePlan(room)');

  const at = (c, r) => pixels[r * img.width + c];
  const t = e.tolerances.rasterPx;
  for (const p of e.blackProbes) {
    let hit = false;
    for (let dr = -t; dr <= t; dr++) {
      for (let dc = -t; dc <= t; dc++) if (at(p.px[0] + dc, p.px[1] + dr) === e.black) hit = true;
    }
    assert.ok(hit, `${p.name} ${p.px} is black (±${t} px)`);
  }
  for (const p of e.whiteProbes) {
    for (let dr = -p.radiusPx; dr <= p.radiusPx; dr++) {
      for (let dc = -p.radiusPx; dc <= p.radiusPx; dc++) {
        const c = p.px[0] + dc;
        const r = p.px[1] + dr;
        if (c < 0 || r < 0) continue;
        assert.equal(at(c, r), e.white, `${p.name}: pixel (${c}, ${r}) is white`);
      }
    }
  }
}

async function checkGlb(file) {
  const e = expected(GLB);
  const T = e.tolerances;
  const m = e.metresPerInch;
  const bytes = readFileSync(file);

  assert.equal(bytes.toString('latin1', 0, 4), e.header.magic);
  assert.equal(bytes.readUInt32LE(4), e.header.version);
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'header length = file size');
  const chunkName = { 0x4e4f534a: 'JSON', 0x004e4942: 'BIN' };
  const chunks = [];
  for (let off = 12; off < bytes.length; ) {
    const len = bytes.readUInt32LE(off);
    chunks.push({ type: chunkName[bytes.readUInt32LE(off + 4)], len, data: bytes.subarray(off + 8, off + 8 + len) });
    off += 8 + len;
  }
  assert.deepEqual(chunks.map((c) => c.type), e.chunkTypes);
  for (const c of chunks) assert.equal(c.len % 4, 0, `${c.type} chunk length multiple of 4`);
  const json = JSON.parse(chunks[0].data.toString('utf8'));
  assert.equal(json.asset.version, e.assetVersion);

  const gltf = await loadGlb(file);
  const meshes = [];
  gltf.scene.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  assert.equal(meshes.length, e.meshCount, 'meshes');
  assert.equal(json.meshes.length, e.meshCount);
  const prims = json.meshes[0].primitives;
  assert.equal(prims.length, e.primitiveCount);
  assert.equal(prims[0].mode, e.mode);
  assert.deepEqual(Object.keys(prims[0].attributes).sort(), e.attributes);
  const acc = json.accessors[prims[0].attributes.POSITION];
  acc.min.forEach((v, i) => near(v, e.positionMin[i], T.metres, `POSITION min[${i}]`));
  acc.max.forEach((v, i) => near(v, e.positionMax[i], T.metres, `POSITION max[${i}]`));

  const geo = meshes[0].geometry;
  assert.deepEqual(Object.keys(geo.attributes).sort(), e.attributes.map((a) => a.toLowerCase()));
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const index = geo.index;
  assert.equal(pos.count, e.vertexCount, 'vertices');
  assert.equal(index.count, e.indexCount, 'indices');
  assert.equal(index.count / 3, e.triangleCount, 'triangles');

  // Plan inches (x east, y north, h up) from glTF metres (x, h, -y).
  const plan = (i) => [pos.getX(i) / m, -pos.getZ(i) / m, pos.getY(i) / m];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const W = e.interior.widthIn;
  const D = e.interior.depthIn;
  const c = e.ceiling;
  const hAt = (x) => c.heightAtWestIn + (x * c.rise) / c.run;

  const groups = { floor: [], ceiling: [], west: [], east: [], north: [], south: [] };
  for (let t = 0; t < index.count / 3; t++) {
    const ids = [index.getX(3 * t), index.getX(3 * t + 1), index.getX(3 * t + 2)];
    const [A, B, C] = ids.map(plan);
    const n = cross(sub(B, A), sub(C, A));
    const len = Math.hypot(...n);
    const unit = n.map((v) => v / len);
    const area = len / 2;
    // Geometric (counter-clockwise) normal vs the NORMAL attribute, both in glTF axes.
    const g = [unit[0], unit[2], -unit[1]];
    for (const i of ids) {
      const dot = g[0] * nor.getX(i) + g[1] * nor.getY(i) + g[2] * nor.getZ(i);
      assert.ok(dot >= T.normalDot, `triangle ${t}: normal agrees (dot ${dot})`);
    }
    const centroid = [0, 1, 2].map((k) => (A[k] + B[k] + C[k]) / 3);
    const probe = centroid.map((v, k) => v + unit[k]);
    assert.ok(
      probe[0] > 0 && probe[0] < W && probe[1] > 0 && probe[1] < D && probe[2] > 0 && probe[2] < hAt(probe[0]),
      `triangle ${t}: normal points into the room`,
    );
    const k = [0, 1, 2].reduce((best, i) => (Math.abs(unit[i]) > Math.abs(unit[best]) ? i : best), 0);
    const name =
      k === 2 ? (unit[2] > 0 ? 'floor' : 'ceiling') : k === 0 ? (unit[0] > 0 ? 'west' : 'east') : unit[1] > 0 ? 'south' : 'north';
    groups[name].push({ A, B, C, area });
  }
  let total = 0;
  for (const [name, want] of Object.entries(e.surfaceAreasSqIn)) {
    const a = groups[name].reduce((s, tri) => s + tri.area, 0);
    total += a;
    near(a, want, T.areaSqIn, `${name} area sq in`);
  }
  near(total, e.totalAreaSqIn, T.areaSqIn, 'total area sq in');

  const ceilingVerts = groups.ceiling.flatMap((tri) => [tri.A, tri.B, tri.C]);
  for (const v of ceilingVerts) near(v[2], hAt(v[0]), T.inches, `ceiling height at x ${v[0]}`);
  const cornerH = {};
  for (const [corner, want] of Object.entries(c.cornerHeightsIn)) {
    const v = ceilingVerts.find((p) => samePt([p[0], p[1]], want.at, T.inches));
    assert.ok(v, `ceiling vertex at ${corner}`);
    near(v[2], want.heightIn, T.inches, `${corner} height`);
    cornerH[corner] = v[2];
  }
  const wallTop = (name) => Math.max(...groups[name].flatMap((tri) => [tri.A[2], tri.B[2], tri.C[2]]));
  const sideName = { W: 'west', E: 'east' };
  near(wallTop(sideName[c.lowWall.side]), c.lowWall.heightIn, T.inches, 'low wall height');
  near(wallTop(sideName[c.highWall.side]), c.highWall.heightIn, T.inches, 'high wall height');
  const rise = cornerH.SE - cornerH.SW;
  const pitch = (rise / W) * c.run;
  near(pitch, c.pitchPer12, T.pitchPer12, 'pitch per 12');
  near((Math.atan(rise / W) * 180) / Math.PI, c.slopeDeg, T.slopeDeg, 'slope degrees');

  // Barycentric point-in-triangle on two coordinates.
  const inTri = (p, a, b, cc, i, j) => {
    const d = (b[j] - cc[j]) * (a[i] - cc[i]) + (cc[i] - b[i]) * (a[j] - cc[j]);
    const l1 = ((b[j] - cc[j]) * (p[0] - cc[i]) + (cc[i] - b[i]) * (p[1] - cc[j])) / d;
    const l2 = ((cc[j] - a[j]) * (p[0] - cc[i]) + (a[i] - cc[i]) * (p[1] - cc[j])) / d;
    const l3 = 1 - l1 - l2;
    return { inside: l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9, l: [l1, l2, l3] };
  };
  const centreTri = groups.ceiling.find((tri) => inTri(c.centre.at, tri.A, tri.B, tri.C, 0, 1).inside);
  assert.ok(centreTri, 'ceiling over the room centre');
  const { l } = inTri(c.centre.at, centreTri.A, centreTri.B, centreTri.C, 0, 1);
  near(l[0] * centreTri.A[2] + l[1] * centreTri.B[2] + l[2] * centreTri.C[2], c.centre.heightIn, T.inches, 'centre height');

  // South-wall holes, in (x, h).
  const covered = (p) => groups.south.some((tri) => inTri(p, tri.A, tri.B, tri.C, 0, 2).inside);
  const inset = e.holeInsetIn;
  const steps = e.holeGrid - 1;
  for (const o of e.southWallOpenings) {
    const [x0, x1] = o.xIn;
    const [h0, h1] = o.hIn;
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const p = [x0 + inset + ((x1 - x0 - 2 * inset) * i) / steps, h0 + inset + ((h1 - h0 - 2 * inset) * j) / steps];
        assert.ok(!covered(p), `${o.name} hole: (${p}) covered by a south-wall triangle`);
      }
    }
    const mx = (x0 + x1) / 2;
    const mh = (h0 + h1) / 2;
    const outside = [
      [x0 - inset, mh],
      [x1 + inset, mh],
      [mx, h1 + inset],
      ...(o.checkFloorEdge ? [[mx, h0 - inset]] : []),
    ];
    for (const p of outside) assert.ok(covered(p), `${o.name}: (${p}) just outside the opening is wall`);
  }
}

// ---------- tests ----------

describe('EZD-016b synthetic fixtures', () => {
  let tmp = '';
  /** @type {import('node:child_process').SpawnSyncReturns<string> | null} */
  let run = null;

  before(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd016b-'));
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    run = spawnSync(process.execPath, [SCRIPT, '--out', tmp], { encoding: 'utf8', env, timeout: 180_000 });
  });
  after(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  const both = (name) => [
    ['generated', () => path.join(tmp, name)],
    ['committed', () => path.join(SYNTHETIC, name)],
  ];

  describe('EZD-016b done when: the synthetic fixture script runs and its expected JSON matches', () => {
    it('T1 script runs, writes exactly the 4 files, and they equal the committed ones', () => {
      assert.ok(run, 'generator ran');
      assert.equal(run.status, 0, `exit status (stderr: ${run.stderr})`);
      const written = readdirSync(tmp).sort();
      assert.deepEqual(written, [...FIXTURES].sort());
      assert.ok(!written.some((f) => f.endsWith('.expected.json')), 'no expected JSON written');
      const lines = run.stdout.trim().split('\n').map((l) => JSON.parse(l));
      assert.deepEqual(lines.map((l) => l.name).sort(), [...FIXTURES].sort(), 'one JSON line per file');
      for (const l of lines) {
        const b = readFileSync(path.join(tmp, l.name));
        assert.equal(l.bytes, b.length, `${l.name} bytes`);
        assert.equal(l.sha256, sha256(b), `${l.name} sha256`);
      }
      for (const f of [DXF, VECTOR, GLB]) {
        assert.equal(
          sha256(readFileSync(path.join(tmp, f))),
          sha256(readFileSync(path.join(SYNTHETIC, f))),
          `${f} equals the committed file`,
        );
      }
      const fresh = readFileSync(path.join(tmp, SCANNED));
      const kept = readFileSync(path.join(SYNTHETIC, SCANNED));
      const a = imageStream(fresh);
      const b = imageStream(kept);
      assert.ok(
        zlib.inflateSync(fresh.subarray(a.start, a.end)).equals(zlib.inflateSync(kept.subarray(b.start, b.end))),
        'scanned PDF: inflated image stream equals the committed one',
      );
      assert.ok(fresh.subarray(0, a.start).equals(kept.subarray(0, b.start)), 'scanned PDF: bytes before the stream');
      assert.ok(fresh.subarray(a.end).equals(kept.subarray(b.end)), 'scanned PDF: bytes after the stream');
    });

    for (const [which, file] of both(DXF)) {
      it(`T2 DXF matches expected JSON (${which})`, () => checkDxf(file()));
    }
    for (const [which, file] of both(VECTOR)) {
      it(`T3 vector PDF matches expected JSON (${which})`, () => checkVectorPdf(file()));
    }
    for (const [which, file] of both(SCANNED)) {
      it(`T4 scanned PDF matches expected JSON (${which})`, () => checkScannedPdf(file()));
    }
    for (const [which, file] of both(GLB)) {
      it(`T5 GLB matches expected JSON (${which})`, () => checkGlb(file()));
    }
  });

  it('T6 expected JSON files are complete', () => {
    for (const f of FIXTURES) {
      const e = expected(f);
      assert.equal(e.fixture, f, `${f}: fixture`);
      assert.equal(e.generatedBy, GENERATED_BY, `${f}: generatedBy`);
      assert.ok(Array.isArray(e.sources) && e.sources.length > 0, `${f}: sources`);
      assert.ok(e.sources.every((s) => typeof s === 'string' && s.length > 0), `${f}: sources are text`);
      assert.ok(e.tolerances && typeof e.tolerances === 'object', `${f}: tolerances`);
      for (const k of REQUIRED_TOLERANCES[f]) {
        assert.equal(typeof e.tolerances[k], 'number', `${f}: tolerances.${k}`);
      }
      for (const k of REQUIRED_KEYS[f]) assert.ok(k in e, `${f}: ${k}`);
    }
  });

  it('T9 generator stays independent of the code under test', () => {
    const dir = path.join(repo, 'scripts', 'fixtures');
    const sources = readdirSync(dir).filter((f) => f.endsWith('.mjs'));
    for (const f of [
      'room.mjs',
      'plan-drawing.mjs',
      'write-dxf.mjs',
      'write-pdf.mjs',
      'raster.mjs',
      'write-glb.mjs',
      'generate-synthetic.mjs',
    ]) {
      assert.ok(sources.includes(f), `generator source ${f} scanned`);
    }
    for (const f of sources) {
      const text = readFileSync(path.join(dir, f), 'utf8');
      const specs = [
        ...text.matchAll(/\bimport\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g),
        ...text.matchAll(/\bexport\s+[^'";]*?\sfrom\s+['"]([^'"]+)['"]/g),
        ...text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
        ...text.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
      ].map((x) => x[1]);
      // L-019: a dynamic import or require whose target is not a string literal cannot be checked;
      // count them and require 0, so nothing slips past the scan.
      const dynamicCalls = [...text.matchAll(/\b(?:import|require)\s*\(/g)].length;
      const literalCalls = [...text.matchAll(/\b(?:import|require)\s*\(\s*['"][^'"]+['"]\s*\)/g)].length;
      assert.equal(dynamicCalls - literalCalls, 0, `${f}: import()/require() calls the scan cannot read`);
      for (const s of specs) {
        if (s.startsWith('node:')) continue;
        assert.ok(s.startsWith('./') && !s.slice(2).includes('/'), `${f}: import ${s} is not node: or ./ in scripts/fixtures`);
      }
      for (const bad of ['pdfkit', 'dxf-parser', 'pdfjs-dist', 'three', 'app/', 'packages/']) {
        assert.ok(!specs.some((s) => s === bad || s.includes(bad)), `${f}: imports ${bad}`);
      }
    }
  });
});
