// EZD-416 (AC-EZD-416-1 "Footer totals match the pieces"; S04b Controls left panel; S04b Layout status bar; board
// S04bCountertops). Expected numbers are the board's and hand counts (test-fixture.ts boardPiecesModel; EZD-413's
// seam test for the traced L): the board's three tops read "3 pieces · 1 seam", "56.1 sq ft", "Exposed edge 36 lf",
// "Increment 1/2"". The traced L kitchen (A 144 × 25 1/2 = 3672 sq in, B 63 × 25 1/2 = 1606.5 sq in) reads 2 pieces,
// 0 seams, 5278.5 / 144 = 36.66 → 36.7 sq ft; a seam on A at x = 100 makes 3 pieces, 1 seam, the area unchanged.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { createModelStore, type ModelStore } from '../../editor/model/model-store';
import { modelObjects } from '../../editor/cabinets/cabinet-view';
import { createCountertopSelectionStore } from '../../editor/countertops/selection-store';
import { countertopSeamChanges } from '../../editor/countertops/seam-tool';
import { countertopTraceChanges, countertopTraceDefaults } from '../../editor/countertops/trace-tool';
import {
  boardPiecesModel,
  CT_FLOOR,
  ctId,
  twoRunModel,
} from '../../editor/countertops/test-fixture';
import type { CatalogItem } from '../../lib/catalog/catalog';
import { countertopMaterialChanges } from '../../editor/countertops/material';
import { countertopPieces } from '../../editor/countertops/trace-tool';
import { CountertopsPanel, type CountertopsPanelProps } from './CountertopsPanel';
import { CountertopsStatus } from './CountertopsStatus';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

const DEFAULTS = {
  overhang_standard: 1.5,
  overhang_seating_counter: 12,
  overhang_seating_bar: 10,
  overhang_against_wall: 0,
  countertop_increment: 0.5,
};

const panel = (store: ModelStore, more: Partial<CountertopsPanelProps> = {}) =>
  html(
    <CountertopsPanel
      store={store}
      selection={more.selection ?? createCountertopSelectionStore()}
      defaults={DEFAULTS}
      {...more}
    />,
  );
// Text with each element's words apart ("Standard 1 1/2"" rather than "Standard1 1/2"").
const words = (inner: string) => textOf(inner.replace(/></g, '> <')).replace(/\s+/g, ' ').trim();
const text = (s: string, id: string) => elements(s, id).map((e) => words(e.inner));
// Server markup reads a zustand store's first state, so each render takes a store made from the current objects.
const now = (store: ModelStore) => createModelStore({ objects: store.getState().objects });
const footer = (s: string) => [...text(s, 'countertop-panel-counts'), ...text(s, 'countertop-panel-area')];

function tracedL() {
  const store = createModelStore({ objects: twoRunModel() });
  let n = 100;
  const r = countertopTraceChanges(
    modelObjects(store.getState().objects),
    CT_FLOOR,
    countertopTraceDefaults(null),
    () => ctId(n++),
  );
  store.applyEdit(r.changes);
  return store;
}

