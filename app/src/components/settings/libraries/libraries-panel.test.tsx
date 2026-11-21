// EZD-131 (S15h Layout, Controls; mockup S15hLibraries; AC-EZD-131-1). Server markup of the panel (the unit
// project has no DOM): the seven tabs in order with the selected one marked, the tab's search placeholder,
// and Add abbreviation only on the Symbols + abbreviations tab (S15h: abbreviations may be added). The
// empty states after loading are proven in app/e2e/libraries.spec.ts.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LibraryTabId } from '../../../lib/libraries/libraries';
import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { LibrariesPanel } from './LibrariesPanel';

const html = (tab: LibraryTabId) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <LibrariesPanel initialTab={tab} />
    </MessagesProvider>,
  );

const tabs = (markup: string) =>
  Array.from(
    markup.matchAll(/<button[^>]*data-testid="libraries-tab"[^>]*>([^<]*)<\/button>/g),
    (m) => ({ text: m[1], on: /aria-selected="true"/.test(m[0]) }),
  );

describe('EZD-131 LibrariesPanel markup', () => {
  it('lists the seven tabs in order and marks the open one', () => {
    const t = tabs(html('saved_groups'));
    expect(t.map((x) => x.text)).toEqual([
      'Notes',
      'Symbols + abbreviations',
      'Details',
      'Hatches',
      'Parts',
      'Saved groups',
      'Field task templates',
    ]);
    expect(t.filter((x) => x.on).map((x) => x.text)).toEqual(['Saved groups']);
  });

  it('shows the tab search and Add abbreviation only on Symbols + abbreviations', () => {
    const symbols = html('symbols');
    expect(symbols).toContain('placeholder="Search abbreviations"');
    expect(symbols).toContain('data-testid="libraries-add"');
    expect(symbols).toContain('Add abbreviation');
    for (const tab of ['details', 'hatches', 'parts', 'saved_groups', 'task_templates'] as const) {
      expect(html(tab), tab).not.toContain('data-testid="libraries-add"');
    }
    expect(html('task_templates')).toContain('placeholder="Search templates"');
  });

  it('starts with the empty inspector', () => {
    expect(html('notes')).toContain('Select an item to see it here.');
  });

  // EZD-714 (S15h Add note / Edit / Delete on the Notes tab).
  it('the Notes tab has Search notes and Add note', () => {
    const notes = html('notes');
    expect(notes).toContain('placeholder="Search notes"');
    expect(notes).toContain('data-testid="libraries-add"');
    expect(notes).toContain('Add note');
    expect(notes).not.toContain('Add abbreviation');
  });
});

// EZD-1408 (S15h Permissions "Edit field tasks may also edit field task templates"): with Edit field tasks and no
// Libraries switch the page passes onlyTemplates, so Field task templates is the only tab.
describe('EZD-1408 LibrariesPanel for Edit field tasks only', () => {
  it('shows only the Field task templates tab, with no Add button', () => {
    const markup = renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <LibrariesPanel initialTab="task_templates" onlyTemplates />
      </MessagesProvider>,
    );
    expect(tabs(markup)).toEqual([{ text: 'Field task templates', on: true }]);
    expect(markup).not.toContain('data-testid="libraries-add"');
  });
});
