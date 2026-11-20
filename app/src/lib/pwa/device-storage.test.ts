// EZD-134 (03b Architecture rule 10 "The app asks the browser for persistent storage and shows the answer").
import { describe, expect, it, vi } from 'vitest';
import { readPersistence, requestPersistentStorage } from './device-storage';

describe('EZD-134 persistent storage', () => {
  it('asks when not yet kept and answers the browser reply', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    expect(await requestPersistentStorage({ persisted: async () => false, persist })).toBe('kept');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(
      await requestPersistentStorage({ persisted: async () => false, persist: async () => false }),
    ).toBe('may_clear');
  });

  it('does not ask again when already kept', async () => {
    const persist = vi.fn();
    expect(await requestPersistentStorage({ persisted: async () => true, persist })).toBe('kept');
    expect(persist).not.toHaveBeenCalled();
  });

  it('no Storage API is unsupported; a failing call is may_clear', async () => {
    expect(await readPersistence(undefined)).toBe('unsupported');
    expect(await readPersistence({})).toBe('unsupported');
    expect(await readPersistence({ persisted: () => Promise.reject(new Error('x')) })).toBe('may_clear');
    expect(
      await requestPersistentStorage({
        persisted: async () => false,
        persist: () => Promise.reject(new Error('x')),
      }),
    ).toBe('may_clear');
  });
});
