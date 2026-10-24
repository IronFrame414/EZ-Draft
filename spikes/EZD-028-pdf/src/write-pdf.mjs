// EZD-028 PDF writer: drawing list -> one 24x36 page with PDFKit (vault/plans/EZD-028.md Step 3;
// 02 Named tools PDF writer; R26 R7).
import PDFDocument from 'pdfkit';
import { FONT_FILES } from './metrics.mjs';

/**
 * @typedef {import('./drawing-list.mjs').View} View
 * @typedef {import('./drawing-list.mjs').Item} Item
 */

const TITLE = 'EZD-028 room';

/**
 * Writes the list to a one-page PDF.
 * @param {{ view: View, items: Item[] }} list
 * @returns {Promise<Uint8Array>}
 */
export function writePdf(list) {
  const { view, items } = list;
  const [pageW, pageH] = view.paperSize;
  const k = view.scale * 72;

  // Step 2 Model to paper, then Step 3's flip to PDFKit's top-left user space.
  const toPdfkit = ([x, y]) => [
    view.paperOrigin[0] + x * k,
    pageH - (view.paperOrigin[1] + y * k),
  ];

  // `font: null` keeps PDFKit from loading its default Helvetica (Risks: Default font).
  const doc = new PDFDocument({
    size: [pageW, pageH],
    margin: 0,
    font: null,
    info: { Title: TITLE },
  });
  for (const [name, file] of Object.entries(FONT_FILES)) doc.registerFont(name, file);

  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);
  });

  for (const entry of items) {
    doc.addContent(`/EZ_${entry.role.replace(/-/g, '_')} BMC`);
    drawItem(doc, entry, toPdfkit);
    doc.addContent('EMC');
  }

  doc.outline.addItem(TITLE);
  doc.end();
  return done;
}

function drawItem(doc, entry, toPdfkit) {
  switch (entry.kind) {
    case 'line': {
      doc.lineWidth(entry.weight);
      doc.moveTo(...toPdfkit(entry.from)).lineTo(...toPdfkit(entry.to));
      doc.stroke();
      return;
    }
    case 'polyline': {
      const [first, ...rest] = entry.points;
      doc.lineWidth(entry.weight);
      doc.moveTo(...toPdfkit(first));
      for (const p of rest) doc.lineTo(...toPdfkit(p));
      if (entry.closed) doc.closePath();
      doc.stroke();
      return;
    }
    case 'arc': {
      doc.lineWidth(entry.weight);
      drawArc(doc, entry, toPdfkit);
      doc.stroke();
      return;
    }
    case 'hatch': {
      doc.lineWidth(entry.weight);
      for (const s of entry.segments) doc.moveTo(...toPdfkit(s.from)).lineTo(...toPdfkit(s.to));
      doc.stroke();
      return;
    }
    case 'text': {
      // Step 2 Text box: the anchor is the baseline point; align says where it sits on it.
      const [ax, ay] = toPdfkit(entry.anchor);
      const offset = { left: 0, center: entry.width / 2, right: entry.width }[entry.align];
      if (offset === undefined) throw new Error(`unknown align ${entry.align}`);
      doc.font(entry.font).fontSize(entry.size);
      doc.text(entry.text, ax - offset, ay, { lineBreak: false, baseline: 'alphabetic' });
      return;
    }
    default:
      throw new Error(`unknown kind ${entry.kind}`);
  }
}

/**
 * Counter-clockwise arc from startAngle to endAngle as cubic Beziers of at most 90 degrees each,
 * computed in model space (y up) and mapped point by point.
 */
function drawArc(doc, arc, toPdfkit) {
  const rad = (deg) => (deg * Math.PI) / 180;
  let sweep = arc.endAngle - arc.startAngle;
  while (sweep <= 0) sweep += 360;
  const parts = Math.max(1, Math.ceil(sweep / 90 - 1e-9));
  const step = sweep / parts;
  const at = (deg) => [
    arc.center[0] + arc.radius * Math.cos(rad(deg)),
    arc.center[1] + arc.radius * Math.sin(rad(deg)),
  ];
  doc.moveTo(...toPdfkit(at(arc.startAngle)));
  for (let i = 0; i < parts; i++) {
    const a0 = arc.startAngle + i * step;
    const a1 = a0 + step;
    const h = (4 / 3) * Math.tan(rad(step) / 4) * arc.radius;
    const p0 = at(a0);
    const p3 = at(a1);
    const c1 = [p0[0] - h * Math.sin(rad(a0)), p0[1] + h * Math.cos(rad(a0))];
    const c2 = [p3[0] + h * Math.sin(rad(a1)), p3[1] - h * Math.cos(rad(a1))];
    doc.bezierCurveTo(...toPdfkit(c1), ...toPdfkit(c2), ...toPdfkit(p3));
  }
}
