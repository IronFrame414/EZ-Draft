// EZD-117b U6, U7 (vault/plans/EZD-117b.md section 4; AC-EZD-117b-2, -3, -4). Expected values: Decided "Header
// markup" (wordmark "ez" + "draft", the title, the search field with its attributes and the "/" hint, the bell,
// the settings gear only when showSettings, the avatar menu; no EZ Binder link; no search and no bell when
// `search` is null), "/ key" (isSearchShortcut), Q-0401, S01 Controls. The avatar menu and the bell are stubs.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ProjectsHeader, isSearchShortcut } from './ProjectsHeader';
import { elements, textOf } from '../../../test-harness/projects-markup';

vi.mock('../account/AvatarMenu', async () => {
  const { createElement } = await import('react');
  return { AvatarMenu: () => createElement('span', { 'data-testid': 'avatar-menu-trigger' }) };
});
vi.mock('../notifications/NotificationBell', async () => {
  const { createElement } = await import('react');
  return {
    NotificationBell: () => createElement('button', { 'data-testid': 'notification-bell' }),
  };
});

const account = (showSettings: boolean) => ({
  initials: 'PO',
  name: 'Pat Owner',
  email: 'pat@example.test',
  showSettings,
});
const search = { query: '', onQuery: () => {}, onClear: () => {} };
const render = (showSettings: boolean, withSearch: boolean) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <ProjectsHeader account={account(showSettings)} search={withSearch ? search : null} />
    </MessagesProvider>,
  );
// React writes attribute names in its own case (maxLength); HTML does not care.
const attrOf = (attrs: string, name: string) =>
  new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'i').exec(attrs)?.[1] ?? null;

describe('EZD-117b projects header', () => {
  it(`EZD-117b done when: The header shows the wordmark, Projects, search, the notifications bell, the settings gear and the avatar, and no EZ Binder link (Q-0401). (U6)`, () => {
    const html = render(true, true);
    expect(elements(html, 'projects-header')).toHaveLength(1);
    expect(textOf(elements(html, 'projects-wordmark')[0].inner)).toBe('ezdraft');
    expect(textOf(elements(html, 'projects-header-title')[0].inner)).toBe('Projects');
    const input = elements(html, 'projects-search')[0];
    expect(attrOf(input.attrs, 'aria-label')).toBe('Search projects');
    expect(attrOf(input.attrs, 'placeholder')).toBe('Search client, address or project');
    expect(attrOf(input.attrs, 'aria-keyshortcuts')).toBe('/');
    expect(attrOf(input.attrs, 'maxlength')).toBe('1000');
    expect(textOf(elements(html, 'projects-search-hint')[0].inner)).toBe('/');
    expect(elements(html, 'notification-bell')).toHaveLength(1);
    const gear = elements(html, 'projects-settings')[0];
    expect(attrOf(gear.attrs, 'href')).toBe('/settings');
    expect(attrOf(gear.attrs, 'aria-label')).toBe('Company settings');
    expect(elements(html, 'avatar-menu-trigger')).toHaveLength(1);
    expect(html).not.toContain('EZ Contractor Binder');

    const noGear = render(false, true);
    expect(elements(noGear, 'projects-settings')).toHaveLength(0);
    expect(elements(noGear, 'projects-search')).toHaveLength(1);

    const noSearch = render(false, false);
    expect(elements(noSearch, 'projects-search')).toHaveLength(0);
    expect(elements(noSearch, 'notification-bell')).toHaveLength(0);
    expect(elements(noSearch, 'avatar-menu-trigger')).toHaveLength(1);
  });

  it(`EZD-117b done when: "/" focuses the search field unless focus is already in a text input; Esc clears the search. (U7)`, () => {
    const ev = (over: Record<string, unknown> = {}) => ({
      key: '/',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      defaultPrevented: false,
      isComposing: false,
      target: { tagName: 'BODY' } as unknown,
      ...over,
    });
    expect(isSearchShortcut(ev())).toBe(true);
    expect(isSearchShortcut(ev({ target: { tagName: 'INPUT', type: 'text' } }))).toBe(false);
    expect(isSearchShortcut(ev({ target: { tagName: 'INPUT', type: 'checkbox' } }))).toBe(true);
    expect(isSearchShortcut(ev({ target: { tagName: 'TEXTAREA' } }))).toBe(false);
    expect(isSearchShortcut(ev({ target: { isContentEditable: true } }))).toBe(false);
    expect(isSearchShortcut(ev({ ctrlKey: true }))).toBe(false);
    expect(isSearchShortcut(ev({ defaultPrevented: true }))).toBe(false);
    expect(isSearchShortcut(ev({ key: 'a' }))).toBe(false);
  });
});
