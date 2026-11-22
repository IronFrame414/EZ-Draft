// EZD-417 (AC-EZD-417-1 "An offered total equals rate × exposed LF"; S04b Controls "Edge profile card", "Offered
// profile rows | ... the price difference as a total for this top (price per lf × exposed edge length) | Price hidden
// without See sell prices", "Edit offered edges | ... | Requires Send to client; hidden otherwise", "Edge profile status
// pill"; S04b States "open (client choosing), chosen, or not offered"; R24 #33; board S04bCountertops inspector "Edge
// profile", "Exposed edges only", "Client choosing", "Open", "Offered to client", "Eased  Included"). Markup through
// renderToStaticMarkup (L-020). Hand counts on the board's island (test-fixture.ts boardPiecesModel, C 76 1/2 ×
// 37 1/2, all four sides exposed, 228" = 19 LF): half bullnose at $12/lf → +$228.00; ogee at $18.50/lf → +$351.50.
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
import { createCountertopSelectionStore } from '../../editor/countertops/selection-store';
import { edgeProfileChanges, type EdgeOffer, type EdgeProfile } from '../../editor/countertops/edge-profile';
import type { PermissionKey } from '../../lib/permissions/catalog';
import { EdgeProfileCard, EdgeProfilePill } from './EdgeProfileCard';
import { CountertopsInspector } from './TopSchedule';
import { CountertopsView } from './CountertopsView';

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
const PROFILES: EdgeProfile[] = KEYS.map((key, i) => ({
  id: pid(i),
  key,
  name: NAMES[i]!,
  sectionSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><path d="M0 10 H60 V30 H0 Z"/></svg>',
}));
const ISLAND = ctId(303);
const PROJECT = 'a0000000-0000-4000-8000-000000000001';
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
const NO_RATES: EdgeOffer = { ...OFFER, choices: OFFER.choices.map(({ profileId }) => ({ profileId })) };

const store = () => createModelStore({ objects: boardPiecesModel() });
const islandOf = (s = store()) =>
  countertopPieces(modelObjects(s.getState().objects), CT_FLOOR).find((p) => p.id === ISLAND)!.data;
const rows = (s: string) =>
  elements(s, 'edge-offered-row').map((r) => ({
    name: textOf(r.inner.replace(/<span[^>]*data-testid="edge-offered-price"[^>]*>.*?<\/span>/, '')),
    price: elements(r.inner, 'edge-offered-price').map((p) => textOf(p.inner))[0] ?? null,
  }));

