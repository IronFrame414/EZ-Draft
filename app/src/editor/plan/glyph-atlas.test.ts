// EZD-207b U1-U5 (vault/plans/EZD-207b.md section 4; Decided "Atlas characters", "Atlas cells", "Text size",
// "Text layout", "Quad vertices"; AC-EZD-207-4). Expected values are the plan's own numbers.
import type { DrawingItem, DrawingList } from '@ezdraft/geometry';
import { Color, SRGBColorSpace } from 'three';
import { describe, expect, test } from 'vitest';
import { tokenRgb } from './color';
import { ATLAS_CHARS, atlasCell, layoutText } from './glyph-atlas';

const OBJ = '00000000-0000-4000-8000-0000000000aa';

function linear(name: `--ez-${string}`) {
  const c = tokenRgb(name);
  const k = new Color().setRGB(c.r, c.g, c.b, SRGBColorSpace);
  return [k.r, k.g, k.b];
}
const INK = linear('--ez-ink');
const SLATE = linear('--ez-slate-300');

const mono = (
  text: string,
  over: Partial<{ rotationDeg: number; widthPt: number }> = {},
): DrawingItem => ({
  kind: 'text',
  layer: 'dimensions',
  objectId: OBJ,
  text,
  font: 'dm-mono-400',
  sizePt: 10,
  widthPt: over.widthPt ?? 18,
  at: { x: 60, y: 30 },
  rotationDeg: over.rotationDeg ?? 0,
  align: 'center',
});
const label: DrawingItem = {
  kind: 'text',
  layer: 'rooms',
  objectId: OBJ,
  text: 'R·R',
  font: 'instrument-sans-600',
  sizePt: 10,
  letterSpacingPt: 1,
  widthPt: 16.72,
  at: { x: 0, y: 0 },
  rotationDeg: 0,
  align: 'center',
};
const list = (...items: DrawingItem[]): DrawingList => ({ level: 'L', items, omitted: [] });

// Vertex order BL, BR, TR, BL, TR, TL: 18 position floats and 12 uv floats per glyph.
const bl = (p: Float32Array, g: number) => ({ x: p[g * 18], y: p[g * 18 + 1] });
const tr = (p: Float32Array, g: number) => ({ x: p[g * 18 + 6], y: p[g * 18 + 7] });

function expectColors(colors: Float32Array, from: number, to: number, want: number[]) {
  for (let v = from * 6; v < to * 6; v++)
    for (let c = 0; c < 3; c++) expect(colors[v * 3 + c]).toBeCloseTo(want[c], 6);
}

describe('EZD-207b glyph atlas', () => {
  test('EZD-207b U1 atlas characters and cells', () => {
    expect(ATLAS_CHARS).toHaveLength(96);
    expect(ATLAS_CHARS[0]).toBe(' ');
    expect(ATLAS_CHARS[95]).toBe('·');
    const near = (got: unknown, want: Record<string, number>) => {
      const g = got as Record<string, number>;
      for (const k of Object.keys(want)) expect(g[k]).toBeCloseTo(want[k], 9);
    };
    near(atlasCell('dm-mono-400', '1'), { u0: 0.0625, v0: 0.0625, u1: 0.125, v1: 0.125 });
    near(atlasCell('dm-mono-400', "'"), { u0: 0.4375, v0: 0, u1: 0.5, v1: 0.0625 });
    near(atlasCell('instrument-sans-600', 'R'), { u0: 0.125, v0: 0.5625, u1: 0.1875, v1: 0.625 });
    near(atlasCell('instrument-sans-600', '·'), { u0: 0.9375, v0: 0.6875, u1: 1, v1: 0.75 });
    expect(atlasCell('dm-mono-400', 'é')).toBeNull();
    // Rejects two atlases: Instrument Sans cells do not start at row 0.
    expect(atlasCell('instrument-sans-600', ' ')!.v0).toBeGreaterThan(0);
  });

  test('EZD-207b U2 DM Mono text is model geometry, centred, with ink colour', () => {
    const b = layoutText(list(mono("10'")));
    expect(b.glyphs).toBe(3);
    expect(b.positions.length).toBe(54);
    expect(bl(b.positions, 0).x).toBeCloseTo(54, 5);
    expect(bl(b.positions, 0).y).toBeCloseTo(26, 5);
    expect(tr(b.positions, 0).x).toBeCloseTo(62, 5);
    expect(tr(b.positions, 0).y).toBeCloseTo(34, 5);
    expect(bl(b.positions, 1).x).toBeCloseTo(57, 5);
    expect(bl(b.positions, 2).x).toBeCloseTo(60, 5);
    expect(b.uvs[0]).toBeCloseTo(0.0625, 6);
    expect(b.uvs[1]).toBeCloseTo(0.125, 6);
    expect(b.uvs[10]).toBeCloseTo(0.0625, 6);
    expect(b.uvs[11]).toBeCloseTo(0.0625, 6);
    expect(b.colors.length).toBe(54);
    expectColors(b.colors, 0, 3, INK);
  });

  test('EZD-207b U3 label text applies letter spacing and slate colour', () => {
    const b = layoutText(list(label));
    expect(b.glyphs).toBe(3);
    expect(bl(b.positions, 0).x).toBeCloseTo(-5.68, 5);
    expect(bl(b.positions, 1).x).toBeCloseTo(-1.86, 5);
    expect(bl(b.positions, 2).x).toBeCloseTo(-0.64, 5);
    expect(b.uvs[12]).toBeCloseTo(0.9375, 6);
    // glyph 2 BL uv is (u0, v1); its top-left (index 5 of 6) carries v0 .6875.
    expect(b.uvs[12 + 11]).toBeCloseTo(0.6875, 6);
    expectColors(b.colors, 0, 3, SLATE);
  });

  test('EZD-207b U4 rotation, spaces and characters missing from the atlas', () => {
    const r = layoutText(list(mono("10'", { rotationDeg: 90 })));
    expect(bl(r.positions, 0).x).toBeCloseTo(64, 5);
    expect(bl(r.positions, 0).y).toBeCloseTo(24, 5);
    expect(tr(r.positions, 0).x).toBeCloseTo(56, 5);
    expect(tr(r.positions, 0).y).toBeCloseTo(32, 5);

    const sp = layoutText(list(mono('1 2')));
    expect(sp.glyphs).toBe(2);
    expect(bl(sp.positions, 1).x).toBeCloseTo(60, 5);

    const miss = layoutText(list(mono('aéb')));
    expect(miss.glyphs).toBe(2);
    expect(bl(miss.positions, 1).x).toBeCloseTo(60, 5);
  });

  test('EZD-207b U5 empty lists and item order', () => {
    for (const input of [
      null,
      list(
        {
          kind: 'line',
          layer: 'existing',
          objectId: OBJ,
          role: 'cut',
          from: { x: 0, y: 0 },
          to: { x: 1, y: 0 },
        },
        {
          kind: 'fill',
          layer: 'existing',
          objectId: OBJ,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ],
        },
      ),
    ]) {
      const b = layoutText(input);
      expect(b.glyphs).toBe(0);
      expect(b.positions).toHaveLength(0);
      expect(b.uvs).toHaveLength(0);
      expect(b.colors).toHaveLength(0);
    }
    const mixed = layoutText(list(label, mono("10'")));
    expect(mixed.glyphs).toBe(6);
    expectColors(mixed.colors, 0, 3, SLATE);
    expectColors(mixed.colors, 3, 6, INK);
  });
});
