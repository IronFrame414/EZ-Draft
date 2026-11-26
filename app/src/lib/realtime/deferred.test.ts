// EZD-1997 (AC-EZD-1997-1: "after first paint or when idle"): afterPageReady waits for the window load event,
// then an idle moment (at most IDLE_TIMEOUT_MS), with a zero timer where requestIdleCallback is missing.
import { describe, expect, it } from 'vitest';
import { IDLE_TIMEOUT_MS, afterPageReady } from './deferred';

function fakeWindow(readyState: DocumentReadyState, idle: boolean) {
  const listeners = new Map<string, () => void>();
  const idleCalls: Array<{ cb: () => void; timeout?: number; cancelled: boolean }> = [];
  const timers: Array<{ cb: () => void; ms: number; cancelled: boolean }> = [];
  const win = {
    document: { readyState },
    addEventListener: (type: string, cb: () => void) => listeners.set(type, cb),
    removeEventListener: (type: string, cb: () => void) => {
      if (listeners.get(type) === cb) listeners.delete(type);
    },
    setTimeout: (cb: () => void, ms: number) => timers.push({ cb, ms, cancelled: false }) - 1,
    clearTimeout: (id: number) => {
      timers[id].cancelled = true;
    },
    ...(idle
      ? {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) =>
            idleCalls.push({ cb, timeout: opts?.timeout, cancelled: false }) - 1,
          cancelIdleCallback: (id: number) => {
            idleCalls[id].cancelled = true;
          },
        }
      : {}),
  };
  return { win: win as never, listeners, idleCalls, timers };
}

describe('EZD-1997 afterPageReady', () => {
  it('waits for the load event, then an idle callback with a timeout', () => {
    const f = fakeWindow('interactive', true);
    let runs = 0;
    afterPageReady(() => runs++, f.win);
    expect(f.idleCalls).toHaveLength(0);
    expect(f.listeners.has('load')).toBe(true);
    f.listeners.get('load')!();
    expect(f.listeners.has('load')).toBe(false);
    expect(f.idleCalls).toHaveLength(1);
    expect(f.idleCalls[0].timeout).toBe(IDLE_TIMEOUT_MS);
    expect(runs).toBe(0);
    f.idleCalls[0].cb();
    expect(runs).toBe(1);
  });

  it('a page already loaded goes straight to the idle wait', () => {
    const f = fakeWindow('complete', true);
    afterPageReady(() => {}, f.win);
    expect(f.listeners.has('load')).toBe(false);
    expect(f.idleCalls).toHaveLength(1);
  });

  it('without requestIdleCallback a zero timer runs it after load', () => {
    const f = fakeWindow('complete', false);
    let runs = 0;
    afterPageReady(() => runs++, f.win);
    expect(f.timers).toHaveLength(1);
    expect(f.timers[0].ms).toBe(0);
    f.timers[0].cb();
    expect(runs).toBe(1);
  });

  it('cancel before load removes the listener; cancel after load cancels the idle wait', () => {
    const before = fakeWindow('loading', true);
    afterPageReady(() => {}, before.win)();
    expect(before.listeners.has('load')).toBe(false);
    expect(before.idleCalls).toHaveLength(0);

    const after = fakeWindow('complete', true);
    afterPageReady(() => {}, after.win)();
    expect(after.idleCalls[0].cancelled).toBe(true);

    const timer = fakeWindow('complete', false);
    afterPageReady(() => {}, timer.win)();
    expect(timer.timers[0].cancelled).toBe(true);
  });
});
