// EZD-028 T1-T7, T9 (vault/plans/EZD-028.md Tests table; Approach Steps 1-4).
import { describe, test, expect, beforeAll } from 'vitest';
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildRoomList } from '../src/drawing-list.mjs';
import { writePdf } from '../src/write-pdf.mjs';

// Paper tolerance: 03 rule 5's 1/64 in at the 1/48 plan scale, 1/64 / 48 in x 72 pt/in (plan Tests).
const PAPER_TOL = 0.0234375;
// Page: 24x36 ARCH D landscape, 36 x 72 by 24 x 72 pt (ticket Done when; plan Step 4).
const PAGE_W = 2592;
const PAGE_H = 1728;
// Model-space tolerance: 1/64 in (03 rule 5).
const MODEL_TOL = 1 / 64;
// Room interior (0,0)-(144,120) in model inches (Step 1).
const ROOM = { x0: 0, y0: 0, x1: 144, y1: 120 };
// Room on paper, PDF user space (T6; Step 2 Model to paper: 1188 + 144 x 1.5, 774 + 120 x 1.5).
const ROOM_PAPER = { x0: 1188, y0: 774, x1: 1404, y1: 954 };
// Hinge (12,0) on paper (T7: 12 x 1/48 x 72 + 1188 = 1206).
const HINGE_PAPER = [1206, 774];

// pdfjs-dist 6.4.299 path buffer codes (DrawOPS in legacy/build/pdf.worker.mjs; not exported).
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };
const STROKING = new Set([
  OPS.stroke,
  OPS.closeStroke,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
]);

let bytes;
let pdfjsDoc;

function pdfjsLoad(data) {
  return getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
}

function mult(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function tagOf(arg) {
  if (typeof arg === 'string') return arg;
  return arg?.name ?? null;
}

/**
 * Walks the page operator list and returns every stroked straight segment and Bezier curve in
 * PDF default user space (the full CTM applied), each with the marked-content tags around it.
 */
function strokedGeometry(opList) {
  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack = [];
  const tags = [];
  const segments = [];
  const curves = [];
  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    if (fn === OPS.save) ctmStack.push(ctm);
    else if (fn === OPS.restore) ctm = ctmStack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mult(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      ctmStack.push(ctm);
      if (Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0])) ctm = mult(ctm, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = ctmStack.pop() ?? ctm;
    else if (fn === OPS.beginMarkedContent || fn === OPS.beginMarkedContentProps)
      tags.push(tagOf(args?.[0]));
    else if (fn === OPS.endMarkedContent) tags.pop();
    else if (fn === OPS.constructPath) {
      const [op, [buffer]] = args;
      if (!STROKING.has(op) || !buffer) continue;
      const here = [...tags];
      let cur = null;
      let start = null;
      for (let k = 0; k < buffer.length; ) {
        const code = buffer[k++];
        if (code === DRAW.moveTo) {
          cur = apply(ctm, buffer[k], buffer[k + 1]);
          start = cur;
          k += 2;
        } else if (code === DRAW.lineTo) {
          const p = apply(ctm, buffer[k], buffer[k + 1]);
          segments.push({ a: cur, b: p, tags: here });
          cur = p;
          k += 2;
        } else if (code === DRAW.curveTo) {
          const p = apply(ctm, buffer[k + 4], buffer[k + 5]);
          curves.push({ a: cur, b: p, tags: here });
          cur = p;
          k += 6;
        } else if (code === DRAW.quadraticCurveTo) {
          const p = apply(ctm, buffer[k + 2], buffer[k + 3]);
          curves.push({ a: cur, b: p, tags: here });
          cur = p;
          k += 4;
        } else if (code === DRAW.closePath) {
          if (cur && start && dist(cur, start) > 0) segments.push({ a: cur, b: start, tags: here });
          cur = start;
        }
      }
    }
  }
  return { segments, curves };
}

