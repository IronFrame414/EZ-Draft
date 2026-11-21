// EZD-418 (AC-EZD-418-1 "Schedule matches the pieces and exports to CSV"; S04b Controls "Top schedule | Inspector
// footer | Opens schedule: material, thickness, area, edge length"; 08 Exports "Countertop schedule | Piece, material,
// thickness, area, edge profile, edge length"; board S04bCountertops inspector footer "Top schedule"). Markup through
// renderToStaticMarkup (L-020). Expected values are hand counts from the board's three tops (test-fixture.ts
// boardPiecesModel; app/src/editor/countertops/top-schedule.test.ts): A 25.1 sq ft, 9.7 lf; B 11.2 sq ft, 7.4 lf;
// C 19.9 sq ft (board "19.9 sq ft"), 19.0 lf; 3 cm (board "Quartz · 3 cm").
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { createModelStore } from '../../editor/model/model-store';
import { modelObjects } from '../../editor/cabinets/cabinet-view';
import { boardPiecesModel, CT_FLOOR, twoRunModel } from '../../editor/countertops/test-fixture';
import { countertopMaterialChanges } from '../../editor/countertops/material';
import { countertopPieces } from '../../editor/countertops/trace-tool';
import type { CatalogItem } from '../../lib/catalog/catalog';
import { CountertopsInspector, TopScheduleView } from './TopSchedule';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

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

const board = () => countertopPieces(modelObjects(boardPiecesModel()), CT_FLOOR).map((p) => p.data);
const cells = (s: string) =>
  elements(s, 'top-schedule-row').map((r) =>
    [...r.inner.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => textOf(m[1]!)),
  );
const never = () => new Promise<never>(() => {});

describe('EZD-418 top schedule view', () => {
  it('AC-EZD-418-1: one row per piece, matching the pieces, under the spec headings', () => {
    const s = html(<TopScheduleView pieces={board()} catalog={null} canExport={false} onClose={() => {}} />);
    expect(s).toContain('<th scope="col">Piece</th>');
    expect(
      [...s.matchAll(/<th scope="col">(.*?)<\/th>/g)].map((m) => m[1]),
    ).toEqual(['Piece', 'Material', 'Thickness', 'Area (sq ft)', 'Edge profile', 'Edge length (lf)']);
    expect(elements(s, 'top-schedule-row').map((r) => attr(r.attrs, 'data-label'))).toEqual(['A', 'B', 'C']);
    expect(cells(s)).toEqual([
      ['A · Back wall', '—', '3 cm', '25.1', '—', '9.7'],
      ['B · Left return', '—', '3 cm', '11.2', '—', '7.4'],
      ['C · Island', '—', '3 cm', '19.9', '—', '19.0'],
    ]);
  });

  it('shows the material name from the catalog', () => {
    const store = createModelStore({ objects: boardPiecesModel() });
    store.applyEdit(
      countertopMaterialChanges(countertopPieces(modelObjects(store.getState().objects), CT_FLOOR), QUARTZ.id),
    );
    const pieces = countertopPieces(modelObjects(store.getState().objects), CT_FLOOR).map((p) => p.data);
    const s = html(<TopScheduleView pieces={pieces} catalog={[QUARTZ]} canExport={false} onClose={() => {}} />);
    expect(cells(s).map((r) => r[1])).toEqual(['Quartz', 'Quartz', 'Quartz']);
  });

  it('AC-EZD-418-1: Export CSV shows only with Export', () => {
    const on = html(<TopScheduleView pieces={board()} catalog={null} canExport onClose={() => {}} />);
    expect(elements(on, 'top-schedule-export').map((e) => textOf(e.inner))).toEqual(['Export CSV']);
    const off = html(<TopScheduleView pieces={board()} catalog={null} canExport={false} onClose={() => {}} />);
    expect(elements(off, 'top-schedule-export')).toEqual([]);
  });

  it('with no tops: the empty line, and Export CSV is off', () => {
    const s = html(<TopScheduleView pieces={[]} catalog={null} canExport onClose={() => {}} />);
    expect(elements(s, 'top-schedule-empty').map((e) => textOf(e.inner))).toEqual(['No tops on this floor yet.']);
    expect(elements(s, 'top-schedule-export').map((e) => attr(e.attrs, 'disabled'))).toEqual(['']);
  });
});

describe('EZD-418 countertop inspector footer', () => {
  it('shows the board button "Top schedule", schedule closed', () => {
    const s = html(
      <CountertopsInspector
        store={createModelStore({ objects: boardPiecesModel() })}
        loadCatalog={never}
        loadPermissions={never}
      />,
    );
    expect(elements(s, 'countertop-top-schedule').map((e) => textOf(e.inner))).toEqual(['Top schedule']);
    expect(elements(s, 'top-schedule')).toEqual([]);
  });

  it('AC-EZD-418-1: opened, it lists the tops on the floor', () => {
    const s = html(
      <CountertopsInspector
        store={createModelStore({ objects: boardPiecesModel() })}
        loadCatalog={never}
        loadPermissions={never}
        initialOpen
      />,
    );
    expect(cells(s).map((r) => r[0])).toEqual(['A · Back wall', 'B · Left return', 'C · Island']);
  });

  it('with cabinets and no tops, the schedule is empty', () => {
    const s = html(
      <CountertopsInspector
        store={createModelStore({ objects: twoRunModel() })}
        loadCatalog={never}
        loadPermissions={never}
        initialOpen
      />,
    );
    expect(elements(s, 'top-schedule-row')).toEqual([]);
    expect(elements(s, 'top-schedule-empty')).toHaveLength(1);
  });
});
