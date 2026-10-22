// EZD-015b · U5 (vault/plans/EZD-015b.md Section 4). Sources: Q-0058 (a); D-ToastStore behaviour.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_DEFAULT_MS, createToastStore, type ToastOptions } from './toast-store';

const M = 'dev.messages.sample' as const;
const HOUR = 3_600_000;

describe('EZD-015b toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('U5 (a) default duration constant', () => {
    expect(TOAST_DEFAULT_MS).toBe(5000);
  });

  it('EZD-015b done when: A toast appears and clears after its time', () => {
    const store = createToastStore();
    const id = store.show({ message: M, duration: 1000 });
    expect(id).toBe('1');
    const def = store.show({ message: M });
    const zero = store.show({ message: M, duration: 0 });
    const has = (i: string) => store.getSnapshot().some((t) => t.id === i);
    vi.advanceTimersByTime(999);
    expect(has(id)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(has(id)).toBe(false);
    vi.advanceTimersByTime(3999);
    expect(has(def)).toBe(true);
    expect(has(zero)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(has(def)).toBe(false);
    expect(has(zero)).toBe(false);
    const s2 = createToastStore();
    s2.show({ message: M, duration: 1000 });
    s2.show({ message: M });
    s2.show({ message: M, duration: 0 });
    expect(s2.getSnapshot().map((t) => t.duration)).toEqual([1000, 5000, 5000]);
  });

  it('U5 (c) duration null stays until dismissed', () => {
    const store = createToastStore();
    const id = store.show({ message: M, duration: null });
    vi.advanceTimersByTime(HOUR);
    expect(store.getSnapshot().length).toBe(1);
    store.dismiss(id);
    expect(store.getSnapshot()).toEqual([]);
  });

  it('EZD-015b done when: a toast with an action stays until used or closed', () => {
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    const spy3 = vi.fn();
    const store = createToastStore();
    store.show({ message: M, action: { label: 'common.retry', onPress: spy2 } });
    store.show({
      message: M,
      action: { label: 'common.retry', onPress: spy3 },
      duration: 1000,
    } as unknown as ToastOptions);
    const id = store.show({
      message: M,
      duration: null,
      action: { label: 'common.retry', onPress: spy1 },
    });
    vi.advanceTimersByTime(HOUR);
    const snap = store.getSnapshot();
    expect(snap.length).toBe(3);
    expect(snap.map((t) => t.duration)).toEqual([null, null, null]);
    expect(spy2).toHaveBeenCalledTimes(0);
    expect(spy3).toHaveBeenCalledTimes(0);
    expect(vi.getTimerCount()).toBe(0);
    store.press(id);
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().some((t) => t.id === id)).toBe(false);
    store.press(id);
    expect(spy1).toHaveBeenCalledTimes(1);
  });

  it('U5 (e) snapshot, subscribe, defaults', () => {
    const store = createToastStore();
    store.show({ message: M });
    store.show({ message: M });
    const snap = store.getSnapshot();
    expect(snap.map((t) => t.id)).toEqual(['1', '2']);
    expect(snap[0].tone).toBe('neutral');
    expect(snap[0].action).toBeNull();
    expect(store.getSnapshot()).toBe(snap);
    const spy = vi.fn();
    const off = store.subscribe(spy);
    store.dismiss('1');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(snap);
    store.dismiss('999');
    expect(spy).toHaveBeenCalledTimes(1);
    off();
    store.show({ message: M });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('U5 (f) dismiss clears the timer', () => {
    const store = createToastStore();
    const id = store.show({ message: M, duration: 1000 });
    vi.advanceTimersByTime(500);
    store.dismiss(id);
    expect(vi.getTimerCount()).toBe(0);
  });
});
