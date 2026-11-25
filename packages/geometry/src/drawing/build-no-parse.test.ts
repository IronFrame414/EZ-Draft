// EZD-1903 (AC-EZD-1903-2; editor plan 2026-11-23 L2): buildDrawingList takes the view and dimensions the app built
// as they are, with no zod run per call; the view and dimension schemas still refuse bad input from outside the app.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDrawingList, dimensionInputSchema, drawingViewSchema, type DrawingView } from '../index';

const F1 = '11111111-1111-4111-8111-111111111111';
const VIEW: DrawingView = { level: F1, dimensionTextPt: 9, roomHatch: null, roomLabelPt: 9 };
const DIM = {
  id: 'M1',
  level: F1,
  from: { x: 0, y: 0 },
  to: { x: 144, y: 0 },
  offset: -24,
  text: `12'-0"`,
};

afterEach(() => vi.restoreAllMocks());

describe('EZD-1903 buildDrawingList without a per-call parse', () => {
  it('never calls the view or dimension schema', () => {
    const spies = [
      vi.spyOn(drawingViewSchema, 'parse'),
      vi.spyOn(drawingViewSchema, 'safeParse'),
      vi.spyOn(dimensionInputSchema, 'parse'),
      vi.spyOn(dimensionInputSchema, 'safeParse'),
    ];
    const list = buildDrawingList({ objects: [] }, VIEW, [DIM]);
    expect(list.level).toBe(F1);
    const texts = list.items.filter((i) => i.kind === 'text').map((i) => i.text);
    expect(texts).toEqual([`12'-0"`]);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it('the schemas still refuse what they refused before', () => {
    expect(drawingViewSchema.safeParse(VIEW).success).toBe(true);
    expect(drawingViewSchema.safeParse({ ...VIEW, level: 'not-a-uuid' }).success).toBe(false);
    expect(drawingViewSchema.safeParse({ ...VIEW, extra: 1 }).success).toBe(false);
    expect(dimensionInputSchema.safeParse(DIM).success).toBe(true);
    expect(dimensionInputSchema.safeParse({ ...DIM, text: '' }).success).toBe(false);
    expect(dimensionInputSchema.safeParse({ ...DIM, id: '' }).success).toBe(false);
  });
});
