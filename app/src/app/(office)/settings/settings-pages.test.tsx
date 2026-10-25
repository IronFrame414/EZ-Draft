// EZD-103a U10 (vault/plans/EZD-103a.md sections 3, 4; AC-EZD-103-2, -3, -4).
// Expected values: plan Decided "Index" (first permitted section in nav order, 307; none → NoAccess in
// place, Q-0214, Q-0232) and "Section page" (unknown slug → 404; no switch → NoAccess, HTTP 200; else the
// unbuilt page body, Q-0226); the Next 16.4.2 redirect and notFound digests (plan section 2); preset
// arrays of supabase/migrations/20261024100001_create_permission_catalog.sql (Q-0223). Mocks: section 4.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION_KEYS, type PermissionKey } from '../../../lib/permissions/catalog';
import type { PermissionContext } from '../../../server/permissions';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/title-block',
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../../../server/auth/session', () => ({
  requireSession: async () => ({ authUserId: 'a1', appUserId: 'u1', email: 'josh@example.com' }),
}));
vi.mock('../../../server/permissions', async (orig) => ({
  ...(await orig<typeof import('../../../server/permissions')>()),
  getPermissionContext: vi.fn(),
}));
vi.mock('../../../server/auth/supabase-server', () => ({ createSessionClient: () => ({}) }));
vi.mock('../../../server/errors/report', () => ({ reportError: vi.fn(async () => ({})) }));

import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { getPermissionContext } from '../../../server/permissions';
import { StateHost } from '../../../components/states/StateHost';
import SectionPage from './[section]/page';
import IndexPage from './page';

const getCtx = vi.mocked(getPermissionContext);

const FOREMAN: PermissionKey[] = [
  'view_projects',
  'create_projects',
  'add_markup',
  'run_fast_renders',
  'export',
  'edit_field_tasks',
  'check_off_tasks',
  'photo_notes',
  'flag_conflict',
  'send_field_measurement',
  'settings_libraries',
];
const CREW: PermissionKey[] = ['view_projects', 'check_off_tasks', 'photo_notes', 'flag_conflict'];

const ctxWith = (keys: readonly PermissionKey[]): PermissionContext => ({
  appUserId: 'u1',
  membershipId: 'm1',
  scope: 'all',
  permissions: new Set<PermissionKey>(keys),
  listedProjectIds: new Set(),
});

const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>{el}</StateHost>
    </MessagesProvider>,
  );
const section = (slug: string) => SectionPage({ params: Promise.resolve({ section: slug }) });
const digestOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { digest?: string }).digest;
  }
  return 'resolved';
};
const h1Text = (html: string) =>
  /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1].replace(/<[^>]*>/g, '');

describe('EZD-103a settings pages', () => {
  afterEach(() => {
    getCtx.mockReset();
  });

  it('U10 section page: unknown slug is not found', async () => {
    getCtx.mockResolvedValue(ctxWith(PERMISSION_KEYS));
    expect(await digestOf(section('nope'))).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('U10 section page: with the switch, the unbuilt page body', async () => {
    getCtx.mockResolvedValue(ctxWith(PERMISSION_KEYS));
    const html = render((await section('title-block')) as ReactElement);
    expect(html).toContain('data-settings-page="title_block"');
    expect(h1Text(html)).toBe('Title block');
  });

  it('U10 section page: without the switch, NoAccess in place', async () => {
    getCtx.mockResolvedValue(ctxWith(CREW));
    const html = render((await section('title-block')) as ReactElement);
    expect(html).toContain('data-testid="no-access"');
    expect(html).not.toContain('data-settings-page');
  });

  it('U10 section page: context load failed returns null', async () => {
    getCtx.mockRejectedValue(new Error('db down'));
    expect(await section('title-block')).toBeNull();
  });

  it('U10 index: all keys redirects to Company', async () => {
    getCtx.mockResolvedValue(ctxWith(PERMISSION_KEYS));
    expect(await digestOf(IndexPage())).toBe('NEXT_REDIRECT;replace;/settings/company;307;');
  });

  it('U10 index: Foreman redirects to Libraries', async () => {
    getCtx.mockResolvedValue(ctxWith(FOREMAN));
    expect(await digestOf(IndexPage())).toBe('NEXT_REDIRECT;replace;/settings/libraries;307;');
  });

  it('U10 index: Crew gets NoAccess in place', async () => {
    getCtx.mockResolvedValue(ctxWith(CREW));
    const html = render((await IndexPage()) as ReactElement);
    expect(html).toContain('data-testid="no-access"');
  });

  it('U10 index: context load failed returns null', async () => {
    getCtx.mockRejectedValue(new Error('db down'));
    expect(await IndexPage()).toBeNull();
  });
});
