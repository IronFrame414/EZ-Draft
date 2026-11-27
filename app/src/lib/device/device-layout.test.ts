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
  UPRIGHT_MIN_SIDE,
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

// EZD-2031: evaluates a comma list (or) of `and`-joined `(width < N px)` / `(height < N px)` features at a size.
function evaluate(query: string, width: number, height: number): boolean {
  return query.split(',').some((part) =>
    part
      .trim()
      .split(/\s+and\s+/)
      .every((feature) => {
        const m = /^\((width|height) < (\d+)px\)$/.exec(feature.trim());
        if (!m) return false;
        return (m[1] === 'width' ? width : height) < Number(m[2]);
      }),
  );
}

function fakeMatchMedia(width: number, height = 820) {
  const queries: string[] = [];
  const lists: FakeList[] = [];
  const fn = (query: string) => {
    queries.push(query);
    const list = {
      matches: evaluate(query, width, height),
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
  // EZD-2031 (Q-0908, which changes Q-0054 (a)): the full shell from 1024 px wide, and from 744 px wide on a screen
  // at least 744 px tall; a phone, also held sideways, keeps the phone layout.
  it('AC-EZD-2031-1, AC-EZD-2031-4: from 1024 px wide nothing changes; getDeviceLayout gives the full shell to an iPad held upright and the phone layout to a phone', () => {
    expect(FULL_SHELL_MIN_WIDTH).toBe(1024);
    expect(UPRIGHT_MIN_SIDE).toBe(744);
    expect(PHONE_LAYOUT_QUERY).toBe('(width < 744px), (width < 1024px) and (height < 744px)');
    expect(DESKTOP_REFERENCE_WIDTH).toBe(1600);
    expect(COMPACT_HEADER_QUERY).toBe('(width < 1600px)');
    expect(COARSE_POINTER_QUERY).toBe('(any-pointer: coarse)');

    const expected: Array<[number, number, string]> = [
      [390, 844, 'phone'],
      [430, 932, 'phone'],
      [932, 430, 'phone'],
      [844, 390, 'phone'],
      [743, 1100, 'phone'],
      [744, 744, 'full'],
      [744, 1133, 'full'],
      [768, 1024, 'full'],
      [834, 1194, 'full'],
      [1023, 743, 'phone'],
      [1023, 744, 'full'],
      [1024, 600, 'full'],
      [1024, 1366, 'full'],
      [1180, 820, 'full'],
      [1600, 1000, 'full'],
    ];
    for (const [w, h, layout] of expected) {
      const mm = fakeMatchMedia(w, h);
      expect(getDeviceLayout(mm.fn as unknown as typeof window.matchMedia), `${w}x${h}`).toBe(
        layout,
      );
      expect(mm.queries).toEqual([PHONE_LAYOUT_QUERY]);
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
    for (const [w, h, layout] of [
      [743, 1024, 'phone'],
      [768, 1024, 'full'],
      [1024, 600, 'full'],
    ] as const) {
      const spyW = vi.fn();
      const mm = fakeMatchMedia(w, h);
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

  // EZD-2031 (AC-EZD-2031-4: this test assumed the 1024 px boundary): the CSS hides the frame by the same query as PHONE_LAYOUT_QUERY, once, after the base rule.
  it('U8 part a: EditorFrame hides the frame by PHONE_LAYOUT_QUERY, once, after the base rule', () => {
    const css = squash(
      readFileSync(path.join(here, '../../components/shell/EditorFrame.module.css'), 'utf8'),
    );
    const hides = [...css.matchAll(/@media ([^{]+) \{ \.frame \{ display: none;? \} \}/g)];
    expect(hides).toHaveLength(1);
    expect(hides[0]![1]).toBe(PHONE_LAYOUT_QUERY);
    expect(css.split(`@media ${PHONE_LAYOUT_QUERY}`)).toHaveLength(2);
    const base = /(^| )\.frame \{[^{}]*\}/.exec(css);
    expect(base).not.toBeNull();
    expect(hides[0]!.index).toBeGreaterThan(base!.index + base![0].length - 1);
  });
});
