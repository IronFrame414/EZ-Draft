// EZD-419 (S03 Controls — inspector (selection: Island run); board S03Plan; AC-EZD-419-1, -2). Markup through
// renderToStaticMarkup (L-020). Expected values: board S03Plan ("Island run", "3 boxes · 2 end panels", "Client
// selections", "Countertop", "Cabinet finish", "Shaker, Midnight", "B24 + DB24 + B24 + 2 panels", "73 1/2"",
// "Cabinet schedule"); board S04's back wall run ("5 boxes · 1 filler" as its header, chain 117").
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../lib/catalog/catalog';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { cabinetView, modelObjects } from '../../editor/cabinets/cabinet-view';
import { runCountertopChanges, runFinishChanges } from '../../editor/cabinets/run-inspector';
import { boardModel, CAB_FLOOR } from '../../editor/cabinets/test-utils/board-run';
import { apply, FLOOR, islandModel, ITEM } from '../../editor/cabinets/test-utils/island-run';
import type { Objects } from '../../editor/model/patches';
import { RunInspector, type RunInspectorProps } from './RunInspector';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

const STONE: CatalogItem = {
  id: ITEM,
  category: 'countertops',
  subcategory: null,
  line: null,
  name: 'Calacatta Nuvo',
  brand: null,
  model: null,
  width: null,
  depth: null,
  height: null,
  finish: null,
};

const text = (markup: string, testId: string): string => {
  const m = new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(markup);
  return m?.[1] ?? '';
};
const tag = (markup: string, testId: string): string =>
  new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`).exec(markup)?.[0] ?? '';

const screen = (
  p: Partial<RunInspectorProps> & { model?: Objects; floor?: string; items?: CatalogItem[] } = {},
) => {
  const objects = modelObjects(p.model ?? islandModel());
  const view = cabinetView(objects, p.floor ?? FLOOR)!;
  return html(
    <RunInspector
      view={view}
      objects={objects}
      catalog={{ kind: 'ready', items: p.items ?? [STONE] }}
      canEdit={p.canEdit ?? true}
      canExport={false}
      onChanges={() => []}
    />,
  );
};

describe('EZD-419 run inspector', () => {
  it('AC-EZD-419-1 the island run shows its title, contents, total line and both tiles', () => {
    const m = screen();
    expect(text(m, 'run-inspector-title')).toBe('Island run');
    expect(text(m, 'run-inspector-contents')).toBe('3 boxes · 2 end panels');
    expect(m).toContain('Client selections');
    expect(m).toContain('Countertop');
    expect(m).toContain('Cabinet finish');
    expect(text(m, 'run-inspector-countertop-value')).toBe('—');
    expect(text(m, 'run-inspector-finish-value')).toBe('—');
    expect(text(m, 'run-inspector-list')).toBe('B24 + DB24 + B24 + 2 panels');
    expect(text(m, 'run-inspector-total')).toBe('73 1/2"');
    expect(text(m, 'run-inspector-schedule')).toBe('Cabinet schedule');
    // With Edit model and the lock both tiles open the picker.
    expect(tag(m, 'run-inspector-countertop')).not.toContain('disabled');
    expect(tag(m, 'run-inspector-finish')).not.toContain('disabled');
  });

  it('AC-EZD-419-2 after a finish and a countertop are picked the tiles show them', () => {
    const objects = islandModel();
    const parsed = modelObjects(objects);
    const view = cabinetView(parsed, FLOOR)!;
    const model = apply(objects, [
      ...runFinishChanges(view, parsed, 'Shaker, Midnight'),
      ...runCountertopChanges(view, parsed, ITEM),
    ]);
    const m = screen({ model });
    expect(text(m, 'run-inspector-finish-value')).toBe('Shaker, Midnight');
    expect(text(m, 'run-inspector-countertop-value')).toBe('Calacatta Nuvo');
  });

  it('a run with a filler and no panels: the board back wall run', () => {
    const m = screen({ model: boardModel(), floor: CAB_FLOOR });
    expect(text(m, 'run-inspector-title')).toBe('Back wall run');
    expect(text(m, 'run-inspector-contents')).toBe('5 boxes · 1 filler');
    expect(text(m, 'run-inspector-list')).toBe('F3 + B15 + DW24 + SB36 + B18 + B21');
    expect(text(m, 'run-inspector-total')).toBe('117"');
    // No countertop piece over it: nothing to set.
    expect(tag(m, 'run-inspector-countertop')).toContain('disabled');
  });

  it('a reader sees the tiles and the schedule, but cannot open a picker', () => {
    const m = screen({ canEdit: false });
    expect(tag(m, 'run-inspector-countertop')).toContain('disabled');
    expect(tag(m, 'run-inspector-finish')).toContain('disabled');
    expect(tag(m, 'run-inspector-schedule')).not.toContain('disabled');
  });
});
