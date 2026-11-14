// EZD-5603b test helpers (vault/plans/EZD-5603b.md section 4 T15-T20): images made in memory with sharp, a
// fixed-boundary multipart body, and the byte patterns of the plan's refusals. No file is written; no import.meta
// or __dirname (lesson L-017). Sources: the plan's T15 (GPS and XMP canary JPEG), T16 (buildMultipart), T17 (a
// 3,500,000-byte JPEG padded with COM segments, a body of exactly 4,000,000 bytes), T18 (PNG bytes, FF D8 FF + 07s).
import sharp from 'sharp';

export const XMP_CANARY = 'CANARY-XMP-5603B';
export const PHOTO_CANARY = 'CANARY-PHOTO-5603B';
export const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const XMP =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  `<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${XMP_CANARY}</dc:title>` +
  '</rdf:Description></rdf:RDF></x:xmpmeta>';

/** A solid JPEG of the given size. */
export function solidJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .jpeg()
    .toBuffer();
}

/** T15: a 64 x 48 JPEG carrying GPS in its EXIF and a canary in its XMP. */
export function gpsJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '28/1 32/1 0/1' } })
    .withXmp(XMP)
    .toBuffer();
}

/** `FF D8 FF` followed by 100 bytes of 07: a JPEG signature that does not decode (T15, T18, B3). */
export const corruptJpeg = (): Uint8Array =>
  Uint8Array.from([0xff, 0xd8, 0xff, ...new Array<number>(100).fill(0x07)]);

/** A JPEG padded after its SOI with COM segments (FF FE, a 2-byte length, data), to exactly `total` bytes. */
export function padJpeg(jpeg: Uint8Array, total: number, comment = ''): Uint8Array {
  let need = total - jpeg.length;
  if (need < 0) throw new Error('jpeg already longer than the total');
  const segments: Uint8Array[] = [];
  const seg = (size: number, fill: string) => {
    const s = new Uint8Array(size);
    s[0] = 0xff;
    s[1] = 0xfe;
    s[2] = (size - 2) >> 8;
    s[3] = (size - 2) & 0xff;
    const text = new TextEncoder().encode(fill);
    s.set(text.subarray(0, size - 4), 4);
    return s;
  };
  if (comment !== '') {
    const size = 4 + comment.length;
    segments.push(seg(size, comment));
    need -= size;
  }
  while (need > 0) {
    let size = Math.min(65_537, need);
    if (need - size > 0 && need - size < 4) size -= 4;
    segments.push(seg(size, ''));
    need -= size;
  }
  if (need !== 0) throw new Error('could not pad exactly');
  const out = new Uint8Array(total);
  out.set(jpeg.subarray(0, 2), 0);
  let at = 2;
  for (const s of segments) {
    out.set(s, at);
    at += s.length;
  }
  out.set(jpeg.subarray(2), at);
  return out;
}

export type Part = {
  name: string;
  data: Uint8Array | string;
  filename?: string;
  contentType?: string;
};

/** A multipart/form-data body with a fixed boundary and CRLF line ends. */
export function buildMultipart(boundary: string, parts: Part[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const p of parts) {
    let header = `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"`;
    if (p.filename !== undefined) header += `; filename="${p.filename}"`;
    header += '\r\n';
    if (p.contentType !== undefined) header += `Content-Type: ${p.contentType}\r\n`;
    header += '\r\n';
    chunks.push(enc.encode(header), typeof p.data === 'string' ? enc.encode(p.data) : p.data, enc.encode('\r\n'));
  }
  chunks.push(enc.encode(`--${boundary}--\r\n`));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export const multipartRequest = (url: string, boundary: string, body: Uint8Array): Request =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: body as unknown as BodyInit,
  });

/** Decode a COM-padded JPEG's stored pixel size with sharp. */
export const sizeOf = async (jpeg: Uint8Array) => {
  const m = await sharp(jpeg).metadata();
  return { width: m.width, height: m.height, exif: m.exif, xmp: m.xmp };
};
