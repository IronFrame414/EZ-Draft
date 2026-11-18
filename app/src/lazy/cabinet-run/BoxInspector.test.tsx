// EZD-406 (S04 Layout "Inspector 336px: selected box (title, position in run, status pill, size fields, Face section,
// Catalog section, Swap box, Cabinet schedule)"; S04 Controls (inspector); S04 Permissions "See company costs: Cost
// row in the inspector Catalog section"; Q-0630 plain text for a reader; AC-EZD-406-1, -2). Markup through
// renderToStaticMarkup (L-020). Expected values: board S04Cabinets ("SB36 · Sink base", "Box 3 of 5 in back wall
// run", 36", 24", 34 1/2", "False drawer + 2 doors", "[Supplier] SB36-SH", "Shaker, Midnight", "$… · internal",
// "Swap box", "Cabinet schedule") and the cost 1.25 given to the stub catalog.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../lib/catalog/catalog';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { boxInspectorView, swapBoxChanges } from '../../editor/cabinets/box-inspector';
import { createCabinetSelectionStore } from '../../editor/cabinets/cabinet-selection-store';
import { cabinetView, modelObjects } from '../../editor/cabinets/cabinet-view';
import { boardModel, CAB_FLOOR, cabId } from '../../editor/cabinets/test-utils/board-run';
import type { Change, Objects } from '../../editor/model/patches';
import { BoxInspectorScreen, type BoxInspectorScreenProps } from './BoxInspector';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

const SB36 = cabId(4);
const SHAKER: CatalogItem = {
  id: 'd0000000-0000-4000-8000-000000000036',
  category: 'cabinets',
  subcategory: 'sink_base',
  line: 'Shaker',
  name: 'Sink base',
  brand: 'Supplier',
  model: 'SB36-SH',
  width: 36,
  depth: 24,
  height: 34.5,
  finish: 'Shaker, Midnight',
};
const B36: CatalogItem = { ...SHAKER, id: 'd0000000-0000-4000-8000-000000000037', subcategory: 'base', line: 'Generic', brand: null, name: 'Base cabinet', model: 'B36', finish: null };

const apply = (objects: Objects, changes: Change[]): Objects => {
  const next = new Map(objects);
  for (const c of changes) if (c.value !== null) next.set(c.id, c.value);
  return next;
};

// The board model with SB36 linked to the Shaker sink base (as a swap leaves it).
const linkedModel = (): Objects => {
  const objects = boardModel();
  const parsed = modelObjects(objects);
  return apply(objects, swapBoxChanges(cabinetView(parsed, CAB_FLOOR)!, parsed, SB36, SHAKER));
};

const screen = (
  p: Partial<BoxInspectorScreenProps> & { objects?: Objects; items?: CatalogItem[] } = {},
) => {
  const objects = modelObjects(p.objects ?? linkedModel());
  const view = cabinetView(objects, CAB_FLOOR)!;
  const ids = p.ids ?? [SB36];
  return html(
    <BoxInspectorScreen
      view={view}
      objects={objects}
      ids={ids}
      box={ids.length === 1 ? boxInspectorView(view, objects, ids[0]!) : null}
      catalog={{ kind: 'ready', items: p.items ?? [SHAKER, B36] }}
      canEdit={p.canEdit ?? true}
      swapOpen={p.swapOpen ?? false}
      onSwapOpen={() => {}}
      onChanges={() => []}
    />,
  );
};

describe('EZD-406 box inspector', () => {
  it('shows the board header, position, size fields and face section', () => {
    const s = screen();
    expect(s).toContain('SB36-SH · Sink base');
    expect(s).toContain('Box 3 of 5 in back wall run');
    expect(s).toMatch(/data-testid="box-inspector-width" value="36""/);
    expect(s).toMatch(/data-testid="box-inspector-depth" value="24""/);
    expect(s).toMatch(/data-testid="box-inspector-height" value="34 1\/2""/);
    expect(s).toContain('Face');
    expect(s).toMatch(/<option value="false_drawer_doors_2" selected="">False drawer \+ 2 doors<\/option>/);
    expect(s).toContain('Hinges');
    expect(s).toMatch(/aria-pressed="true"[^>]*>Pair</);
    expect(s).toContain('Finished ends');
    expect(s).toMatch(/aria-pressed="true"[^>]*>None</);
    expect(s).toContain('Swap box');
    expect(s).toContain('Cabinet schedule');
  });

  it('the status pill offers Existing, Demo and New with the box status chosen', () => {
    const s = screen();
    expect(s).toMatch(/data-testid="box-inspector-status"/);
    expect(s).toContain('<option value="existing">Existing</option>');
    expect(s).toContain('<option value="demo">Demo</option>');
    expect(s).toContain('<option value="new" selected="">New</option>');
  });

  it('the Catalog section shows the item and finish', () => {
    const s = screen();
    expect(s).toContain('[Supplier] SB36-SH');
    expect(s).toMatch(/<option value="Shaker, Midnight" selected="">Shaker, Midnight<\/option>/);
  });

  it('AC-EZD-406-2: with See company costs the Cost row reads "$1.25 · internal"', () => {
    const s = screen({ items: [{ ...SHAKER, unitCost: 1.25 }, B36] });
    expect(s).toContain('Cost');
    expect(s).toContain('data-testid="box-inspector-cost"');
    expect(s).toContain('$1.25 · internal');
  });

  it('AC-EZD-406-2: without See company costs (no cost sent) there is no Cost row at all', () => {
    const s = screen({ items: [SHAKER, B36] });
    expect(s).not.toContain('box-inspector-cost');
    expect(s).not.toContain('internal');
    expect(s).not.toMatch(/>Cost</);
  });

  it('a reader sees plain text, Swap box off (Q-0630)', () => {
    const s = screen({ canEdit: false });
    expect(s).not.toContain('<input');
    expect(s).not.toContain('<select');
    expect(s).toMatch(/data-testid="box-inspector-width">36"</);
    expect(s).toMatch(/data-testid="box-inspector-layout">False drawer \+ 2 doors</);
    expect(s).toMatch(/<button[^>]*data-testid="box-inspector-swap"[^>]*disabled=""/);
  });

  it('the open Swap box list shows the compatible boxes', () => {
    const s = screen({ swapOpen: true });
    expect(s).toContain('data-testid="box-inspector-swap-list"');
    // B36 is the same width; the box's own item (SB36-SH) is left out.
    expect(s).toContain(`data-item-id="${B36.id}"`);
    expect(s).not.toContain(`data-item-id="${SHAKER.id}"`);
  });

  it('with nothing or several boxes selected the inspector says so', () => {
    expect(screen({ ids: [] })).toContain('Select a box to see its size, face and catalog item.');
    expect(screen({ ids: [SB36, cabId(2)] })).toContain('2 boxes selected');
  });
});

describe('EZD-406 shared selection', () => {
  it('a click on the drawing selects the box the inspector reads; Swap box closes when another box is picked', () => {
    const s = createCabinetSelectionStore();
    s.getState().send({ type: 'click', id: SB36 });
    expect(s.getState().selection.ids).toEqual([SB36]);
    s.getState().openSwap(SB36);
    expect(s.getState().swapFor).toBe(SB36);
    s.getState().send({ type: 'hover', id: cabId(2) });
    expect(s.getState().swapFor).toBe(SB36);
    s.getState().send({ type: 'click', id: cabId(2) });
    expect(s.getState().swapFor).toBeNull();
  });
});
