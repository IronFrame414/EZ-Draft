// EZD-103a U11 (vault/plans/EZD-103a.md sections 3, 4; Q-0322 (b)): legacy icon conversion.
// Expected values: plan Decided "Legacy icon conversion" (format, commands, x' = 48x, y' = 48y - 960,
// relative deltas x 48, refusal codes, CONVERTED.md text); the fixture (first pair 15.792 7.667, 5 Z, walked
// extremes x 0.833-19.188, y 0.833-19.167); the source regex of app/scripts/icons-build.mjs lines 64-71;
// EZD-010c T7 (never the words "Material Symbols"). The fixture is the fetched upstream file byte for byte.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..', '..', '..');
const script = path.join(appDir, 'scripts', 'icons-convert-legacy.mjs');
const fixture = path.join(here, '__fixtures__', 'legacy', 'auto_awesome_20px.svg');
const committed = path.join(here, 'svg', 'auto_awesome.svg');
const notice = path.join(here, 'svg', 'CONVERTED.md');
const viewBoxFixture = path.join(here, '__fixtures__', 'svg', 'a.svg');

// app/scripts/icons-build.mjs lines 64-71: the source regex and its viewBox read.
const SOURCE_RE =
  /^\s*(?:<\?xml[^>]*\?>\s*)?<svg\b([^>]*)>\s*((?:<path d="[^"]*"\s*\/>\s*)+)<\/svg>\s*$/;

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ezd-icons-legacy-'));
const run = (args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { cwd: appDir, encoding: 'utf8' });
const wrapper = (d: string, size = '20') =>
  `<svg xmlns="http://www.w3.org/2000/svg" height="${size}" width="${size}"><path d="${d}"/></svg>`;
const dOf = (svg: string) => /<path d="([^"]*)"/.exec(svg)?.[1] ?? '';

// Walk M/m/L/l/Z: pairs after a moveto are linetos of the same case; the first pair of a leading m is
// absolute (relative to the origin); Z returns to the subpath start.
function walk(d: string): [number, number][] {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+(?:\.\d*)?|\.\d+)/g) ?? [];
  const points: [number, number][] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        x = sx;
        y = sy;
        points.push([x, y]);
      }
      continue;
    }
    const a = Number(tokens[i]);
    const b = Number(tokens[i + 1]);
    i += 2;
    const rel = cmd === cmd.toLowerCase();
    x = rel ? x + a : a;
    y = rel ? y + b : b;
    points.push([x, y]);
    if (cmd === 'M' || cmd === 'm') {
      sx = x;
      sy = y;
      cmd = cmd === 'M' ? 'L' : 'l';
    }
  }
  return points;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

describe('EZD-103a legacy icon conversion', () => {
  it('U11 (a) the fixture converts to the committed auto_awesome.svg byte for byte', () => {
    const out = path.join(tmp(), 'auto_awesome.svg');
    const r = run([fixture, out]);
    expect(r.status, r.stderr).toBe(0);
    expect(fs.readFileSync(out).equals(fs.readFileSync(committed))).toBe(true);
  });

  it('U11 (b) the committed file is a valid source in the 0 -960 960 960 box', () => {
    const text = fs.readFileSync(committed, 'utf8');
    const m = text.match(SOURCE_RE);
    expect(m).not.toBeNull();
    const attrs = m![1];
    expect(attrs).toContain('viewBox="0 -960 960 960"');
    expect(attrs).toContain('height="20"');
    expect(attrs).toContain('width="20"');
    expect(text).not.toContain('\n');

    const d = dOf(text);
    const letters = new Set(d.match(/[A-Za-z]/g) ?? []);
    for (const l of letters) expect(['L', 'l', 'm', 'Z'], l).toContain(l);
    expect((d.match(/Z/g) ?? []).length).toBe(5);
    expect(d.startsWith('m758.016 -591.984')).toBe(true);

    const points = walk(d);
    expect(points.length).toBeGreaterThan(0);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(960);
      expect(y).toBeGreaterThanOrEqual(-960);
      expect(y).toBeLessThanOrEqual(0);
    }
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    expect(round3(Math.min(...xs))).toBe(39.984);
    expect(round3(Math.max(...xs))).toBe(921.024);
    expect(round3(Math.min(...ys))).toBe(-920.016);
    expect(round3(Math.max(...ys))).toBe(-39.984);
  });

  it('U11 (c) refusals exit 1, name the code and write nothing', () => {
    const fixtureD = dOf(fs.readFileSync(fixture, 'utf8'));
    const cases: { name: string; input: string | null; code: string }[] = [
      { name: 'curve', input: wrapper('M1 1c1 1 2 2 3 3Z'), code: 'unsupported_command' },
      {
        name: 'viewbox',
        input: fs.readFileSync(viewBoxFixture, 'utf8'),
        code: 'legacy_format_expected',
      },
      { name: 'size24', input: wrapper(fixtureD, '24'), code: 'legacy_format_expected' },
      { name: 'usage', input: null, code: 'usage' },
    ];
    for (const c of cases) {
      const dir = tmp();
      const inFile = path.join(dir, 'in.svg');
      const outFile = path.join(dir, 'out.svg');
      fs.writeFileSync(inFile, c.input ?? wrapper(fixtureD));
      const r = run(c.input === null ? [inFile] : [inFile, outFile]);
      expect(r.status, c.name).toBe(1);
      expect(r.stderr, c.name).toContain(c.code);
      expect(fs.existsSync(outFile), c.name).toBe(false);
      expect(fs.readdirSync(dir), c.name).toEqual(['in.svg']);
    }
  });

  it('U11 (d) the package script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['icons:convert-legacy']).toBe('node scripts/icons-convert-legacy.mjs');
  });

  it('U11 (e) CONVERTED.md names the file, the original, the script, 4(b) and the commit', () => {
    const text = fs.readFileSync(notice, 'utf8');
    for (const s of [
      'auto_awesome.svg',
      '__fixtures__/legacy/auto_awesome_20px.svg',
      'icons-convert-legacy.mjs',
      '4(b)',
      '49d4db35df873165d6bd6ba09b063c7dafbac2f4',
    ]) {
      expect(text, s).toContain(s);
    }
    expect(text.toLowerCase()).not.toContain('material symbols');
  });
});
