// EZD-134 (11 Offline "cached by the service worker after first load"; 03b Architecture rule 10): after a load the
// page names to the worker the page and the files it loaded (not its API reads), then asks for persistent storage.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WARM_MESSAGE } from './sw-constants.mjs';
import { loadedFiles, openProjectOf, startWarm, warmData } from './warm-message';

const ORIGIN = 'https://ezdraft.example.com';
const P = '00000000-0000-4000-8000-000000000001';
const entry = (name: string, initiatorType: string) => ({ name, initiatorType }) as unknown as PerformanceEntry;

afterEach(() => vi.unstubAllGlobals());

describe('EZD-134 warm message', () => {
  it('names the files the page loaded, not its fetches', () => {
    expect(
      loadedFiles([
        entry(`${ORIGIN}/_next/static/chunks/a.js`, 'script'),
        entry(`${ORIGIN}/_next/static/chunks/b.css`, 'link'),
        entry(`${ORIGIN}/api/projects/counts`, 'fetch'),
        entry(`${ORIGIN}/api/x`, 'xmlhttprequest'),
      ]),
    ).toEqual([`${ORIGIN}/_next/static/chunks/a.js`, `${ORIGIN}/_next/static/chunks/b.css`]);
  });

  it('the open project is a project page id', () => {
    expect(openProjectOf(`/projects/${P}`)).toBe(P);
    expect(openProjectOf(`/projects/${P}/plan`)).toBe(P);
    expect(openProjectOf('/')).toBeNull();
    expect(openProjectOf('/projects/not-an-id')).toBeNull();
  });

  it('the message carries the build, the page when asked, the files and the open project', () => {
    const loc = { href: `${ORIGIN}/projects/${P}`, pathname: `/projects/${P}` };
    expect(warmData(loc, ['f'], true, 7)).toEqual({
      type: WARM_MESSAGE,
      build: 7,
      page: loc.href,
      files: ['f'],
      openProject: P,
    });
    expect(warmData(loc, [], false, 7).page).toBeNull();
  });

  it('posts once to the active worker, observes later files, then asks for persistent storage', async () => {
    const postMessage = vi.fn();
    const observe = vi.fn();
    const persist = vi.fn(async () => true);
    vi.stubGlobal('window', { location: { href: `${ORIGIN}/`, pathname: '/' } });
    vi.stubGlobal('performance', {
      getEntriesByType: () => [entry(`${ORIGIN}/_next/static/chunks/a.js`, 'script')],
    });
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        observe = observe;
      },
    );
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist } });
    await startWarm(Promise.resolve({ active: { postMessage } }));
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0]).toMatchObject({
      type: WARM_MESSAGE,
      page: `${ORIGIN}/`,
      files: [`${ORIGIN}/_next/static/chunks/a.js`],
      openProject: null,
    });
    expect(observe).toHaveBeenCalledWith({ type: 'resource' });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('without a worker it still asks for persistent storage and never throws', async () => {
    const persist = vi.fn(async () => false);
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist } });
    await expect(startWarm(Promise.reject(new Error('no worker')))).resolves.toBeUndefined();
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
