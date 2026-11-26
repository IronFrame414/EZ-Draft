// EZD-715 AC-EZD-715-1 (08 Exports "Permit set"; S13 Validation): the 24x36 page is 2592 x 1728 pt (36 in x 72 by
// 24 in x 72) and the check dimension line measures its printed label x the viewport scale in PDF units; plus the
// rest of the 08 Permit set row: one bookmark per sheet, not password-locked, embedded fonts (no default Helvetica).
// The PDF is read back with pdf.js (the EZD-028 spike's method): the stroked segments inside the /EZ_check_dimension
// marked-content sequence, with the full transform applied, and the text of /EZ_check_dimension_label.
import { describe, expect, it } from 'vitest';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { DrawingList } from '@ezdraft/geometry';
import { sheetDrawingArea } from '../../../lib/sheets/sheet-set';
import { viewportAreas } from '../../../lib/sheets/viewport';
import { writePdf, type PdfInput } from './write-pdf';

// A 12'-0" wall on its own, drawn at 1/4" = 1'-0": 0.25 paper inch per 12 model inches.
const QUARTER = 0.25 / 12;
const wall: DrawingList = {
  level: '00000000-0000-4000-8000-00000000f100',
  omitted: [],
  items: [
    { kind: 'line', layer: 'new', objectId: 'w1', role: 'cut', from: { x: 0, y: 0 }, to: { x: 144, y: 0 } },
    { kind: 'line', layer: 'new', objectId: 'w1', role: 'cut', from: { x: 0, y: 6 }, to: { x: 144, y: 6 } },
  ],
};

function input(size: PdfInput['size'], scale: number | null = QUARTER): PdfInput {
  const [area] = viewportAreas(sheetDrawingArea(size), 1);
  return {
    size,
    title: '336 Golfview Rd buildingplans Rev 0',
    bookmarks: true,
    sheets: [
      { number: 'A1.0', title: 'Existing', scaleLabel: '1/4" = 1\'-0"', stampAreas: true, viewports: [{ list: wall, scale, area: area! }] },
      { number: 'A2.0', title: 'Demo', scaleLabel: '1/4" = 1\'-0"', stampAreas: true, viewports: [{ list: wall, scale, area: area! }] },
    ],
  };
}

const load = (bytes: Uint8Array) =>
  getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false })
    .promise;

type M = number[];
const mult = (a: M, b: M): M => [
  a[0]! * b[0]! + a[2]! * b[1]!,
  a[1]! * b[0]! + a[3]! * b[1]!,
  a[0]! * b[2]! + a[2]! * b[3]!,
  a[1]! * b[2]! + a[3]! * b[3]!,
  a[0]! * b[4]! + a[2]! * b[5]! + a[4]!,
  a[1]! * b[4]! + a[3]! * b[5]! + a[5]!,
];
const apply = (m: M, x: number, y: number): [number, number] => [m[0]! * x + m[2]! * y + m[4]!, m[1]! * x + m[3]! * y + m[5]!];
const tagOf = (arg: unknown): string | null =>
  typeof arg === 'string' ? arg : ((arg as { name?: string } | null)?.name ?? null);
const STROKING = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.closeFillStroke]);

// Stroked straight segments in PDF user space with the marked-content tags around them (pdf.js path codes:
// 0 moveTo, 1 lineTo, 2 curveTo, 3 quadraticCurveTo, 4 closePath).
function strokedSegments(opList: { fnArray: number[]; argsArray: unknown[][] }) {
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const tags: (string | null)[] = [];
  const out: { a: [number, number]; b: [number, number]; tags: (string | null)[] }[] = [];
  opList.fnArray.forEach((fn, i) => {
    const args = opList.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mult(ctm, args as M);
    else if (fn === OPS.beginMarkedContent || fn === OPS.beginMarkedContentProps) tags.push(tagOf(args[0]));
    else if (fn === OPS.endMarkedContent) tags.pop();
    else if (fn === OPS.constructPath) {
      const [op, [buffer]] = args as [number, [ArrayLike<number> | undefined]];
      if (!STROKING.has(op) || !buffer) return;
      let cur: [number, number] | null = null;
      for (let k = 0; k < buffer.length; ) {
        const code = buffer[k++];
        if (code === 0) {
          cur = apply(ctm, buffer[k]!, buffer[k + 1]!);
          k += 2;
        } else if (code === 1) {
          const p = apply(ctm, buffer[k]!, buffer[k + 1]!);
          if (cur) out.push({ a: cur, b: p, tags: [...tags] });
          cur = p;
          k += 2;
        } else if (code === 2) k += 6;
        else if (code === 3) k += 4;
      }
    }
  });
  return out;
}

