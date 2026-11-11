// EZD-207b U6, U7 (vault/plans/EZD-207b.md section 4; Decided "Atlas drawing", "Font strings", "Atlas cells").
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  createGlyphAtlas,
  drawGlyphAtlas,
  firstFontFamily,
  type AtlasCanvas,
} from './glyph-atlas-canvas';

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

// EZD-373 U1-U5 (vault/plans/EZD-373.md section 4).
describe('EZD-373 glyph atlas font loading', () => {
  const DEFAULT_VARS: Record<string, string> = {
    '--ez-font-mono': '"dmMono", "dmMono Fallback", monospace',
    '--ez-font-sans': '"instrumentSans", "instrumentSans Fallback", sans-serif',
  };
  const MONO = '400 40px "dmMono"';
  const SANS = '600 40px "instrumentSans"';

  function setup(load: (font: string) => Promise<unknown[]>, vars: Record<string, string>) {
    const f = fake();
    const loadMock = vi.fn(load);
    const createElement = vi.fn(() => f.canvas);
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (n: string) => vars[n] ?? '',
    }));
    vi.stubGlobal('document', {
      documentElement: {},
      createElement,
      fonts: { load: loadMock },
    });
    return { f, load: loadMock, createElement };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test.each([
    ['"dmMono", "dmMono Fallback", monospace', '"dmMono"'],
    ["'dmMono', 'dmMono Fallback', monospace", "'dmMono'"],
    ['  Inter , Arial', 'Inter'],
    ['"A, B", C', '"A, B"'],
    ['monospace', 'monospace'],
    ['', ''],
    ['   ', ''],
    [', Arial', ''],
    ['"dmMono', ''],
  ])(
    'EZD-373 U1 firstFontFamily keeps the first family of a font-family list, quotes and all (%j)',
    (input, expected) => {
      expect(firstFontFamily(input)).toBe(expected);
    },
  );

  test('EZD-373 U2 the atlas loads and draws only the first family of each font variable', async () => {
    const { f, load, createElement } = setup(async () => [], DEFAULT_VARS);
    const out = await createGlyphAtlas();
    expect(out).toBe(f.canvas);
    expect(load.mock.calls.map((c) => c[0])).toEqual([MONO, SANS]);
    const texts = f.calls.filter((c) => c.name === 'fillText');
    expect(texts).toHaveLength(192);
    expect(texts.slice(0, 96).every((t) => t.font === MONO)).toBe(true);
    expect(texts.slice(96).every((t) => t.font === SANS)).toBe(true);
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(createElement).toHaveBeenCalledWith('canvas');
  });

  test('EZD-373 U3 a fallback face that cannot load does not stop the atlas', async () => {
    const { f } = setup(async (font) => {
      if (font.includes('Fallback')) throw new Error('NetworkError');
      return [];
    }, DEFAULT_VARS);
    const out = await createGlyphAtlas();
    expect(out).toBe(f.canvas);
    expect(f.calls.filter((c) => c.name === 'fillText')).toHaveLength(192);
  });

  test('EZD-373 U4 a font variable with no first family rejects as missing', async () => {
    for (const mono of ', "dmMono Fallback", monospace|'.split('|')) {
      const { load } = setup(async () => [], { ...DEFAULT_VARS, '--ez-font-mono': mono });
      await expect(createGlyphAtlas()).rejects.toThrow('font variable missing: --ez-font-mono');
      expect(load).toHaveBeenCalledTimes(0);
      vi.unstubAllGlobals();
    }
  });

  test('EZD-373 U5 a first family that cannot load still rejects', async () => {
    const e = new Error('NetworkError');
    const { f, load } = setup(async (font) => {
      if (font === MONO) throw e;
      return [];
    }, DEFAULT_VARS);
    await expect(createGlyphAtlas()).rejects.toBe(e);
    expect(load).toHaveBeenCalledTimes(1);
    expect(f.calls.filter((c) => c.name === 'fillText')).toHaveLength(0);
  });
});