describe('EZD-416 countertop left panel', () => {
  it('AC-EZD-416-1: the board tops show the footer "3 pieces · 1 seam" and "56.1 sq ft"', () => {
    const s = panel(createModelStore({ objects: boardPiecesModel() }));
    expect(footer(s)).toEqual(['3 pieces · 1 seam', '56.1 sq ft']);
  });

  it('AC-EZD-416-1: the footer follows the pieces: a traced L, then a seam on it', () => {
    const store = tracedL();
    expect(footer(panel(now(store)))).toEqual(['2 pieces · 0 seams', '36.7 sq ft']);
    let n = 200;
    const r = countertopSeamChanges(
      modelObjects(store.getState().objects),
      CT_FLOOR,
      { x: 100.2, y: 12 },
      0.5,
      () => ctId(n++),
    );
    store.applyEdit(r.changes);
    expect(footer(panel(now(store)))).toEqual(['3 pieces · 1 seam', '36.7 sq ft']);
  });

  it('AC-EZD-416-1: with no tops the footer reads 0 pieces, 0 seams, 0.0 sq ft', () => {
    const s = panel(createModelStore({ objects: twoRunModel() }));
    expect(footer(s)).toEqual(['0 pieces · 0 seams', '0.0 sq ft']);
  });

  it('lists the pieces with letter, name, size and the seating tag (board rows)', () => {
    const s = panel(createModelStore({ objects: boardPiecesModel() }));
    const rows = elements(s, 'countertop-panel-piece');
    expect(rows.map((r) => attr(r.attrs, 'data-label'))).toEqual(['A', 'B', 'C']);
    expect(rows.map((r) => words(r.inner))).toEqual([
      'A Back wall 141 1/2 × 25 1/2',
      'B Left return 63 × 25 1/2',
      'C Island 76 1/2 × 37 1/2 · seating',
    ]);
  });

  it('marks the piece selected in the shared selection', () => {
    const selection = createCountertopSelectionStore();
    selection.getState().select(ctId(303));
    const s = panel(createModelStore({ objects: boardPiecesModel() }), { selection });
    const rows = elements(s, 'countertop-panel-piece');
    expect(rows.map((r) => attr(r.attrs, 'aria-pressed'))).toEqual(['false', 'false', 'true']);
  });

  it('shows the material, backsplash and behind-range rows', () => {
    const s = panel(createModelStore({ objects: boardPiecesModel() }));
    expect(text(s, 'countertop-panel-material')).toEqual(['No material chosen · 3 cm']);
    expect(text(s, 'countertop-panel-backsplash')).toEqual(['Backsplash 4" · same']);
    expect(text(s, 'countertop-panel-behind-range')).toEqual(['Behind range Backsplash height']);
  });

  it('shows the Default overhangs from the Defaults (board rows)', () => {
    const s = panel(createModelStore({ objects: boardPiecesModel() }));
    expect(text(s, 'countertop-panel-overhang-overhang_standard')).toEqual(['Standard 1 1/2"']);
    expect(text(s, 'countertop-panel-overhang-overhang_seating_counter')).toEqual([
      'Seating, counter height 12"',
    ]);
    expect(text(s, 'countertop-panel-overhang-overhang_seating_bar')).toEqual(['Seating, bar 10"']);
    expect(text(s, 'countertop-panel-overhang-overhang_against_wall')).toEqual(['Against wall 0 + splash']);
  });

  it('shows "Change in company settings" only with Settings → Defaults', () => {
    const store = createModelStore({ objects: boardPiecesModel() });
    const yes = elements(panel(store, { canManageDefaults: true }), 'countertop-panel-settings');
    expect(yes.map((e) => [textOf(e.inner), attr(e.attrs, 'href')])).toEqual([
      ['Change in company settings', '/settings/defaults'],
    ]);
    expect(elements(panel(store), 'countertop-panel-settings')).toEqual([]);
  });

  it('the Edges tab lists every edge of each piece with type, overhang and length', () => {
    const s = panel(createModelStore({ objects: boardPiecesModel() }), { initialTab: 'edges' });
    const b = elements(s, 'countertop-panel-edge').filter((e) => attr(e.attrs, 'data-piece') === 'B');
    expect(b.map((e) => words(e.inner))).toEqual([
      'Side 1 Wall 0" 25 1/2"',
      'Side 2 Exposed 1 1/2" 63"',
      'Side 3 Exposed 1 1/2" 25 1/2"',
      'Side 4 Splash 0" 63"',
    ]);
    expect(elements(s, 'countertop-panel-edge')).toHaveLength(5 + 4 + 4);
  });

  it('the Material tab edits are off without Edit model and the lock', () => {
    const store = createModelStore({ objects: boardPiecesModel() });
    const off = panel(store, { initialTab: 'material' });
    expect(elements(off, 'countertop-panel-thickness').map((e) => attr(e.attrs, 'disabled'))).toEqual(['']);
    const on = panel(store, { initialTab: 'material', canEdit: true });
    expect(elements(on, 'countertop-panel-thickness').map((e) => attr(e.attrs, 'disabled'))).toEqual([null]);
  });
});

