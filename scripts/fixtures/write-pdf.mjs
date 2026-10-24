// EZD-016b Steps 4.2, 4.3, 4.4 (vault/plans/EZD-016b.md): a minimal PDF 1.4 object writer shared by
// both PDFs, the vector page and the scanned page. Header %PDF-1.4 and a binary comment line;
// Catalog, Pages, one Page with MediaBox [0 0 1224 792]; classic xref with exact byte offsets;
// trailer with /Size and /Root; no /Info, no /ID, no encryption.
import zlib from 'node:zlib';

/** 11x17 landscape page and the 1/4" = 1'-0" mapping (Fixture values table). */
export const PAPER = Object.freeze({
  width: 1224,
  height: 792,
  originX: 504,
  originY: 300,
  ptPerInch: 1.5,
  wallLineWidth: 1.5,
  otherLineWidth: 0.5,
});

/** 4/3 * tan(90deg / 4), one cubic per quarter circle (Fixture values table). */
export const BEZIER_K = 0.5522847;

/** @param {number} x @param {number} y @returns {[number, number]} paper point (PDF user space, y up) */
export function toPaper(x, y) {
  return [PAPER.originX + PAPER.ptPerInch * x, PAPER.originY + PAPER.ptPerInch * y];
}

/** Shortest decimal form, at most 4 decimals, never exponent form. @param {number} n */
const num = (n) => {
  const v = Number(n.toFixed(4));
  return String(Object.is(v, -0) ? 0 : v);
};

/**
 * Serialises objects 1..n (object i is objects[i - 1]); object 1 is the Catalog.
 * Each object is a dictionary string, or { dict, stream } for a stream object (/Length is added).
 * @param {(string | { dict: string, stream: Buffer })[]} objects
 * @returns {Buffer}
 */
export function buildPdf(objects) {
  /** @type {Buffer[]} */
  const parts = [];
  let length = 0;
  /** @param {Buffer | string} b */
  const push = (b) => {
    const buf = typeof b === 'string' ? Buffer.from(b, 'latin1') : b;
    parts.push(buf);
    length += buf.length;
  };
  push('%PDF-1.4\n');
  push(Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  /** @type {number[]} */
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(length);
    push(`${i + 1} 0 obj\n`);
    if (typeof obj === 'string') {
      push(`${obj}\nendobj\n`);
    } else {
      push(`${obj.dict.replace(/>>$/, `/Length ${obj.stream.length} >>`)}\nstream\n`);
      push(obj.stream);
      push('\nendstream\nendobj\n');
    }
  });
  const xref = length;
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) table += `${String(off).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}

/** @param {string} resources @param {number} contentsRef */
const page = (resources, contentsRef) =>
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAPER.width} ${PAPER.height}] /Resources ${resources} /Contents ${contentsRef} 0 R >>`;

/**
 * Vector page (Step 4.3): uncompressed content, `m l S` per straight line, one cubic `c` per arc,
 * walls 1.5 pt, everything else 0.5 pt; no text and no image.
 * @param {import('./plan-drawing.mjs').Drawing} drawing
 * @returns {Buffer}
 */
export function writeVectorPdf(drawing) {
  const lines = [];
  /** @param {number} w @param {import('./plan-drawing.mjs').Primitive[]} prims */
  const stroke = (w, prims) => {
    if (prims.length === 0) return;
    lines.push(`${num(w)} w`);
    for (const p of prims) {
      if (p.type === 'line') {
        const [ax, ay] = toPaper(...p.a);
        const [bx, by] = toPaper(...p.b);
        lines.push(`${num(ax)} ${num(ay)} m ${num(bx)} ${num(by)} l S`);
      } else if (p.type === 'arc') {
        const s = (p.startDeg * Math.PI) / 180;
        const e = (p.endDeg * Math.PI) / 180;
        const r = p.radius * PAPER.ptPerInch;
        const [cx, cy] = toPaper(...p.center);
        const k = r * BEZIER_K;
        const p0 = [cx + r * Math.cos(s), cy + r * Math.sin(s)];
        const p3 = [cx + r * Math.cos(e), cy + r * Math.sin(e)];
        const c1 = [p0[0] - k * Math.sin(s), p0[1] + k * Math.cos(s)];
        const c2 = [p3[0] + k * Math.sin(e), p3[1] - k * Math.cos(e)];
        lines.push(
          `${num(p0[0])} ${num(p0[1])} m ${[c1, c2, p3].map((q) => `${num(q[0])} ${num(q[1])}`).join(' ')} c S`,
        );
      }
    }
  };
  const drawn = drawing.primitives.filter((p) => p.type !== 'polygon');
  stroke(
    PAPER.wallLineWidth,
    drawn.filter((p) => p.layer === 'WALLS'),
  );
  stroke(
    PAPER.otherLineWidth,
    drawn.filter((p) => p.layer !== 'WALLS'),
  );
  const content = Buffer.from(lines.join('\n') + '\n', 'latin1');
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    page('<< >>', 4),
    { dict: '<< >>', stream: content },
  ]);
}

/**
 * Scanned page (Step 4.4): one DeviceGray 8-bit image XObject, FlateDecode, drawn full page by
 * `q 1224 0 0 792 0 0 cm /Im1 Do Q` and no other operators.
 * @param {{ width: number, height: number, data: Uint8Array }} gray
 * @returns {Buffer}
 */
export function writeScannedPdf(gray) {
  const content = Buffer.from(`q ${PAPER.width} 0 0 ${PAPER.height} 0 0 cm /Im1 Do Q\n`, 'latin1');
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    page('<< /XObject << /Im1 5 0 R >> >>', 4),
    { dict: '<< >>', stream: content },
    {
      dict: `<< /Type /XObject /Subtype /Image /Width ${gray.width} /Height ${gray.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode >>`,
      stream: zlib.deflateSync(gray.data),
    },
  ]);
}
