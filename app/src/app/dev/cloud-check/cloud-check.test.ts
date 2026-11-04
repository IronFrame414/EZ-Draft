// EZD-171 T11 (vault/plans/EZD-171.md section 4).
import { describe, expect, it, vi } from 'vitest';
import { runCloudCheck } from './cloud-check';

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

describe('EZD-171 cloud check probe', () => {
  it('EZD-171 T11 runCloudCheck reads plain, then with the fake header', async () => {
    const b1 = { n: 1 };
    const b2 = { n: 2 };
    const f = vi.fn().mockResolvedValueOnce(json(b1)).mockResolvedValueOnce(json(b2));
    const r = await runCloudCheck(f as unknown as typeof fetch);
    expect(r).toEqual({ plain: b1, withFakeHeader: b2 });
    expect(f.mock.calls[0]).toEqual(['/dev/cloud-check/read', { cache: 'no-store' }]);
    expect(f.mock.calls[1][0]).toBe('/dev/cloud-check/read');
    expect(f.mock.calls[1][1]).toMatchObject({
      cache: 'no-store',
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });

    const f500 = vi.fn().mockResolvedValueOnce(json(b1)).mockResolvedValueOnce(json({}, 500));
    expect(await runCloudCheck(f500 as unknown as typeof fetch)).toEqual({ error: 'fetch_failed' });

    const fThrow = vi.fn().mockRejectedValue(new Error('network'));
    expect(await runCloudCheck(fThrow as unknown as typeof fetch)).toEqual({
      error: 'fetch_failed',
    });
  });
});