// EZD-416 (S04b Controls "Material swatch row ("Quartz · 3 cm") | Opens catalog picker (category counter)").
const QUARTZ: CatalogItem = {
  id: 'c0000000-0000-4000-8000-000000000001',
  category: 'countertops',
  subcategory: null,
  line: null,
  name: 'Quartz',
  brand: null,
  model: null,
  width: null,
  depth: null,
  height: null,
  finish: null,
};
const BASE: CatalogItem = { ...QUARTZ, id: 'c0000000-0000-4000-8000-000000000002', category: 'cabinets', name: 'Base cabinet' };

describe('EZD-416 countertop material', () => {
  const board = () => createModelStore({ objects: boardPiecesModel() });
  const tops = (store: ModelStore) => countertopPieces(modelObjects(store.getState().objects), CT_FLOOR);

  it('a pick sets the item on every top on the floor in one undo step', () => {
    const store = board();
    const changes = countertopMaterialChanges(tops(store), QUARTZ.id);
    expect(changes).toHaveLength(3);
    store.applyEdit(changes);
    expect(tops(store).map((p) => p.data.attributes.materialItemId)).toEqual([QUARTZ.id, QUARTZ.id, QUARTZ.id]);
    // The same pick again changes nothing.
    expect(countertopMaterialChanges(tops(store), QUARTZ.id.toUpperCase())).toEqual([]);
    store.undo();
    expect(tops(store).map((p) => p.data.attributes.materialItemId)).toEqual([null, null, null]);
  });

  it('shows the chosen item name with the thickness (board "Quartz · 3 cm")', () => {
    const store = board();
    store.applyEdit(countertopMaterialChanges(tops(store), QUARTZ.id));
    const s = panel(now(store), { catalog: [QUARTZ] });
    expect(text(s, 'countertop-panel-material')).toEqual(['Quartz · 3 cm']);
    const tab = panel(now(store), { catalog: [QUARTZ], initialTab: 'material' });
    expect(text(tab, 'countertop-panel-material-pick')).toEqual(['Quartz']);
  });

  it('the swatch row opens the picker only with Edit model, the lock and the catalog read', () => {
    const off = (s: string) => elements(s, 'countertop-panel-material').map((e) => attr(e.attrs, 'disabled'));
    expect(off(panel(board(), { catalog: [QUARTZ], canEdit: true }))).toEqual([null]);
    expect(off(panel(board(), { catalog: [QUARTZ] }))).toEqual(['']);
    expect(off(panel(board(), { catalog: null, canEdit: true }))).toEqual(['']);
  });

  it('the picker lists the countertop items only, on the Countertops category', () => {
    const s = panel(board(), { catalog: [QUARTZ, BASE], canEdit: true, initialPicking: true });
    expect(elements(s, 'countertop-panel-picker')).toHaveLength(1);
    expect(
      elements(s, 'catalog-category-countertops').map((e) => attr(e.attrs, 'aria-pressed')),
    ).toEqual(['true']);
    const items = elements(s, 'catalog-item');
    expect(items).toHaveLength(1);
    expect(words(items[0]!.inner)).toContain('Quartz');
    // Without Edit model the picker does not open.
    const view = panel(board(), { catalog: [QUARTZ], initialPicking: true });
    expect(elements(view, 'countertop-panel-picker')).toEqual([]);
  });
});

describe('EZD-416 countertop status bar', () => {
  it('AC-EZD-416-1: the board tops show Exposed edge 36 lf and Increment 1/2"', () => {
    const s = html(
      <CountertopsStatus store={createModelStore({ objects: boardPiecesModel() })} defaults={DEFAULTS} />,
    );
    expect(text(s, 'status-countertop-exposed')).toEqual(['36 lf']);
    expect(text(s, 'status-countertop-increment')).toEqual(['1/2"']);
  });
});
