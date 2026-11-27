// EZD-1930 (audit 2026-11-23 S6; AC-EZD-1930-1, AC-EZD-1930-3): next.config.ts headers() answers every path with
// frame-ancestors 'self', nosniff and a Permissions-Policy with camera, microphone and geolocation off, and keeps
// the earlier rules: Referrer-Policy no-referrer on /auth/confirm (EZD-007f) and /invite/:token (EZD-105), and the
// sw.js no-cache rule (EZD-013). Expected values: the ticket's acceptance criteria and those tickets' plans.
import { describe, expect, it } from 'vitest';

type Rule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<Rule[]> {
  const config = (await import('../../next.config')).default;
  return (await config.headers!()) as Rule[];
}

function headersFor(all: Rule[], source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of all.filter((r) => r.source === source)) {
    for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
}

describe('EZD-1930 security headers', () => {
  it('every path carries frame-ancestors self, nosniff and the Permissions-Policy', async () => {
    const all = headersFor(await rules(), '/:path*');
    // EZD-2022: the policy gained object-src 'none' and base-uri 'self'; frame-ancestors is still 'self'.
    expect(all['Content-Security-Policy'].split(';').map((d) => d.trim())).toContain(
      "frame-ancestors 'self'",
    );
    expect(all['X-Content-Type-Options']).toBe('nosniff');
    expect(all['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('never forbids same-origin framing (Run benchmark frames the editor)', async () => {
    const values = (await rules()).flatMap((r) => r.headers);
    expect(values.find((h) => h.key.toLowerCase() === 'x-frame-options')).toBeUndefined();
    // EZD-2022: object-src 'none' is allowed; only the frame-ancestors directive must not be 'none'.
    for (const h of values.filter((v) => v.key === 'Content-Security-Policy')) {
      const frame = h.value
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith('frame-ancestors'));
      expect(frame).toBe("frame-ancestors 'self'");
    }
  });

  it('keeps the Referrer-Policy rules and the sw.js Cache-Control rule', async () => {
    const all = await rules();
    expect(headersFor(all, '/auth/confirm')).toEqual({ 'Referrer-Policy': 'no-referrer' });
    expect(headersFor(all, '/invite/:token')).toEqual({ 'Referrer-Policy': 'no-referrer' });
    expect(headersFor(all, '/sw.js')).toEqual({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
  });
});
