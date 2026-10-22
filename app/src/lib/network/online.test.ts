// EZD-015a · U4 (vault/plans/EZD-015a.md Section 4). Sources: P-Step 1; 11 rule 11; Decided Listeners.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOnlineSource } from './online';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('EZD-015a online source', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('EZD-015a done when: useOnline follows the browser online and offline events with no timer', () => {
    const target = new EventTarget();
    let added = 0;
    let removed = 0;
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    target.addEventListener = ((...a: Parameters<EventTarget['addEventListener']>) => {
      added++;
      return add(...a);
    }) as EventTarget['addEventListener'];
    target.removeEventListener = ((...a: Parameters<EventTarget['removeEventListener']>) => {
      removed++;
      return remove(...a);
    }) as EventTarget['removeEventListener'];
    const nav = { onLine: true };
    const source = createOnlineSource(target, nav);
    const spy = vi.fn();
    expect(source.getSnapshot()).toBe(true);
    const unsubscribe = source.subscribe(spy);
    expect(vi.getTimerCount()).toBe(0);
    nav.onLine = false;
    target.dispatchEvent(new Event('offline'));
    expect(source.getSnapshot()).toBe(false);
    nav.onLine = true;
    target.dispatchEvent(new Event('online'));
    expect(source.getSnapshot()).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    unsubscribe();
    target.dispatchEvent(new Event('offline'));
    target.dispatchEvent(new Event('online'));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(added).toBe(2);
    expect(removed).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('U4 without a window the source reads online and subscribes to nothing', () => {
    const source = createOnlineSource();
    expect(source.getSnapshot()).toBe(true);
    expect(typeof source.subscribe(() => {})).toBe('function');
  });

  it('U4 online.ts holds no timer or request', () => {
    const text = readFileSync(path.join(here, 'online.ts'), 'utf8');
    for (const word of ['setInterval', 'setTimeout', 'fetch(']) {
      expect(text).not.toContain(word);
    }
  });
});
