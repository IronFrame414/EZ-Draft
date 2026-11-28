// EZD-2032: the part of fontkit 2.0.4 the client sheet images use (the package ships no types; docs/architecture.md
// Dependencies). Glyph outlines in font units, y up.
declare module 'fontkit' {
  type PathCommand = { command: string; args: number[] };
  class Path {
    commands: PathCommand[];
    transform(m0: number, m1: number, m2: number, m3: number, m4: number, m5: number): Path;
    toSVG(): string;
  }
  type Glyph = { path: Path };
  type GlyphPosition = { xAdvance: number; yAdvance: number; xOffset: number; yOffset: number };
  type GlyphRun = { glyphs: Glyph[]; positions: GlyphPosition[] };
  type Font = {
    unitsPerEm: number;
    ascent: number;
    descent: number;
    layout(text: string, features?: readonly string[]): GlyphRun;
  };
  export function create(buffer: Buffer | Uint8Array): Font;
}
