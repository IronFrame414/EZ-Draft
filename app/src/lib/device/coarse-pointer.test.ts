// EZD-208b U1 (vault/plans/EZD-208b.md section 4; interface contract C5): coarsePointerStore reads the coarse-pointer
// query and listens once.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COARSE_POINTER_QUERY } from './device-layout';
import { coarsePointerStore } from './useDeviceLayout';

type FakeList = {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

function fakeMatchMedia(state: { matches: boolean }) {
  const queries: string[] = [];
  const lists: FakeList[] = [];
  const matchMedia = (query: string) => {
    queries.push(query);
    const list = {
      get matches() {
        return state.matches;
      },
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    lists.push(list as unknown as FakeList);
    return list as unknown as MediaQueryList;
  };
  return { matchMedia, queries, lists };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EZD-208b coarse pointer', () => {
  it('EZD-208b U1 coarsePointerStore reads the coarse query and listens once', () => {
    const state = { matches: true };
    const { matchMedia, queries, lists } = fakeMatchMedia(state);
    vi.stubGlobal('window', { matchMedia });

    expect(coarsePointerStore.getSnapshot()).toBe(true);
    state.matches = false;
    expect(coarsePointerStore.getSnapshot()).toBe(false);
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) expect(q).toBe('(any-pointer: coarse)');
    expect(COARSE_POINTER_QUERY).toBe('(any-pointer: coarse)');
    expect(coarsePointerStore.getServerSnapshot()).toBe(false);

    const before = lists.length;
    const onChange = vi.fn();
    const unsubscribe = coarsePointerStore.subscribe(onChange);
    const subscribed = lists.slice(before);
    const adds = subscribed.flatMap((l) => l.addEventListener.mock.calls);
    expect(adds).toHaveLength(1);
    expect(adds[0]![0]).toBe('change');
    const added = adds[0]![1];
    expect(typeof added).toBe('function');
    const removes = subscribed.flatMap((l) => l.removeEventListener.mock.calls);
    expect(removes).toHaveLength(0);

    unsubscribe();
    const removed = lists.slice(before).flatMap((l) => l.removeEventListener.mock.calls);
    expect(removed).toHaveLength(1);
    expect(removed[0]![0]).toBe('change');
    expect(removed[0]![1]).toBe(added);
  });
});
