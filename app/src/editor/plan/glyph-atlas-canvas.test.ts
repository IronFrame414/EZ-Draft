// EZD-207b U6, U7 (vault/plans/EZD-207b.md section 4; Decided "Atlas drawing", "Font strings", "Atlas cells").
import { describe, expect, test, vi } from 'vitest';
import { drawGlyphAtlas, type AtlasCanvas } from './glyph-atlas-canvas';

type Call = { name: string; args: unknown[]; fill: unknown; font: unknown; baseline: unknown };
const FAMILIES = { 'dm-mono-400': 'MonoF', 'instrument-sans-600': 'SansF' };

function fake(opts: { context?: boolean } = {}) {
  const log: string[] = [];
  const calls: Call[] = [];
  const ctx = {
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect: (...args: unknown[]) => {
      log.push('fillRect');
      calls.push({
        name: 'fillRect',
        args,
        fill: ctx.fillStyle,
        font: ctx.font,
        baseline: ctx.textBaseline,
      });
    },
    fillText: (...args: unknown[]) => {
      log.push('fillText');
      calls.push({
        name: 'fillText',
        args,
        fill: ctx.fillStyle,
        font: ctx.font,
        baseline: ctx.textBaseline,
      });
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => (opts.context === false ? null : ctx),
  };
  const createCanvas = vi.fn((size: number) => {
    log.push('createCanvas');
    canvas.width = size;
    canvas.height = size;
    return canvas as unknown as AtlasCanvas;
  });
  return { canvas, calls, log, createCanvas };
}

describe('EZD-207b glyph atlas drawing', () => {
  test('EZD-207b U6 the fonts load first, then one canvas is filled black and 192 glyphs are drawn white', async () => {
    const f = fake();
    const loadFont = vi.fn(async (font: string) => {
      f.log.push(`load ${font}`);
    });
    const out = await drawGlyphAtlas({
      createCanvas: f.createCanvas,
      families: FAMILIES,
      loadFont,
    });
    expect(out).toBe(f.canvas);
    expect(f.createCanvas).toHaveBeenCalledTimes(1);
    expect(f.createCanvas).toHaveBeenCalledWith(1024);
    expect(loadFont.mock.calls.map((c) => c[0])).toEqual(['400 40px MonoF', '600 40px SansF']);
    const firstText = f.log.indexOf('fillText');
    expect(f.log.indexOf('load 400 40px MonoF')).toBeLessThan(firstText);
    expect(f.log.indexOf('load 600 40px SansF')).toBeLessThan(firstText);

    expect(f.calls[0].name).toBe('fillRect');
    expect(f.calls[0].args).toEqual([0, 0, 1024, 1024]);
    expect(f.calls[0].fill).toBe('#000000');

    const texts = f.calls.filter((c) => c.name === 'fillText');
    expect(texts).toHaveLength(192);
    for (const t of texts) {
      expect(t.fill).toBe('#ffffff');
      expect(t.baseline).toBe('alphabetic');
    }
    expect(texts[0].args).toEqual([' ', 12, 46]);
    expect(texts[0].font).toBe('400 40px MonoF');
    expect(texts[146].args).toEqual(['R', 140, 622]);
    expect(texts[146].font).toBe('600 40px SansF');
    expect(texts[191].args).toEqual(['·', 972, 750]);
  });

  test('EZD-207b U7 a missing 2d context and a font that fails to load reject, never a blank atlas', async () => {
    const none = fake({ context: false });
    await expect(
      drawGlyphAtlas({
        createCanvas: none.createCanvas,
        families: FAMILIES,
        loadFont: async () => {},
      }),
    ).rejects.toEqual(new Error('2d context unavailable'));

    const bad = fake();
    await expect(
      drawGlyphAtlas({
        createCanvas: bad.createCanvas,
        families: FAMILIES,
        loadFont: async () => {
          throw new Error('x');
        },
      }),
    ).rejects.toEqual(new Error('x'));
    expect(bad.calls.filter((c) => c.name === 'fillText')).toHaveLength(0);
  });
});
