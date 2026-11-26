// EZD-1991 (Q-0813; AC-EZD-1991-1, AC-EZD-1991-2). Expected values: the S13 permit set (lib/sheets/sheet-set.ts
// header, S13 Decision 1, Q-0779): A0.0 Cover, A1.0 Existing, A2.0 Demo, A3.0 Proposed, A4.0 Elevations, A5.0
// Details, A6.0 RCP only with the "Reflected ceiling plan" box, E1.0 Electrical, E2.0 Panel + load calc, R1.0 Finish
// schedule + renders: 9 sheets, 10 with RCP (board S15b "Used on 10 sheets", preview "4 OF 10"). The Electrical,
// Plumbing and Mechanical boxes do not change the set (Q-0764). The zoom frames the preview's title block column
// (22% of the sheet at 24x36, 30% at 11x17): scaled, the column is the viewport's full width and starts at its left
// edge.
import { describe, expect, it } from 'vitest';
import {
  TITLE_BLOCK_COLUMN,
  sheetsScreenHref,
  titleBlockSheetCount,
  titleBlockZoom,
} from './title-block';

describe('EZD-1991 titleBlockSheetCount', () => {
  it('no projects: 0 sheets', () => {
    expect(titleBlockSheetCount([])).toBe(0);
  });

  it('one project: 9 sheets, 10 with the reflected ceiling plan', () => {
    expect(titleBlockSheetCount([{ scopeTrades: [] }])).toBe(9);
    expect(titleBlockSheetCount([{ scopeTrades: ['rcp'] }])).toBe(10);
    expect(titleBlockSheetCount([{ scopeTrades: ['electrical', 'plumbing', 'mechanical'] }])).toBe(9);
  });

  it('several projects: the sum of their permit sets; unknown boxes are ignored', () => {
    expect(
      titleBlockSheetCount([
        { scopeTrades: [] },
        { scopeTrades: ['rcp', 'electrical'] },
        { scopeTrades: ['bogus'] },
      ]),
    ).toBe(9 + 10 + 9);
  });
});

describe('EZD-1991 Open Sheets link', () => {
  it('opens the project on its Sheets screen', () => {
    expect(sheetsScreenHref('11111111-1111-4111-8111-111111111111')).toBe(
      '/projects/11111111-1111-4111-8111-111111111111?view=sheets',
    );
  });
});

describe('EZD-1991 titleBlockZoom', () => {
  it('the preview draws the title block column at 22% (24x36) and 30% (11x17)', () => {
    expect(TITLE_BLOCK_COLUMN).toEqual({ '24x36': 0.22, '11x17': 0.3 });
  });

  it.each([
    ['24x36', 0.22],
    ['11x17', 0.3],
  ] as const)('%s: the column fills the width and starts at the left edge', (size, w) => {
    const { scale, shift } = titleBlockZoom(size);
    // Column width once scaled = the viewport's width.
    expect(w * scale).toBeCloseTo(1, 9);
    // Column's left edge once scaled and shifted = 0.
    expect((1 - w) * scale + shift).toBeCloseTo(0, 9);
    // Its right edge = the viewport's right edge.
    expect(1 * scale + shift).toBeCloseTo(1, 9);
  });
});
