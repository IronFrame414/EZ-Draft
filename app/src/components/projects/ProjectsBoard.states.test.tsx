// EZD-117b U5 (vault/plans/EZD-117b.md section 4; AC-EZD-117b-5, -6). Expected values: Decided "Board states"
// (six skeleton cards of four `[data-skeleton]` while loading; `projects-error` with the InlineError and a Retry
// button when the page or the counts failed; `projects-empty` plus `projects-empty-new` only with canCreate for
// tab all and no search; otherwise `projects-no-match` with `projects-clear-filter`; `projects-more-error`;
// `projects-new` only with canCreate), S01 States, Q-0214. Strings: office catalog `en` (Decided "Strings").
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProjectListState } from '../../lib/projects/projects-store';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ProjectsBoard } from './ProjectsView';
import { elements, textOf } from '../../../test-harness/projects-markup';

const READY: ProjectListState = {
  status: 'ready',
  tab: 'all',
  sort: 'edited',
  items: [],
  next: null,
  moreStatus: 'idle',
  counts: { all: 0, draft: 0, client_review: 0, permit_submitted: 0, approved: 0, in_build: 0 },
  countsStatus: 'ready',
  search: '',
};
const ITEMS: ProjectListState['items'] = [
  { id: 'a', name: 'Alpha', clientName: null, address: '1 A St', status: 'draft', openItems: 0 },
  { id: 'b', name: 'Beta', clientName: null, address: '2 B St', status: 'draft', openItems: 0 },
];

const render = (state: ProjectListState, canCreate: boolean) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <ProjectsBoard
        state={state}
        canCreate={canCreate}
        onTab={() => {}}
        onSort={() => {}}
        onMore={() => {}}
        onRetry={() => {}}
        onClearFilters={() => {}}
      />
    </MessagesProvider>,
  );

const hasRetry = (inner: string) => /<button\b[^>]*>[\s\S]*?Retry[\s\S]*?<\/button>/.test(inner);

describe('EZD-117b projects board states', () => {
  it(`EZD-117b done when: No projects shows a one-line message with New project (Create projects only); no match shows "No projects match" with a clear-filter link; loading shows 6 card skeletons; a failed load shows "Projects could not load" with Retry. (U5)`, () => {
    const loading = render(
      { ...READY, status: 'loading', counts: null, countsStatus: 'loading' },
      true,
    );
    const skeletons = elements(loading, 'projects-skeleton');
    expect(skeletons).toHaveLength(6);
    for (const s of skeletons) expect(s.inner.match(/data-skeleton/g) ?? []).toHaveLength(4);

    for (const state of [
      { ...READY, status: 'error' as const },
      { ...READY, countsStatus: 'error' as const },
    ]) {
      const errors = elements(render(state, true), 'projects-error');
      expect(errors).toHaveLength(1);
      expect(textOf(errors[0].inner)).toContain('Projects could not load');
      expect(hasRetry(errors[0].inner)).toBe(true);
    }

    const empty = render(READY, true);
    const emptyBlock = elements(empty, 'projects-empty');
    expect(emptyBlock).toHaveLength(1);
    expect(textOf(emptyBlock[0].inner)).toContain('No projects yet');
    expect(textOf(elements(empty, 'projects-empty-new')[0].inner)).toBe('New project');
    expect(elements(empty, 'projects-new')).toHaveLength(1);
    expect(elements(empty, 'projects-no-match')).toHaveLength(0);

    const emptyNoCreate = render(READY, false);
    expect(elements(emptyNoCreate, 'projects-empty')).toHaveLength(1);
    expect(elements(emptyNoCreate, 'projects-empty-new')).toHaveLength(0);
    expect(elements(emptyNoCreate, 'projects-new')).toHaveLength(0);

    const noMatch = render({ ...READY, search: 'x' }, true);
    const block = elements(noMatch, 'projects-no-match');
    expect(block).toHaveLength(1);
    expect(textOf(block[0].inner)).toContain('No projects match');
    expect(textOf(elements(noMatch, 'projects-clear-filter')[0].inner)).toBe('Clear filter');
    expect(elements(noMatch, 'projects-empty')).toHaveLength(0);

    const more = render({ ...READY, items: ITEMS, next: 'n1', moreStatus: 'error' }, false);
    expect(elements(more, 'projects-more-error')).toHaveLength(1);

    const plain = render({ ...READY, items: ITEMS }, false);
    expect(elements(plain, 'projects-new')).toHaveLength(0);
  });
});
