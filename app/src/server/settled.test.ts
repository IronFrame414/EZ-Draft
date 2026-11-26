// Performance audit 2026-11-26: valueOf gives a settled read's value or throws its failure.
import { describe, expect, it } from 'vitest';
import { valueOf } from './settled';

describe('EZD-1404 valueOf (reads started together)', () => {
  it('returns the value of a read that answered and throws the reason of one that failed', async () => {
    const boom = new Error('db down');
    const [ok, failed] = await Promise.allSettled([Promise.resolve(7), Promise.reject(boom)]);
    expect(valueOf(ok)).toBe(7);
    expect(() => valueOf(failed)).toThrow(boom);
  });
});
