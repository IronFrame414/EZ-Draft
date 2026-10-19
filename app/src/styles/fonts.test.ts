// EZD-010c T5 (vault/plans/EZD-010c.md section 4). Hashes: npm pack of @fontsource 5.3.0 (plan section 2).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Src = { path: string; weight: string; style: string };
type Opts = { src: Src[]; variable: string; display: string; fallback: string[] };

const calls = vi.hoisted(() => [] as unknown[]);

vi.mock('next/font/local', () => ({
  default: (opts: { variable: string }) => {
    calls.push(opts);
    return { className: 'c', variable: opts.variable, style: {} };
  },
}));

const here = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.join(here, 'fonts');
const sha = (f: string) =>
  createHash('sha256')
    .update(readFileSync(path.join(fontsDir, f)))
    .digest('hex');

const HASHES: Record<string, string> = {
  'instrument-sans-latin-400-normal.woff2':
    '9a91efaa3599a6ef01b2f49e9ec670e3a2f39baeef09c73198f1052cf3bb0850',
  'instrument-sans-latin-500-normal.woff2':
    '9d3547da16d950d12a677c772a3ff9b69846e60e7dcd1b5efd540993f7286532',
  'instrument-sans-latin-600-normal.woff2':
    'efb770916eda95a0e31d80cccde9651d4e8617010b21220e9f227c4820d675da',
  'dm-mono-latin-400-normal.woff2':
    'e1896b13b2b1bb112fac2f9571bd6c40e118746e77a4511edbf43fbb41bf3e1e',
  'dm-mono-latin-500-normal.woff2':
    '9964608a849396bd00c4bfd7034afe03486469dcf20b4f6b8cbdfdd310369951',
  'LICENSE-instrument-sans.txt': 'c27a3c53c3beed7f5c26853afa15991478ff7145d3754a36b0382f84e10c0d03',
  'LICENSE-dm-mono.txt': 'd2766c396a8534cba53340f8af2037749b6a0a1dd3587348c917a70e779d2e32',
};

describe('EZD-010c fonts are self-hosted latin subsets', () => {
  beforeAll(async () => {
    await import('./fonts');
  });

  it('T5 (a): two localFont calls with the planned options', () => {
    expect(calls).toHaveLength(2);
    const [sans, mono] = calls as Opts[];
    expect(sans.variable).toBe('--ez-font-sans');
    expect(sans.display).toBe('swap');
    expect(sans.fallback).toEqual(['sans-serif']);
    expect(sans.src.map((s) => s.weight)).toEqual(['400', '500', '600']);
    expect(sans.src.every((s) => s.style === 'normal')).toBe(true);
    expect(mono.variable).toBe('--ez-font-mono');
    expect(mono.display).toBe('swap');
    expect(mono.fallback).toEqual(['monospace']);
    expect(mono.src.map((s) => s.weight)).toEqual(['400', '500']);
    expect(mono.src.every((s) => s.style === 'normal')).toBe(true);
  });

  it('T5 (b): every path is a local latin woff2 file', () => {
    for (const o of calls as Opts[]) {
      for (const s of o.src) {
        expect(s.path.startsWith('./fonts/')).toBe(true);
        expect(s.path.endsWith('.woff2')).toBe(true);
        expect(s.path).toContain('-latin-');
        const abs = path.resolve(here, s.path);
        expect(existsSync(abs), abs).toBe(true);
        expect(readFileSync(abs).subarray(0, 4).toString('ascii')).toBe('wOF2');
      }
    }
  });

  it('T5 (c): the folder holds exactly the 7 planned files', () => {
    expect(existsSync(fontsDir)).toBe(true);
    expect(readdirSync(fontsDir).sort()).toEqual(Object.keys(HASHES).sort());
  });

  it('T5 (d): file bytes match the pinned SHA-256', () => {
    for (const [file, hash] of Object.entries(HASHES)) {
      expect(sha(file), file).toBe(hash);
    }
  });

  it('T5 (e): each licence is the SIL Open Font License', () => {
    for (const f of ['LICENSE-instrument-sans.txt', 'LICENSE-dm-mono.txt']) {
      expect(readFileSync(path.join(fontsDir, f), 'utf8')).toContain('SIL Open Font License');
    }
  });
});
