// EZD-720 (AC-EZD-720-1; vault/build/assumptions/EZD-720.md Settled: A8.0 draws the pieces and the TOP SCHEDULE, A9.0
// a section of each edge profile; Permit plan viewports draw no countertop seams, piece labels, edge tags or the
// schedule). The renderer sends a countertop job only for A8.0 and A9.0 with pieces in the model, and the sheet worker
// draws it. The pieces are EZD-418's board tops (editor/countertops/test-fixture.ts boardPiecesModel).
import { describe, expect, it } from 'vitest';
import { boardPiecesModel, CT_FLOOR } from '../../editor/countertops/test-fixture';
import { sheetJob } from '../../workers/sheet-job';
import { createSheetRenderer, sheetCountertopsJobInput, sheetJobInputs, type SheetRenderRequest } from './renderer';

const HALF_BULLNOSE = 'b0000000-0000-4000-8000-000000000001';
const NAMES = { materials: [], profiles: [{ id: HALF_BULLNOSE, key: 'half_bullnose', name: 'Half bullnose' }], open: [] };

const req = (sheet: string, over: Partial<SheetRenderRequest> = {}): SheetRenderRequest => ({
  objects: boardPiecesModel(),
  size: '11x17',
  viewports: [],
  sheet,
  names: NAMES,
  ...over,
});

describe('EZD-720 countertop sheet jobs', () => {
  it('A8.0 and A9.0 send one countertop job with the pieces; other sheets and a model without tops send none', () => {
    const a8 = sheetCountertopsJobInput(req('A8.0'));
    expect(a8?.countertops.sheet).toBe('A8.0');
    expect(a8?.countertops.pieces.map((p) => p.type)).toEqual(['countertop_piece', 'countertop_piece', 'countertop_piece']);
    expect(sheetCountertopsJobInput(req('A9.0'))?.countertops.sheet).toBe('A9.0');
    for (const sheet of ['A0.0', 'A3.0', 'A4.0', 'R1.0']) expect(sheetCountertopsJobInput(req(sheet))).toBeNull();
    const floorOnly = new Map([...boardPiecesModel()].filter(([id]) => id === CT_FLOOR));
    expect(sheetCountertopsJobInput(req('A8.0', { objects: floorOnly }))).toBeNull();
  });

  it('the worker draws A8.0: piece labels, the dashed seam and the TOP SCHEDULE with the board values', () => {
    const svg = sheetJob(sheetCountertopsJobInput(req('A8.0'))!);
    expect(svg.markup).toContain('TOP SCHEDULE');
    for (const cell of ['A - Back wall', 'B - Left return', 'C - Island', '25.1', '11.2', '19.9', '19.0'])
      expect(svg.markup).toContain(cell);
    expect(svg.markup).toContain('data-role="hidden"');
  });

  it('the worker refuses a countertop job with bad names', () => {
    const input = sheetCountertopsJobInput(req('A8.0'))!;
    expect(() => sheetJob({ countertops: { ...input.countertops, names: { materials: 1 } } })).toThrow('sheet_input');
  });

  it('a permit plan viewport on A3.0 draws no countertop label, seam or schedule', () => {
    const inputs = sheetJobInputs(req('A3.0', { viewports: [{ kind: 'plan', level: CT_FLOOR, view: 'proposed', scale: '1/4' }] }));
    expect(inputs).toHaveLength(1);
    const markup = sheetJob(inputs[0]!).markup;
    expect(markup).not.toContain('TOP SCHEDULE');
    expect(markup).not.toContain('Back wall');
    expect(markup).not.toContain('A9.0');
    expect(markup).not.toContain('data-role="hidden"');
  });

  it('the renderer joins the countertop job into the sheet', async () => {
    const asked: unknown[] = [];
    const r = createSheetRenderer(async (input) => {
      asked.push(input);
      return { markup: '<g/>', shown: [] };
    });
    expect(await r.render(req('A8.0'))).toEqual({ markup: '<g/>', shown: [] });
    expect(asked).toHaveLength(1);
    expect(await r.render(req('R1.0'))).toBeNull();
  });
});
