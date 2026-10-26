// EZD-010b · T8, T9: icons:build output and rules (vault/plans/EZD-010b.md section 4).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..', '..', '..');
const script = path.join(appDir, 'scripts', 'icons-build.mjs');
const spritePath = path.join(appDir, 'public', 'icons', 'sprite.svg');
const namesPath = path.join(here, 'icon-names.generated.ts');
const listPath = path.join(here, 'icons.json');
const fixtures = path.join(here, '__fixtures__', 'svg');

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ezd-icons-'));
}
function run(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}
function symbolIds(svg: string): string[] {
  return [...svg.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
}
function build(list: unknown) {
  const dir = tmp();
  const listFile = path.join(dir, 'list.json');
  fs.writeFileSync(listFile, JSON.stringify(list));
  const sprite = path.join(dir, 'out', 'sprite.svg');
  const names = path.join(dir, 'out', 'names.ts');
  fs.mkdirSync(path.join(dir, 'out'));
  const r = run(['--src', fixtures, '--list', listFile, '--sprite', sprite, '--names', names]);
  return { r, sprite, names };
}

describe('EZD-010b icons:build output', () => {
  it('EZD-010b done when: icons:build turns icons.json into the committed sprite and IconName list', () => {
    const dir = tmp();
    const sprite = path.join(dir, 'sprite.svg');
    const names = path.join(dir, 'names.ts');
    const r = run(['--sprite', sprite, '--names', names]);
    // (a)
    expect(r.status, r.stderr).toBe(0);
    // (b)
    const committed = fs.readFileSync(spritePath);
    expect(fs.readFileSync(sprite).equals(committed)).toBe(true);
    expect(fs.readFileSync(names).equals(fs.readFileSync(namesPath))).toBe(true);
    // (c)
    const list = JSON.parse(fs.readFileSync(listPath, 'utf8')) as string[];
    const text = committed.toString('utf8');
    expect(symbolIds(text)).toEqual(list);
    expect(list).toContain('expand_more');
    const symbols = text.match(/<symbol\b[^>]*>/g) ?? [];
    expect(symbols.length).toBe(list.length);
    for (const s of symbols) expect(s).toContain('viewBox="0 -960 960 960"');
    // (d)
    for (const bad of [
      '<style',
      '<script',
      '<text',
      'font-family',
      '@font-face',
      'fill=',
      'width=',
      'height=',
    ]) {
      expect(text, bad).not.toContain(bad);
    }
    // (e)
    expect(text.toLowerCase()).not.toContain('material symbols');
    const comment = text.match(/<!--[\s\S]*?-->/);
    expect(comment).not.toBeNull();
    expect(comment![0]).toContain('google/material-design-icons');
    expect(comment![0]).toContain('Apache-2.0');
    // (f)
    const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
    expect(pkg.scripts['icons:build']).toBe('node scripts/icons-build.mjs');
    expect(pkg.scripts['icons:fetch']).toBe('node scripts/icons-fetch.mjs');
  });
});

describe('EZD-010b icons:build rules', () => {
  it('EZD-010b T9 (1): a valid list builds a byte-stable sprite and names file', () => {
    const one = build(['a', 'a-fill']);
    expect(one.r.status, one.r.stderr).toBe(0);
    const text = fs.readFileSync(one.sprite, 'utf8');
    expect(symbolIds(text)).toEqual(['a', 'a-fill']);
    for (const name of ['a', 'a-fill']) {
      const fixtureD = fs
        .readFileSync(path.join(fixtures, `${name}.svg`), 'utf8')
        .match(/<path d="([^"]*)"/)![1];
      const sym = text.match(new RegExp(`<symbol id="${name}"[^>]*>([\\s\\S]*?)</symbol>`));
      expect(sym, name).not.toBeNull();
      expect([...sym![1].matchAll(/<path d="([^"]*)"/g)].map((m) => m[1])).toEqual([fixtureD]);
    }
    expect(symbolIds(text)).not.toContain('b');
    const namesText = fs.readFileSync(one.names, 'utf8');
    const found = [...namesText.matchAll(/['"]([a-z0-9_-]+)['"]/g)].map((m) => m[1]);
    expect(found).toEqual(['a', 'a-fill']);
    const two = build(['a', 'a-fill']);
    expect(two.r.status).toBe(0);
    expect(fs.readFileSync(two.sprite).equals(fs.readFileSync(one.sprite))).toBe(true);
    expect(fs.readFileSync(two.names).equals(fs.readFileSync(one.names))).toBe(true);
  });

  const failing: Array<[string, string[], string | null]> = [
    ['(2) a missing source file', ['a', 'zz_missing'], 'zz_missing'],
    ['(3) a repeated name', ['a', 'a'], 'a'],
    ['(4) an unsorted list', ['b', 'a'], null],
    ['(5) a source with a non-path element', ['a', 'bad'], 'bad'],
    ['(6) a name with upper case', ['A'], 'A'],
  ];
  for (const [title, list, mention] of failing) {
    it(`EZD-010b T9 ${title} exits 1 and writes nothing`, () => {
      const { r, sprite, names } = build(list);
      expect(fs.existsSync(script), 'icons-build.mjs must exist').toBe(true);
      expect(r.stderr).not.toContain('MODULE_NOT_FOUND');
      expect(r.status).toBe(1);
      if (mention) expect(r.stderr).toContain(mention);
      expect(fs.existsSync(sprite)).toBe(false);
      expect(fs.existsSync(names)).toBe(false);
    });
  }
});

describe('EZD-158 icons:build refuses unsafe sources', () => {
  it('EZD-158 a path with an extra attribute exits 1 and writes nothing', () => {
    const { r, sprite, names } = build(['a', 'attr']);
    expect(r.stderr).not.toContain('MODULE_NOT_FOUND');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('attr');
    expect(fs.existsSync(sprite)).toBe(false);
    expect(fs.existsSync(names)).toBe(false);
  });

  it('EZD-158 a source with a script element exits 1 and writes nothing', () => {
    const { r, sprite, names } = build(['a', 'script']);
    expect(r.stderr).not.toContain('MODULE_NOT_FOUND');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('script');
    expect(fs.existsSync(sprite)).toBe(false);
    expect(fs.existsSync(names)).toBe(false);
  });

  it('EZD-158 a source with a style element exits 1 and writes nothing', () => {
    const { r, sprite, names } = build(['a', 'style']);
    expect(r.stderr).not.toContain('MODULE_NOT_FOUND');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('style');
    expect(fs.existsSync(sprite)).toBe(false);
    expect(fs.existsSync(names)).toBe(false);
  });
});
