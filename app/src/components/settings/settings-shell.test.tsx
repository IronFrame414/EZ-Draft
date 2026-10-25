// EZD-103a U4, U5, U6 (vault/plans/EZD-103a.md sections 3, 4; AC-EZD-103-1, -2, -3, -6).
// Markup: section 3 "frame", "header", "nav", "status bar", "main", "load error". Expected values: plan
// Decided "Sections", "Badges", "Header", "Status bar", "Active item and location", "Unbuilt page body",
// "Load failure"; Q-0214 (hidden, not disabled); Q-0226; Q-0086 (error.db_unavailable English text);
// AC-EZD-102-3 (NoAccess). Position checks anchor on each element's own tag (L-020).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ path: '/settings/users' as string | null }));
vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => nav.path,
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));

import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { NoAccess } from '../states/NoAccess';
import { StateHost } from '../states/StateHost';
import { SettingsLoadError, SettingsMain, SettingsShell } from './SettingsShell';

const ALL = [
  'company',
  'users',
  'title_block',
  'sheet_presets',
  'defaults',
  'catalog',
  'render_models',
  'code_edition',
  'libraries',
  'system_status',
] as const;
const LABELS = [
  'Company',
  'Users + permissions',
  'Title block',
  'Sheet presets',
  'Defaults',
  'Catalog',
  'Render models',
  'Code edition',
  'Libraries',
  'System status',
];
const DOT = '·';

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const stripTags = (s: string) => decode(s.replace(/<[^>]*>/g, ''));
const count = (html: string, needle: string) => html.split(needle).length - 1;

const render = (el: ReactElement, path: string | null = '/settings/users') => {
  nav.path = path;
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>{el}</StateHost>
    </MessagesProvider>,
  );
};

// Text of the first element with the given tag carrying the attribute (no nested element of the same tag).
const textOf = (html: string, tag: string, attr: string) => {
  const m = new RegExp(`<${tag}\\b[^>]*\\b${attr}[^>]*>([\\s\\S]*?)</${tag}>`).exec(html);
  return m ? stripTags(m[1]) : null;
};
const openTag = (html: string, tag: string, attr: string) =>
  new RegExp(`<${tag}\\b[^>]*\\b${attr}[^>]*>`).exec(html)?.[0] ?? null;

type NavItem = { id: string; label: string; current: boolean; inner: string };
const navItems = (html: string): NavItem[] =>
  [...html.matchAll(/<a\b([^>]*\bdata-settings-nav="([^"]+)"[^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    id: m[2],
    current: /\baria-current="page"/.test(m[1]),
    inner: m[3],
    label: stripTags(
      m[3].replace(/<span\b[^>]*\bdata-settings-badge="[^"]*"[^>]*>[\s\S]*?<\/span>/g, ''),
    ).trim(),
  }));
const badges = (html: string) =>
  [...html.matchAll(/<span\b[^>]*\bdata-settings-badge="([^"]+)"[^>]*>([\s\S]*?)<\/span>/g)].map(
    (m) => [m[1], stripTags(m[2])],
  );

const shell = (props: Partial<Parameters<typeof SettingsShell>[0]> = {}) => (
  <SettingsShell
    companyName="Worth Properties"
    initials="JB"
    activeMembers={4}
    allowed={ALL}
    draftScope="m1"
    {...props}
  >
    <p data-c="" />
  </SettingsShell>
);

describe('EZD-103a settings shell', () => {
  it('U4 shell filled: header, nav in order with badges, status bar, children once', () => {
    const html = render(shell());
    expect(textOf(html, 'span', 'data-settings-nav-label')).toBe('Company settings');
    const items = navItems(html);
    expect(items.map((i) => i.id)).toEqual([...ALL]);
    expect(items.map((i) => i.label)).toEqual(LABELS);
    expect(count(html, 'aria-current="page"')).toBe(1);
    expect(items.filter((i) => i.current).map((i) => i.id)).toEqual(['users']);
    expect(badges(html)).toEqual([
      ['users', '4'],
      ['defaults', 'ft-in'],
    ]);
    expect(html).toMatch(
      /<span\b[^>]*\bdata-settings-wordmark\b[^>]*>\s*<span\b[^>]*>ez<\/span>\s*<span\b[^>]*>draft<\/span>\s*<\/span>/,
    );
    expect(textOf(html, 'span', 'data-settings-title')).toBe('Settings');
    expect(textOf(html, 'a', 'data-settings-back')).toBe('Projects');
    expect(openTag(html, 'a', 'data-settings-back')).toMatch(/\bhref="\/"/);
    expect(textOf(html, 'span', 'data-settings-company')).toBe('Worth Properties');
    expect(textOf(html, 'span', 'data-settings-avatar')).toBe('JB');
    expect(textOf(html, 'span', 'data-settings-status="company"')).toBe('Worth Properties');
    expect(textOf(html, 'span', 'data-settings-status="location"')).toBe(`Settings ${DOT} Users`);
    expect(count(html, 'data-c=""')).toBe(1);
    for (const word of ['translations', 'billing', 'ez binder', 'seat']) {
      expect(html.toLowerCase(), word).not.toContain(word);
    }
  });

  it('U5 (a) only the allowed item is listed', () => {
    const html = render(shell({ allowed: ['libraries'] }));
    expect(navItems(html).map((i) => i.id)).toEqual(['libraries']);
  });

  it('U5 (b) no allowed items: zero nav items, the nav label stays', () => {
    const html = render(shell({ allowed: [] }));
    expect(navItems(html)).toEqual([]);
    expect(textOf(html, 'span', 'data-settings-nav-label')).toBe('Company settings');
  });

  it('U5 (c) activeMembers null: users item present, no users badge', () => {
    const html = render(shell({ activeMembers: null }));
    expect(navItems(html).map((i) => i.id)).toContain('users');
    expect(html).not.toContain('data-settings-badge="users"');
  });

  it('U5 (d) path /settings: no active item, empty location', () => {
    const html = render(shell(), '/settings');
    expect(html).not.toContain('aria-current');
    expect(textOf(html, 'span', 'data-settings-status="location"')).toBe('');
  });

  it('U6 SettingsMain with a title, SettingsMain with NoAccess, SettingsLoadError', () => {
    const titled = render(
      <SettingsMain section="title_block" title="office.settings.section.title_block" />,
    );
    expect(count(titled, '<main')).toBe(1);
    expect(openTag(titled, 'main', 'data-settings-page')).toMatch(
      /\bdata-settings-page="title_block"/,
    );
    expect(count(titled, '<h1')).toBe(1);
    expect(stripTags(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(titled)?.[1] ?? '')).toBe('Title block');
    expect(stripTags(titled)).toBe('Title block');

    const denied = render(
      <SettingsMain>
        <NoAccess />
      </SettingsMain>,
    );
    expect(denied).toContain('data-testid="no-access"');
    expect(denied).not.toContain('<h1');
    expect(denied).not.toContain('data-settings-page');

    const failed = render(<SettingsLoadError />);
    expect(failed).toContain('data-settings-load-error');
    expect(failed).toContain('role="alert"');
    const text = stripTags(failed);
    expect(text).toContain("Can't reach the database. Try again in a minute.");
    expect(text).toContain('Retry');
  });
});
