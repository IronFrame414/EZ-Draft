// EZD-1906a (AC-EZD-1906a-1) shared listener list and value store. Expected behaviour: editor plan R4 (get / set /
// subscribe; one store for simple values) and the hand-written stores it replaces (tools/switch-zone-tool.ts,
// tools/ceiling-device-tool.ts: notify a copy of the list, no notify when the value is unchanged).
import { describe, expect, it, vi } from 'vitest';
import { createListeners, createValueStore } from './value-store';

describe('EZD-1906a createListeners', () => {
  it('calls each listener with the arguments, until removed or cleared', () => {
    const list = createListeners<[number]>();
    const a = vi.fn();
    const b = vi.fn();
    const offA = list.add(a);
    list.add(b);
    list.notify(7);
    expect(a).toHaveBeenCalledWith(7);
    expect(b).toHaveBeenCalledWith(7);
    offA();
    list.notify(8);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    list.clear();
    list.notify(9);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('a listener that unsubscribes another during notify does not stop that one this round', () => {
    const list = createListeners();
    const calls: string[] = [];
    let offSecond = () => {};
    list.add(() => {
      calls.push('first');
      offSecond();
    });
    offSecond = list.add(() => calls.push('second'));
    list.notify();
    list.notify();
    expect(calls).toEqual(['first', 'second', 'first']);
  });
});

describe('EZD-1906a createValueStore', () => {
  it('get returns the value, set changes it and notifies', () => {
    const store = createValueStore(1);
    const l = vi.fn();
    store.subscribe(l);
    expect(store.get()).toBe(1);
    store.set(2);
    expect(store.get()).toBe(2);
    expect(l).toHaveBeenCalledTimes(1);
  });

  it('no notify when the value is unchanged', () => {
    const store = createValueStore('a');
    const l = vi.fn();
    store.subscribe(l);
    store.set('a');
    expect(l).not.toHaveBeenCalled();
  });

  it('a given equals decides what is unchanged', () => {
    const store = createValueStore({ n: 1 }, (a, b) => a.n === b.n);
    const l = vi.fn();
    store.subscribe(l);
    store.set({ n: 1 });
    expect(l).not.toHaveBeenCalled();
    store.set({ n: 2 });
    expect(l).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops the notifications', () => {
    const store = createValueStore(0);
    const l = vi.fn();
    const off = store.subscribe(l);
    off();
    store.set(1);
    expect(l).not.toHaveBeenCalled();
  });
});
