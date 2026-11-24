// EZD-1418 (S02 Layout "Status bar: source, scan accuracy"; S02 Entry points "rooms sent from the phone (17b Field
// measure, source kind field_measure)"): a review of rooms sent from the phone names its source Field measure and,
// as nothing was scanned, shows the lengths as typed on site in place of the scan's accuracy (wording for Josh,
// vault/build/assumptions.md EZD-1418). The L room's items are lib/imports/field-measure-items.ts's.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { textOf } from '../../../test-harness/projects-markup';
import { emptyRoom, initialRooms, withShape } from '../../field-measure/rooms';
import { fieldMeasureItems } from '../../lib/imports/field-measure-items';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ReadyBody, type ImportReviewData } from './ImportReview';

const items = fieldMeasureItems([
  initialRooms()[0]!,
  {
    ...withShape(emptyRoom('r1', 'room', 'Kitchen'), 'l'),
    lengths: [180, 120, 96, 96, 84, 216],
  },
]);

const review = (files: ImportReviewData['files']): ImportReviewData => ({
  jobId: 'j',
  projectId: 'p',
  projectName: 'Kitchen remodel',
  status: 'ready',
  files,
  failedFile: null,
  items,
  meshUrl: null,
  cutoff: 80,
});

const render = (data: ImportReviewData) =>
  textOf(
    renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <ReadyBody review={data} initialMode="accept_fix" />
      </MessagesProvider>,
    ),
  );

describe('EZD-1418 Import review of rooms sent from the phone', () => {
  it('shows the source as Field measure, typed on site, and offers Accept 7', () => {
    const text = render(review([{ name: 'Field measure', kind: 'field_measure' }]));
    expect(text).toContain('Field measure');
    expect(text).toContain('Typed on site');
    expect(text).not.toContain('±1/2');
    expect(text).toContain('Accept 7');
  });

  it('a scan keeps its accuracy', () => {
    const text = render(review([{ name: 'room.dxf', kind: 'polycam_dxf' }]));
    expect(text).toContain('±1/2');
    expect(text).not.toContain('Typed on site');
  });
});
