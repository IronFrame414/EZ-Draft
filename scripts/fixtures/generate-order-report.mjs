// EZD-916 (phase-09 EZD-916 "Built against a synthetic fixture report ... committed with the ticket; re-checked when
// Josh supplies a real sample"; S12 Data shown "Order report lines: line no, code, width, face, finish"; board
// S12RenderMarkup sample lines; vault/build/assumptions.md EZD-916 "Fixture and stub"): the stand-in 2020 order
// report. One US Letter page (612 x 792 pt) written with EZD-016b's buildPdf: the title, the supplier and a table of
// 22 lines, one text item per cell (Helvetica 9 pt) and all cells of a line on one baseline, columns LINE, CODE,
// WIDTH, FACE and FINISH. Width is written in inches with the inch mark ("36\""); a line with no face leaves the cell
// empty. Lines include the board's samples (#7 SB36 36" "FD + 2 doors" "Shaker, White"; #9 B18; #10 F3; #14 W1530).
// The expected values are hand-written in fixtures/synthetic/order-report.pdf.expected.json.
// Run with `node scripts/fixtures/generate-order-report.mjs`.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPdf } from './write-pdf.mjs';

export const ORDER_REPORT_FILE = 'order-report.pdf';

const W = 'Shaker, White';
/** [line no, code, width (in), face or null, finish] */
export const LINES = [
  [1, 'B15', 15, '1 door + 1 drawer', W],
  [2, 'B24', 24, '2 doors + 1 drawer', W],
  [3, 'DB18', 18, '3 drawers', W],
  [4, 'B21', 21, '1 door + 1 drawer', W],
  [5, 'B30', 30, '2 doors + 1 drawer', W],
  [6, 'B12', 12, '1 door + 1 drawer', W],
  [7, 'SB36', 36, 'FD + 2 doors', W],
  [8, 'B27', 27, '2 doors + 1 drawer', W],
  [9, 'B18', 18, '1 door + 1 drawer', W],
  [10, 'F3', 3, null, W],
  [11, 'W3030', 30, '2 doors', W],
  [12, 'W1830', 18, '1 door', W],
  [13, 'W2430', 24, '2 doors', W],
  [14, 'W1530', 15, '1 door', W],
  [15, 'W3630', 36, '2 doors', W],
  [16, 'W3012', 30, '2 doors', W],
  [17, 'W2130', 21, '1 door', W],
  [18, 'W2730', 27, '2 doors', W],
  [19, 'F3', 3, null, W],
  [20, 'BEP24', 24, null, W],
  [21, 'TK96', 96, null, W],
  [22, 'CM96', 96, null, W],
];

const FONT = 9;
const COLUMNS = [54, 100, 170, 230, 380];
const TOP = 700;
const ROW = 20;

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const text = (s, x, y, size = FONT) => `BT /F1 ${size} Tf ${x} ${y} Td (${esc(s)}) Tj ET`;

export function orderReportPdf() {
  const out = [
    text('ORDER REPORT', 54, 750, 14),
    text('Supplier: Cabinet Co', 54, 732),
    ...['LINE', 'CODE', 'WIDTH', 'FACE', 'FINISH'].map((h, i) => text(h, COLUMNS[i], TOP)),
  ];
  LINES.forEach(([no, code, width, face, finish], i) => {
    const y = TOP - ROW * (i + 1);
    const cells = [String(no), code, `${width}"`, face, finish];
    cells.forEach((c, j) => {
      if (c !== null) out.push(text(c, COLUMNS[j], y));
    });
  });
  const stream = { dict: '<< >>', stream: Buffer.from(out.join('\n') + '\n', 'latin1') };
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    stream,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]);
}

const here = path.dirname(fileURLToPath(import.meta.url));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(here, '..', '..', 'fixtures', 'synthetic', ORDER_REPORT_FILE);
  writeFileSync(out, orderReportPdf());
  process.stdout.write(`${out}\n`);
}
