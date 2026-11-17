// EZD-128 C1, C2 (vault/plans/EZD-128.md section 4; AC-EZD-128-1, -3, -4). Expected values: section 3 data-testid
// rows; Decided "List states" (3 skeleton rows; "No recent projects"; "No projects match", S01:99; "Projects
// could not load" with Retry, S01:101, Q-0214), "Busy row" ("Saving…", 04 Header card subtitle), "Leave failed"
// (EZD-126's "Couldn't stop editing. You still hold the lock.", vault/build/assumptions.md EZD-128); S01:8 "Back
// to projects"; S01:32 search label and placeholder; PROJECT_SEARCH_MAX 1000; section 6 wording.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import { ProjectSwitcherPanel } from './ProjectSwitcher';
import type { SwitcherState } from './switcher-store';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {} }) }));

const P3 = { id: '33333333-3333-4333-8333-333333333333', name: 'charlie', clientName: 'acme' };
const P2 = { id: '22222222-2222-4222-8222-222222222222', name: 'Alpha', clientName: null };
const base: SwitcherState = {
  open: true,
  query: '',
  mode: 'recent',
  term: '',
  list: { status: 'ready', items: [P3, P2] },
  leaving: { status: 'idle' },
};
const store = {
  setQuery: () => {},
  retryList: () => {},
  pick: async () => {},
  backToProjects: async () => {},
  retryLeave: async () => {},
};

function render(state: Partial<SwitcherState>): string {
  const ui: ReactElement = (
    <ProjectSwitcherPanel state={{ ...base, ...state }} store={store} panelId="sw1" />
  );
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );
}

const one = (html: string, id: string) => {
  const found = elements(html, id);
  expect(found, id).toHaveLength(1);
  return found[0];
};

describe('EZD-128 ProjectSwitcherPanel', () => {
  it('C1 renders each state', () => {
    const states: Partial<SwitcherState>[] = [
      { list: { status: 'loading' } },
      {},
      { list: { status: 'ready', items: [] } },
      { mode: 'search', term: 'zz', query: 'zz', list: { status: 'ready', items: [] } },
      { list: { status: 'failed' } },
      { leaving: { status: 'busy', target: { kind: 'project', projectId: P3.id } } },
      { leaving: { status: 'failed', target: { kind: 'project', projectId: P3.id } } },
    ];
    for (const s of states) {
      const html = render(s);
      const panel = one(html, 'project-switcher');
      expect(attr(panel.attrs, 'role')).toBe('dialog');
      expect(attr(panel.attrs, 'aria-label')).toBe('Switch project');
      expect(attr(panel.attrs, 'id')).toBe('sw1');
      expect(attr(panel.attrs, 'data-mode')).toBe(s.mode ?? 'recent');
      expect(attr(panel.attrs, 'data-list')).toBe((s.list ?? base.list).status);
      expect(attr(panel.attrs, 'data-leaving')).toBe((s.leaving ?? base.leaving).status);
      const back = one(html, 'project-switcher-back');
      expect(attr(back.attrs, 'href')).toBe('/');
      const input = one(html, 'project-switcher-search');
      expect(attr(input.attrs, 'type')).toBe('search');
      expect(attr(input.attrs, 'maxLength')).toBe('1000');
      expect(attr(input.attrs, 'aria-label')).toBe('Search projects');
      expect(attr(input.attrs, 'placeholder')).toBe('Search client, address or project');
    }

    const loading = render({ list: { status: 'loading' } });
    expect(one(loading, 'project-switcher-loading').inner.match(/data-skeleton=""/g)).toHaveLength(
      3,
    );
    expect(textOf(one(loading, 'project-switcher-back').inner)).toBe('Back to projects');

    const ready = render({});
    const items = elements(ready, 'project-switcher-item');
    expect(items.map((i) => attr(i.attrs, 'href'))).toEqual([
      `/projects/${P3.id}`,
      `/projects/${P2.id}`,
    ]);
    expect(items.map((i) => attr(i.attrs, 'data-project-id'))).toEqual([P3.id, P2.id]);
    expect(elements(ready, 'project-switcher-item-name').map((e) => textOf(e.inner))).toEqual([
      'charlie',
      'Alpha',
    ]);
    expect(elements(ready, 'project-switcher-item-client').map((e) => textOf(e.inner))).toEqual([
      'acme',
    ]);
    expect(items.every((i) => attr(i.attrs, 'aria-disabled') === null)).toBe(true);

    expect(
      textOf(one(render({ list: { status: 'ready', items: [] } }), 'project-switcher-empty').inner),
    ).toBe('No recent projects');
    const noMatch = render({ mode: 'search', term: 'zz', list: { status: 'ready', items: [] } });
    expect(textOf(one(noMatch, 'project-switcher-no-match').inner)).toBe('No projects match');
    expect(elements(noMatch, 'project-switcher-empty')).toHaveLength(0);

    const failed = one(render({ list: { status: 'failed' } }), 'project-switcher-error');
    expect(textOf(failed.inner)).toContain('Projects could not load');
    expect(failed.inner).toMatch(/<button[^>]*>Retry<\/button>/);

    const busy = render({
      leaving: { status: 'busy', target: { kind: 'project', projectId: P3.id } },
    });
    const busyItems = elements(busy, 'project-switcher-item');
    expect(attr(busyItems[0].attrs, 'aria-busy')).toBe('true');
    expect(attr(busyItems[1].attrs, 'aria-busy')).toBeNull();
    expect(textOf(elements(busy, 'project-switcher-item-client')[0].inner)).toBe('Saving…');
    for (const el of [...busyItems, one(busy, 'project-switcher-back')]) {
      expect(attr(el.attrs, 'aria-disabled')).toBe('true');
    }
    expect(one(busy, 'project-switcher-search').attrs).toMatch(/(?:^|\s)readOnly=""/);

    const backBusy = render({ leaving: { status: 'busy', target: { kind: 'projects' } } });
    expect(textOf(one(backBusy, 'project-switcher-back').inner)).toBe('Saving…');

    const leaveFailed = render({
      leaving: { status: 'failed', target: { kind: 'project', projectId: P3.id } },
    });
    const err = one(leaveFailed, 'project-switcher-leave-error');
    expect(textOf(err.inner).replace(/&#x27;/g, "'")).toContain(
      "Couldn't stop editing. You still hold the lock.",
    );
    expect(err.inner).toMatch(/<button[^>]*>Retry<\/button>/);
    expect(elements(leaveFailed, 'project-switcher-item')).toHaveLength(2);
    expect(leaveFailed.indexOf('project-switcher-leave-error')).toBeLessThan(
      leaveFailed.indexOf('project-switcher-back'),
    );
  });

  it('C2 the office.switcher keys are English only', () => {
    const keys = Object.entries(en).filter(([k]) => k.startsWith('office.switcher.'));
    expect(Object.fromEntries(keys)).toEqual({
      'office.switcher.label': 'Switch project',
      'office.switcher.no_recent': 'No recent projects',
      'office.switcher.back': 'Back to projects',
    });
    expect(Object.keys(es).some((k) => k.startsWith('office.'))).toBe(false);
  });
});
