// EZD-310 (AC-EZD-310-1 "A typed value beyond tolerance lists every conflict it creates"; S02 Typed or laser input,
// Conflict list, Validation; board S02 inspector wording). The review body rendered in the real office catalog.
// Fixture: the 12' x 10' room of ImportReview.test.tsx (east wall scanned 118 in, drawn north to south; room corners
// SW, SE, NE, NW) plus Window W2 on the west wall. The east wall typed 9' 11" (119 in, 1 in over the scan) is
// worked by hand with the walk rule (vault/build/assumptions.md EZD-310): the walk S, E, N, W from the SW corner
// ends 1 in north of it, so a 1" gap at the southwest corner; W2 on the west wall moves 1 in along it; the south
// wall's door and window come before the change and do not move.
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
): ReviewItem => ({
  id,
  type: 'wall',
  number: n,
  side,
  confidence: c,
  geometry: { start: { x: s[0], y: s[1] }, end: { x: e[0], y: e[1] } },
  thickness: 4.5,
});
const win = (id: string, n: number, host: string, x: number, y: number): ReviewItem => ({
  id,
  type: 'opening',
  kind: 'window',
  number: n,
  confidence: 90,
  hostWallId: host,
  width: 36,
  center: { x, y },
});

const ITEMS: ReviewItem[] = [
  w('w1', 1, 'south', 95, [144, 0], [0, 0]),
  w('w2', 2, 'east', 70, [144, 118], [144, 0]),
  w('w3', 3, 'north', 95, [0, 120], [144, 120]),
  w('w4', 4, 'west', 95, [0, 0], [0, 120]),
  {
    id: 'd1',
    type: 'opening',
    kind: 'door',
    number: 1,
    confidence: 90,
    hostWallId: 'w1',
    width: 36,
    center: { x: 30, y: 0 },
  },
  win('n1', 1, 'w1', 102, 0),
  win('n2', 2, 'w4', 0, 60),
  {
    id: 'r1',
    type: 'room',
    number: 1,
    confidence: 90,
    boundary: [
      { x: 0, y: 0 },
      { x: 144, y: 0 },
      { x: 144, y: 120 },
      { x: 0, y: 120 },
    ],
    closed: true,
    areaSqIn: 17280,
  },
];

// The east wall typed 119 in: its start (144, 118) stays, its end moves along the wall to (144, -1).
const TYPED_EAST = { geometry: { start: { x: 144, y: 118 }, end: { x: 144, y: -1 } }, typed: 119 };

const review = (over: Partial<ImportReviewData> = {}): ImportReviewData => ({
  jobId: '00000000-0000-4000-8000-0000000000aa',
  projectId: '00000000-0000-4000-8000-0000000000bb',
  projectName: 'Family room',
  status: 'ready',
  files: [{ name: 'family-room.dxf', kind: 'polycam_dxf' }],
  failedFile: null,
  items: ITEMS,
  meshUrl: null,
  cutoff: 80,
  decisions: { w2: 'accepted' },
  fixes: { w2: TYPED_EAST },
  mode: 'one_by_one',
  ...over,
});

// One by one starts at the first unresolved item; with every item but the east wall resolved it is the east wall.
const others = Object.fromEntries(
  ITEMS.filter((i) => i.id !== 'w2').map((i) => [i.id, 'accepted' as const]),
);
const selectingEast = (over: Partial<ImportReviewData> = {}) =>
  review({ decisions: { ...others, w2: undefined as never }, ...over });

describe('EZD-310 typed vs scan conflicts', () => {
  it('AC-EZD-310-1: the typed east wall lists every conflict it creates, error first, with the board wording', () => {
    const html = render(<ReadyBody review={selectingEast()} />);
    const inspector = textOf(elements(html, 'import-review-inspector')[0].inner);
    expect(inspector).toContain('East wall');
    expect(textOf(elements(html, 'import-review-conflict-pill')[0].inner)).toBe('Conflict');
    expect(attr(elements(html, 'import-review-typed')[0].attrs, 'value')).toBe('9&#x27; 11&quot;');
    expect(textOf(elements(html, 'import-review-scan')[0].inner)).toBe('9&#x27; 10&quot;');
    expect(textOf(elements(html, 'import-review-conflicts')[0].inner)).toContain(
      'Typed wins. This creates',
    );
    const lines = elements(html, 'import-review-conflict');
    expect(lines.map((l) => textOf(l.inner))).toEqual([
      'Room no longer closes: 1&quot; gap at the southwest corner',
      'Window W2 offset from corner changes by 1&quot;',
    ]);
    expect(lines.map((l) => attr(l.attrs, 'data-severity'))).toEqual(['error', 'warning']);
    // The canvas shows the red gap marker with its size.
    const gap = elements(html, 'review-gap');
    expect(gap).toHaveLength(1);
    expect(textOf(gap[0].inner)).toBe('1&quot; gap');
  });

  it('within the tolerance the typed value still overrides, but nothing is listed', () => {
    const html = render(
      <ReadyBody
        review={selectingEast({
          fixes: { w2: { ...TYPED_EAST, geometry: { ...TYPED_EAST.geometry, end: { x: 144, y: -0.5 } }, typed: 118.5 } },
        })}
      />,
    );
    expect(attr(elements(html, 'import-review-typed')[0].attrs, 'value')).toBe('9&#x27; 10 1/2&quot;');
    expect(elements(html, 'import-review-conflict-pill')).toHaveLength(0);
    expect(elements(html, 'import-review-conflicts')).toHaveLength(0);
    expect(elements(html, 'review-gap')).toHaveLength(0);
  });

  it('the company tolerance from Defaults decides, and the footer shows it', () => {
    const html = render(<ReadyBody review={selectingEast({ tolerance: 2 })} />);
    expect(elements(html, 'import-review-conflicts')).toHaveLength(0);
    expect(textOf(elements(html, 'import-review-tolerance')[0].inner)).toBe(
      'Tolerance 2&quot; · shared with field measurements',
    );
    const fallback = render(<ReadyBody review={selectingEast()} />);
    expect(textOf(elements(fallback, 'import-review-tolerance')[0].inner)).toBe(
      'Tolerance 1/2&quot; · shared with field measurements',
    );
  });

  it('an untyped wall shows an empty typed field and no conflicts; a room shows its scan only', () => {
    const html = render(<ReadyBody review={selectingEast({ fixes: {} })} />);
    expect(attr(elements(html, 'import-review-typed')[0].attrs, 'value')).toBe('');
    expect(elements(html, 'import-review-conflict')).toHaveLength(0);
  });
});
