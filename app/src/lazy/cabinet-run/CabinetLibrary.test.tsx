// EZD-403 (S04 Layout "Left panel 248px 'Cabinet library': tabs Boxes / Runs / Saved; search; line section; Fillers,
// panels, trim section"; S04 Controls (left panel) "Drag handle icon on rows | Indicates draggable | Cursor 'grab'",
// "Tab: Runs | Lists every run in the project (name, box count, fit status)"; S04 Permissions "Edit model: place ...
// boxes"). Markup through renderToStaticMarkup (L-020). Expected values: board S04Cabinets' panel text and its run
// ("Back wall run", 5 boxes, 117" with 1/2" scribe on a 117 1/2" wall: fits).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { createCabinetSelectionStore } from '../../editor/cabinets/cabinet-selection-store';
import { createModelStore } from '../../editor/model/model-store';
import { boardModel, CAB_RUN } from '../../editor/cabinets/test-utils/board-run';
import { CabinetLibrary, CabinetLibraryRuns } from './CabinetLibrary';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

const never = () => new Promise<never>(() => {});
const library = (canEdit: boolean) =>
  html(
    <CabinetLibrary
      store={createModelStore({ objects: boardModel() })}
      selectionStore={createCabinetSelectionStore()}
      canEdit={canEdit}
      loadCatalog={never}
    />,
  );
const text = (s: string, cls: RegExp) => [...s.matchAll(cls)].map((m) => m[1]);

describe('EZD-403 cabinet library panel', () => {
  it('shows the Boxes, Runs and Saved tabs with Boxes open, the search and the line label', () => {
    const s = library(true);
    expect(text(s, /role="tab"[^>]*>([^<]+)</g)).toEqual(['Boxes', 'Runs', 'Saved']);
    expect(s).toMatch(/aria-selected="true"[^>]*data-testid="cabinet-library-tab-boxes"/);
    expect(s).toContain('placeholder="Code or size, e.g. B24"');
    expect(s).toContain('Line: ');
  });

  it("lists board S04's rows with their names, then Fillers, panels, trim", () => {
    const s = library(true);
    const codes = text(s, /data-testid="cabinet-library-row"[^>]*data-code="([^"]+)"/g);
    expect(codes).toEqual([
      'B9–B24',
      'B27–B36',
      'DB12–36',
      'SB30–36',
      'BBC42',
      'W1230+',
      'T1884',
      'F3',
      'EP',
      'DWP',
    ]);
    for (const name of [
      'Base, 1 door',
      'Base, 2 doors',
      'Drawer base',
      'Sink base',
      'Blind corner',
      'Wall, 30" tall',
      'Tall pantry',
      'Filler, scribe',
      'End panel 3/4"',
      'Dishwasher panel',
      'Toe kick, light rail, crown',
    ]) {
      expect(s).toContain(`>${name}<`);
    }
    expect(s).toContain('Fillers, panels, trim');
    expect(text(s, /data-testid="cabinet-library-trim-[a-z_]+"[^>]*>([^<]+)</g)).toEqual([
      'TK',
      'LR',
      'CM',
    ]);
  });

  it('with Edit model the rows drag and show the handle; without it they do not', () => {
    const edit = library(true);
    expect(edit.match(/data-testid="cabinet-library-row"[^>]*draggable="true"/g)).toHaveLength(10);
    expect(edit).toContain('<circle');
    const read = library(false);
    expect(read).not.toMatch(/draggable="true"/);
    expect(read).not.toContain('<circle');
  });

  it('the Runs tab lists the run with its box count and fit, the open one marked', () => {
    const s = html(
      <CabinetLibraryRuns
        store={createModelStore({ objects: boardModel() })}
        selectionStore={createCabinetSelectionStore()}
        fitTolerance={null}
      />,
    );
    expect(s).toContain(`data-run-id="${CAB_RUN}"`);
    expect(s).toContain('aria-current="true"');
    expect(s).toContain('Back wall run');
    expect(s).toContain('5 boxes');
    expect(s).toMatch(/data-fit="fits"[^>]*> · Fits</);
  });
});
