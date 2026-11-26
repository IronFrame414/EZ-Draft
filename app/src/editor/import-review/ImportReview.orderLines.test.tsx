// EZD-916 (S12 Order report import; Decisions 2 "shown in Import review for the user to confirm"; Data shown "Order
// report lines: line no, code, width, face, finish"; AC-EZD-916-1 "A sample report's lines appear in review for
// confirmation"): Import review of an order report lists its lines and the inspector shows what the report reads.
// Items are two of the fixture's lines (fixtures/synthetic/order-report.pdf.expected.json #7 and #10); #10 is made
// the line to check (60, cutoff 80) so Accept + fix selects it first.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import type { ReviewItem, ReviewOrderLine } from '../../lib/imports/review';
import { ReadyBody, type ImportReviewData } from './ImportReview';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );

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
const F3: ReviewOrderLine = { ...SB36, id: 'ol10', number: 2, confidence: 60, lineNo: 10, code: 'F3', width: 3, face: null };
const ITEMS: ReviewItem[] = [SB36, F3];

const review = (over: Partial<ImportReviewData> = {}): ImportReviewData => ({
  jobId: 'j',
  projectId: 'p',
  projectName: 'Kitchen',
  status: 'ready',
  files: [{ name: 'order-report.pdf', kind: 'order_report' }],
  failedFile: null,
  items: ITEMS,
  meshUrl: null,
  cutoff: 80,
  ...over,
});

const fields = (html: string) =>
  elements(html, 'import-review-order-line').map((e) => [attr(e.attrs, 'data-field'), textOf(e.inner)]);

describe('EZD-916 Import review of an order report', () => {
  it('AC-EZD-916-1: the lines are listed for confirmation and the line to check shows what the report reads', () => {
    const all = render(<ReadyBody review={review()} initialMode="by_room" />);
    expect(elements(all, 'import-review-row').map((r) => textOf(r.inner))).toEqual([
      'Line #7 · SB3695%',
      'Line #10 · F360%',
    ]);
    const html = render(<ReadyBody review={review()} initialMode="accept_fix" />);
    expect(textOf(elements(html, 'import-review-summary')[0].inner)).toBe('2 found · 1 high confidence · 1 to check');
    expect(html).toContain('Order line · 60% confidence');
    expect(html).toContain('Order report');
    expect(fields(html)).toEqual([
      ['code', 'F3'],
      ['width', '3&quot;'],
      ['face', 'Not on the report'],
      ['finish', 'Shaker, White'],
    ]);
  });

  it('One by one starts on line #7 with its code, width, face and finish', () => {
    const html = render(<ReadyBody review={review()} initialMode="one_by_one" />);
    expect(fields(html)).toEqual([
      ['code', 'SB36'],
      ['width', '36&quot;'],
      ['face', 'FD + 2 doors'],
      ['finish', 'Shaker, White'],
    ]);
  });

  it('draws no line on the plan canvas', () => {
    const html = render(<ReadyBody review={review()} initialMode="accept_fix" />);
    expect(elements(html, 'review-item')).toEqual([]);
  });
});
