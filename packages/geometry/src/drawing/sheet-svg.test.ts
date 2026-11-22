// EZD-702b: sheetSvg, a drawing list on a sheet (09h Sheet set rules: 1/4" = 1'-0" plans; text prints at a fixed
// paper size at any scale; line weights by role: cut heavy, beyond light, hidden dashed, dims thinnest).
import { describe, expect, it } from 'vitest';
import { QUARTER_INCH_SCALE, SHEET_PEN_IN, escapeXml, sheetSvg, type DrawingList } from '../index';

const AREA = { x: 0, y: 0, width: 10, height: 10 };
const list = (items: DrawingList['items']): DrawingList => ({ level: 'L', items, omitted: [] });
const attr = (markup: string, name: string): string[] =>
  [...markup.matchAll(new RegExp(` ${name}="([^"]*)"`, 'g'))].map((m) => m[1]!);

describe('EZD-702b sheetSvg', () => {
  it('1/4" = 1\'-0" is 1/48 paper inch per model inch', () => {
    expect(QUARTER_INCH_SCALE * 48).toBeCloseTo(1, 12);
    const svg = sheetSvg(
      list([{ kind: 'line', layer: 'existing', objectId: 'A', role: 'cut', from: { x: 0, y: 0 }, to: { x: 96, y: 0 } }]),
      { scale: QUARTER_INCH_SCALE, area: AREA },
    );
    // An 8'-0" line is 2" on paper, centred in the area.
    const [x1, x2] = [Number(attr(svg.markup, 'x1')[0]), Number(attr(svg.markup, 'x2')[0])];
    expect(x2 - x1).toBeCloseTo(2, 6);
    expect((x1 + x2) / 2).toBeCloseTo(5, 6);
    expect(Number(attr(svg.markup, 'y1')[0])).toBeCloseTo(5, 6);
    expect(svg.shown).toEqual(['A']);
  });

  it('line weights by role: cut heavier than beyond, hidden dashed, dimensions thinnest', () => {
    expect(SHEET_PEN_IN.cut).toBeGreaterThan(SHEET_PEN_IN.beyond);
    expect(SHEET_PEN_IN.dimension).toBeLessThan(SHEET_PEN_IN.beyond);
    expect(SHEET_PEN_IN.dimension).toBeLessThan(SHEET_PEN_IN.hidden);
    const roles = ['cut', 'beyond', 'hidden', 'dimension'] as const;
    const svg = sheetSvg(
      list(
        roles.map((role, i) => ({
          kind: 'line' as const,
          layer: 'existing' as const,
          objectId: role,
          role,
          from: { x: 0, y: i },
          to: { x: 10, y: i },
        })),
      ),
      { scale: 1, area: AREA },
    );
    const lines = svg.markup.split('/>').filter((s) => s.includes('<line'));
    expect(lines).toHaveLength(4);
    lines.forEach((l, i) => {
      expect(l).toContain(`data-role="${roles[i]}"`);
      expect(l.includes('stroke-dasharray')).toBe(roles[i] === 'hidden');
    });
  });

  it('text prints at its point size at any scale', () => {
    const text = {
      kind: 'text' as const,
      layer: 'dimensions' as const,
      objectId: 'M',
      text: `12'-0"`,
      font: 'dm-mono-400' as const,
      sizePt: 9,
      widthPt: 30,
      at: { x: 0, y: 0 },
      rotationDeg: 90,
      align: 'center' as const,
    };
    for (const scale of [QUARTER_INCH_SCALE, 0.5 / 12]) {
      const svg = sheetSvg(list([text]), { scale, area: AREA });
      expect(Number(attr(svg.markup, 'font-size')[0])).toBeCloseTo(9 / 72, 6);
      expect(svg.markup).toContain('rotate(-90 5 5)');
    }
  });

  it('escapes typed text so a room name cannot add markup', () => {
    expect(escapeXml(`<a href='x'>&"`)).toBe('&lt;a href=&#39;x&#39;&gt;&amp;&quot;');
    const svg = sheetSvg(
      list([
        {
          kind: 'text',
          layer: 'rooms',
          objectId: 'R"><script>',
          text: '<script>alert(1)</script> & co',
          font: 'instrument-sans-600',
          sizePt: 9,
          letterSpacingPt: 0.9,
          widthPt: 50,
          at: { x: 0, y: 0 },
          rotationDeg: 0,
          align: 'center',
        },
      ]),
      { scale: 1, area: AREA },
    );
    expect(svg.markup).not.toContain('<script>');
    expect(svg.markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
    expect(svg.markup).toContain('data-object-id="R&quot;&gt;&lt;script&gt;"');
  });

  it('an arc is drawn counter-clockwise in the model, so clockwise on paper (y flipped)', () => {
    const svg = sheetSvg(
      list([
        {
          kind: 'arc',
          layer: 'new',
          objectId: 'D',
          role: 'hidden',
          center: { x: 0, y: 0 },
          radius: 36,
          startAngle: 0,
          endAngle: 90,
        },
      ]),
      { scale: QUARTER_INCH_SCALE, area: AREA },
    );
    // Bounds are the circle's box, so the centre maps to (5, 5); radius 36/48 = 0.75.
    expect(attr(svg.markup, 'd')[0]).toBe('M 5.75 5 A 0.75 0.75 0 0 0 5 4.25');
  });

  it('an empty list draws nothing', () => {
    expect(sheetSvg(list([]), { scale: 1, area: AREA })).toEqual({ markup: '', shown: [] });
  });
});
