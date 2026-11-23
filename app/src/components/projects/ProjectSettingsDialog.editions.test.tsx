// EZD-643 (Q-0220; Q-0765; S15g Decision 2; board S15gCode wording). Static markup of the dialog's Code edition
// select and Permit application date, as ProjectSettingsDialog.test.tsx renders it. Expected values: the select
// offers "By permit date (automatic)", "FBC 9th ed. · NEC 2023" and "FBC 8th ed. · NEC 2020" with Edit model; the
// date is an input with Edit model and text without it (Q-0765: "Permit application date", wizard and Project
// settings).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import { draftOf, type ProjectSettings } from '../../lib/projects/project-settings';
import { catalogFor } from '../../server/messages/catalog';
import { ProjectSettingsContent } from './ProjectSettingsDialog';

const read = (details: boolean): ProjectSettings => ({
  project: {
    id: 'p1',
    name: 'Lee bath',
    address: '1 Oak St',
    type: 'bath',
    scopeOfWork: '',
    permitApplicationDate: '2026-12-01',
  },
  client: null,
  defaults: {},
  codeEdition: { own: 'fbc8_nec2020', effective: 'fbc8_nec2020', auto: true },
  can: { details, client: false, typeAndDefaults: details },
});

const render = (s: ProjectSettings) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <ProjectSettingsContent
        load={{ status: 'ready', settings: s }}
        draft={draftOf(s)}
        holding={false}
        fields={{}}
        error={null}
        busy={false}
        online
        profile={null}
        profileId={null}
        onDraft={() => {}}
        onRetry={() => {}}
        onSave={() => {}}
        onClose={() => {}}
      />
    </MessagesProvider>,
  );

describe('EZD-643 Project settings: code edition and permit date', () => {
  it('with Edit model: the three choices, By permit date picked, and the date input', () => {
    const html = render(read(true));
    const [select] = elements(html, 'project-settings-code-edition');
    expect(select.tag).toBe('select');
    const options = [
      ...select.inner.matchAll(/<option value="([a-z0-9_]+)"([^>]*)>([^<]*)<\/option>/g),
    ].map((m) => [m[1], m[3], m[2].includes('selected')]);
    expect(options).toEqual([
      ['by_permit_date', 'By permit date (automatic)', true],
      ['fbc9_nec2023', 'FBC 9th ed. · NEC 2023', false],
      ['fbc8_nec2020', 'FBC 8th ed. · NEC 2020', false],
    ]);
    const [date] = elements(html, 'project-settings-permit-date');
    expect(date.tag).toBe('input');
    expect(attr(date.attrs, 'type')).toBe('date');
    expect(attr(date.attrs, 'value')).toBe('2026-12-01');
    expect(textOf(html)).toContain('Permit application date');
  });

  it('without Edit model both are text', () => {
    const html = render(read(false));
    const [edition] = elements(html, 'project-settings-code-edition');
    expect(attr(edition.attrs, 'data-readonly')).toBe('true');
    expect(textOf(edition.inner)).toBe('By permit date (automatic)');
    const [date] = elements(html, 'project-settings-permit-date');
    expect(attr(date.attrs, 'data-readonly')).toBe('true');
    expect(textOf(date.inner)).toBe('2026-12-01');
  });
});
