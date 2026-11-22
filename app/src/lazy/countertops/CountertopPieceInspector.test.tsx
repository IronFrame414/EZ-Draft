// EZD-414 (AC-EZD-414-1 "The Seating preset sets 12" and labels the side "seating""; S04b Controls "Overhang inputs
// Front / Left / Right / Back | ... Active side has blue border; label shows "seating" when seating overhang", "Preset
// chip ..."; board S04bCountertops inspector "Island top", "Piece C · Quartz 3 cm · 19.9 sq ft", "Back · seating 12"",
// "Cabinets 73 1/2 × 24", chips "Flush 0", "Standard 1 1/2", "Bar 10", "Seating 12", "Wall + splash"). Markup through
// renderToStaticMarkup (L-020). Hand counts (test-fixture.ts islandModel): cabinets 73 1/2 × 24 under a 76 1/2 × 27
// top; the back at 12" makes it 76 1/2 × 37 1/2 = 2868.75 sq in = 19.92 → "19.9 sq ft" (board), 3 cm.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { createModelStore } from '../../editor/model/model-store';
import { modelObjects } from '../../editor/cabinets/cabinet-view';
import { CT_FLOOR, CT_ISLAND, islandModel } from '../../editor/countertops/test-fixture';
import { countertopPieces } from '../../editor/countertops/trace-tool';
import { createCountertopSelectionStore } from '../../editor/countertops/selection-store';
import { countertopPresetChanges, countertopPresetValues } from '../../editor/countertops/overhang-tool';
import { CountertopPieceInspector } from './CountertopPieceInspector';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

function setup(edge: number | null) {
  const store = createModelStore({ objects: islandModel() });
  const selection = createCountertopSelectionStore();
  selection.getState().select(CT_ISLAND, edge);
  const pieces = () => countertopPieces(modelObjects(store.getState().objects), CT_FLOOR);
  return { store, selection, pieces };
}

const sides = (s: string) =>
  elements(s, 'countertop-side').map((e) => ({
    side: attr(e.attrs, 'data-side'),
    active: attr(e.attrs, 'data-active'),
    label: textOf(elements(e.inner, 'countertop-side-label')[0]!.inner),
  }));
// The typed field's value as shown (the inch mark escaped in the raw markup).
const inputValue = (s: string, side: string) =>
  attr(elements(s, `countertop-side-input-${side}`)[0]!.attrs.replace(/"(?=")/g, '&quot;'), 'value')?.replace(
    /&quot;/g,
    '"',
  );

describe('EZD-414 countertop piece inspector', () => {
  it('AC-EZD-414-1: after the Seating preset the back reads 12" and is labelled seating', () => {
    const { store, selection, pieces } = setup(0);
    store.applyEdit(countertopPresetChanges(pieces(), CT_ISLAND, 0, 'seating', countertopPresetValues(null, pieces())));
    const s = html(
      <CountertopPieceInspector store={store} pieces={pieces()} selection={selection} canEdit />,
    );
    expect(inputValue(s, 'back')).toBe('12"');
    expect(sides(s)).toEqual([
      { side: 'front', active: 'false', label: 'Front' },
      { side: 'left', active: 'false', label: 'Left' },
      { side: 'right', active: 'false', label: 'Right' },
      { side: 'back', active: 'true', label: 'Back · seating' },
    ]);
    expect(elements(s, 'countertop-preset-seating').map((e) => attr(e.attrs, 'aria-pressed'))).toEqual(['true']);
    expect(elements(s, 'countertop-inspector-title').map((e) => textOf(e.inner))).toEqual(['Island top']);
    expect(elements(s, 'countertop-inspector-summary').map((e) => textOf(e.inner))).toEqual([
      'Piece C · 3 cm · 19.9 sq ft',
    ]);
    expect(textOf(elements(s, 'countertop-cabinets')[0]!.inner)).toContain('73 1/2 × 24');
  });

  it('shows the board chips with the Defaults values, Standard pressed on a 1 1/2" side', () => {
    const { store, selection, pieces } = setup(2);
    const s = html(
      <CountertopPieceInspector store={store} pieces={pieces()} selection={selection} canEdit />,
    );
    const chips = ['flush', 'standard', 'bar', 'seating', 'wall'].map(
      (p) => elements(s, `countertop-preset-${p}`)[0]!,
    );
    expect(chips.map((c) => textOf(c.inner))).toEqual([
      'Flush 0',
      'Standard 1 1/2',
      'Bar 10',
      'Seating 12',
      'Wall + splash',
    ]);
    expect(chips.map((c) => attr(c.attrs, 'aria-pressed'))).toEqual(['false', 'true', 'false', 'false', 'false']);
    expect(chips.every((c) => attr(c.attrs, 'disabled') === null)).toBe(true);
    expect(inputValue(s, 'front')).toBe('1 1/2"');
    expect(textOf(elements(s, 'countertop-cabinets')[0]!.inner)).toContain('73 1/2 × 24');
  });

  it('chips follow the per-project Defaults', () => {
    const { store, selection, pieces } = setup(2);
    const s = html(
      <CountertopPieceInspector
        store={store}
        pieces={pieces()}
        selection={selection}
        canEdit
        defaults={{ overhang_seating_counter: 14, overhang_seating_bar: 9 }}
      />,
    );
    expect(textOf(elements(s, 'countertop-preset-seating')[0]!.inner)).toBe('Seating 14');
    expect(textOf(elements(s, 'countertop-preset-bar')[0]!.inner)).toBe('Bar 9');
  });

  it('chips are off without Edit model and the lock, or with no edge picked', () => {
    const a = setup(2);
    const ro = html(<CountertopPieceInspector store={a.store} pieces={a.pieces()} selection={a.selection} />);
    expect(elements(ro, 'countertop-preset-seating').map((e) => attr(e.attrs, 'disabled'))).toEqual(['']);
    const b = setup(null);
    const none = html(
      <CountertopPieceInspector store={b.store} pieces={b.pieces()} selection={b.selection} canEdit />,
    );
    expect(elements(none, 'countertop-preset-seating').map((e) => attr(e.attrs, 'disabled'))).toEqual(['']);
  });

  it('shows nothing with no top selected', () => {
    const { store, pieces } = setup(null);
    const selection = createCountertopSelectionStore();
    const s = html(<CountertopPieceInspector store={store} pieces={pieces()} selection={selection} />);
    expect(elements(s, 'countertop-piece-inspector')).toEqual([]);
  });
});
