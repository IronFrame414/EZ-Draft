// EZD-314 (S02 States Locked / view-only "all edit controls disabled", Permission-denied "read-only"; Validation
// "Bearing walls detected or marked: flagged"; AC-EZD-314-3, -4, -6): the review body in a read-only review, and a
// wall the import read as bearing. Items are EZD-307's hand-written room (four walls of a 144 x 120 in room; the
// east wall 70, the others 95; cutoff 80), with the south wall read as bearing. The page states (detecting count,
// failed with Retry, lock banner, read-only note, the card's Importing) are browser tests in
// app/e2e/import-states.spec.ts.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import type { ReviewItem } from '../../lib/imports/review';
import { ReadyBody, type ImportReviewData } from './ImportReview';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );

const w = (
  id: string,
  n: number,
  side: 'north' | 'east' | 'south' | 'west',
  c: number,
  s: [number, number],
  e: [number, number],
  bearing?: boolean,
): ReviewItem => ({
  id,
  type: 'wall',
  number: n,
  side,
  confidence: c,
  geometry: { start: { x: s[0], y: s[1] }, end: { x: e[0], y: e[1] } },
  thickness: 4.5,
  ...(bearing === undefined ? {} : { bearing }),
});

const ITEMS: ReviewItem[] = [
  w('w1', 1, 'south', 95, [144, 0], [0, 0], true),
  w('w2', 2, 'east', 70, [144, 118], [144, 0]),
  w('w3', 3, 'north', 95, [0, 120], [144, 120], false),
  w('w4', 4, 'west', 95, [0, 0], [0, 120]),
];

const review = (over: Partial<ImportReviewData> = {}): ImportReviewData => ({
  jobId: 'j',
  projectId: 'p',
  projectName: 'Family room',
  status: 'ready',
  files: [{ name: 'family-room.dxf', kind: 'polycam_dxf' }],
  failedFile: null,
  items: ITEMS,
  meshUrl: null,
  cutoff: 80,
  ...over,
});

const one = (html: string, id: string) => {
  const found = elements(html, id);
  expect(found, id).toHaveLength(1);
  return found[0];
};
const disabled = (html: string, id: string) => attr(one(html, id).attrs, 'disabled') !== null;

describe('EZD-314 read-only review', () => {
  it('AC-EZD-314-3, -4: a read-only review disables Accept N, Fix and Delete', () => {
    const html = render(<ReadyBody review={review()} initialMode="accept_fix" readOnly />);
    // The east wall (70) is selected as the first item to check; three 95 walls are pending Accept N.
    expect(disabled(html, 'import-review-accept-n')).toBe(true);
    expect(disabled(html, 'import-review-fix')).toBe(true);
    expect(disabled(html, 'import-review-delete')).toBe(true);
  });

  it('the same review with Edit model and no lock leaves them enabled', () => {
    const html = render(<ReadyBody review={review()} initialMode="accept_fix" />);
    expect(disabled(html, 'import-review-accept-n')).toBe(false);
    expect(disabled(html, 'import-review-fix')).toBe(false);
    expect(disabled(html, 'import-review-delete')).toBe(false);
  });

  it('AC-EZD-314-3, -4: One by one Accept and Reject this item are disabled when read-only', () => {
    const html = render(<ReadyBody review={review()} initialMode="one_by_one" readOnly />);
    expect(disabled(html, 'import-review-accept')).toBe(true);
    expect(disabled(html, 'import-review-reject')).toBe(true);
  });

  it('AC-EZD-314-3, -4: By room Accept room is disabled when read-only', () => {
    const html = render(<ReadyBody review={review()} initialMode="by_room" readOnly />);
    for (const b of elements(html, 'import-review-accept-room')) {
      expect(attr(b.attrs, 'disabled')).not.toBeNull();
    }
  });
});

describe('EZD-314 bearing walls flagged', () => {
  it('AC-EZD-314-6: only the wall read as bearing carries the Bearing flag in its row', () => {
    const html = render(<ReadyBody review={review()} initialMode="one_by_one" />);
    const rows = elements(html, 'import-review-row');
    expect(rows.map((r) => attr(r.attrs, 'data-id'))).toEqual(['w1', 'w2', 'w3', 'w4']);
    const flagged = rows.filter((r) => elements(r.inner, 'import-review-row-bearing').length > 0);
    expect(flagged.map((r) => attr(r.attrs, 'data-id'))).toEqual(['w1']);
    expect(textOf(one(html, 'import-review-row-bearing').inner)).toBe('Bearing');
  });

  it('AC-EZD-314-6: the inspector of the selected bearing wall shows the flag', () => {
    // One by one selects the first unresolved item, the south wall w1.
    const html = render(<ReadyBody review={review()} initialMode="one_by_one" />);
    expect(textOf(one(html, 'import-review-inspector-bearing').inner)).toBe('Bearing');
  });

  it('a wall not read as bearing shows no flag in the inspector', () => {
    // Accept + fix selects the first item to check, the east wall w2 (70).
    const html = render(<ReadyBody review={review()} initialMode="accept_fix" />);
    expect(elements(html, 'import-review-inspector-bearing')).toHaveLength(0);
  });
});

describe('EZD-314 empty review', () => {
  it('Nothing detected offers a button that opens the Plan editor of the project', () => {
    const html = render(<ReadyBody review={review({ items: [] })} />);
    expect(textOf(one(html, 'import-review-message').inner)).toBe(
      'Nothing detected. Trace over the underlay in the Plan editor',
    );
    const open = one(html, 'import-review-open-plan-editor');
    expect(open.tag).toBe('a');
    expect(attr(open.attrs, 'href')).toBe('/projects/p');
    expect(textOf(open.inner)).toBe('Open the Plan editor');
  });
});
