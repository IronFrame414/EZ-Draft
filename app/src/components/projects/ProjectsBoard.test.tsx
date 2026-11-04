// EZD-117a U8 (vault/plans/EZD-117a.md section 4; AC-EZD-117a-1, -6). Expected values: Decided "Tabs" (six
// buttons in PROJECT_TABS order with aria-pressed; the count only when counts is not null), "Sort menu" (trigger
// shows the current sort label, aria-label "Sort by {sort}"; the menu items render only while open, so they are
// asserted in browser test B5) and "Board markup" (grid data-state; cards only when ready; nothing else while
// loading). Strings: Decided "Strings", section 6. Renders in the real office catalog.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProjectListState } from '../../lib/projects/projects-store';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ProjectsBoard } from './ProjectsView';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';

const READY: ProjectListState = {
  status: 'ready',
  tab: 'all',
  sort: 'name',
  items: [],
  next: null,
  moreStatus: 'idle',
  counts: { all: 6, draft: 2, client_review: 1, permit_submitted: 1, approved: 1, in_build: 1 },
  countsStatus: 'ready',
};
const TABS = ['all', 'draft', 'client_review', 'permit_submitted', 'approved', 'in_build'];
const LABELS = ['All', 'Draft', 'Client review', 'Permit submitted', 'Approved', 'In build'];

const render = (state: ProjectListState) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <ProjectsBoard state={state} onTab={() => {}} onSort={() => {}} onMore={() => {}} />
    </MessagesProvider>,
  );

describe('EZD-117a projects board markup', () => {
  it('U8 six tabs with counts, the sort trigger, and the loading board', () => {
    const html = render(READY);
    expect(textOf(elements(html, 'projects-title')[0].inner)).toBe('Projects');
    const tabs = TABS.flatMap((t) => elements(html, `projects-tab-${t}`));
    expect(tabs).toHaveLength(6);
    const positions = TABS.map((t) => html.indexOf(`data-testid="projects-tab-${t}"`));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    tabs.forEach((tab, i) => {
      expect(textOf(tab.inner).startsWith(LABELS[i])).toBe(true);
      expect(attr(tab.attrs, 'aria-pressed')).toBe(i === 0 ? 'true' : 'false');
    });
    expect(elements(html, 'projects-tab-count').map((c) => textOf(c.inner))).toEqual([
      '6',
      '2',
      '1',
      '1',
      '1',
      '1',
    ]);
    const sort = elements(html, 'projects-sort');
    expect(sort).toHaveLength(1);
    expect(textOf(sort[0].inner)).toBe('Name');
    expect(attr(sort[0].attrs, 'aria-label')).toBe('Sort by Name');

    const noCounts = render({ ...READY, counts: null, countsStatus: 'loading' });
    expect(elements(noCounts, 'projects-tab-count')).toHaveLength(0);

    const loading = render({
      ...READY,
      status: 'loading',
      items: [],
      next: 'n1',
      counts: null,
      countsStatus: 'loading',
    });
    expect(attr(elements(loading, 'projects-grid')[0].attrs, 'data-state')).toBe('loading');
    expect(elements(loading, 'project-card')).toHaveLength(0);
    expect(elements(loading, 'projects-more')).toHaveLength(0);
  });
});
