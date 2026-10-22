// EZD-015a · U7 (vault/plans/EZD-015a.md Section 4). Source: Decided asyncReducer; P-Step 3.
import { describe, expect, it } from 'vitest';
import { asyncReducer, INITIAL_ASYNC_STATE } from './async-state';

describe('EZD-015a async reducer', () => {
  it('U7 follows the latest run and ignores late or unknown runs', () => {
    expect(INITIAL_ASYNC_STATE).toEqual({ status: 'pending', run: 0 });
    const p1 = asyncReducer<string>(INITIAL_ASYNC_STATE, { type: 'start', run: 1 });
    expect(p1).toEqual({ status: 'pending', run: 1 });
    const r1 = asyncReducer<string>(p1, { type: 'resolve', run: 1, data: 'A' });
    expect(r1).toEqual({ status: 'ready', run: 1, data: 'A' });
    const E = new Error('boom');
    const p2 = asyncReducer<string>(r1, { type: 'start', run: 2 });
    expect(p2.status).toBe('pending');
    expect(p2.run).toBe(2);
    expect(p2.data).toBeUndefined();
    expect(p2.error).toBeUndefined();
    const e2 = asyncReducer<string>(p2, { type: 'reject', run: 2, error: E });
    expect(e2).toEqual({ status: 'error', run: 2, error: E });
    const p3 = asyncReducer<string>(e2, { type: 'start', run: 3 });
    const late = asyncReducer<string>(p3, { type: 'resolve', run: 2, data: 'late' });
    expect(late).toBe(p3);
    expect(late.status).toBe('pending');
    const r3 = asyncReducer<string>(late, { type: 'resolve', run: 3, data: 'C' });
    expect(r3.status).toBe('ready');
    expect(r3.data).toBe('C');
    const stray = asyncReducer<string>(r3, { type: 'reject', run: 9, error: E });
    expect(stray).toBe(r3);
  });
});
