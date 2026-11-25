// EZD-222 (S15d Keyboard shortcuts "One row per command ... Click a key cell, press the new key", Reset to default
// map, Reset shortcut (row); Layout "Keyboard shortcuts is a table"). Markup only (node environment); pressing keys
// is in the browser test e2e/keyboard-shortcuts.spec.ts.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/defaults',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));

import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { StateHost } from '../../states/StateHost';
import { UnsavedChangesProvider } from '../unsaved-changes';
import { DefaultsPage } from './DefaultsForm';

// As defaults-form.test.tsx renders it.
const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <UnsavedChangesProvider draftScope="m1">{el}</UnsavedChangesProvider>
      </StateHost>
    </MessagesProvider>,
  );
const keyCell = (html: string, id: string) =>
  new RegExp(`<button[^>]*data-testid="shortcut-key-${id}"[^>]*>(.*?)</button>`).exec(html)?.[1] ?? null;

describe('EZD-222 Keyboard shortcuts table', () => {
  it('one row per command, the stored change in the Wall cell, the defaults elsewhere', () => {
    const html = render(<DefaultsPage initial={{ keyboard_shortcuts: { wall: 'B', door: '' } }} />);
    const rows = [...html.matchAll(/data-testid="shortcut-row" data-command="([a-z0-9-]+)"/g)].map((m) => m[1]);
    // EZD-230: every 04 rail tool in the 04 table order, then Pan, Look up, the tabs (S15d default map), the edit keys.
    expect(rows).toEqual([
      'select',
      'move',
      'wall',
      'room-rect',
      'door',
      'window',
      'cabinets',
      'countertops',
      'fixtures',
      'electrical',
      'ceiling',
      'catalog',
      'dimension',
      'text',
      'sketch',
      'detail-callout',
      'revision-cloud',
      'reference',
      'markup',
      'supplier-markup',
      'measure',
      'check',
      'help',
      'pan',
      'look-up',
      'tab-plan',
      'tab-3d',
      'tab-sheets',
      'tab-render',
      'undo',
      'redo',
      'copy',
      'paste',
      'save',
    ]);
    expect(keyCell(html, 'undo')).toBe('Ctrl+Z');
    expect(keyCell(html, 'wall')).toBe('B');
    expect(keyCell(html, 'room-rect')).toBe('R');
    expect(keyCell(html, 'measure')).toBe('Shift+L');
    expect(keyCell(html, 'door')).toContain('Not set');
    // EZD-230: the Shift combos and digits of 04 / S15d.
    expect(keyCell(html, 'reference')).toBe('Shift+R');
    expect(keyCell(html, 'check')).toBe('Shift+C');
    expect(keyCell(html, 'tab-3d')).toBe('2');
    expect(keyCell(html, 'save')).toBe('Ctrl+S');
    // Board S15dDefaults: subtitle with the command count, the view filter, the note.
    expect(html).toContain('Click a key, then press the new one · 34 commands');
    const filter = [...html.matchAll(/data-testid="shortcuts-filter-([a-z0-9]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
    expect(filter).toEqual([
      ['all', 'All'],
      ['plan', 'Plan'],
      ['3d', '3D'],
      ['sheets', 'Sheets'],
      ['render', 'Render'],
    ]);
    expect(html).toContain(
      'Reset fills empty rows only and never overwrites a key you set. Keys are checked within the same view. Tabs 1 to 4: Plan, 3D, Sheets, Render. Ctrl means Cmd on Mac; Ctrl+W, T and N are reserved by the browser.',
    );
    expect(html).toContain('Reset to default map');
    expect(html).toContain('data-testid="shortcut-reset-wall"');
  });
});
