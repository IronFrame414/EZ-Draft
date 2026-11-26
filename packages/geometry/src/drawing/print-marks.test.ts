// EZD-705 (S13 Validation "Every sheet gets a scale bar and a printed check dimension"; 09h "Text prints at fixed
// paper sizes at any scale: minimum 3/32\" on 24×36; labels and dims one size up from notes"; settled
// vault/build/assumptions/EZD-705.md: a 0 to 8 ft scale bar and a 4'-0" check dimension at the viewport scale).
import { describe, expect, it } from 'vitest';
import {
  PRINT_MARK_BAND_IN,
  checkDimensionLabel,
  printMarks,
  printMarksSvg,
  splitPrintMarkBand,
} from '../index';

const AREA = { x: 1, y: 1, width: 24, height: 20 };

describe('EZD-705 print marks', () => {
  it('labels lengths in feet and inches with a dash', () => {
    expect(checkDimensionLabel(48)).toBe(`4'-0"`);
    expect(checkDimensionLabel(6)).toBe(`0'-6"`);
    expect(checkDimensionLabel(24)).toBe(`2'-0"`);
  });

  it('a 4\'-0" check dimension is 1" at 1/4" = 1\'-0" and 2" at 1/2" = 1\'-0"; the scale bar is 8 ft', () => {
    for (const [scale, check, bar] of [
      [0.25 / 12, 1, 2],
      [0.5 / 12, 2, 4],
    ] as const) {
      const m = printMarks(scale, AREA);
      if (m.kind !== 'scaled') throw new Error('expected scaled marks');
      expect(m.check.label).toBe(`4'-0"`);
      expect(m.check.to.x - m.check.from.x).toBeCloseTo(check, 9);
      expect(m.check.to.y).toBe(m.check.from.y);
      const segs = m.scaleBar.segments;
      expect(segs[segs.length - 1]!.x + segs[segs.length - 1]!.width - segs[0]!.x).toBeCloseTo(bar, 9);
      expect(m.scaleBar.labels.map((l) => l.text)).toEqual(['0', `4'`, `8'`]);
    }
  });

  it('a scale too large for the viewport steps down to a shorter pair that fits', () => {
    // At 3" = 1'-0" an 8 ft bar is 24" of paper, wider than a 12" viewport; a 2 ft bar (6") and a 1'-0" check (3")
    // with 1/4" each side and 3/4" between them take 10.25".
    const narrow = { x: 0, y: 0, width: 12, height: 10 };
    const m = printMarks(3 / 12, narrow);
    if (m.kind !== 'scaled') throw new Error('expected scaled marks');
    expect(m.check.label).toBe(`1'-0"`);
    expect(m.check.to.x - m.check.from.x).toBeCloseTo(3, 9);
    expect(m.scaleBar.labels.map((l) => l.text)).toEqual(['0', `1'`, `2'`]);
    const right = Math.max(m.check.to.x, ...m.scaleBar.segments.map((s) => s.x + s.width));
    expect(right).toBeLessThanOrEqual(narrow.x + narrow.width);
  });

  it('the marks take a strip at the bottom of the area; the drawing keeps the rest', () => {
    const { drawing, band } = splitPrintMarkBand(AREA);
    expect(band.height).toBe(PRINT_MARK_BAND_IN);
    expect(band.y + band.height).toBe(AREA.y + AREA.height);
    expect(drawing.y + drawing.height).toBe(band.y);
    const m = printMarks(0.25 / 12, AREA);
    if (m.kind !== 'scaled') throw new Error('expected scaled marks');
    for (const p of [m.check.from, m.check.labelAt, m.check.captionAt, ...m.scaleBar.labels.map((l) => l.at)]) {
      expect(p.y).toBeGreaterThan(band.y);
      expect(p.y).toBeLessThan(band.y + band.height);
    }
  });

  it('notes print at 3/32" and the check dimension label one size up at 1/8", at any scale', () => {
    for (const scale of [0.25 / 12, 0.5 / 12]) {
      const svg = printMarksSvg(printMarks(scale, AREA));
      const size = (mark: string) =>
        Number(new RegExp(`font-size="([^"]*)"[^>]*data-print-mark="${mark}"`).exec(svg)![1]);
      expect(size('scale-bar-label')).toBeCloseTo(3 / 32, 6);
      expect(size('check-dimension-caption')).toBeCloseTo(3 / 32, 6);
      expect(size('check-dimension-label')).toBeCloseTo(1 / 8, 6);
      expect(svg).not.toContain('data-object-id');
    }
  });

  it('a not-to-scale viewport is stamped NTS', () => {
    const m = printMarks(null, AREA);
    expect(m.kind).toBe('nts');
    expect(printMarksSvg(m)).toContain('>NTS</text>');
  });
});
