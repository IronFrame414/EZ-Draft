// EZD-2032 (AC-EZD-2032-1; vault/build/assumptions/EZD-1205.md Settled "Page images made at send": "runs EZD-702b's
// sheet SVG builder, and rasterises with sharp ... Text is drawn as glyph outlines with fontkit, so no system font is
// needed"): one sheet page as SVG markup. It takes the same drawing calls as the PDF writer (pdf-export/write-pdf.ts
// drawSheet: frame, title block, viewports, print marks), so the client's image is the PDF's page. Units are PDF
// points (paper inches x 72), y down, as PDFKit's. Text becomes filled glyph outlines of the two committed drawing
// fonts, placed as PDFKit places them (the same advances, character spacing and baselines), so the rasteriser needs
// no font. No DOM, no database.
import { create, type Font } from 'fontkit';
import type { SheetSize } from '@ezdraft/geometry';
import { drawSheet, fonts, pagePoints, type FontName, type PdfSheet, type SheetDoc } from '../pdf-export/write-pdf';

type TextOptions = Parameters<SheetDoc['text']>[3];

let fontCache: Record<FontName, Font> | null = null;
function outlineFonts(): Record<FontName, Font> {
  if (fontCache === null) {
    const files = fonts();
    fontCache = {
      'dm-mono-400': create(files['dm-mono-400']),
      'instrument-sans-600': create(files['instrument-sans-600']),
    };
  }
  return fontCache;
}

const n = (v: number): string => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

type State = {
  lineWidth: number;
  lineCap: string;
  dash: [number, number] | null;
  strokeColor: string;
  fillColor: string;
  font: FontName;
  fontSize: number;
  transform: string;
};

export class SvgDoc implements SheetDoc {
  private parts: string[] = [];
  private path = '';
  private state: State = {
    lineWidth: 1,
    lineCap: 'butt',
    dash: null,
    strokeColor: '#000000',
    fillColor: '#000000',
    font: 'dm-mono-400',
    fontSize: 12,
    transform: '',
  };
  private stack: State[] = [];

  private add(element: string): void {
    const t = this.state.transform;
    this.parts.push(t === '' ? element : `<g transform="${t}">${element}</g>`);
  }

  private strokeAttrs(color: string): string {
    const s = this.state;
    const dash = s.dash === null ? '' : ` stroke-dasharray="${n(s.dash[0])} ${n(s.dash[1])}"`;
    return `stroke="${color}" stroke-width="${n(s.lineWidth)}" stroke-linecap="${s.lineCap}"${dash}`;
  }

