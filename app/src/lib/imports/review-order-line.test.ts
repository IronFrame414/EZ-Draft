// EZD-916 (S12 Data shown "Order report lines: line no, code, width, face, finish"; S12 Decisions 2 "shown in Import
// review for the user to confirm"; vault/build/assumptions.md EZD-916 wording "Line #{n} · {code}", status bar source
// "Order report"): how Import review names, reads and handles an order line. The line is the board's sample #7.
import { describe, expect, it } from 'vitest';
import {
  itemExtents,
  itemLabel,
  itemTypeWord,
  orderLineText,
  reviewSummary,
  roomGroups,
  scanReads,
  sourceLine,
  type ReviewOrderLine,
} from './review';
import { applyFix, itemHandles, parseFix } from './review-fix';

const SB36: ReviewOrderLine = {
  id: 'ol7',
  type: 'order_line',
  number: 1,
  confidence: 95,
  lineNo: 7,
  code: 'SB36',
  width: 36,
  face: 'FD + 2 doors',
  finish: 'Shaker, White',
};
const F3: ReviewOrderLine = { ...SB36, id: 'ol10', number: 2, lineNo: 10, code: 'F3', width: 3, face: null };

describe('EZD-916 order line in review', () => {
  it('is named by its line number and code', () => {
    expect(itemLabel(SB36, [SB36, F3])).toBe('Line #7 · SB36');
    expect(itemTypeWord(SB36)).toBe('Order line');
  });

  it('reads width, face and finish, leaving out what the report does not give', () => {
    expect(scanReads(SB36)).toBe('36" · FD + 2 doors · Shaker, White');
    expect(orderLineText(F3)).toBe('3" · Shaker, White');
    expect(orderLineText({ width: 34.5, face: null, finish: null })).toBe('34 1/2"');
  });

  it('has no plan position, handles or fix, and counts in no plan total', () => {
    expect(itemExtents([SB36, F3])).toBeNull();
    expect(itemHandles(SB36, [SB36])).toEqual([]);
    expect(parseFix(SB36, { center: { x: 0, y: 0 }, width: 1 })).toBeNull();
    expect(applyFix(SB36, undefined)).toBe(SB36);
    expect(roomGroups([SB36, F3])).toEqual([{ room: null, items: [SB36, F3] }]);
    expect(reviewSummary([SB36, F3], 80, { ol7: 'accepted' }).accepted).toEqual({
      walls: 0,
      rooms: 0,
      doors: 0,
      windows: 0,
      fixtures: 0,
    });
  });

  it('an import of order reports alone reads "Order report" in the status bar', () => {
    expect(sourceLine([{ name: 'order-report.pdf', kind: 'order_report' }])).toBe('Order report');
  });
});
