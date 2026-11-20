// EZD-134 (03b Architecture rule 12 "Every request carries the app version"; Q-0530; Q-0540): same-origin fetches
// carry the build; an answer from a newer build to a request other than a save marks the page outdated.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_BUILD_HEADER } from '../app-version';
import { installVersionFetch, isNewerBuild, isSaveRequest, outdatedStore } from './version-fetch';

const ORIGIN = 'https://ezdraft.example.com';
const P = '00000000-0000-4000-8000-000000000001';

function makeWin(serverBuild: string | null) {
  const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    const headers = new Headers();
    if (serverBuild !== null) headers.set(APP_BUILD_HEADER, serverBuild);
    return new Response('{}', { headers });
  });
  const win = { fetch: fetch as unknown as typeof globalThis.fetch, location: { href: `${ORIGIN}/`, origin: ORIGIN } };
  return { win, calls };
}

afterEach(() => outdatedStore.reset());

describe('EZD-134 version helpers', () => {
  it('a save is POST /api/projects/<id>/objects only', () => {
    expect(isSaveRequest('POST', new URL(`/api/projects/${P}/objects`, ORIGIN))).toBe(true);
    expect(isSaveRequest('post', new URL(`/api/projects/${P}/objects`, ORIGIN))).toBe(true);
    expect(isSaveRequest('GET', new URL(`/api/projects/${P}/objects`, ORIGIN))).toBe(false);
    expect(isSaveRequest('POST', new URL(`/api/projects/${P}/checkpoints`, ORIGIN))).toBe(false);
  });

  it('newer only when the header is a number above this build', () => {
    expect(isNewerBuild('101', 100)).toBe(true);
    expect(isNewerBuild('100', 100)).toBe(false);
    expect(isNewerBuild('99', 100)).toBe(false);
    expect(isNewerBuild(null, 100)).toBe(false);
    expect(isNewerBuild('abc', 100)).toBe(false);
    expect(isNewerBuild('101, 101', 100)).toBe(false);
  });
});

describe('EZD-134 installVersionFetch', () => {
  it('adds the build to same-origin requests, keeps their own headers, leaves other origins untouched', async () => {
    const { win, calls } = makeWin('100');
    installVersionFetch(win, 100);
    await win.fetch('/api/projects/counts', { headers: { accept: 'application/json' } });
    await win.fetch(new Request(`${ORIGIN}/api/profile`, { headers: { 'x-a': '1' } }));
    await win.fetch('https://supabase.example.com/rest/v1/x');
    const h0 = new Headers(calls[0].init?.headers);
    expect(h0.get(APP_BUILD_HEADER)).toBe('100');
    expect(h0.get('accept')).toBe('application/json');
    const h1 = new Headers(calls[1].init?.headers);
    expect(h1.get(APP_BUILD_HEADER)).toBe('100');
    expect(h1.get('x-a')).toBe('1');
    expect(calls[2].init).toBeUndefined();
  });

  it('wraps once', async () => {
    const { win, calls } = makeWin('100');
    installVersionFetch(win, 100);
    installVersionFetch(win, 100);
    await win.fetch('/x');
    expect(calls).toHaveLength(1);
  });

  it('a newer build on a request other than a save marks the page outdated', async () => {
    const { win } = makeWin('101');
    installVersionFetch(win, 100);
    expect(outdatedStore.get()).toBe(false);
    const seen = vi.fn();
    const off = outdatedStore.subscribe(seen);
    await win.fetch('/api/notifications');
    expect(outdatedStore.get()).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    off();
  });

  it('a save is passed on untouched and left to the save path (EZD-299, Q-0540)', async () => {
    const { win, calls } = makeWin('101');
    installVersionFetch(win, 100);
    const init = { method: 'POST', body: '{}' };
    await win.fetch(`/api/projects/${P}/objects`, init);
    expect(calls[0].init).toBe(init);
    expect(outdatedStore.get()).toBe(false);
  });

  it('the same or an older build, or no header, is not outdated', async () => {
    for (const b of ['100', '99', null]) {
      const { win } = makeWin(b);
      installVersionFetch(win, 100);
      await win.fetch('/api/notifications');
      expect(outdatedStore.get(), String(b)).toBe(false);
    }
  });
});
