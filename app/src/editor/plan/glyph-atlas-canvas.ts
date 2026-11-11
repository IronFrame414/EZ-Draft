// EZD-207b Build step 3 (vault/plans/EZD-207b.md section 1 Decided "Atlas drawing", "Font strings", "Browser atlas";
// C5; 11 rules 4, 8; ARCH Design tokens): draws the one glyph atlas, white glyphs on opaque black, with the fonts
// the page already loaded (their families from the CSS variables), never a second copy of a font file.
// EZD-373: only the first family of each variable is loaded and drawn (vault/plans/EZD-373.md)
import {
  ATLAS_BASELINE_PX,
  ATLAS_CELL_PX,
  ATLAS_CHARS,
  ATLAS_COLUMNS,
  ATLAS_FONTS,
  ATLAS_FONT_PX,
  ATLAS_PAD_PX,
  ATLAS_SIZE_PX,
  type AtlasFont,
} from './glyph-atlas';

export type AtlasContext = Pick<
  CanvasRenderingContext2D,
  'fillStyle' | 'font' | 'textAlign' | 'textBaseline' | 'fillRect' | 'fillText'
>;
export type AtlasCanvas = {
  width: number;
  height: number;
  getContext(id: '2d'): AtlasContext | null;
};

const FONT_WEIGHT: Record<AtlasFont, number> = { 'dm-mono-400': 400, 'instrument-sans-600': 600 };
const FONT_VARIABLE: Record<AtlasFont, string> = {
  'dm-mono-400': '--ez-font-mono',
  'instrument-sans-600': '--ez-font-sans',
};

export function atlasFontString(font: AtlasFont, family: string): string {
  return `${FONT_WEIGHT[font]} ${ATLAS_FONT_PX}px ${family}`;
}

export function firstFontFamily(list: string): string {
  const text = list.trimStart();
  const quote = text[0];
  if (quote === '"' || quote === "'") {
    const close = text.indexOf(quote, 1);
    return close === -1 ? '' : text.slice(0, close + 1);
  }
  const comma = text.indexOf(',');
  return (comma === -1 ? text : text.slice(0, comma)).trim();
}

export async function drawGlyphAtlas<C extends AtlasCanvas>(deps: {
  createCanvas(size: number): C;
  families: Record<AtlasFont, string>;
  loadFont(font: string): Promise<unknown>;
}): Promise<C> {
  for (const f of ATLAS_FONTS) await deps.loadFont(atlasFontString(f, deps.families[f]));
  const canvas = deps.createCanvas(ATLAS_SIZE_PX);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  // Mask values, not design colours: white coverage on opaque black.
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, ATLAS_SIZE_PX, ATLAS_SIZE_PX);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const chars = [...ATLAS_CHARS];
  ATLAS_FONTS.forEach((f, fontIndex) => {
    ctx.font = atlasFontString(f, deps.families[f]);
    chars.forEach((ch, charIndex) => {
      const i = fontIndex * chars.length + charIndex;
      const col = i % ATLAS_COLUMNS;
      const row = Math.floor(i / ATLAS_COLUMNS);
      ctx.fillText(ch, col * ATLAS_CELL_PX + ATLAS_PAD_PX, row * ATLAS_CELL_PX + ATLAS_BASELINE_PX);
    });
  });
  return canvas;
}

export function createGlyphAtlas(): Promise<HTMLCanvasElement> {
  const style = getComputedStyle(document.documentElement);
  const families = {} as Record<AtlasFont, string>;
  for (const f of ATLAS_FONTS) {
    const name = FONT_VARIABLE[f];
    const family = firstFontFamily(style.getPropertyValue(name));
    if (family === '') return Promise.reject(new Error(`font variable missing: ${name}`));
    families[f] = family;
  }
  return drawGlyphAtlas({
    createCanvas: (size) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      return canvas;
    },
    families,
    loadFont: (font) => document.fonts.load(font),
  });
}
