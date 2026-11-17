// EZD-307 (AC-EZD-307-1 counts; S02 Layout, Controls, Data shown; board S02 text): the review body rendered in the
// real office catalog. Items are hand-written from fixtures/synthetic/room-12x10-unjoined.dxf.expected.json (four
// walls, the east wall 118 in with one joined end; a door and a window of 36 in; one closed 120 SF room) with the
// confidences of EZD-302's scoring (east wall 70, the other walls 95, openings and room 90) and the cutoff 80
// (vault/build/assumptions.md EZD-307). The polling, selection and Show 3D mesh toggle are browser behaviour,
// tested in app/e2e/import-review.spec.ts.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import type { ReviewItem } from '../../lib/imports/review';
import { ImportReview, ReadyBody, type ImportReviewData } from './ImportReview';

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
  {
    id: 'n1',
    type: 'opening',
    kind: 'window',
    number: 1,
    confidence: 90,
    hostWallId: 'w1',
    width: 36,
    center: { x: 102, y: 0 },
  },
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

const review = (over: Partial<ImportReviewData> = {}): ImportReviewData => ({
  jobId: 'j',
  projectId: 'p',
  projectName: 'Family room',
  status: 'ready',
  files: [
    { name: 'family-room.dxf', kind: 'polycam_dxf' },
    { name: 'mesh.glb', kind: 'polycam_glb' },
  ],
  failedFile: null,
  items: ITEMS,
  meshUrl: 'https://storage.example.test/mesh.glb',
  cutoff: 80,
  ...over,
});

const one = (html: string, id: string) => {
  const found = elements(html, id);
  expect(found, id).toHaveLength(1);
  return found[0];
};

describe('EZD-307 Import review screen', () => {
  it('AC-EZD-307-1: shows the summary counts and the Accepted counts', () => {
    const html = render(<ReadyBody review={review()} />);
    expect(textOf(one(html, 'import-review-summary').inner)).toBe(
      '7 found · 6 high confidence · 1 to check',
    );
    // Nothing is accepted until Accept N (EZD-308); the e2e spec clicks it and sees 3 · 1 · 1 · 1.
    expect(textOf(one(html, 'import-review-accepted').inner)).toBe(
      'Accepted0 walls · 0 windows · 0 doors0 rooms · 0 fixtures + cabinets',
    );
  });

  it('lists the To check item with its confidence and selects it in the inspector', () => {
    const html = render(<ReadyBody review={review()} />);
    const rows = elements(html, 'import-review-row');
    expect(rows).toHaveLength(1);
    expect(textOf(rows[0].inner)).toBe('East wall70%');
    expect(attr(rows[0].attrs, 'aria-pressed')).toBe('true');
    const inspector = textOf(one(html, 'import-review-inspector').inner);
    expect(inspector).toContain('East wall');
    expect(inspector).toContain('Wall · existing · 70% confidence');
    // 118 in (the fixture's east wall) as 9' 10"; the markup escapes the quote marks.
    expect(textOf(one(html, 'import-review-scan').inner)).toBe('9&#x27; 10&quot;');
    expect(inspector).toContain('Tolerance 1/2&quot; · shared with field measurements');
  });

  it('draws every item on the canvas by status: accepted, to check, selected', () => {
    const html = render(<ReadyBody review={review()} />);
    const drawn = elements(html, 'review-item').map((e) => [
      attr(e.attrs, 'data-id'),
      attr(e.attrs, 'data-state'),
    ]);
    expect(new Map(drawn as [string, string][])).toEqual(
      new Map([
        ['r1', 'accepted'],
        ['w1', 'accepted'],
        ['w2', 'selected'],
        ['w3', 'accepted'],
        ['w4', 'accepted'],
        ['d1', 'accepted'],
        ['n1', 'accepted'],
      ]),
    );
    expect(textOf(one(html, 'review-legend').inner)).toBe('AcceptedTo checkSelectedScan');
  });

  it('AC-EZD-307-2: offers Show 3D mesh, off at first, only when a GLB was uploaded', () => {
    const html = render(<ReadyBody review={review()} />);
    const toggle = one(html, 'review-mesh-toggle');
    expect(attr(toggle.attrs, 'aria-label')).toBe('Show 3D mesh');
    expect(attr(toggle.attrs, 'aria-pressed')).toBe('false');
    expect(attr(one(html, 'review-mesh').attrs, 'data-mesh')).toBe('off');
    const noGlb = render(
      <ReadyBody review={review({ meshUrl: null, files: review().files.slice(0, 1) })} />,
    );
    expect(elements(noGlb, 'review-mesh-toggle')).toHaveLength(0);
    expect(elements(noGlb, 'review-mesh')).toHaveLength(0);
  });

  it('shows the status bar as board S02 does', () => {
    const html = render(<ReadyBody review={review()} />);
    expect(html).toContain('Polycam Space · DXF + GLB');
    expect(html).toContain('±1/2&quot;');
    expect(html).toContain('type or laser (keyboard mode)');
    expect(textOf(one(html, 'import-review-zoom').inner)).toBe('100%');
  });

  it('shows the header steps and disabled Cancel import and Finish import while loading', () => {
    const html = render(<ImportReview projectId="p" jobId="j" />);
    expect(html).toContain('data-step="upload" data-state="done"');
    expect(html).toContain('data-step="review" data-state="current"');
    expect(html).toContain('data-step="finish" data-state="pending"');
    const cancel = one(html, 'import-review-cancel');
    const finish = one(html, 'import-review-finish');
    expect(textOf(cancel.inner)).toBe('Cancel import');
    expect(textOf(finish.inner)).toBe('Finish import');
    expect(cancel.attrs).toContain('disabled');
    expect(finish.attrs).toContain('disabled');
    expect(textOf(one(html, 'import-review-message').inner)).toBe('Detecting items…');
  });

  it('shows the empty message when nothing was detected', () => {
    const html = render(<ReadyBody review={review({ items: [] })} />);
    expect(textOf(one(html, 'import-review-message').inner)).toBe(
      'Nothing detected. Trace over the underlay in the Plan editor',
    );
  });
});

