// EZD-010c T7 (vault/plans/EZD-010c.md section 4). Test files and next.config.ts are not scanned (C3).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fontsDir = path.join(appDir, 'src', 'styles', 'fonts');

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === 'node_modules') continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = [...walk(path.join(appDir, 'src')), ...walk(path.join(appDir, 'public'))];
const FONT_EXT = /\.(woff2?|ttf|otf|eot)$/i;
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|css|json|svg|html|txt|md|webmanifest)$/i;
const isTest = (f: string) => /\.(test\.tsx?|spec\.ts)$/.test(f);

describe('EZD-010c no icon font, no Google Fonts', () => {
  it('T7 (a): no font file named material or symbol', () => {
    const bad = files.filter((f) => FONT_EXT.test(f) && /material|symbol/i.test(path.basename(f)));
    expect(bad).toEqual([]);
  });

  it('T7 (b): woff2 files live only in app/src/styles/fonts/', () => {
    const bad = files.filter((f) => /\.woff2$/i.test(f) && path.dirname(f) !== fontsDir);
    expect(bad).toEqual([]);
  });

  it('T7 (c): no Google Fonts or icon font text', () => {
    const banned = [
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'next/font/google',
      'material symbols',
    ];
    const hits: string[] = [];
    const scan = [...files, path.join(appDir, 'next.config.ts')];
    for (const f of scan) {
      if (isTest(f)) continue;
      const base = path.basename(f);
      if (!(TEXT_EXT.test(base) || !path.extname(base) || base === 'next.config.ts')) continue;
      const text = readFileSync(f, 'utf8').toLowerCase();
      for (const b of banned) if (text.includes(b)) hits.push(`${f}: ${b}`);
    }
    expect(hits).toEqual([]);
  });

  it('T7 (d): no icon font package in app/package.json', () => {
    const pkg = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8'));
    const names = [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ].flatMap((k) => Object.keys(pkg[k] ?? {}));
    expect(names.filter((n) => /material-symbols|material-icons/i.test(n))).toEqual([]);
  });
});
