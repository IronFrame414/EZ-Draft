// EZD-134: the caching rules (sw-rules.mjs). The worker's routes match only offline and only same-origin pages of
// the app shell or projects and static files; the API, auth links, invites and dev pages never match. The page
// side uses the same path rules.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_PREFIX,
  PROJECT_CACHE,
  SHELL_CACHE,
  STATIC_CACHE,
  isProjectPath,
  isShellPath,
  isStaticPath,
  isStorable,
  offlineProjectPage,
  offlineShellPage,
  offlineStaticFile,
} from './sw-rules.mjs';

const ORIGIN = 'https://ezdraft.example.com';
const nav = (p: string, origin = ORIGIN) => ({ request: { mode: 'navigate' }, url: new URL(p, origin) });
const sub = (p: string) => ({ request: { mode: 'cors' }, url: new URL(p, ORIGIN) });
const asWorker = (onLine: boolean) => {
  vi.stubGlobal('location', { origin: ORIGIN });
  vi.stubGlobal('self', { navigator: { onLine } });
};
afterEach(() => vi.unstubAllGlobals());

const SHELL = ['/', '/settings', '/settings/defaults', '/terms'];
const NEVER = ['/api/projects', '/sign-in', '/auth/confirm', '/invite/abc', '/dev/shell'];

describe('EZD-134 caching rules', () => {
  it('cache names share the prefix sign-out clears', () => {
    for (const n of [SHELL_CACHE, STATIC_CACHE, PROJECT_CACHE]) expect(n.startsWith(CACHE_PREFIX)).toBe(true);
  });

  it('path rules: shell pages (not sign-in), project pages, static files', () => {
    for (const p of SHELL) expect(isShellPath(p), p).toBe(true);
    for (const p of [...NEVER, '/projects/x']) expect(isShellPath(p), p).toBe(false);
    expect(isProjectPath('/projects/0b7e')).toBe(true);
    expect(isProjectPath('/projects/0b7e/plan')).toBe(true);
    expect(isProjectPath('/projects')).toBe(false);
    expect(isProjectPath('/api/projects/abc')).toBe(false);
    expect(isStaticPath('/_next/static/chunks/a.js')).toBe(true);
    expect(isStaticPath('/app-icons/icon-192.png')).toBe(true);
    expect(isStaticPath('/icons/x.svg')).toBe(true);
    expect(isStaticPath('/sw.js')).toBe(false);
    expect(isStaticPath('/api/health')).toBe(false);
  });

  it('online the worker routes match nothing', () => {
    asWorker(true);
    for (const p of SHELL) expect(offlineShellPage(nav(p)), p).toBe(false);
    expect(offlineProjectPage(nav('/projects/abc'))).toBe(false);
    expect(offlineStaticFile({ url: new URL('/_next/static/a.js', ORIGIN) })).toBe(false);
  });

  it('offline: same-origin shell and project page loads and static files; nothing else', () => {
    asWorker(false);
    for (const p of SHELL) expect(offlineShellPage(nav(p)), p).toBe(true);
    for (const p of [...NEVER, '/projects/x']) expect(offlineShellPage(nav(p)), p).toBe(false);
    expect(offlineShellPage(nav('/', 'https://evil.example.com'))).toBe(false);
    expect(offlineShellPage(sub('/'))).toBe(false);
    expect(offlineProjectPage(nav('/projects/abc'))).toBe(true);
    expect(offlineProjectPage(sub('/projects/abc'))).toBe(false);
    expect(offlineProjectPage(nav('/api/projects/abc'))).toBe(false);
    expect(offlineStaticFile({ url: new URL('/_next/static/a.js', ORIGIN) })).toBe(true);
    expect(offlineStaticFile({ url: new URL('/_next/static/a.js', 'https://cdn.example.com') })).toBe(false);
    expect(offlineStaticFile({ url: new URL('/api/health', ORIGIN) })).toBe(false);
  });

  it('stores only a whole same-origin answer: no error, redirect or opaque answer', () => {
    const r = (status: number, type = 'basic', redirected = false) =>
      ({ status, type, redirected }) as unknown as Response;
    expect(isStorable(r(200))).toBe(true);
    expect(isStorable(r(500))).toBe(false);
    expect(isStorable(r(404))).toBe(false);
    expect(isStorable(r(200, 'basic', true))).toBe(false);
    expect(isStorable(r(0, 'opaqueredirect'))).toBe(false);
    expect(isStorable(r(200, 'cors'))).toBe(false);
    expect(isStorable(null)).toBe(false);
  });
});
