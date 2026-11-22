// EZD-915 (S02 States "Supplier kitchen PDF: cabinet labels read (W3030, B24) and plan vs elevation cross-check
// results shown per cabinet"; AC-EZD-915-1): Import review of a supplier PDF lists its cabinets, draws each as a box,
// and the inspector shows the size from the label and each view's check. Items are the fixture's two boxes
// (fixtures/synthetic/supplier-kitchen.pdf.expected.json), W3030 with no elevation so it is the item to check (70,
// cutoff 80) and is selected first in Accept + fix.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import type { ReviewCabinet, ReviewItem } from '../../lib/imports/review';
import { ReadyBody, type ImportReviewData } from './ImportReview';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );

const B24: ReviewCabinet = {
  id: 'cabinet-1',
  type: 'cabinet',
  number: 1,
  confidence: 95,
  code: 'B24',
  boxType: 'base',
  width: 24,
  depth: 24,
  height: 34.5,
  center: { x: 212, y: 288 },
  outline: { min: { x: 200, y: 276 }, max: { x: 224, y: 300 } },
  run: 1,
  check: {
    plan: 'agrees',
    elevation: 'agrees',
    planSize: { long: 24, short: 24 },
    elevationSize: { width: 24, height: 34.5 },
  },
};
const W3030: ReviewCabinet = {
  ...B24,
  id: 'cabinet-2',
  number: 2,
  confidence: 70,
  code: 'W3030',
  boxType: 'wall',
  width: 30,
  depth: 12,
  height: 30,
  center: { x: 239, y: 294 },
  outline: { min: { x: 224, y: 288 }, max: { x: 254, y: 300 } },
  check: { plan: 'agrees', elevation: 'missing', planSize: { long: 30, short: 12 }, elevationSize: null },
};
const ITEMS: ReviewItem[] = [B24, W3030];

const review = (over: Partial<ImportReviewData> = {}): ImportReviewData => ({
  jobId: 'j',
  projectId: 'p',
  projectName: 'Kitchen',
  status: 'ready',
  files: [{ name: 'kitchen.pdf', kind: 'supplier_pdf' }],
  failedFile: null,
  items: ITEMS,
  meshUrl: null,
  cutoff: 80,
  ...over,
});

describe('EZD-915 Import review of a supplier PDF', () => {
  it('AC-EZD-915-1: the to-check cabinet shows its size from the label and the cross-check per view', () => {
    const html = render(<ReadyBody review={review()} initialMode="accept_fix" />);
    expect(textOf(elements(html, 'import-review-cabinet-size')[0].inner)).toBe('30 × 12 × 30');
    const checks = elements(html, 'import-review-cabinet-check');
    expect(checks.map((c) => [attr(c.attrs, 'data-view'), attr(c.attrs, 'data-state'), textOf(c.inner)])).toEqual([
      ['plan', 'agrees', 'Plan agrees with W3030'],
      ['elevation', 'missing', 'Elevation not found'],
    ]);
    expect(html).toContain('Cabinet W3030');
  });

  it('each cabinet is drawn as its plan box in its confidence color', () => {
    const html = render(<ReadyBody review={review()} initialMode="accept_fix" />);
    const drawn = elements(html, 'review-item').map((e) => [
      attr(e.attrs, 'data-id'),
      attr(e.attrs, 'data-state'),
      attr(e.attrs, 'width'),
      attr(e.attrs, 'height'),
    ]);
    expect(drawn).toEqual([
      ['cabinet-1', 'accepted', '24', '24'],
      ['cabinet-2', 'selected', '30', '12'],
    ]);
  });

  it('One by one starts on B24 and shows both views agreeing', () => {
    const html = render(<ReadyBody review={review()} initialMode="one_by_one" />);
    expect(textOf(elements(html, 'import-review-cabinet-size')[0].inner)).toBe('24 × 24 × 34 1/2');
    expect(elements(html, 'import-review-cabinet-check').map((c) => textOf(c.inner))).toEqual([
      'Plan agrees with B24',
      'Elevation agrees with B24',
    ]);
  });
});
