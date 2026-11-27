// EZD-2022 (AC-EZD-2022-1; audit 2026-11-27 X5): the request gate is the first line; every page whose path is not
// public (public-paths.ts) also calls requireSession itself, so a page the gate misses is still closed. The walk
// turns each app/src/app/**/page.tsx into its URL path: route groups "(x)" and slots "@x" drop out, a
// "[param]" segment becomes a sample value.
// AC-EZD-2022-4: a unit test over the source files; no live service.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isPublicPath } from './public-paths';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');

type Page = { file: string; urlPath: string };

function urlPathOf(relDir: string): string {
  const segments = relDir
    .split(path.sep)
    .filter((s) => s !== '' && s !== '.')
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')) && !s.startsWith('@'))
    .map((s) => (s.startsWith('[') && s.endsWith(']') ? 'x' : s));
  return '/' + segments.join('/');
}

function pages(): Page[] {
  return readdirSync(APP_DIR, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name === 'page.tsx')
    .map((d) => {
      const rel = path.relative(APP_DIR, d.parentPath);
      return { file: path.join(rel, d.name), urlPath: urlPathOf(rel) };
    });
}

describe('EZD-2022 every non-public page calls requireSession', () => {
  it('the walk turns files into paths and sorts the known public pages as public', () => {
    const all = pages();
    const byFile = new Map(all.map((p) => [p.file.split(path.sep).join('/'), p.urlPath]));
    expect(byFile.get('page.tsx') ?? byFile.get('(office)/page.tsx')).toBe('/');
    expect(byFile.get('sign-in/page.tsx')).toBe('/sign-in');
    expect(byFile.get('terms/page.tsx')).toBe('/terms');
    expect(byFile.get('auth/confirm/page.tsx')).toBe('/auth/confirm');
    expect(byFile.get('invite/[token]/page.tsx')).toBe('/invite/x');
    expect(byFile.get('(office)/dev/settings/page.tsx')).toBe('/dev/settings');
    expect(byFile.get('(editor)/dev/entry/editor/page.tsx')).toBe('/dev/entry/editor');
    for (const p of ['/sign-in', '/terms', '/auth/confirm', '/invite/x', '/dev/settings', '/dev/entry/editor'])
      expect(isPublicPath(p), p).toBe(true);
    // The walk finds gated pages too, so the check below is not empty.
    const gated = all.filter((p) => !isPublicPath(p.urlPath));
    expect(gated.length).toBeGreaterThan(10);
    expect(gated.map((p) => p.urlPath)).toContain('/');
    expect(gated.map((p) => p.urlPath)).toContain('/projects/x');
  });

  it('each page under a non-public path calls requireSession', () => {
    const missing = pages()
      .filter((p) => !isPublicPath(p.urlPath))
      .filter((p) => !/\brequireSession\s*\(/.test(readFileSync(path.join(APP_DIR, p.file), 'utf8')))
      .map((p) => `${p.file} (${p.urlPath})`);
    expect(missing).toEqual([]);
  });
});
