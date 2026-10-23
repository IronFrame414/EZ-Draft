// EZD-013 U4 (vault/plans/EZD-013.md section 4).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, '..', '..');
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const FILES = [
  { rel: 'public/app-icons/icon-192.png', size: 192, opaque: false },
  { rel: 'public/app-icons/icon-512.png', size: 512, opaque: false },
  { rel: 'public/app-icons/icon-maskable-512.png', size: 512, opaque: true },
  { rel: 'src/app/apple-icon.png', size: 180, opaque: true },
  { rel: 'src/app/icon.png', size: 48, opaque: false },
];

function parse(buf: Buffer) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  const idat: Buffer[] = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  return { width, height, bitDepth, colorType, interlace, data: Buffer.concat(idat) };
}

function allAlpha255(p: ReturnType<typeof parse>): boolean {
  const bpp = 4; // 8-bit RGBA
  const stride = p.width * bpp;
  const raw = inflateSync(p.data);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < p.height; y++) {
    const ft = raw[y * (stride + 1)];
    const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let add = 0;
      if (ft === 1) add = a;
      else if (ft === 2) add = b;
      else if (ft === 3) add = (a + b) >> 1;
      else if (ft === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[i] = (row[i] + add) & 255;
    }
    for (let x = 0; x < p.width; x++) if (row[x * bpp + 3] !== 255) return false;
    prev = row;
  }
  return true;
}

describe('EZD-013 app icon files', () => {
  for (const f of FILES) {
    it(`U4: ${f.rel} is a ${f.size} px PNG${f.opaque ? ', opaque' : ''}`, () => {
      const buf = readFileSync(path.join(app, f.rel));
      expect(buf.subarray(0, 8).equals(SIG)).toBe(true);
      const p = parse(buf);
      expect(p.width).toBe(f.size);
      expect(p.height).toBe(f.size);
      if (f.opaque) {
        expect([2, 6]).toContain(p.colorType);
        if (p.colorType === 6) {
          expect(p.bitDepth).toBe(8);
          expect(p.interlace).toBe(0);
          expect(allAlpha255(p)).toBe(true);
        }
      }
    });
  }
});
