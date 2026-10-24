// EZD-028 T8 text metrics match the writer (vault/plans/EZD-028.md Tests table; Approach Step 2;
// 02 PDF out "text with metrics from bundled font files"; 09 text minimum 3/32" on 24x36).
import { describe, test, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { buildRoomList } from '../src/drawing-list.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fontsDir = path.join(repoRoot, 'app', 'src', 'styles', 'fonts');

// Step 2: `sans` = Instrument Sans 400, `mono` = DM Mono 400, read from EZD-010's files.
const FONT_FILES = {
  sans: path.join(fontsDir, 'instrument-sans-latin-400-normal.woff2'),
  mono: path.join(fontsDir, 'dm-mono-latin-400-normal.woff2'),
};

const PAPER_TOL = 0.0234375; // plan Tests: 1/64 in / 48 x 72 pt/in
const MIN_TEXT_PT = 6.75; // 09: 3/32 in x 72 pt/in

describe('EZD-028 text metrics', () => {
  test('T8 every text item width equals PDFKit widthOfString with the same font and size; size >= 6.75 pt', () => {
    const { items } = buildRoomList();
    const texts = items.filter((item) => item.kind === 'text');
    expect(texts.length).toBeGreaterThan(0);
    for (const item of texts) {
      expect(Object.keys(FONT_FILES)).toContain(item.font);
      expect(item.size).toBeGreaterThanOrEqual(MIN_TEXT_PT);
      const doc = new PDFDocument({ size: [2592, 1728], margin: 0 });
      doc.font(FONT_FILES[item.font]).fontSize(item.size);
      const pdfkitWidth = doc.widthOfString(item.text);
      doc.end();
      expect(typeof item.width).toBe('number');
      expect(Math.abs(item.width - pdfkitWidth), `width of "${item.text}"`).toBeLessThanOrEqual(
        PAPER_TOL,
      );
    }
  });
});
