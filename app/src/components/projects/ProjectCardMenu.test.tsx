// EZD-124 (AC-EZD-124-1, -3, -7, -8). Expected values: S01 Controls and Q-0700 decisions 10 (items the user lacks
// permission for are absent; with neither Edit model nor Delete projects there is no menu); Q-0201 (Delete is
// offered even after a send); S01 Card overflow menu (Rename inline); Q-0700 decisions 05 (an archived card still
// opens its project). The menu is closed in static markup: its items are checked by cardMenuItems
// (project-card-menu.test.ts) and the e2e.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import type { ProjectSummary } from '../../lib/projects/projects';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements } from '../../../test-harness/projects-markup';
import { ProjectCardWithMenu, RenameField, type CardMenuConfig } from './ProjectCardMenu';
import { ProjectCard } from './ProjectCard';

const P: ProjectSummary = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Kitchen remodel',
  clientName: null,
  address: '4 Card St',
  status: 'client_review',
  openItems: 0,
  hasThumbnail: false,
  versionNo: 2,
};
const api = {
  rename: async () => {},
  setStatus: async () => {},
  setArchived: async () => {},
  remove: async () => {},
};
const config = (canEdit: boolean, canDelete: boolean): CardMenuConfig => ({
  canEdit,
  canDelete,
  api,
  onChanged: () => {},
  onFailed: () => {},
});
const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {node}
    </MessagesProvider>,
  );

describe('EZD-124 project card menu markup', () => {
  it('the three-dot button sits beside the link, never inside it, after a send too', () => {
    const html = wrap(<ProjectCardWithMenu project={P} config={config(true, true)} />);
    const card = elements(html, 'project-card')[0];
    expect(card.tag).toBe('a');
    expect(attr(card.attrs, 'href')).toBe(`/projects/${P.id}`);
    expect(card.inner).not.toContain('project-card-menu');
    const button = elements(html, 'project-card-menu');
    expect(button).toHaveLength(1);
    expect(attr(button[0].attrs, 'aria-label')).toBe('Actions for Kitchen remodel');
    expect(attr(elements(html, 'project-card-wrap')[0].attrs, 'data-archived')).toBe('false');
  });

  it('with Edit model only or Delete projects only there is a menu; with neither there is none', () => {
    expect(elements(wrap(<ProjectCardWithMenu project={P} config={config(true, false)} />), 'project-card-menu')).toHaveLength(1);
    expect(elements(wrap(<ProjectCardWithMenu project={P} config={config(false, true)} />), 'project-card-menu')).toHaveLength(1);
    const none = wrap(<ProjectCardWithMenu project={P} config={config(false, false)} />);
    expect(elements(none, 'project-card-menu')).toHaveLength(0);
  });

  it('an archived card is still a link to the editor', () => {
    const html = wrap(<ProjectCardWithMenu project={{ ...P, archived: true }} config={config(true, true)} />);
    const card = elements(html, 'project-card')[0];
    expect(card.tag).toBe('a');
    expect(attr(card.attrs, 'href')).toBe(`/projects/${P.id}`);
    expect(attr(elements(html, 'project-card-wrap')[0].attrs, 'data-archived')).toBe('true');
  });

  it('Rename inline: while the name is edited the card is not a link and shows the name field', () => {
    const html = wrap(
      <ProjectCard project={P} menu={null} nameEditor={<RenameField name={P.name} onDone={() => {}} />} />,
    );
    const card = elements(html, 'project-card')[0];
    expect(card.tag).toBe('div');
    expect(attr(card.attrs, 'href')).toBeNull();
    const input = elements(html, 'project-card-rename-input');
    expect(input).toHaveLength(1);
    expect(attr(input[0].attrs, 'value')).toBe('Kitchen remodel');
    expect(elements(html, 'project-card-name')).toHaveLength(0);
  });
});