  font(name: FontName): this {
    this.state.font = name;
    return this;
  }
  fontSize(size: number): this {
    this.state.fontSize = size;
    return this;
  }
  private scaleOf(font: Font): number {
    return this.state.fontSize / font.unitsPerEm;
  }
  widthOfString(text: string, options?: TextOptions): number {
    const font = outlineFonts()[this.state.font];
    const run = font.layout(text, options?.features ?? []);
    const advance = run.positions.reduce((sum, p) => sum + p.xAdvance, 0) * this.scaleOf(font);
    return advance + (options?.characterSpacing ?? 0) * Math.max(0, text.length - 1);
  }
  // PDFKit's placement: the baseline sits `dy` below y, dy from the font's ascender and descender by baseline kind
  // (top is the default).
  text(text: string, x: number, y: number, options?: TextOptions): this {
    const font = outlineFonts()[this.state.font];
    const k = this.scaleOf(font);
    const ascender = font.ascent * k;
    const descender = font.descent * k;
    const dy =
      options?.baseline === 'alphabetic'
        ? 0
        : options?.baseline === 'middle'
          ? (ascender + descender) / 2
          : options?.baseline === 'bottom'
            ? descender
            : ascender;
    const baseline = y + dy;
    const spacing = options?.characterSpacing ?? 0;
    const run = font.layout(text, options?.features ?? []);
    let pen = x;
    let d = '';
    run.glyphs.forEach((glyph, i) => {
      const p = run.positions[i]!;
      // Font units, y up, to points, y down, at the pen position.
      d += glyph.path.transform(k, 0, 0, -k, pen + p.xOffset * k, baseline - p.yOffset * k).toSVG();
      pen += p.xAdvance * k + spacing;
    });
    if (d !== '') this.add(`<path d="${d}" fill="${this.state.fillColor}"/>`);
    return this;
  }
  addContent(): this {
    // PDF marked-content tags have no meaning in an image.
    return this;
  }
  save(): this {
    this.stack.push({ ...this.state, dash: this.state.dash === null ? null : [...this.state.dash] });
    return this;
  }
  restore(): this {
    const s = this.stack.pop();
    if (s !== undefined) this.state = s;
    return this;
  }
  rotate(angle: number, options?: { origin?: [number, number] }): this {
    const [ox, oy] = options?.origin ?? [0, 0];
    const r = `rotate(${n(angle)} ${n(ox)} ${n(oy)})`;
    this.state.transform = this.state.transform === '' ? r : `${this.state.transform} ${r}`;
    return this;
  }
  lineWidth(w: number): this {
    this.state.lineWidth = w;
    return this;
  }
  lineCap(c: 'round'): this {
    this.state.lineCap = c;
    return this;
  }
  dash(length: number, options?: { space?: number }): this {
    this.state.dash = [length, options?.space ?? length];
    return this;
  }
  undash(): this {
    this.state.dash = null;
    return this;
  }
  moveTo(x: number, y: number): this {
    this.path += `M${n(x)} ${n(y)}`;
    return this;
  }
  lineTo(x: number, y: number): this {
    this.path += `L${n(x)} ${n(y)}`;
    return this;
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
    this.path += `C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(x)} ${n(y)}`;
    return this;
  }
  closePath(): this {
    this.path += 'Z';
    return this;
  }
  rect(x: number, y: number, w: number, h: number): this {
    this.path += `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
    return this;
  }
  private takePath(): string {
    const d = this.path;
    this.path = '';
    return d;
  }
  stroke(color?: string): this {
    if (color !== undefined) this.state.strokeColor = color;
    const d = this.takePath();
    if (d !== '') this.add(`<path d="${d}" fill="none" ${this.strokeAttrs(this.state.strokeColor)}/>`);
    return this;
  }
  fill(color?: string): this {
    if (color !== undefined) this.state.fillColor = color;
    const d = this.takePath();
    if (d !== '') this.add(`<path d="${d}" fill="${this.state.fillColor}" stroke="none"/>`);
    return this;
  }
  fillAndStroke(fill?: string, stroke?: string): this {
    if (fill !== undefined) this.state.fillColor = fill;
    if (stroke !== undefined) this.state.strokeColor = stroke;
    const d = this.takePath();
    if (d !== '')
      this.add(`<path d="${d}" fill="${this.state.fillColor}" ${this.strokeAttrs(this.state.strokeColor)}/>`);
    return this;
  }
  fillColor(color: string): this {
    this.state.fillColor = color;
    return this;
  }
  strokeColor(color: string): this {
    this.state.strokeColor = color;
    return this;
  }

  /** The page as one SVG document, `pixelWidth` wide, on white paper. */
  toSvg(page: { width: number; height: number }, pixelWidth: number): string {
    const pixelHeight = Math.round((pixelWidth * page.height) / page.width);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" ` +
      `viewBox="0 0 ${n(page.width)} ${n(page.height)}">` +
      `<rect x="0" y="0" width="${n(page.width)}" height="${n(page.height)}" fill="#ffffff"/>` +
      this.parts.join('') +
      '</svg>'
    );
  }
}

/** One sheet page as SVG, `pixelWidth` pixels across (its height follows the paper). */
export function sheetPageSvg(size: SheetSize, sheet: PdfSheet, pixelWidth: number): string {
  const doc = new SvgDoc();
  drawSheet(doc, size, sheet);
  return doc.toSvg(pagePoints(size), pixelWidth);
}
