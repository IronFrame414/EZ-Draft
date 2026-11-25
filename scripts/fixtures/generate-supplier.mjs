// EZD-915 (phase-09 EZD-915 "Commits a generated supplier PDF (plan + one elevation, labels W3030 and B24) with
// expected JSON, used until Josh supplies a real one"; 08 Imports "Supplier kitchen drawings | Vector PDF | Walls,
// runs, dimensions; cabinet labels (W3030, B24…) set size and type; plan and elevations cross-checked"): the
// stand-in supplier kitchen PDF. Two 11x17 pages written with EZD-016b's buildPdf, both at 1/4" = 1'-0" (1.5 pt per
// model inch, as the synthetic room):
// - page 1, the plan: one wall 60" long and 4.5" thick drawn as its two faces at the heavy wall weight (1.5 pt), a
//   B24 base box (24" wide, 24" deep) and a W3030 wall box (30" wide, 12" deep) beside it along the wall's room face,
//   each an outline at 0.5 pt with its code in the middle, and the title PLAN;
// - page 2, elevation A: the same two boxes seen from the room, B24 from the floor to 34 1/2", W3030 from 54" to
//   84", each with its code in the middle, and the title ELEVATION A.
// Sizes are the seed line's (EZD-401: base boxes 24" deep by 34 1/2" high, wall boxes 12" deep) and the code's own
// (W3030 is 30 wide by 30 high). Labels are Helvetica 8 pt; each is placed so its box (string width from the
// Helvetica widths, 8 pt high) is centred on its cabinet. The expected values are hand-written in
// fixtures/synthetic/supplier-kitchen.pdf.expected.json. Run with `node scripts/fixtures/generate-supplier.mjs`.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPdf, PAPER } from './write-pdf.mjs';

export const SUPPLIER_FILE = 'supplier-kitchen.pdf';

const PT = PAPER.ptPerInch;
const FONT_SIZE = 8;
// Helvetica advance widths per 1000 em (Adobe Helvetica AFM) for the characters the labels use.
const HELVETICA = { B: 667, W: 944, P: 667, L: 556, A: 667, N: 722, E: 667, V: 667, T: 611, I: 278, O: 778, ' ': 278, 0: 556, 2: 556, 3: 556, 4: 556 };

/** The page points of the plan's model origin (the wall's room face, west end) and the elevation's (floor, west). */
export const PLAN_ORIGIN = [300, 450];
export const ELEVATION_ORIGIN = [300, 200];

/** Model inches: x along the wall (east), y north on the plan and up on the elevation. */
export const BOXES = [
  { code: 'B24', plan: { x0: 0, x1: 24, y0: -24, y1: 0 }, elevation: { x0: 0, x1: 24, y0: 0, y1: 34.5 } },
  { code: 'W3030', plan: { x0: 24, x1: 54, y0: -12, y1: 0 }, elevation: { x0: 24, x1: 54, y0: 54, y1: 84 } },
];
export const WALL = { x0: 0, x1: 60, thickness: 4.5 };

const num = (n) => String(Number(n.toFixed(4)));
const textWidth = (s) => ([...s].reduce((w, c) => w + HELVETICA[c], 0) * FONT_SIZE) / 1000;

function pageContent(origin, boxes, title) {
  const at = (x, y) => [origin[0] + PT * x, origin[1] + PT * y];
  const out = [];
  const text = (s, [cx, cy]) =>
    out.push(`BT /F1 ${FONT_SIZE} Tf ${num(cx - textWidth(s) / 2)} ${num(cy - FONT_SIZE / 2)} Td (${s}) Tj ET`);
  return {
    out,
    at,
    text,
    boxes() {
      out.push(`${num(PAPER.otherLineWidth)} w`);
      for (const b of boxes) {
        const [ax, ay] = at(b.x0, b.y0);
        const [bx, by] = at(b.x1, b.y1);
        out.push(`${num(ax)} ${num(ay)} m ${num(bx)} ${num(ay)} l ${num(bx)} ${num(by)} l ${num(ax)} ${num(by)} l h S`);
        text(b.code, at((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2));
      }
      text(title, at(0, Math.min(...boxes.map((b) => b.y0)) - 12));
    },
  };
}

export function supplierPdf() {
  const plan = pageContent(PLAN_ORIGIN, BOXES.map((b) => ({ code: b.code, ...b.plan })), 'PLAN');
  plan.out.push(`${num(PAPER.wallLineWidth)} w`);
  for (const y of [0, WALL.thickness]) {
    const [ax, ay] = plan.at(WALL.x0, y);
    const [bx, by] = plan.at(WALL.x1, y);
    plan.out.push(`${num(ax)} ${num(ay)} m ${num(bx)} ${num(by)} l S`);
  }
  plan.boxes();
  const elev = pageContent(ELEVATION_ORIGIN, BOXES.map((b) => ({ code: b.code, ...b.elevation })), 'ELEVATION A');
  elev.boxes();
  const stream = (lines) => ({ dict: '<< >>', stream: Buffer.from(lines.join('\n') + '\n', 'latin1') });
  const page = (contents) =>
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAPER.width} ${PAPER.height}] /Resources << /Font << /F1 7 0 R >> >> /Contents ${contents} 0 R >>`;
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    page(5),
    page(6),
    stream(plan.out),
    stream(elev.out),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]);
}

const here = path.dirname(fileURLToPath(import.meta.url));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(here, '..', '..', 'fixtures', 'synthetic', SUPPLIER_FILE);
  writeFileSync(out, supplierPdf());
  process.stdout.write(`${out}\n`);
}
