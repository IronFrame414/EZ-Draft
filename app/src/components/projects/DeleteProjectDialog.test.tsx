// EZD-124 (AC-EZD-124-1). Expected values: examples 09p Delete confirmation rows 1-4 (Delete enabled only when the
// trimmed text equals the project name exactly, case included); S01 Validation ("Delete: type project name to
// confirm"). Renders the dialog content without the portal, in the real office catalog.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { DeleteProjectContent } from './DeleteProjectDialog';

const render = (typed: string, busy = false) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <DeleteProjectContent
        projectName="Kitchen remodel"
        typed={typed}
        busy={busy}
        onTyped={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    </MessagesProvider>,
  );
const confirmDisabled = (html: string) =>
  attr(elements(html, 'delete-project-confirm')[0].attrs, 'disabled') !== null;

describe('EZD-124 Delete dialog', () => {
  it('09p rows 1-4: Delete is enabled only for the exact name, trimmed', () => {
    expect(confirmDisabled(render('Kitchen remodel'))).toBe(false);
    expect(confirmDisabled(render('kitchen remodel'))).toBe(true);
    expect(confirmDisabled(render('  Kitchen remodel '))).toBe(false);
    expect(confirmDisabled(render(''))).toBe(true);
    // While the delete runs, Delete and Cancel are disabled.
    const busy = render('Kitchen remodel', true);
    expect(confirmDisabled(busy)).toBe(true);
    expect(attr(elements(busy, 'delete-project-cancel')[0].attrs, 'disabled')).not.toBeNull();
  });

  it('asks for the project name by name', () => {
    const html = render('');
    expect(html).toContain('Delete Kitchen remodel?');
    expect(textOf(elements(html, 'delete-project-confirm')[0].inner)).toBe('Delete project');
    expect(elements(html, 'delete-project-input')).toHaveLength(1);
  });
});
