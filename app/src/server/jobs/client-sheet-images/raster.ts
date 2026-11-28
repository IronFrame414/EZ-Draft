// EZD-2032 (AC-EZD-2032-1; vault/build/assumptions/EZD-1205.md Settled "Image size": "2400 px on the long side (an
// 11x17 sheet at about 140 dpi; client copies default to 11x17) plus a 400 px strip thumbnail"; "one WebP per sheet"):
// one sheet page to its two WebP images. Sheets are landscape, so the long side is the width. sharp reads the SVG
// (sheetPageSvg, text already outlines) and encodes; the thumbnail is the full image scaled down.
import sharp from 'sharp';
import type { SheetSize } from '@ezdraft/geometry';
import type { PdfSheet } from '../pdf-export/write-pdf';
import { sheetPageSvg } from './svg-doc';

export const SHEET_IMAGE_LONG_PX = 2400;
export const SHEET_THUMB_LONG_PX = 400;
export const SHEET_IMAGE_TYPE = 'image/webp';

export type EncodedImage = { bytes: Buffer; width: number; height: number };

export async function sheetImages(
  size: SheetSize,
  sheet: PdfSheet,
): Promise<{ full: EncodedImage; thumb: EncodedImage }> {
  const svg = Buffer.from(sheetPageSvg(size, sheet, SHEET_IMAGE_LONG_PX), 'utf8');
  const raster = await sharp(svg).flatten({ background: '#ffffff' }).png().toBuffer();
  const full = await sharp(raster).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(raster)
    .resize({ width: SHEET_THUMB_LONG_PX })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  return {
    full: { bytes: full.data, width: full.info.width, height: full.info.height },
    thumb: { bytes: thumb.data, width: thumb.info.width, height: thumb.info.height },
  };
}
