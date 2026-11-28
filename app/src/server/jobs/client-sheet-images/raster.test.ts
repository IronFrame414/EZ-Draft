// EZD-2032 AC-EZD-2032-1 (vault/build/assumptions/EZD-1205.md Settled "Image size": 2400 px on the long side plus a
// 400 px strip thumbnail; "one WebP per sheet"; "Text is drawn as glyph outlines ..., so no system font is needed"):
// a sheet page drawn through the PDF writer's drawing calls into SVG, then encoded. Sheets are landscape, so the long
// side is the width and the height follows the paper: 24x36 is 2400 x 1600 (24/36 of 2400) and 400 x 267; 11x17 is
// 2400 x 1553 (11/17 of 2400 = 1552.9).
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { DrawingList } from '@ezdraft/geometry';
import { sheetDrawingArea } from '../../../lib/sheets/sheet-set';
import { viewportAreas } from '../../../lib/sheets/viewport';
import type { PdfSheet } from '../pdf-export/write-pdf';
import { sheetImages, SHEET_IMAGE_LONG_PX, SHEET_THUMB_LONG_PX } from './raster';
import { sheetPageSvg } from './svg-doc';

const QUARTER = 0.25 / 12;
const wall: DrawingList = {
  level: '00000000-0000-4000-8000-00000000f100',
  omitted: [],
  items: [
    { kind: 'line', layer: 'new', objectId: 'w1', role: 'cut', from: { x: 0, y: 0 }, to: { x: 144, y: 0 } },
    { kind: 'line', layer: 'new', objectId: 'w1', role: 'cut', from: { x: 0, y: 6 }, to: { x: 144, y: 6 } },
    {
      kind: 'text',
      layer: 'new',
      objectId: 'r1',
      text: 'KITCHEN',
      at: { x: 72, y: 40 },
      sizePt: 9,
      font: 'instrument-sans-600',
      letterSpacingPt: 0.5,
      rotationDeg: 0,
    },
  ],
} as DrawingList;

function sheet(size: '24x36' | '11x17'): PdfSheet {
  const [area] = viewportAreas(sheetDrawingArea(size), 1);
  return {
    number: 'A1.0',
    title: 'Existing',
    scaleLabel: '1/4" = 1\'-0"',
    stampAreas: false,
    viewports: [{ list: wall, scale: QUARTER, area: area! }],
  };
}

describe('EZD-2032 client sheet images', () => {
  it('AC-EZD-2032-1 the sizes are 2400 px and 400 px on the long side', () => {
    expect(SHEET_IMAGE_LONG_PX).toBe(2400);
    expect(SHEET_THUMB_LONG_PX).toBe(400);
  });

  it('AC-EZD-2032-1 a 24x36 sheet is a 2400 x 1600 WebP with a 400 x 267 thumbnail', async () => {
    const { full, thumb } = await sheetImages('24x36', sheet('24x36'));
    expect([full.width, full.height]).toEqual([2400, 1600]);
    expect([thumb.width, thumb.height]).toEqual([400, 267]);
    const meta = await sharp(full.bytes).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([2400, 1600]);
    expect((await sharp(thumb.bytes).metadata()).format).toBe('webp');
  });

  it('AC-EZD-2032-1 an 11x17 sheet is 2400 x 1553', async () => {
    const { full } = await sheetImages('11x17', sheet('11x17'));
    expect([full.width, full.height]).toEqual([2400, 1553]);
  });

  it('draws the page in ink on white paper, the text as outlines (no font needed)', async () => {
    const svg = sheetPageSvg('24x36', sheet('24x36'), 2400);
    expect(svg).not.toContain('<text');
    // The page in points (36 x 72 by 24 x 72), 2400 px wide.
    expect(svg).toContain('viewBox="0 0 2592 1728"');
    const { full } = await sheetImages('24x36', sheet('24x36'));
    const stats = await sharp(full.bytes).stats();
    // White paper, with black ink somewhere on it (frame, title block, wall, glyphs).
    expect(stats.channels[0]!.max).toBe(255);
    expect(stats.channels[0]!.min).toBeLessThan(40);
  });
});
