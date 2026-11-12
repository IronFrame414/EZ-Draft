// EZD-104 U4-U5 (vault/plans/EZD-104.md section 4; AC-EZD-104-1, -7). Expected values: Decided "Search bound"
// (trimmed q up to 1,000 characters), "Page bound" (absent or /^[1-9][0-9]{0,5}$/; L-061) and "Touch call"
// (never rejects; 42501 ignored; others reported once with alert false; Q-0695 03 row 34).
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../errors/report', () => ({ reportError: vi.fn(async () => ({})) }));

import { reportError } from '../errors/report';
import { parseUsersQuery, touchLastActive } from './users';

const report = vi.mocked(reportError);
const parse = (qs: string) => parseUsersQuery(new URLSearchParams(qs));

describe('EZD-104 users server functions', () => {
  beforeEach(() => {
    report.mockClear();
  });

  it('U4 parseUsersQuery bounds', () => {
    expect(parse('')).toEqual({ q: '', page: 1 });
    expect(parse('q=%20Ann%20')).toEqual({ q: 'Ann', page: 1 });
    expect(parse(`q=${'a'.repeat(1000)}`)).toEqual({ q: 'a'.repeat(1000), page: 1 });
    expect(parse(`q=${'a'.repeat(1001)}`)).toBeNull();
    expect(parse('page=1')).toEqual({ q: '', page: 1 });
    expect(parse('page=999999')).toEqual({ q: '', page: 999999 });
    for (const bad of ['0', '01', '-1', '1.5', 'abc', '1000000'])
      expect(parse(`page=${bad}`), `page=${bad}`).toBeNull();
  });

  it('U5 touchLastActive never rejects', async () => {
    const run = async (answer: () => Promise<unknown>) => {
      const rpc = vi.fn<(...args: unknown[]) => Promise<unknown>>(answer);
      const out = await touchLastActive({ rpc } as never);
      expect(out).toBeUndefined();
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls[0]?.[0]).toBe('touch_last_active');
    };
    await run(async () => ({ error: null }));
    expect(report).toHaveBeenCalledTimes(0);
    await run(async () => ({ error: { code: 'XX000' } }));
    expect(report).toHaveBeenCalledTimes(1);
    await run(async () => ({ error: { code: '42501' } }));
    expect(report).toHaveBeenCalledTimes(1);
    await run(async () => {
      throw new Error('boom');
    });
    expect(report).toHaveBeenCalledTimes(2);
    for (const call of report.mock.calls) {
      expect(call[0]).toBeInstanceOf(Error);
      expect((call[0] as Error).message).toBe('last_active_touch_failed');
      expect(call[1]).toEqual({
        source: 'function',
        location: 'permissions.last_active',
        alert: false,
      });
    }
  });
});
