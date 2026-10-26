// EZD-014a · U1 (a)-(e), U8 part a (vault/plans/EZD-014a.md Section 4).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COARSE_POINTER_QUERY,
  COMPACT_HEADER_QUERY,
  DESKTOP_REFERENCE_WIDTH,
  FULL_SHELL_MIN_WIDTH,
  PHONE_LAYOUT_QUERY,
  getDeviceLayout,
  subscribeDeviceLayout,
} from './device-layout';
import { deviceLayoutStore } from './useDeviceLayout';

const here = path.dirname(fileURLToPath(import.meta.url));

type FakeList = {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

function fakeMatchMedia(width: number) {
  const queries: string[] = [];
  const lists: FakeList[] = [];
  const fn = (query: string) => {
    queries.push(query);
    const m = /^\(width < (\d+)px\)$/.exec(query);
    const list = {
      matches: m ? width < Number(m[1]) : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    lists.push(list);
    return list as unknown as MediaQueryList;
  };
  return { fn, queries, lists };
}

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
const squash = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EZD-014a device layout', () => {
  it('EZD-014a done when: getDeviceLayout returns phone below 1024 px and full from 1024 px', () => {
    expect(FULL_SHELL_MIN_WIDTH).toBe(1024);
    expect(PHONE_LAYOUT_QUERY).toBe('(width < 1024px)');
    expect(PHONE_LAYOUT_QUERY).toBe(`(width < ${FULL_SHELL_MIN_WIDTH}px)`);
    expect(DESKTOP_REFERENCE_WIDTH).toBe(1600);
    expect(COMPACT_HEADER_QUERY).toBe('(width < 1600px)');
    expect(COARSE_POINTER_QUERY).toBe('(any-pointer: coarse)');

    const expected: Array<[number, string]> = [
      [390, 'phone'],
      [1023, 'phone'],
      [1024, 'full'],
      [1180, 'full'],
      [1600, 'full'],
    ];
    for (const [w, layout] of expected) {
      const mm = fakeMatchMedia(w);
      expect(getDeviceLayout(mm.fn as unknown as typeof window.matchMedia), String(w)).toBe(layout);
      expect(mm.queries).toEqual(['(width < 1024px)']);
    }
  });

  it('U1 (c) subscribeDeviceLayout adds one change listener on the list and none on window', () => {
    const spyW = vi.fn();
    vi.stubGlobal('window', { addEventListener: spyW, removeEventListener: vi.fn() });
    const mm = fakeMatchMedia(500);
    const cb = vi.fn();
    const off = subscribeDeviceLayout(mm.fn as unknown as typeof window.matchMedia, cb);
    const list = mm.lists[0];
    expect(list.addEventListener).toHaveBeenCalledTimes(1);
    const [type, handler] = list.addEventListener.mock.calls[0];
    expect(type).toBe('change');
    expect(typeof handler).toBe('function');
    handler();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect(list.removeEventListener).toHaveBeenCalledTimes(1);
    expect(list.removeEventListener).toHaveBeenCalledWith('change', handler);
    expect(spyW).toHaveBeenCalledTimes(0);
  });

  it('U1 (d) the store reads the window and the server snapshot is full (EZD-158)', () => {
    for (const [w, layout] of [
      [1023, 'phone'],
      [1024, 'full'],
    ] as const) {
      const spyW = vi.fn();
      const mm = fakeMatchMedia(w);
      vi.stubGlobal('window', { matchMedia: mm.fn, addEventListener: spyW });
      expect(deviceLayoutStore.getSnapshot()).toBe(layout);
      expect(deviceLayoutStore.getServerSnapshot()).toBe('full');
      const before = mm.lists.length;
      const off = deviceLayoutStore.subscribe(() => {});
      const subscribed = mm.lists.slice(before).filter((l) => l.addEventListener.mock.calls.length);
      const adds = subscribed.flatMap((l) => l.addEventListener.mock.calls);
      expect(adds).toHaveLength(1);
      expect(adds[0][0]).toBe('change');
      expect(subscribed).toHaveLength(1);
      off();
      expect(subscribed[0].removeEventListener.mock.calls).toEqual([['change', adds[0][1]]]);
      expect(mm.lists.flatMap((l) => l.removeEventListener.mock.calls)).toHaveLength(1);
      expect(spyW).toHaveBeenCalledTimes(0);
      vi.unstubAllGlobals();
    }
  });

  it('U1 (e) neither file listens to resize', () => {
    for (const f of ['device-layout.ts', 'useDeviceLayout.ts']) {
      const text = stripComments(readFileSync(path.join(here, f), 'utf8'));
      expect(text, f).not.toContain('resize');
    }
  });

  it('U8 part a: EditorFrame hides the frame below 1024 px, once, after the base rule', () => {
    const css = squash(
      readFileSync(path.join(here, '../../components/shell/EditorFrame.module.css'), 'utf8'),
    );
    expect(css.match(/@media \(width < 1024px\)/g) ?? []).toHaveLength(1);
    const media = /@media \(width < 1024px\) \{ \.frame \{ display: none;? \} \}/.exec(css);
    expect(media).not.toBeNull();
    const base = /(^| )\.frame \{[^{}]*\}/.exec(css);
    expect(base).not.toBeNull();
    expect(media!.index).toBeGreaterThan(base!.index + base![0].length - 1);
    expect(1024).toBe(FULL_SHELL_MIN_WIDTH);
  });
});
