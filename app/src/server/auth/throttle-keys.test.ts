// EZD-033 T10 (vault/plans/EZD-033.md Tests; Step 5): clientIp(headers, env) and throttleKey(scope, value).
// Expected values: Q-0104 (v) (IPv6 by /64, IPv4 by full address, IPv4-mapped IPv6 as IPv4), (vi) (null only
// with VERCEL_ENV unset; on Vercel loopback, private, carrier-NAT, link-local, unparsable or missing give
// 'unknown'), (vii) (HKDF key from the gate secret, label ezd-sign-in-throttle-v1), Q-0094 (keyed hashes only).
// clientIp takes a Headers object and an env record ({ VERCEL_ENV }); it reads only x-forwarded-for.
import { createHmac, hkdfSync } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { clientIp, throttleKey } from './throttle';

const ip = (xff: string | null, env: Record<string, string | undefined> = {}) => {
  const headers = new Headers();
  if (xff !== null) headers.set('x-forwarded-for', xff);
  return clientIp(headers, env);
};

const S1 = 'test-secret-one-0123456789-abcdefghijklmnopqrstuvwxyz';
const S2 = 'test-secret-two-0123456789-abcdefghijklmnopqrstuvwxyz';

describe('EZD-033 throttle keys', () => {
  const saved = process.env.SUPABASE_API_GATE_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.SUPABASE_API_GATE_SECRET;
    else process.env.SUPABASE_API_GATE_SECRET = saved;
  });

  it('EZD-033 T10 clientIp with VERCEL_ENV unset (local and CI)', () => {
    expect(ip('203.0.113.7')).toBe('203.0.113.7'); // (a)
    expect(ip('203.0.113.7, 10.0.0.1')).toBe('203.0.113.7'); // (b)
    expect(ip('127.0.0.1')).toBeNull(); // (c)
    expect(ip('127.5.6.7')).toBeNull(); // (d)
    expect(ip('::1')).toBeNull(); // (e)
    expect(ip('::ffff:127.0.0.1')).toBeNull(); // (f)
    expect(ip('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64'); // (g)
    expect(ip('2001:0db8:0001:0002:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64'); // (h)
    expect(ip('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64'); // (i)
    expect(ip('::ffff:203.0.113.9')).toBe('203.0.113.9'); // (j)
    expect(ip('abc')).toBe('unknown'); // (k)
    expect(ip(null)).toBeNull(); // (l)
  });

  it('EZD-033 T10 clientIp with VERCEL_ENV set (preview or production)', () => {
    const prod = { VERCEL_ENV: 'production' };
    expect(ip(null, prod)).toBe('unknown'); // (m)
    expect(ip('127.0.0.1', prod)).toBe('unknown'); // (n)
    expect(ip('10.0.0.1', prod)).toBe('unknown'); // (o)
    expect(ip('::1', { VERCEL_ENV: 'preview' })).toBe('unknown'); // (p)
    expect(ip('fe80::1', prod)).toBe('unknown'); // (q)
    for (const addr of [
      '172.16.0.1',
      '192.168.1.1',
      '100.64.0.1',
      '169.254.1.1',
      'fc00::1',
      'abc',
    ]) {
      expect(ip(addr, prod), addr).toBe('unknown'); // (r)
    }
    expect(ip('203.0.113.7', prod)).toBe('203.0.113.7'); // (s)
  });

  it('EZD-033 T10 clientIp reads only x-forwarded-for', () => {
    const headers = new Headers({
      'x-real-ip': '203.0.113.50',
      'x-vercel-forwarded-for': '203.0.113.51',
    });
    expect(clientIp(headers, {})).toBeNull();
    expect(clientIp(headers, { VERCEL_ENV: 'production' })).toBe('unknown');
  });

  it('EZD-033 T10 throttleKey is an HKDF-keyed HMAC of scope:value under the gate secret', () => {
    process.env.SUPABASE_API_GATE_SECRET = S1;
    const key = throttleKey('email', 'Crew@Example.test ');
    const expected = createHmac(
      'sha256',
      Buffer.from(hkdfSync('sha256', S1, Buffer.alloc(0), 'ezd-sign-in-throttle-v1', 32)),
    )
      .update('email:crew@example.test')
      .digest('hex');
    expect(key).toBe(expected);
    expect(key).toMatch(/^[0-9a-f]{64}$/);

    process.env.SUPABASE_API_GATE_SECRET = S2;
    const other = throttleKey('email', 'Crew@Example.test ');
    expect(other).toMatch(/^[0-9a-f]{64}$/);
    expect(other).not.toBe(key);

    delete process.env.SUPABASE_API_GATE_SECRET;
    expect(() => throttleKey('email', 'Crew@Example.test ')).toThrow();
  });
});
