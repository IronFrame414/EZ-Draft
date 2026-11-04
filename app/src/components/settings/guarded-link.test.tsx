// EZD-103b U16 (vault/plans/EZD-103b.md sections 1, 3, 4; AC-EZD-103-5).
// Expected values: plan section 4 row U16; section 1 Decided "Unsaved context" (the hooks and GuardedLink
// throw outside the provider with these texts), "GuardedLink" (own class then touch.target, every other
// prop passed through), "Draft store" (creating the store touches no IndexedDB, so server rendering is safe).
// Renders sit inside MessagesProvider > StateHost (section 4 header), so only the unsaved provider is missing
// in (a)-(c).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/company',
  useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
}));

import { MessagesProvider } from '../../lib/messages';
import type { DraftRecord, DraftStore } from '../../lib/settings/draft';
import { catalogFor } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { StateHost } from '../states/StateHost';
import {
  GuardedLink,
  UnsavedChangesProvider,
  useSettingsDraft,
  useUnsavedChanges,
} from './unsaved-changes';

const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>{el}</StateHost>
    </MessagesProvider>,
  );

function fakeStore() {
  const calls: [string, ...unknown[]][] = [];
  const store: DraftStore = {
    read: async (key: string) => {
      calls.push(['read', key]);
      return null;
    },
    write: async (key: string, record: DraftRecord) => {
      calls.push(['write', key, record]);
    },
    clear: async (key: string) => {
      calls.push(['clear', key]);
    },
  };
  return { calls, store };
}

function UsesUnsaved() {
  useUnsavedChanges(false, async () => true);
  return null;
}
function UsesDraft() {
  useSettingsDraft('dev_sample', null, () => {});
  return null;
}
function UsesBoth() {
  useUnsavedChanges(false, async () => true);
  useSettingsDraft('dev_sample', null, () => {});
  return <i data-probe="" />;
}

const link = () => (
  <GuardedLink href="/settings/users" className="x" data-settings-nav="users" aria-current="page">
    U
  </GuardedLink>
);

describe('EZD-103b guard hooks and link', () => {
  it('U16 (a) useUnsavedChanges outside the provider throws', () => {
    expect(() => render(<UsesUnsaved />)).toThrow(
      'useUnsavedChanges must be used inside SettingsShell',
    );
  });

  it('U16 (b) useSettingsDraft outside the provider throws', () => {
    expect(() => render(<UsesDraft />)).toThrow(
      'useSettingsDraft must be used inside SettingsShell',
    );
  });

  it('U16 (c) GuardedLink outside the provider throws', () => {
    expect(() => render(<GuardedLink href="/">P</GuardedLink>)).toThrow(
      'GuardedLink must be used inside SettingsShell',
    );
  });

  it('U16 (d) inside the provider: one link with the props passed through, no store call', () => {
    const f = fakeStore();
    const html = render(
      <UnsavedChangesProvider draftScope="m1" draftStore={f.store}>
        {link()}
        <UsesBoth />
      </UnsavedChangesProvider>,
    );
    const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
    expect(anchors.length).toBe(1);
    const [, attrs, inner] = anchors[0];
    expect(attrs).toMatch(/\bhref="\/settings\/users"/);
    expect(attrs).toMatch(/\bdata-settings-nav="users"/);
    expect(attrs).toMatch(/\baria-current="page"/);
    expect((/\bclass="([^"]*)"/.exec(attrs)?.[1] ?? '').split(' ')).toEqual(['x', touch.target]);
    expect(inner).toBe('U');
    expect(html).toContain('data-probe=""');
    expect(f.calls).toEqual([]);
  });

  it('U16 (e) inside the provider with no draftStore: renders without throwing', () => {
    expect(() =>
      render(
        <UnsavedChangesProvider draftScope="m1">
          {link()}
          <UsesBoth />
        </UnsavedChangesProvider>,
      ),
    ).not.toThrow();
  });
});