function textByTag(items: { type?: string; tag?: string; str?: string }[]): Map<string, string> {
  const stack: string[] = [];
  const out = new Map<string, string>();
  for (const item of items) {
    if (item.type === 'beginMarkedContent' || item.type === 'beginMarkedContentProps') stack.push(item.tag ?? '');
    else if (item.type === 'endMarkedContent') stack.pop();
    else if (typeof item.str === 'string') for (const t of stack) out.set(t, (out.get(t) ?? '') + item.str);
  }
  return out;
}

// `4'-0"` -> 48 (inches).
function feetInches(s: string): number {
  const m = /^(\d+)'-(\d+)"$/.exec(s.trim());
  return m ? Number(m[1]) * 12 + Number(m[2]) : NaN;
}

describe('EZD-715 PDF writer', () => {
  it('AC-EZD-715-1 the 24x36 page is 2592 x 1728 pt and the check dimension measures its label x scale', async () => {
    const pdf = await load(await writePdf(input('24x36')));
    expect(pdf.numPages).toBe(2);
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      // 08 Exports: 24x36 ARCH D, landscape; 36 in x 72 pt/in by 24 in x 72 pt/in.
      expect(page.view).toEqual([0, 0, 2592, 1728]);

      const content = await page.getTextContent({ includeMarkedContent: true });
      const label = textByTag(content.items as never).get('EZ_check_dimension_label') ?? '';
      const labeledIn = feetInches(label);
      expect(labeledIn).toBeGreaterThan(0);

      const segs = strokedSegments((await page.getOperatorList()) as never).filter((s) =>
        s.tags.includes('EZ_check_dimension'),
      );
      expect(segs).toHaveLength(1);
      const [s] = segs;
      const length = Math.hypot(s!.b[0] - s!.a[0], s!.b[1] - s!.a[1]);
      // The label's length on paper: model inches x paper inches per model inch x 72 pt per paper inch.
      expect(length).toBeCloseTo(labeledIn * QUARTER * 72, 3);
    }
  });

  it('an 11x17 page is 1224 x 792 pt', async () => {
    const pdf = await load(await writePdf(input('11x17')));
    expect((await pdf.getPage(1)).view).toEqual([0, 0, 1224, 792]);
  });

  it('one bookmark per sheet, not password-locked, fonts embedded and no default Helvetica', async () => {
    const bytes = await writePdf(input('24x36'));
    const pdf = await load(bytes);
    const outline = await pdf.getOutline();
    expect(outline.map((o) => o.title)).toEqual(['A1.0 Existing', 'A2.0 Demo']);
    expect(await pdf.getPermissions()).toBeNull();
    const raw = Buffer.from(bytes).toString('latin1');
    expect(raw).not.toMatch(/\/Encrypt\b/);
    expect(raw).toMatch(/\/FontFile[23]?\b/);
    expect(raw).not.toMatch(/Helvetica/);
  });

  it('a not-to-scale viewport is stamped NTS and has no check dimension', async () => {
    const pdf = await load(await writePdf(input('24x36', null)));
    const page = await pdf.getPage(1);
    const content = await page.getTextContent({ includeMarkedContent: true });
    expect(textByTag(content.items as never).get('EZ_nts')).toBe('NTS');
    const segs = strokedSegments((await page.getOperatorList()) as never);
    expect(segs.some((s) => s.tags.includes('EZ_check_dimension'))).toBe(false);
  });
});
