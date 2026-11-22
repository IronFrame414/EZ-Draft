// EZD-417 (AC-EZD-417-1 "An offered total equals rate × exposed LF"; S04b Controls "Edit offered edges | Choose which
// profiles the client sees and enter the price difference per lf; the client sees the total"; S04b Decisions "The full
// library (eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom) is available there"; S04b
// Permissions "See sell prices: price differences"). Markup through renderToStaticMarkup (L-020). Hand counts on the
// board's island (C 76 1/2 × 37 1/2, all sides exposed, 228" = 19 LF): $12/lf → $228.00; $18.50/lf → $351.50.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { createModelStore } from '../../editor/model/model-store';
import { modelObjects } from '../../editor/cabinets/cabinet-view';
import { boardPiecesModel, CT_FLOOR, ctId } from '../../editor/countertops/test-fixture';
import { countertopPieces } from '../../editor/countertops/trace-tool';
import type { EdgeOffer, EdgeProfile } from '../../editor/countertops/edge-profile';
import { EditOfferedEdges, parseRate } from './EditOfferedEdges';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

const NAMES = ['Eased', 'Bevel', 'Half bullnose', 'Full bullnose', 'Ogee', 'Mitered apron', 'Custom'];
const KEYS = ['eased', 'bevel', 'half_bullnose', 'full_bullnose', 'ogee', 'mitered_apron', 'custom'];
const pid = (i: number) => `f0000000-0000-4000-8000-00000000000${i + 1}`;
const PROFILES: EdgeProfile[] = KEYS.map((key, i) => ({ id: pid(i), key, name: NAMES[i]!, sectionSvg: '<svg/>' }));
const ISLAND = ctId(303);
const OFFER: EdgeOffer = {
  id: 'b0000000-0000-4000-8000-000000000001',
  pieceId: ISLAND,
  status: 'open',
  choices: [
    { profileId: pid(0), ratePerLf: 0 },
    { profileId: pid(2), ratePerLf: 12 },
    { profileId: pid(4), ratePerLf: 18.5 },
  ],
};
const island = () =>
  countertopPieces(modelObjects(createModelStore({ objects: boardPiecesModel() }).getState().objects), CT_FLOOR).find(
    (p) => p.id === ISLAND,
  )!.data;

const view = (offer: EdgeOffer | null, canSeePrices: boolean) =>
  html(
    <EditOfferedEdges
      piece={island()}
      profiles={PROFILES}
      offer={offer}
      canSeePrices={canSeePrices}
      onSave={async () => {}}
      onClose={() => {}}
    />,
  );

const table = (s: string) =>
  elements(s, 'edit-offered-row').map((r) => ({
    key: attr(r.attrs, 'data-key'),
    on: /data-testid="edit-offered-tick"[^>]*checked=""|checked=""[^>]*data-testid="edit-offered-tick"/.test(r.inner),
    rate: elements(r.inner, 'edit-offered-rate').map((i) => attr(i.attrs, 'value'))[0] ?? null,
    total: elements(r.inner, 'edit-offered-total').map((i) => textOf(i.inner))[0] ?? null,
  }));

describe('EZD-417 Edit offered edges', () => {
  it('AC-EZD-417-1 lists the full library with the offered ticks, rates and totals for this top', () => {
    const s = view(OFFER, true);
    expect(attr(elements(s, 'edit-offered-edges')[0]!.attrs, 'aria-label')).toBe('Edit offered edges');
    expect(textOf(elements(s, 'edit-offered-exposed')[0]!.inner)).toBe('Exposed edge 19 lf');
    expect(table(s)).toEqual([
      { key: 'eased', on: true, rate: '0', total: 'Included' },
      { key: 'bevel', on: false, rate: '0', total: '' },
      { key: 'half_bullnose', on: true, rate: '12', total: '+$228.00' },
      { key: 'full_bullnose', on: false, rate: '0', total: '' },
      { key: 'ogee', on: true, rate: '18.5', total: '+$351.50' },
      { key: 'mitered_apron', on: false, rate: '0', total: '' },
      { key: 'custom', on: false, rate: '0', total: '' },
    ]);
    expect(s).toContain('>Per lf<');
    expect(s).toContain('>This top<');
  });

  it('a top with no offer starts with nothing ticked', () => {
    expect(table(view(null, true)).every((r) => !r.on)).toBe(true);
  });

  it('without See sell prices: ticks only, no price column, and a note that saved prices are kept', () => {
    const s = view({ ...OFFER, choices: OFFER.choices.map(({ profileId }) => ({ profileId })) }, false);
    expect(table(s).map((r) => [r.key, r.on, r.rate, r.total])).toEqual([
      ['eased', true, null, null],
      ['bevel', false, null, null],
      ['half_bullnose', true, null, null],
      ['full_bullnose', false, null, null],
      ['ogee', true, null, null],
      ['mitered_apron', false, null, null],
      ['custom', false, null, null],
    ]);
    expect(s).toContain('Prices show with See sell prices. Saved prices are kept.');
    expect(s).not.toContain('$');
  });

  it('reads a typed price per lf in dollars and cents', () => {
    expect(parseRate('12')).toBe(12);
    expect(parseRate('$12.50')).toBe(12.5);
    expect(parseRate(' 1,250 ')).toBe(1250);
    expect(parseRate('')).toBe(0);
    expect(parseRate('12.505')).toBeNull();
    expect(parseRate('-3')).toBeNull();
    expect(parseRate('abc')).toBeNull();
    expect(parseRate('100000')).toBeNull();
  });
});
