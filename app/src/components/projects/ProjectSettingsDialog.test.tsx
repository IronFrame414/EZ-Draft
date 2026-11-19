// EZD-130 (AC-EZD-130-3, -4, -5, -6). Static markup of the dialog's content, as the switcher's tests. Expected
// values: Q-0697 decisions 10 (without Edit model every field is text and there is no Save; with Edit model and no
// lock name, address and scope of work are inputs and type and the defaults are text; the holder edits every
// field; the client picker only with Company settings or Create projects; email and phone only when the read
// gives them); Q-0399 (no Code edition, no Submittal profile); Q-0699 ("Defaults for this project", Save and
// Cancel); AC-6 (a failed save keeps the dialog open with the Try again message).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import { draftOf, type ProjectSettings } from '../../lib/projects/project-settings';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import type { MessageKey } from '../../server/messages/catalog';
import { ProjectSettingsContent, type Load } from './ProjectSettingsDialog';

const read = (can: ProjectSettings['can'], contact = false): ProjectSettings => ({
  project: { id: 'p1', name: 'Lee kitchen', address: '1 Oak St', type: 'kitchen', scopeOfWork: 'Demo' },
  client: contact
    ? { id: 'c1', name: 'Ann Lee', email: 'ann@example.com', phone: '555-0100' }
    : { id: 'c1', name: 'Ann Lee' },
  defaults: { waste_tile: 10, waste_lvp: null, overhang_standard: 1.5 },
  codeEdition: { own: null, effective: 'fbc9_nec2023' },
  can,
});
const NONE = { details: false, client: false, typeAndDefaults: false };
const EDIT = { details: true, client: false, typeAndDefaults: true };
const ALL = { details: true, client: true, typeAndDefaults: true };

function render(
  s: ProjectSettings | null,
  holding: boolean,
  opts: { error?: MessageKey; load?: Load } = {},
): string {
  const load: Load = opts.load ?? (s ? { status: 'ready', settings: s } : { status: 'loading' });
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <ProjectSettingsContent
        load={load}
        draft={s ? draftOf(s) : null}
        holding={holding}
        fields={{}}
        error={opts.error ?? null}
        busy={false}
        online
        onDraft={() => {}}
        onRetry={() => {}}
        onSave={() => {}}
        onClose={() => {}}
      />
    </MessagesProvider>,
  );
}

const one = (html: string, id: string) => {
  const found = elements(html, id);
  expect(found, id).toHaveLength(1);
  return found[0];
};
const isText = (html: string, id: string) => attr(one(html, id).attrs, 'data-readonly') === 'true';

describe('EZD-130 ProjectSettingsContent', () => {
  it('AC-3: without Edit model every field is text and Save is hidden', () => {
    const html = render(read(NONE), false);
    for (const id of ['project-settings-customer', 'project-settings-name', 'project-settings-type',
      'project-settings-address', 'project-settings-scope']) {
      expect(isText(html, id), id).toBe(true);
    }
    expect(elements(html, 'project-settings-default-input')).toHaveLength(0);
    expect(elements(html, 'project-settings-default-value').length).toBeGreaterThan(0);
    expect(elements(html, 'project-settings-save')).toHaveLength(0);
    expect(textOf(one(html, 'project-settings-cancel').inner)).toBe(en['common.cancel']);
    expect(textOf(one(html, 'project-settings-type').inner)).toBe(en['office.new_project.type_kitchen']);
    expect(html).not.toContain('<input');
  });

  it('AC-3: Edit model without the lock edits name, address and scope; type and defaults are text', () => {
    const html = render(read(EDIT), false);
    expect(one(html, 'project-settings-name').tag).toBe('input');
    expect(one(html, 'project-settings-address').tag).toBe('input');
    expect(one(html, 'project-settings-scope').tag).toBe('textarea');
    expect(isText(html, 'project-settings-type')).toBe(true);
    expect(elements(html, 'project-settings-default-input')).toHaveLength(0);
    expect(textOf(one(html, 'project-settings-lock-hint').inner)).toBe(
      en['office.project_settings.lock_hint'],
    );
    expect(textOf(one(html, 'project-settings-save').inner)).toBe(en['office.project_settings.save']);
  });

  it('AC-3: the holder edits type and the defaults', () => {
    const html = render(read(EDIT), true);
    expect(one(html, 'project-settings-type').tag).toBe('select');
    expect(elements(html, 'project-settings-default-input').length).toBeGreaterThan(0);
    expect(elements(html, 'project-settings-lock-hint')).toHaveLength(0);
    const tile = elements(html, 'project-settings-default').find((e) => attr(e.attrs, 'data-key') === 'waste_tile');
    expect(tile?.inner).toContain('value="10"');
    expect(textOf(one(html, 'project-settings-defaults').inner)).toContain(
      en['office.project_settings.defaults_title'],
    );
  });

  it('AC-4: the picker only with Company settings or Create projects; contact only when the read gives it', () => {
    const text = render(read(EDIT), true);
    expect(textOf(one(text, 'project-settings-customer').inner)).toBe('Ann Lee');
    expect(elements(text, 'project-settings-customer-contact')).toHaveLength(0);
    const picker = render(read(ALL, true), true);
    expect(isText(picker, 'project-settings-customer')).toBe(false);
    expect(elements(picker, 'new-project-customer').length).toBe(1);
    expect(textOf(one(picker, 'project-settings-customer-contact').inner)).toBe('ann@example.com · 555-0100');
  });

  it('AC-5: no Submittal profile; EZD-613 (S15g Decision 2): the Code edition, a select with Edit model', () => {
    const html = render(read(ALL, true), true);
    expect(html.toLowerCase()).not.toContain('submittal');
    const select = one(html, 'project-settings-code-edition');
    expect(select.tag).toBe('select');
    expect(select.inner).toContain('FBC 9th ed. · NEC 2023');
    const plain = render(read(NONE), false);
    expect(isText(plain, 'project-settings-code-edition')).toBe(true);
    expect(textOf(one(plain, 'project-settings-code-edition').inner)).toBe('FBC 9th ed. · NEC 2023');
  });

  it('AC-6: a failed save shows the Try again message with Save still there; load states', () => {
    const html = render(read(EDIT), false, { error: 'office.project_settings.save_failed' });
    expect(textOf(one(html, 'project-settings-error').inner).replace(/&#x27;/g, "'")).toBe(
      "Couldn't save the project settings. Try again.",
    );
    expect(elements(html, 'project-settings-save')).toHaveLength(1);
    expect(elements(render(null, false), 'project-settings-loading')).toHaveLength(1);
    expect(elements(render(null, false, { load: { status: 'failed' } }), 'project-settings-load-error')).toHaveLength(1);
  });
});
