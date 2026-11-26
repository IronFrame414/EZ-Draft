// EZD-715: the part of PDFKit 0.20.2 the PDF export writer uses (the package ships no types, and @types/pdfkit is not
// a pinned dependency, docs/architecture.md Dependencies).
declare module 'pdfkit' {
  type TextOptions = {
    lineBreak?: boolean;
    baseline?: 'alphabetic' | 'middle' | 'bottom' | 'top' | 'hanging' | 'ideographic';
    characterSpacing?: number;
    features?: readonly string[];
  };
  type DocumentOptions = {
    size?: [number, number];
    margin?: number;
    font?: string | null;
    autoFirstPage?: boolean;
    compress?: boolean;
    info?: { Title?: string; Producer?: string; Creator?: string };
  };
  class PDFDocument {
    constructor(options?: DocumentOptions);
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (e: unknown) => void): this;
    addPage(options?: { size?: [number, number]; margin?: number }): this;
    registerFont(name: string, src: Buffer | Uint8Array): this;
    font(name: string): this;
    fontSize(size: number): this;
    widthOfString(text: string, options?: TextOptions): number;
    text(text: string, x: number, y: number, options?: TextOptions): this;
    addContent(data: string): this;
    save(): this;
    restore(): this;
    rotate(angle: number, options?: { origin?: [number, number] }): this;
    lineWidth(w: number): this;
    lineCap(c: 'butt' | 'round' | 'square'): this;
    dash(length: number, options?: { space?: number }): this;
    undash(): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this;
    closePath(): this;
    rect(x: number, y: number, w: number, h: number): this;
    stroke(color?: string): this;
    fill(color?: string): this;
    fillAndStroke(fill?: string, stroke?: string): this;
    fillColor(color: string): this;
    strokeColor(color: string): this;
    end(): void;
    outline: { addItem(title: string): unknown };
  }
  export default PDFDocument;
}
