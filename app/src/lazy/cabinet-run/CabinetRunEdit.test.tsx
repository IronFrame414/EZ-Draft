// EZD-405 (S04 Controls "Drag box side edge", "Chain dimension text | Click to type an exact width", "Right-click box |
// Context menu: ... Duplicate, Delete"; S04 Permissions "Edit model: place, drag, resize, swap, delete boxes ... Also
// requires the edit lock"). Markup through renderToStaticMarkup (L-020). Expected values: board S04's run (B15 is 15"
// wide, its upper row 30" tall) and the wording in vault/build/assumptions.md EZD-405.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { NO_CABINET_SELECTION, cabinetView, modelObjects } from '../../editor/cabinets/cabinet-view';
import { boardModel, CAB_FLOOR, cabId } from '../../editor/cabinets/test-utils/board-run';
import { CabinetRunScreen, type CabinetEditHandlers, type CabinetRunScreenProps } from './CabinetRunView';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

const noop = () => {};
const edit: CabinetEditHandlers = {
  beginResize: noop,
  beginMove: noop,
  move: () => false,
  end: () => false,
  cancel: noop,
  openWidth: noop,
  openHeight: noop,
  openMenu: noop,
  isDragging: false,
};
const screen = (p: Partial<CabinetRunScreenProps> = {}) =>
  html(
    <CabinetRunScreen
      view={cabinetView(modelObjects(boardModel()), CAB_FLOOR)}
      selection={NO_CABINET_SELECTION}
      onInput={noop}
      {...p}
    />,
  );

describe('EZD-405 box editing on the screen', () => {
  it('with Edit model every box has a left and a right edge handle in the elevation; without it none', () => {
    const s = screen({ edit });
    for (let i = 1; i <= 8; i += 1) {
      expect(s).toContain(`data-edge="left" data-edge-of="${cabId(i)}"`);
      expect(s).toContain(`data-edge="right" data-edge-of="${cabId(i)}"`);
    }
    expect(s).toContain('Drag to resize');
    expect(screen()).not.toContain('data-edge=');
  });

  it("the typed width entry is labelled with the box's code and starts at its width", () => {
    const s = screen({ edit, entry: { kind: 'width', id: cabId(2) }, onEntry: () => true });
    expect(s).toContain('data-testid="cabinet-dim-entry"');
    expect(s).toMatch(/B15 Width<input[^>]*value="15""/);
  });

  it('the typed upper height entry starts at 30"', () => {
    const s = screen({ edit, entry: { kind: 'height', which: 'upper' }, onEntry: () => true });
    expect(s).toMatch(/Upper height<input[^>]*value="30""/);
  });

  it('the context menu lists Duplicate and Delete', () => {
    const s = screen({ edit, menu: { x: 10, y: 20, onDuplicate: noop, onDelete: noop } });
    const items = [...s.matchAll(/role="menuitem"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(items).toEqual(['Duplicate', 'Delete']);
    expect(s).toContain('aria-label="Box actions"');
  });
});