// EZD-308 (AC-EZD-308-1; S02 Controls Mode, Accept N "Label shows count"; board S02 "One by one", "Accept + fix",
// "By room", "Accept 36"). Same items: with the cutoff 80 six are high confidence (the 95 walls and the 90 door,
// window and room); with a company cutoff of 91 only the three 95 walls are. Clicks are in app/e2e.
describe('EZD-308 review modes', () => {
  it('shows the three modes with Accept + fix chosen, as on board S02', () => {
    const html = render(<ReadyBody review={review()} />);
    const modes = elements(html, 'import-review-mode');
    expect(modes.map((m) => textOf(m.inner))).toEqual(['One by one', 'Accept + fix', 'By room']);
    expect(modes.map((m) => attr(m.attrs, 'aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('AC-EZD-308-1: Accept N counts only the items at or above the company cutoff', () => {
    const at80 = one(render(<ReadyBody review={review()} />), 'import-review-accept-n');
    expect(textOf(at80.inner)).toBe('Accept 6');
    const at91 = one(
      render(<ReadyBody review={review({ cutoff: 91 })} />),
      'import-review-accept-n',
    );
    expect(textOf(at91.inner)).toBe('Accept 3');
    // With 91 the door, window and room (90) go to To check with the east wall (70).
    const html = render(<ReadyBody review={review({ cutoff: 91 })} />);
    expect(elements(html, 'import-review-row').map((r) => attr(r.attrs, 'data-id'))).toEqual([
      'd1',
      'n1',
      'r1',
      'w2',
    ]);
  });

  it('One by one lists every item in order with Previous, Next, Accept and Reject', () => {
    const html = render(<ReadyBody review={review()} initialMode="one_by_one" />);
    expect(elements(html, 'import-review-row').map((r) => attr(r.attrs, 'data-id'))).toEqual([
      'w1',
      'w2',
      'w3',
      'w4',
      'd1',
      'n1',
      'r1',
    ]);
    expect(textOf(one(html, 'import-review-position').inner)).toBe('1 of 7');
    expect(one(html, 'import-review-previous').attrs).toContain('disabled');
    expect(one(html, 'import-review-next').attrs).not.toContain('disabled');
    expect(textOf(one(html, 'import-review-accept').inner)).toBe('Accept');
    expect(textOf(one(html, 'import-review-reject').inner)).toBe('Reject');
    expect(textOf(one(html, 'import-review-inspector').inner)).toContain('South wall');
  });

  it('By room groups the items under their room with Accept room', () => {
    const html = render(<ReadyBody review={review()} initialMode="by_room" />);
    const room = one(html, 'import-review-room');
    expect(attr(room.attrs, 'data-room')).toBe('r1');
    expect(textOf(room.inner)).toContain('Room 1');
    expect(textOf(one(html, 'import-review-accept-room').inner)).toBe('Accept room');
    expect(elements(html, 'import-review-row')).toHaveLength(7);
  });
});

// EZD-309 (AC-EZD-309-2 "reloading mid-review restores accepted and fixed items"; S02 Controls Fix selected,
// Delete; board S02 footer "Fix selected", "Delete"): the body starts from what the import saved. The east wall
// (70%, 118 in) saved as fixed to 120 in: its north end moved from (144, 118) to (144, 120). Fixing accepts it, so
// nothing is left to check; the door saved as deleted is not drawn and not counted.
describe('EZD-309 saved review state and Fix selected / Delete', () => {
  const saved = review({
    decisions: { w1: 'accepted', w2: 'accepted', d1: 'rejected' },
    fixes: { w2: { geometry: { start: { x: 144, y: 120 }, end: { x: 144, y: 0 } } } },
    mode: 'by_room',
  });

  it('AC-EZD-309-2: restores the saved mode, decisions and fixes', () => {
    const html = render(<ReadyBody review={saved} />);
    expect(attr(one(html, 'import-review-modes').attrs, 'data-mode')).toBe('by_room');
    expect(textOf(one(html, 'import-review-summary').inner)).toBe(
      '7 found · 6 high confidence · 0 to check',
    );
    expect(textOf(one(html, 'import-review-accepted').inner)).toBe(
      'Accepted2 walls · 0 windows · 0 doors0 rooms · 0 fixtures + cabinets',
    );
    const drawn = elements(html, 'review-item');
    const east = drawn.find((d) => attr(d.attrs, 'data-id') === 'w2');
    expect(east && attr(east.attrs, 'y1')).toBe('120');
    expect(east && attr(east.attrs, 'data-decision')).toBe('accepted');
    expect(drawn.some((d) => attr(d.attrs, 'data-id') === 'd1')).toBe(false);
    const rows = elements(html, 'import-review-row');
    const door = rows.find((r) => attr(r.attrs, 'data-id') === 'd1');
    expect(door && attr(door.attrs, 'data-decision')).toBe('rejected');
  });

  it('the inspector says Fixed for a fixed item and the scan value stays the scan’s', () => {
    // Every item resolved, so One by one starts at the first item, the south wall, saved as fixed from 144 in to
    // 150 in (its west end moved from (0, 0) to (-6, 0)).
    const all = Object.fromEntries(ITEMS.map((i) => [i.id, 'accepted' as const]));
    const html = render(
      <ReadyBody
        review={review({
          decisions: all,
          fixes: { w1: { geometry: { start: { x: 144, y: 0 }, end: { x: -6, y: 0 } } } },
          mode: 'one_by_one',
        })}
      />,
    );
    const inspector = textOf(one(html, 'import-review-inspector').inner);
    expect(inspector).toContain('South wall');
    expect(textOf(one(html, 'import-review-decision').inner)).toBe('Fixed');
    // Scan reads the detected 144 in, 12' 0" (the markup escapes the quote marks).
    expect(textOf(one(html, 'import-review-scan').inner)).toBe('12&#x27; 0&quot;');
    const south = elements(html, 'review-item').find((d) => attr(d.attrs, 'data-id') === 'w1');
    expect(south && attr(south.attrs, 'x2')).toBe('-6');
  });

  it('shows Fix selected and Delete in the left footer, enabled with a selection', () => {
    const html = render(<ReadyBody review={review()} />);
    const fix = one(html, 'import-review-fix');
    const del = one(html, 'import-review-delete');
    expect(textOf(fix.inner)).toBe('Fix selected');
    expect(textOf(del.inner)).toBe('Delete');
    expect(fix.attrs).not.toContain('disabled');
    expect(attr(fix.attrs, 'aria-pressed')).toBe('false');
    expect(del.attrs).not.toContain('disabled');
    // Nothing selected (nothing left to check): both wait for a selection.
    const none = render(<ReadyBody review={saved} />);
    expect(one(none, 'import-review-fix').attrs).toContain('disabled');
    expect(one(none, 'import-review-delete').attrs).toContain('disabled');
  });
});
