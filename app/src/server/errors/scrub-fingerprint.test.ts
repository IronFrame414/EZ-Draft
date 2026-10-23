// EZD-024 T4 and T5 (vault/plans/EZD-024.md Tests; Step 3): scrubbing and fingerprints. Pure functions: no
// database, no Sentry. Expected values are the plan's rows; the Stripe-shaped key is built at run time so the
// full literal never appears in the repo (plan note under the Tests table).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { scrubEvent, scrubText } from '../../lib/errors/scrub';
import { errorFingerprint, normalizeLocation, normalizeMessage } from './fingerprint';

const FAKE_KEY = 'sk_' + 'live_' + 'ABCdef1234567890ABCdef12';
const UUID = '6f1c9a2e-1111-4222-8333-444455556666';
const T4_TEXT = `User josh@x.test failed 3 times at https://ezdraft.ezcontractorbinder.com/c/AbCd?t=Zz9 for ${UUID} code 482913 key ${FAKE_KEY}`;

describe('EZD-024 scrubbing and fingerprints', () => {
  it('EZD-024 T4 scrubText and scrubEvent remove emails, ids, tokens, codes and request data', () => {
    expect(scrubText(T4_TEXT)).toBe(
      'User <email> failed 3 times at https://ezdraft.ezcontractorbinder.com/c/AbCd for <uuid> code <code> key <token>',
    );

    const event = {
      exception: { values: [{ type: 'Error', value: 'Bad a@b.test' }] },
      request: {
        url: `https://h.test/p/${UUID}/plan?x=1`,
        cookies: { s: '1' },
        data: 'x',
        query_string: 'x=1',
        headers: { 'User-Agent': 'UA', Authorization: 'Bearer t' },
      },
      user: { id: 'u1', email: 'a@b.test', ip_address: '1.2.3.4' },
      extra: { k: 'v' },
      breadcrumbs: [{ message: 'clicked' }],
    };
    const before = JSON.parse(JSON.stringify(event));
    const out = scrubEvent(event as never) as unknown as Record<string, unknown>;
    expect((out.exception as typeof event.exception).values[0].value).toBe('Bad <email>');
    expect(out.request).toEqual({
      url: 'https://h.test/p/<uuid>/plan',
      headers: { 'User-Agent': 'UA' },
    });
    expect(out.user).toEqual({ id: 'u1' });
    expect('extra' in out).toBe(false);
    expect('breadcrumbs' in out).toBe(false);
    expect(event).toEqual(before);
  });

  it('EZD-024 T5 normalizeMessage, normalizeLocation and errorFingerprint follow the Step 3 rules', () => {
    expect(normalizeMessage(T4_TEXT)).toBe(
      'User <email> failed <n> times at https://ezdraft.ezcontractorbinder.com/c/AbCd for <uuid> code <code> key <token>',
    );
    expect(normalizeLocation('browser', `https://h.test/p/${UUID}/plan?x=1#y`)).toBe(
      '/p/<id>/plan',
    );
    expect(normalizeLocation('browser', '/c/Q2x9mZ7pL0aB4cD8eF1g')).toBe('/c/<id>');
    expect(normalizeLocation('browser', '/dev/errors')).toBe('/dev/errors');

    const base = {
      source: 'function' as const,
      type: 'Error',
      message: `Job 42 failed for ${UUID}`,
      location: '/api/x',
    };
    const i = errorFingerprint(base);
    const ii = errorFingerprint({
      ...base,
      message: 'Job 43 failed for 0a1b2c3d-1111-4222-8333-444455556666',
    });
    const iii = errorFingerprint({ ...base, location: '/api/y' });
    const iv = errorFingerprint({ ...base, message: 'Job 42 broke' });
    const expected = createHash('sha256')
      .update('function\nError\nJob <n> failed for <uuid>\n/api/x')
      .digest('hex');
    // errorFingerprint is synchronous or async (Web Crypto); await handles both.
    return Promise.all([i, ii, iii, iv]).then(([a, b, c, d]) => {
      expect(a).toBe(expected);
      expect(b).toBe(a);
      expect(c).not.toBe(a);
      expect(d).not.toBe(a);
      for (const f of [a, b, c, d]) expect(f).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
