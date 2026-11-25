// EZD-127 L1 (04 Header card: the pill "Opens a review list: renders needing approval, unreviewed translations,
// field conflicts, field measurements, client comments, open code warnings, orphan flags"). Each source's line uses
// the 04 row's words; lines follow the row's order with their counts. Renders in the real office catalog.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import { REVIEW_SOURCES } from '../../lib/review/sources';
import { catalogFor } from '../../server/messages/catalog';
import { ReviewListPanel, type ReviewListState } from './ReviewList';

const render = (state: ReviewListState) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <ReviewListPanel state={state} id="rl1" onRetry={() => {}} />
    </MessagesProvider>,
  );

describe('EZD-127 ReviewList', () => {
  it('L1 lists each source with open items, in the 04 order, with its count', () => {
    const html = render({
      kind: 'ready',
      groups: REVIEW_SOURCES.map((source, i) => ({ source, count: i + 1 })),
    });
    const panel = elements(html, 'review-list')[0];
    expect(attr(panel.attrs, 'role')).toBe('dialog');
    expect(attr(panel.attrs, 'aria-label')).toBe('To review');
    const rows = elements(html, 'review-group');
    expect(rows.map((r) => textOf(r.inner))).toEqual([
      'Renders needing approval1',
      'Unreviewed translations2',
      'Field conflicts3',
      'Field measurements4',
      'Client comments5',
      'Open code warnings6',
      'Orphan flags7',
    ]);
    expect(rows.map((r) => attr(r.attrs, 'data-source'))).toEqual([...REVIEW_SOURCES]);
  });

  it('L2 shows loading, a failure with Retry, and the empty line', () => {
    expect(textOf(elements(render({ kind: 'loading' }), 'review-list')[0].inner)).toBe(
      'To reviewLoading…',
    );
    expect(textOf(elements(render({ kind: 'failed' }), 'review-list')[0].inner)).toBe(
      'To reviewCouldn&#x27;t load the review list. Try again.Retry',
    );
    expect(textOf(elements(render({ kind: 'ready', groups: [] }), 'review-list')[0].inner)).toBe(
      'To reviewNothing to review',
    );
  });

  // EZD-1418 (S02 Entry points "rooms sent from the phone"): the field measurements line opens Import review.
  it('a line with a page is a link to it; the others stay plain text', () => {
    const html = render({
      kind: 'ready',
      groups: [
        { source: 'field_conflict', count: 2 },
        { source: 'field_measure', count: 1, href: '/projects/p1/import/j1' },
      ],
    });
    const links = elements(html, 'review-group-link');
    expect(links).toHaveLength(1);
    expect(attr(links[0].attrs, 'href')).toBe('/projects/p1/import/j1');
    expect(textOf(links[0].inner)).toBe('Field measurements');
  });
});
