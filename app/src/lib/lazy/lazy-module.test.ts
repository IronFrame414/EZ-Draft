// EZD-020 U1 (vault/plans/EZD-020.md section 4; Step 3): lazyModule.
import { describe, expect, it, vi } from 'vitest';
import { lazyModule } from './lazy-module';

describe('EZD-020 lazyModule', () => {
  it('EZD-020 U1 (a) one promise stays in flight', async () => {
    const value = { v: 1 };
    const load = vi.fn(() => Promise.resolve(value));
    const m = lazyModule(load);
    const [a, b] = await Promise.all([m.load(), m.load()]);
    const c = await m.load();
    expect(load).toHaveBeenCalledTimes(1);
    expect(a).toBe(value);
    expect(b).toBe(value);
    expect(c).toBe(value);
  });

  it('EZD-020 U1 (b) peek', async () => {
    const m = lazyModule(() => Promise.resolve({ v: 1 }));
    expect(m.peek()).toBeUndefined();
    await m.load();
    expect(m.peek()).toEqual({ v: 1 });
  });

  it('EZD-020 U1 (c) a rejected load is tried again', async () => {
    const load = vi
      .fn<() => Promise<{ v: number }>>()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue({ v: 1 });
    const m = lazyModule(load);
    await expect(m.load()).rejects.toThrow('x');
    expect(m.peek()).toBeUndefined();
    await expect(m.load()).resolves.toEqual({ v: 1 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('EZD-020 U1 (d) preload swallows a rejection', async () => {
    const load = vi
      .fn<() => Promise<{ v: number }>>()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue({ v: 1 });
    const events: unknown[] = [];
    const listener = (e: unknown) => events.push(e);
    process.on('unhandledRejection', listener);
    try {
      const m = lazyModule(load);
      m.preload();
      await new Promise((r) => setTimeout(r, 0));
      expect(events).toHaveLength(0);
      await expect(m.load()).resolves.toEqual({ v: 1 });
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });
});
