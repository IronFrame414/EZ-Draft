// EZD-1422 (S01 Input source; board S01b "Field measure" card "Foreman measures rooms on the phone. Project opens on
// Import review when rooms arrive." and hint "Field measure asks which Foreman gets the link (email + Copy link)";
// Q-0204 "'Waiting for field measurements', who it was sent to and a Resend button ... The sender or anyone who can
// edit the project can cancel it"; Q-0398 a source shows when its ticket ships). Static markup.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import { EMPTY_NEW_PROJECT, type NewProjectDraft } from '../../lib/projects/new-project';
import type { ProjectSummary } from '../../lib/projects/projects';
import type { ForemanCandidate } from '../../lib/users/scope';
import { catalogFor } from '../../server/messages/catalog';
import { NewProjectStep2, type InputSource } from './NewProjectStep2';
import { ProjectCardWithMenu, type CardMenuConfig } from './ProjectCardMenu';

const wrap = (node: React.ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {node}
    </MessagesProvider>,
  );

const draft: NewProjectDraft = {
  ...EMPTY_NEW_PROJECT,
  name: 'Kitchen remodel',
  address: '12 Oak Ave',
  type: 'kitchen',
};
const luis: ForemanCandidate = {
  membershipId: '11111111-1111-4111-8111-111111111111',
  name: 'Luis Ortega',
  email: 'luis@example.com',
  scope: 'all',
};

const step2 = (opts: {
  source: InputSource;
  foreman: ForemanCandidate | null;
  standalone: boolean;
}) =>
  wrap(
    <NewProjectStep2
      draft={draft}
      template={null}
      busy={false}
      error={null}
      onTemplateChange={() => {}}
      onEdit={() => {}}
      foreman={opts.foreman}
      onForemanChange={() => {}}
      source={opts.source}
      {...(opts.standalone ? { onStandaloneSourceChange: () => {} } : {})}
    />,
  );

const one = (html: string, id: string) => {
  const els = elements(html, id);
  expect(els).toHaveLength(1);
  return els[0]!;
};

describe('EZD-1422 wizard step 2: Field measure', () => {
  it('Standalone for a user who may import: Field measure and Blank cards, Blank picked', () => {
    const html = step2({ source: 'blank', foreman: null, standalone: true });
    const fm = one(html, 'new-project-source-field_measure');
    expect(textOf(fm.inner)).toContain('Field measure');
    expect(textOf(fm.inner)).toContain(
      'Foreman measures rooms on the phone. Project opens on Import review when rooms arrive.',
    );
    expect(attr(fm.attrs, 'aria-checked')).toBe('false');
    expect(attr(one(html, 'new-project-source-blank').attrs, 'aria-checked')).toBe('true');
    expect(elements(html, 'new-project-field-measure-hint')).toHaveLength(0);
    expect(elements(html, 'new-project-template-block')).toHaveLength(1);
  });

  it('without the choice (no import right) only Blank shows, as before', () => {
    const html = step2({ source: 'blank', foreman: null, standalone: false });
    expect(elements(html, 'new-project-source-field_measure')).toHaveLength(0);
    expect(elements(html, 'new-project-field-measure-hint')).toHaveLength(0);
    expect(elements(html, 'new-project-source-blank')).toHaveLength(1);
  });

  it('Field measure picked: the board hint, no template, asks for the Foreman, then Create will emails the Foreman', () => {
    const none = step2({ source: 'field_measure', foreman: null, standalone: true });
    expect(textOf(one(none, 'new-project-field-measure-hint').inner)).toBe(
      'Field measure asks which Foreman gets the link (email + Copy link)',
    );
    expect(attr(one(none, 'new-project-source-field_measure').attrs, 'aria-checked')).toBe('true');
    expect(elements(none, 'new-project-template-block')).toHaveLength(0);
    expect(elements(none, 'new-project-upload-block')).toHaveLength(0);
    expect(textOf(one(none, 'new-project-field-measure-foreman').inner)).toBe(
      'Pick the Foreman who gets the link.',
    );
    expect(elements(none, 'new-project-create-will-email-foreman')).toHaveLength(0);

    const picked = step2({ source: 'field_measure', foreman: luis, standalone: true });
    expect(elements(picked, 'new-project-field-measure-foreman')).toHaveLength(0);
    expect(textOf(one(picked, 'new-project-create-will-email-foreman').inner)).toBe(
      'Email Luis Ortega the Field measure link',
    );
    expect(textOf(one(picked, 'new-project-create-will').inner)).toContain(
      'Open Import review when the rooms arrive',
    );
  });
});

const P: ProjectSummary = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Kitchen remodel',
  clientName: null,
  address: '12 Oak Ave',
  status: 'draft',
  openItems: 0,
  hasThumbnail: false,
  versionNo: null,
};
const api = {
  rename: async () => {},
  setStatus: async () => {},
  setArchived: async () => {},
  setComplete: async () => {},
  remove: async () => {},
};
const config = (canEdit: boolean): CardMenuConfig => ({
  canEdit,
  canDelete: false,
  canMeasure: false,
  api,
  onChanged: () => {},
  onFailed: () => {},
});

describe('EZD-1422 project card while waiting for field measurements (Q-0204)', () => {
  it('shows the waiting line in place of the open items and who it was sent to', () => {
    const html = wrap(
      <ProjectCardWithMenu
        project={{ ...P, fieldMeasureWait: { sentTo: 'Luis Ortega', mine: true } }}
        config={config(false)}
      />,
    );
    expect(textOf(one(html, 'project-card-field-measure-waiting').inner)).toBe(
      'Waiting for field measurements',
    );
    expect(textOf(one(html, 'project-card-field-measure-sent-to').inner)).toBe('Sent to Luis Ortega');
    expect(elements(html, 'project-card-open')).toHaveLength(0);
  });

  it('a card that is not waiting shows the open items and no sent-to line', () => {
    const html = wrap(<ProjectCardWithMenu project={P} config={config(true)} />);
    expect(elements(html, 'project-card-field-measure-waiting')).toHaveLength(0);
    expect(elements(html, 'project-card-field-measure-sent-to')).toHaveLength(0);
    expect(elements(html, 'project-card-open')).toHaveLength(1);
  });

  it('the sender or Edit model gets the menu; another member without Edit model gets none', () => {
    const sender = wrap(
      <ProjectCardWithMenu
        project={{ ...P, fieldMeasureWait: { sentTo: 'Luis Ortega', mine: true } }}
        config={config(false)}
      />,
    );
    expect(elements(sender, 'project-card-menu')).toHaveLength(1);
    const other = wrap(
      <ProjectCardWithMenu
        project={{ ...P, fieldMeasureWait: { sentTo: 'Luis Ortega', mine: false } }}
        config={config(false)}
      />,
    );
    expect(elements(other, 'project-card-menu')).toHaveLength(0);
    const editor = wrap(
      <ProjectCardWithMenu
        project={{ ...P, fieldMeasureWait: { sentTo: 'Luis Ortega', mine: false } }}
        config={config(true)}
      />,
    );
    expect(elements(editor, 'project-card-menu')).toHaveLength(1);
  });
});