/** Text of each marked-content tag, from getTextContent({ includeMarkedContent: true }). */
function textByTag(content) {
  const stack = [];
  const out = new Map();
  for (const item of content.items) {
    if (item.type === 'beginMarkedContent' || item.type === 'beginMarkedContentProps') {
      stack.push(item.tag);
    } else if (item.type === 'endMarkedContent') {
      stack.pop();
    } else if (typeof item.str === 'string') {
      for (const tag of stack) out.set(tag, (out.get(tag) ?? '') + item.str);
    }
  }
  for (const [tag, text] of out) out.set(tag, text.replace(/\s+/g, ' ').trim());
  return out;
}

function dist(p, q) {
  return Math.hypot(q[0] - p[0], q[1] - p[1]);
}

// `12'-0"` -> 144 (inches).
function parseFeetInches(s) {
  const m = /^(\d+)'-(\d+(?:\.\d+)?)"$/.exec(s);
  if (!m) return NaN;
  return Number(m[1]) * 12 + Number(m[2]);
}

// `1/4" = 1'-0"` -> (1/4 in) / (12 in) = 1/48.
function parseScale(s) {
  const m = /^(\d+)\/(\d+)" = (\d+)'-(\d+(?:\.\d+)?)"$/.exec(s);
  if (!m) return NaN;
  return Number(m[1]) / Number(m[2]) / (Number(m[3]) * 12 + Number(m[4]));
}

function hasEmbeddedProgram(fd, allowed) {
  if (!(fd instanceof PDFDict)) return false;
  return allowed.some((key) => fd.has(PDFName.of(key)));
}

// T2 rule: Type0 -> DescendantFonts[0] -> FontDescriptor has FontFile2 or FontFile3; a simple font
// -> FontDescriptor has FontFile, FontFile2 or FontFile3. A CIDFont dictionary (the descendant
// itself, also /Type /Font) is held to the Type0 descendant rule.
function isEmbedded(font) {
  const subtype = font.lookup(PDFName.of('Subtype'));
  if (subtype === PDFName.of('Type0')) {
    const descendants = font.lookup(PDFName.of('DescendantFonts'));
    if (!(descendants instanceof PDFArray)) return false;
    const cid = descendants.lookup(0);
    if (!(cid instanceof PDFDict)) return false;
    return hasEmbeddedProgram(cid.lookup(PDFName.of('FontDescriptor')), ['FontFile2', 'FontFile3']);
  }
  if (subtype === PDFName.of('CIDFontType0') || subtype === PDFName.of('CIDFontType2')) {
    return hasEmbeddedProgram(font.lookup(PDFName.of('FontDescriptor')), [
      'FontFile2',
      'FontFile3',
    ]);
  }
  return hasEmbeddedProgram(font.lookup(PDFName.of('FontDescriptor')), [
    'FontFile',
    'FontFile2',
    'FontFile3',
  ]);
}

// Step 2 Model to paper: paperOrigin + model x scale x 72 (PDF user space, y up).
function toPaper(view, [x, y]) {
  return [
    view.paperOrigin[0] + x * view.scale * 72,
    view.paperOrigin[1] + y * view.scale * 72,
  ];
}

// Step 2 arc end point: center + radius (cos t, sin t), t in degrees counter-clockwise.
function arcPoint(arc, deg) {
  const t = (deg * Math.PI) / 180;
  return [arc.center[0] + arc.radius * Math.cos(t), arc.center[1] + arc.radius * Math.sin(t)];
}

function onRoomBoundary([x, y]) {
  const inX = x >= ROOM.x0 - MODEL_TOL && x <= ROOM.x1 + MODEL_TOL;
  const inY = y >= ROOM.y0 - MODEL_TOL && y <= ROOM.y1 + MODEL_TOL;
  const onVertical = Math.abs(x - ROOM.x0) <= MODEL_TOL || Math.abs(x - ROOM.x1) <= MODEL_TOL;
  const onHorizontal = Math.abs(y - ROOM.y0) <= MODEL_TOL || Math.abs(y - ROOM.y1) <= MODEL_TOL;
  return (onVertical && inY) || (onHorizontal && inX);
}

function insideRect([x, y], r, tol) {
  return x >= r.x0 - tol && x <= r.x1 + tol && y >= r.y0 - tol && y <= r.y1 + tol;
}

