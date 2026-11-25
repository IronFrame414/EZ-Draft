// EZD-1990 (Q-0808; AC-EZD-1990-1, -3): the not-found page. Signed in it has the normal app header, the
// message and a "Back to Projects" button to Projects; signed out, or when who is signed in cannot be read, it
// is the bare page as before. Expected text: "Page not found." (Q-0273 (b)), "Página no encontrada." (EZD-136
// section 6 W3), "Back to Projects" (Q-0808), "Volver a Proyectos" (vault/build/assumptions.md EZD-1990).
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useT } from '../lib/messages';
import { attr, elements, textOf } from '../../test-harness/projects-markup';

const getSession = vi.fn();
const getNotFoundLanguage = vi.fn();
const settingsPermissionContext = vi.fn();
const loadProjectsAccount = vi.fn();
const reportError = vi.fn();
const headerProps = vi.fn();
const shellHeaderProps = vi.fn();

vi.mock('../server/auth/session', () => ({ getSession: () => getSession() }));
vi.mock('../server/messages/not-found-language', () => ({
  getNotFoundLanguage: () => getNotFoundLanguage(),
}));
vi.mock('../server/settings/shell-data', () => ({
  settingsPermissionContext: () => settingsPermissionContext(),
}));
vi.mock('../server/projects/account', () => ({
  loadProjectsAccount: (...a: unknown[]) => loadProjectsAccount(...a),
}));
vi.mock('../server/auth/supabase-server', () => ({ createSessionClient: () => ({}) }));
vi.mock('../server/errors/report', () => ({
  reportError: (...a: unknown[]) => reportError(...a),
}));
// The real header loads as its own chunk and needs the app router; a stand-in records its props and reads one
// office key, so the test proves the header gets the English office catalog.
// The button is the real one from the lazy chunk, rendered without the lazy step.
vi.mock('./not-found-header', async () => ({
  NotFoundBack: (
    await vi.importActual<typeof import('./not-found-header-shell')>('./not-found-header-shell')
  ).BackToProjects,
  NotFoundHeader: (props: unknown) => {
    headerProps(props);
    const t = useT();
    return <header data-testid="projects-header">{t('office.projects.title')}</header>;
  },
}));
vi.mock('../components/projects/ProjectsHeader', () => ({
  ProjectsHeader: (props: unknown) => {
    shellHeaderProps(props);
    return <header data-testid="shell-header" />;
  },
}));

import NotFound from './not-found';
import NotFoundHeaderShell from './not-found-header-shell';
import { MessagesProvider } from '../lib/messages';
import { catalogFor } from '../server/messages/catalog';

const SESSION = { authUserId: 'a1', appUserId: 'u1', email: 'owner@example.com' };
const ACCOUNT = { name: 'Owner Person', email: 'owner@example.com', initials: 'OP' };
const ALL_SETTINGS = {
  permissions: new Set(['view_projects', 'settings_company']),
  scope: 'all',
  listedProjectIds: new Set(),
};

async function render(): Promise<string> {
  return renderToStaticMarkup(await NotFound());
}

const one = (html: string, id: string) => {
  const found = elements(html, id);
  expect(found, id).toHaveLength(1);
  return found[0];
};

// The inner markup of the one <main>, and the lang of each of its direct div[lang] children.
function mainOf(html: string): { inner: string; langs: string[] } {
  const open = html.indexOf('<main');
  const close = html.lastIndexOf('</main>');
  expect(open, 'one main').toBeGreaterThanOrEqual(0);
  expect(html.indexOf('<main', open + 1), 'one main').toBe(-1);
  const inner = html.slice(html.indexOf('>', open) + 1, close);
  const langs: string[] = [];
  const tags = /<(\/?)([a-z0-9]+)([^>]*)>/g;
  let depth = 0;
  for (let t = tags.exec(inner); t !== null; t = tags.exec(inner)) {
    if (t[1] === '/') {
      depth--;
      continue;
    }
    if (depth === 0 && t[2] === 'div') {
      const lang = attr(t[3], 'lang');
      if (lang !== null) langs.push(lang);
    }
    if (!t[3].endsWith('/')) depth++;
  }
  return { inner, langs };
}