describe('EZD-417 Edge profile card', () => {
  it('AC-EZD-417-1 open offer: client choosing, and each offered total is rate × 19 LF', () => {
    const s = html(
      <EdgeProfileCard piece={islandOf()} profiles={PROFILES} offer={OFFER} canEdit canSeePrices onPick={() => {}} />,
    );
    expect(s).toContain('>Edge profile</h3>');
    expect(s).toContain('Exposed edges only');
    expect(attr(elements(s, 'edge-profile-card')[0]!.attrs, 'data-state')).toBe('open');
    expect(textOf(elements(s, 'edge-profile-name')[0]!.inner)).toBe('Client choosing');
    expect(textOf(elements(s, 'edge-profile-state')[0]!.inner)).toBe('Open');
    expect(s).toContain('3 profiles offered');
    expect(s).toContain('Offered to client');
    expect(rows(s)).toEqual([
      { name: 'Eased', price: 'Included' },
      { name: 'Half bullnose', price: '+$228.00' },
      { name: 'Ogee', price: '+$351.50' },
    ]);
  });

  it('without See sell prices the offered rows show no price', () => {
    const s = html(
      <EdgeProfileCard
        piece={islandOf()}
        profiles={PROFILES}
        offer={NO_RATES}
        canEdit
        canSeePrices={false}
        onPick={() => {}}
      />,
    );
    expect(rows(s)).toEqual([
      { name: 'Eased', price: null },
      { name: 'Half bullnose', price: null },
      { name: 'Ogee', price: null },
    ]);
    expect(s).not.toContain('$');
    expect(s).not.toContain('Included');
  });

  it('not offered: the top’s own profile, picked from the full library with Edit model', () => {
    const st = store();
    const pieces = countertopPieces(modelObjects(st.getState().objects), CT_FLOOR);
    st.applyEdit(edgeProfileChanges(pieces, ISLAND, pid(3)));
    const s = html(
      <EdgeProfileCard piece={islandOf(st)} profiles={PROFILES} offer={null} canEdit canSeePrices onPick={() => {}} />,
    );
    expect(attr(elements(s, 'edge-profile-card')[0]!.attrs, 'data-state')).toBe('not_offered');
    expect(textOf(elements(s, 'edge-profile-name')[0]!.inner)).toBe('Full bullnose');
    expect(elements(s, 'edge-profile-state')).toHaveLength(0);
    expect(elements(s, 'edge-offered-row')).toHaveLength(0);
    const select = elements(s, 'edge-profile-select')[0]!;
    expect([...select.inner.matchAll(/<option[^>]*>(.*?)<\/option>/g)].map((m) => m[1])).toEqual(NAMES);
    expect(select.inner).toContain(`<option value="${pid(3)}" selected="">Full bullnose</option>`);
  });

  it('no picker without Edit model; a top with no profile reads "No profile set"', () => {
    const s = html(
      <EdgeProfileCard
        piece={islandOf()}
        profiles={PROFILES}
        offer={null}
        canEdit={false}
        canSeePrices
        onPick={() => {}}
      />,
    );
    expect(elements(s, 'edge-profile-select')).toHaveLength(0);
    expect(textOf(elements(s, 'edge-profile-name')[0]!.inner)).toBe('No profile set');
  });

  it('chosen: the profile on the top and the Chosen mark', () => {
    const st = store();
    st.applyEdit(edgeProfileChanges(countertopPieces(modelObjects(st.getState().objects), CT_FLOOR), ISLAND, pid(2)));
    const s = html(
      <EdgeProfileCard
        piece={islandOf(st)}
        profiles={PROFILES}
        offer={{ ...OFFER, status: 'chosen' }}
        canEdit={false}
        canSeePrices
        onPick={() => {}}
      />,
    );
    expect(textOf(elements(s, 'edge-profile-name')[0]!.inner)).toBe('Half bullnose');
    expect(textOf(elements(s, 'edge-profile-state')[0]!.inner)).toBe('Chosen');
  });

  it('the pill reads each state (board "Edge profile: client choosing")', () => {
    const text = (state: 'open' | 'chosen' | 'not_offered') =>
      textOf(elements(html(<EdgeProfilePill state={state} />), 'edge-profile-pill')[0]!.inner);
    expect(text('open')).toBe('Edge profile: client choosing');
    expect(text('chosen')).toBe('Edge profile: chosen');
    expect(text('not_offered')).toBe('Edge profile: not offered');
  });
});

describe('EZD-417 countertop inspector and canvas with edge profiles', () => {
  const inspector = (permissions: PermissionKey[], offers: EdgeOffer[] = [OFFER]) => {
    const selection = createCountertopSelectionStore();
    selection.getState().select(ISLAND, null);
    return html(
      <CountertopsInspector
        store={store()}
        selection={selection}
        projectId={PROJECT}
        profiles={PROFILES}
        offers={offers}
        permissions={permissions}
        loadCatalog={() => new Promise(() => {})}
        loadPermissions={() => new Promise(() => {})}
      />,
    );
  };

  it('Edit offered edges shows with Send to client only, beside Top schedule', () => {
    const withSend = inspector(['view_projects', 'send_to_client', 'see_sell_prices']);
    expect(textOf(elements(withSend, 'countertop-edit-offered')[0]!.inner)).toBe('Edit offered edges');
    expect(elements(withSend, 'countertop-top-schedule')).toHaveLength(1);
    expect(elements(inspector(['view_projects', 'edit_model', 'see_sell_prices']), 'countertop-edit-offered')).toEqual(
      [],
    );
  });

  it('the selected top’s card shows under the piece inspector with its offer', () => {
    const s = inspector(['view_projects', 'see_sell_prices']);
    expect(s.indexOf('data-testid="countertop-piece-inspector"')).toBeLessThan(
      s.indexOf('data-testid="edge-profile-card"'),
    );
    expect(rows(s).map((r) => r.price)).toEqual(['Included', '+$228.00', '+$351.50']);
  });

  it('the canvas pill reads client choosing while the top is offered', () => {
    const selection = createCountertopSelectionStore();
    selection.getState().select(ISLAND, null);
    const s = html(
      <CountertopsView store={store()} selection={selection} projectId={PROJECT} offers={[OFFER]} />,
    );
    const pill = elements(s, 'edge-profile-pill')[0]!;
    expect(attr(pill.attrs, 'data-state')).toBe('open');
    expect(textOf(pill.inner)).toBe('Edge profile: client choosing');
    const none = html(<CountertopsView store={store()} projectId={PROJECT} offers={[]} />);
    expect(attr(elements(none, 'edge-profile-pill')[0]!.attrs, 'data-state')).toBe('not_offered');
  });
});