/** T9: every checked paper point of one item (Step 2 fields, Model to paper, Text box). */
function paperPoints(view, item) {
  const p = (pt) => toPaper(view, pt);
  switch (item.kind) {
    case 'line':
      return [p(item.from), p(item.to)];
    case 'polyline':
      return item.points.map(p);
    case 'arc':
      return [p(item.center), p(arcPoint(item, item.startAngle)), p(arcPoint(item, item.endAngle))];
    case 'hatch':
      return [...item.boundary.map(p), ...item.segments.flatMap((s) => [p(s.from), p(s.to)])];
    case 'text': {
      const [ax, ay] = p(item.anchor);
      const left = { left: ax, center: ax - item.width / 2, right: ax - item.width }[item.align];
      if (left === undefined) throw new Error(`unknown align ${item.align}`);
      return [
        [left, ay - item.size],
        [left + item.width, ay - item.size],
        [left, ay + item.size],
        [left + item.width, ay + item.size],
      ];
    }
    default:
      throw new Error(`unknown kind ${item.kind}`);
  }
}

function numbers(arr) {
  return arr.asArray().map((n) => n.asNumber());
}

describe('EZD-028 PDF from a drawing list', () => {
  beforeAll(async () => {
    bytes = await writePdf(buildRoomList());
    pdfjsDoc = await pdfjsLoad(bytes);
  }, 60_000);

  test('EZD-028 done when: T1 one page, MediaBox [0, 0, 2592, 1728], no crop or rotation', async () => {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(1);
    const node = doc.getPage(0).node;
    expect(numbers(node.MediaBox())).toEqual([0, 0, PAGE_W, PAGE_H]);
    const crop = node.CropBox();
    if (crop !== undefined) expect(numbers(crop)).toEqual([0, 0, PAGE_W, PAGE_H]);
    const rotate = node.Rotate();
    if (rotate !== undefined) expect(rotate.asNumber()).toBe(0);

    expect(pdfjsDoc.numPages).toBe(1);
    const page = await pdfjsDoc.getPage(1);
    expect([...page.view]).toEqual([0, 0, PAGE_W, PAGE_H]);
  });

  test('EZD-028 done when: T2 exactly 2 page fonts, every font program embedded', async () => {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const resources = doc.getPage(0).node.Resources();
    expect(resources).toBeInstanceOf(PDFDict);
    const fontDict = resources.lookup(PDFName.of('Font'));
    expect(fontDict).toBeInstanceOf(PDFDict);
    const pageFonts = fontDict.entries();
    expect(pageFonts.length).toBe(2);
    for (const [name, ref] of pageFonts) {
      const font = doc.context.lookup(ref);
      expect(font, `page font ${name.asString()}`).toBeInstanceOf(PDFDict);
      expect(isEmbedded(font), `page font ${name.asString()} embedded`).toBe(true);
    }

    const allFonts = doc.context
      .enumerateIndirectObjects()
      .filter(([, obj]) => obj instanceof PDFDict && obj.get(PDFName.of('Type')) === PDFName.of('Font'));
    expect(allFonts.length).toBeGreaterThanOrEqual(2);
    for (const [ref, font] of allFonts) {
      expect(isEmbedded(font), `font object ${ref.toString()} embedded`).toBe(true);
    }
  });

  test('EZD-028 done when: T3 check dimension measures 12\'-0" x 1/48 = 216 pt on paper', async () => {
    const page = await pdfjsDoc.getPage(1);
    const { segments } = strokedGeometry(await page.getOperatorList());
    const dimSegments = segments.filter((s) => s.tags.includes('EZ_check_dimension'));
    expect(dimSegments.length).toBeGreaterThan(0);
    const measured = Math.max(...dimSegments.map((s) => dist(s.a, s.b)));
    expect(Math.abs(measured - 216)).toBeLessThanOrEqual(PAPER_TOL);

    const texts = textByTag(await page.getTextContent({ includeMarkedContent: true }));
    const label = texts.get('EZ_check_dimension');
    expect(label).toBe('12\'-0"');
    const labeledInches = parseFeetInches(label);
    expect(labeledInches).toBe(144);

    const scaleText = texts.get('EZ_scale_label');
    expect(scaleText).toBe('1/4" = 1\'-0"');
    const scale = parseScale(scaleText);
    expect(scale).toBeCloseTo(1 / 48, 12);

    expect(Math.abs(labeledInches * scale * 72 - measured)).toBeLessThanOrEqual(PAPER_TOL);
  });

  test('T4 exactly one bookmark, "EZD-028 room", to page index 0', async () => {
    const outline = (await pdfjsDoc.getOutline()) ?? [];
    const count = (items) => items.reduce((n, it) => n + 1 + count(it.items ?? []), 0);
    expect(count(outline)).toBe(1);
    const [item] = outline;
    expect(item.title).toBe('EZD-028 room');
    let dest = item.dest;
    if (typeof dest === 'string') dest = await pdfjsDoc.getDestination(dest);
    expect(Array.isArray(dest)).toBe(true);
    const index = typeof dest[0] === 'number' ? dest[0] : await pdfjsDoc.getPageIndex(dest[0]);
    expect(index).toBe(0);
  });

  test('T5 not password-locked: not encrypted, no /Encrypt in the trailer', async () => {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    expect(doc.isEncrypted).toBe(false);
    expect(doc.context.trailerInfo.Encrypt).toBeUndefined();
  });

  test('T6 hatch: 31 clipped segments on the room boundary; 31 stroked segments in EZ_hatch inside the room on paper', async () => {
    const hatches = buildRoomList().items.filter((item) => item.kind === 'hatch');
    expect(hatches.length).toBe(1);
    const [hatch] = hatches;
    expect(hatch.segments.length).toBe(31);
    for (const s of hatch.segments) {
      expect(onRoomBoundary(s.from), `from ${s.from}`).toBe(true);
      expect(onRoomBoundary(s.to), `to ${s.to}`).toBe(true);
      expect(Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1])).toBeGreaterThan(0);
    }

    const page = await pdfjsDoc.getPage(1);
    const { segments } = strokedGeometry(await page.getOperatorList());
    const hatchSegments = segments.filter((s) => s.tags.includes('EZ_hatch'));
    expect(hatchSegments.length).toBe(31);
    for (const s of hatchSegments) {
      expect(insideRect(s.a, ROOM_PAPER, PAPER_TOL), `a ${s.a}`).toBe(true);
      expect(insideRect(s.b, ROOM_PAPER, PAPER_TOL), `b ${s.b}`).toBe(true);
    }
  });

  test('T7 arc: center [12, 0], radius 36, 0 to 90 degrees; EZ_door curve ends 54 pt from the hinge', async () => {
    const arcs = buildRoomList().items.filter((item) => item.kind === 'arc');
    expect(arcs.length).toBe(1);
    const [arc] = arcs;
    expect(arc.center).toEqual([12, 0]);
    expect(arc.radius).toBe(36);
    expect(arc.startAngle).toBe(0);
    expect(arc.endAngle).toBe(90);
    const start = arcPoint(arc, arc.startAngle);
    const end = arcPoint(arc, arc.endAngle);
    expect(dist(start, [48, 0])).toBeLessThanOrEqual(MODEL_TOL);
    expect(dist(end, [12, 36])).toBeLessThanOrEqual(MODEL_TOL);

    const page = await pdfjsDoc.getPage(1);
    const { curves } = strokedGeometry(await page.getOperatorList());
    const doorCurves = curves.filter((c) => c.tags.includes('EZ_door'));
    expect(doorCurves.length).toBeGreaterThan(0);
    const curveStart = doorCurves[0].a;
    const curveEnd = doorCurves[doorCurves.length - 1].b;
    expect(Math.abs(dist(curveStart, HINGE_PAPER) - 54)).toBeLessThanOrEqual(PAPER_TOL);
    expect(Math.abs(dist(curveEnd, HINGE_PAPER) - 54)).toBeLessThanOrEqual(PAPER_TOL);
  });

  test('T9 every item point and text box, mapped to paper, lies on the 2592 x 1728 page', () => {
    const { view, items } = buildRoomList();
    expect(items.length).toBeGreaterThan(0);
    const page = { x0: 0, y0: 0, x1: PAGE_W, y1: PAGE_H };
    for (const item of items) {
      for (const pt of paperPoints(view, item)) {
        expect(insideRect(pt, page, 0), `${item.kind} ${item.role} ${pt}`).toBe(true);
      }
    }
  });
});