describe('EZD-1990 not-found page', () => {
  beforeEach(() => {
    getSession.mockReset();
    getNotFoundLanguage.mockReset().mockResolvedValue('en');
    settingsPermissionContext.mockReset().mockResolvedValue(ALL_SETTINGS);
    loadProjectsAccount.mockReset().mockResolvedValue(ACCOUNT);
    reportError.mockReset().mockResolvedValue(undefined);
    headerProps.mockReset();
  });

  it('signed in: the app header, the message and a Back to Projects button that opens Projects', async () => {
    getSession.mockResolvedValue(SESSION);
    const html = await render();
    expect(textOf(one(html, 'projects-header').inner)).toBe('Projects');
    expect(headerProps).toHaveBeenCalledWith(
      expect.objectContaining({ account: expect.objectContaining(ACCOUNT) }),
    );
    const main = mainOf(html);
    // The header is above main, not in it.
    expect(html.indexOf('data-testid="projects-header"')).toBeLessThan(html.indexOf('<main'));
    expect(elements(main.inner, 'projects-header')).toHaveLength(0);
    expect(textOf(one(main.inner, 'not-found').inner)).toBe('Page not found.');
    const back = one(main.inner, 'not-found-back');
    expect(back.tag).toBe('a');
    expect(textOf(back.inner)).toBe('Back to Projects');
    expect(attr(back.attrs, 'href')).toBe('/');
    expect(main.langs).toEqual(['en']);
    one(html, 'disclaimer');
    expect(reportError).not.toHaveBeenCalled();
  });

  it('signed in in Spanish: the message and button in Spanish, the header in English', async () => {
    getSession.mockResolvedValue(SESSION);
    getNotFoundLanguage.mockResolvedValue('es');
    const html = await render();
    expect(textOf(one(html, 'projects-header').inner)).toBe('Projects');
    const main = mainOf(html);
    expect(textOf(one(main.inner, 'not-found').inner)).toBe('Página no encontrada.');
    expect(textOf(one(main.inner, 'not-found-back').inner)).toBe('Volver a Proyectos');
    expect(main.langs).toEqual(['es']);
  });

  it('the settings gear follows the Projects page rule: hidden, and reported, when permissions fail to load', async () => {
    getSession.mockResolvedValue(SESSION);
    await render();
    expect(headerProps.mock.calls[0]?.[0]).toMatchObject({ account: { showSettings: true } });

    headerProps.mockReset();
    settingsPermissionContext.mockResolvedValue({
      permissions: new Set(['view_projects']),
      scope: 'all',
      listedProjectIds: new Set(),
    });
    await render();
    expect(headerProps.mock.calls[0]?.[0]).toMatchObject({ account: { showSettings: false } });
    expect(reportError).not.toHaveBeenCalled();

    headerProps.mockReset();
    settingsPermissionContext.mockResolvedValue('failed');
    await render();
    expect(headerProps.mock.calls[0]?.[0]).toMatchObject({ account: { showSettings: false } });
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('signed out: the bare page as before, with no header and no button', async () => {
    getSession.mockResolvedValue(null);
    const html = await render();
    expect(elements(html, 'projects-header')).toHaveLength(0);
    expect(elements(html, 'not-found-back')).toHaveLength(0);
    expect(headerProps).not.toHaveBeenCalled();
    const main = mainOf(html);
    expect(textOf(one(main.inner, 'not-found').inner)).toBe('Page not found.');
    one(main.inner, 'disclaimer');
    expect(main.langs).toEqual(['en']);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('a failed sign-in read or account read: reported, and the bare page (still a 404 page, never an error)', async () => {
    getSession.mockRejectedValue(Object.assign(new Error('db'), { code: 'XX000' }));
    let html = await render();
    expect(elements(html, 'projects-header')).toHaveLength(0);
    expect(textOf(one(html, 'not-found').inner)).toBe('Page not found.');
    expect(reportError).toHaveBeenCalledTimes(1);

    reportError.mockClear();
    getSession.mockResolvedValue(SESSION);
    loadProjectsAccount.mockRejectedValue(new Error('boom'));
    html = await render();
    expect(elements(html, 'projects-header')).toHaveLength(0);
    expect(elements(html, 'not-found-back')).toHaveLength(0);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('the header shell is the Projects header with no search, inside the toast host', () => {
    const account = { ...ACCOUNT, showSettings: true };
    const html = renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <NotFoundHeaderShell account={account} />
      </MessagesProvider>,
    );
    expect(elements(html, 'shell-header')).toHaveLength(1);
    expect(shellHeaderProps).toHaveBeenCalledWith({ account, search: null });
  });
});
