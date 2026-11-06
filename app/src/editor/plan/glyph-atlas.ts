// EZD-207b Build step 2 (vault/plans/EZD-207b.md section 1 Decided "Atlas characters", "Atlas cells", "Text size",
// "Text layout", "Quad vertices"; C3, C5; 11 rule 4; S03 Text): one glyph atlas for both drawing fonts, and the
// drawing list's text laid out as model-space quads on it, so text scales with the zoom and needs no rebuild.
import { DRAWING_FONTS, type DrawingList } from '@ezdraft/geometry';
import { Color, SRGBColorSpace } from 'three';
import { tokenRgb } from './color';

export const ATLAS_SIZE_PX = 1024;
export const ATLAS_CELL_PX = 64;
export const ATLAS_COLUMNS = 16;
export const ATLAS_FONT_PX = 40;
export const ATLAS_PAD_PX = 12;
export const ATLAS_BASELINE_PX = 46;
export const PT_TO_MODEL_IN = 0.5;
export const TEXT_MIDLINE_EM = 0.35;
export const ATLAS_FONTS = ['dm-mono-400', 'instrument-sans-600'] as const;

function atlasChars(): string {
  let s = '';
  for (let cp = 0x20; cp <= 0x7e; cp++) s += String.fromCodePoint(cp);
  return s + '·';
}
export const ATLAS_CHARS: string = atlasChars();

export type AtlasFont = (typeof ATLAS_FONTS)[number];
export type UvRect = { u0: number; v0: number; u1: number; v1: number };
export type PlanTextBatch = {
  glyphs: number;
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
};

const CHAR_INDEX = new Map<string, number>([...ATLAS_CHARS].map((ch, i) => [ch, i]));
const CELL_UV = ATLAS_CELL_PX / ATLAS_SIZE_PX;

export function atlasCell(font: AtlasFont, ch: string): UvRect | null {
  const charIndex = CHAR_INDEX.get(ch);
  const fontIndex = ATLAS_FONTS.indexOf(font);
  if (charIndex === undefined || fontIndex < 0) return null;
  const i = fontIndex * ATLAS_CHARS.length + charIndex;
  const col = i % ATLAS_COLUMNS;
  const row = Math.floor(i / ATLAS_COLUMNS);
  const u0 = (col * ATLAS_CELL_PX) / ATLAS_SIZE_PX;
  const v0 = (row * ATLAS_CELL_PX) / ATLAS_SIZE_PX;
  return { u0, v0, u1: u0 + CELL_UV, v1: v0 + CELL_UV };
}

const FONT_TOKEN: Record<AtlasFont, `--ez-${string}`> = {
  'dm-mono-400': '--ez-ink',
  'instrument-sans-600': '--ez-slate-300',
};

function linearColor(font: AtlasFont): [number, number, number] {
  const c = tokenRgb(FONT_TOKEN[font]);
  const k = new Color().setRGB(c.r, c.g, c.b, SRGBColorSpace);
  return [k.r, k.g, k.b];
}

// Quad corners in em, relative to the pen on the text midline (the atlas cell around one glyph).
const X0_EM = -ATLAS_PAD_PX / ATLAS_FONT_PX;
const X1_EM = (ATLAS_CELL_PX - ATLAS_PAD_PX) / ATLAS_FONT_PX;
const Y0_EM = -TEXT_MIDLINE_EM - (ATLAS_CELL_PX - ATLAS_BASELINE_PX) / ATLAS_FONT_PX;
const Y1_EM = -TEXT_MIDLINE_EM + ATLAS_BASELINE_PX / ATLAS_FONT_PX;

export function layoutText(list: DrawingList | null): PlanTextBatch {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  let glyphs = 0;
  if (list !== null) {
    const palette = new Map<AtlasFont, [number, number, number]>();
    for (const item of list.items) {
      if (item.kind !== 'text') continue;
      const font: AtlasFont = item.font;
      const m = DRAWING_FONTS[font];
      const em = item.sizePt * PT_TO_MODEL_IN;
      const scale = item.sizePt / m.unitsPerEm;
      const ls = item.font === 'instrument-sans-600' ? item.letterSpacingPt : 0;
      const a = (item.rotationDeg * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      let color = palette.get(font);
      if (color === undefined) {
        color = linearColor(font);
        palette.set(font, color);
      }
      const place = (x: number, y: number) => {
        positions.push(item.at.x + x * cos - y * sin, item.at.y + x * sin + y * cos, 0);
        colors.push(color[0], color[1], color[2]);
      };
      let pen = -item.widthPt / 2;
      for (const ch of item.text) {
        const cp = ch.codePointAt(0)!;
        const adv = (m.advances[cp] ?? m.notdefAdvance) * scale;
        const cell = ch === ' ' ? null : atlasCell(font, ch);
        if (cell !== null) {
          const x0 = pen * PT_TO_MODEL_IN + X0_EM * em;
          const x1 = pen * PT_TO_MODEL_IN + X1_EM * em;
          const y0 = Y0_EM * em;
          const y1 = Y1_EM * em;
          // BL, BR, TR, BL, TR, TL
          place(x0, y0);
          place(x1, y0);
          place(x1, y1);
          place(x0, y0);
          place(x1, y1);
          place(x0, y1);
          uvs.push(
            cell.u0,
            cell.v1,
            cell.u1,
            cell.v1,
            cell.u1,
            cell.v0,
            cell.u0,
            cell.v1,
            cell.u1,
            cell.v0,
            cell.u0,
            cell.v0,
          );
          glyphs += 1;
        }
        pen += adv + ls;
      }
    }
  }
  return {
    glyphs,
    positions: Float32Array.from(positions),
    uvs: Float32Array.from(uvs),
    colors: Float32Array.from(colors),
  };
}
