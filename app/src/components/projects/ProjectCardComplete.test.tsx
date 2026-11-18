// EZD-137 (AC-EZD-137-1, -4). Expected values: Q-0702 (the Completed pill; grey like Draft; Completed tab with its
// count); Q-0191 (a completed project stays viewable: the card still opens the editor); the S01 mockup's pill
// markup (data-status on the pill).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import type { ProjectListState } from '../../lib/projects/projects-store';
import type { ProjectSummary } from '../../lib/projects/projects';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { ProjectCardWithMenu, type CardMenuConfig } from './ProjectCardMenu';
import { ProjectsBoard } from './ProjectsView';

const P: ProjectSummary = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Hall bath',
  clientName: null,
  address: '5 Done St',
  status: 'complete',
  openItems: 0,
  hasThumbnail: false,
  versionNo: 3,
};
const config: CardMenuConfig = {
  canEdit: true,
  canDelete: true,
  api: {
    rename: async () => {},
    setStatus: async () => {},
    setArchived: async () => {},
    setComplete: async () => {},
    remove: async () => {},
  },
  onChanged: () => {},
  onFailed: () => {},
};
const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {node}
    </MessagesProvider>,
  );

describe('EZD-137 completed card and tab', () => {
  it('the pill reads "Completed" and the card still opens the project', () => {
    const html = wrap(<ProjectCardWithMenu project={P} config={config} />);
    const pill = elements(html, 'project-card-status')[0];
    expect(textOf(pill.inner)).toBe('Completed');
    expect(attr(pill.attrs, 'data-status')).toBe('complete');
    const card = elements(html, 'project-card')[0];
    expect(card.tag).toBe('a');
    expect(attr(card.attrs, 'href')).toBe(`/projects/${P.id}`);
  });

  it('the Completed pill is grey like Draft', () => {
    const css = readFileSync(join(__dirname, 'Projects.module.css'), 'utf8');
    const rule = (status: string) =>
      css.match(new RegExp(`\\.pill\\[data-status='${status}'\\] \\{([^}]*)\\}`))?.[1].trim();
    expect(rule('complete')).toBeDefined();
    expect(rule('complete')).toBe(rule('draft'));
  });

  it('the Completed tab sits after In build with its count', () => {
    const state: ProjectListState = {
      status: 'ready',
      tab: 'complete',
      sort: 'edited',
      items: [P],
      next: null,
      moreStatus: 'idle',
      counts: {
        all: 4,
        draft: 1,
        client_review: 1,
        permit_submitted: 0,
        approved: 1,
        in_build: 1,
        complete: 1,
        archived: 0,
      },
      countsStatus: 'ready',
      search: '',
    };
    const html = wrap(<ProjectsBoard state={state} onTab={() => {}} onSort={() => {}} onMore={() => {}} />);
    const tab = elements(html, 'projects-tab-complete')[0];
    expect(textOf(tab.inner).startsWith('Completed')).toBe(true);
    expect(textOf(elements(tab.inner, 'projects-tab-count')[0].inner)).toBe('1');
    expect(attr(tab.attrs, 'aria-pressed')).toBe('true');
    expect(html.indexOf('projects-tab-in_build')).toBeLessThan(html.indexOf('projects-tab-complete'));
    expect(html.indexOf('projects-tab-complete')).toBeLessThan(html.indexOf('projects-tab-archived'));
  });
});
