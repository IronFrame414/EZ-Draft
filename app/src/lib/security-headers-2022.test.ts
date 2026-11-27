// EZD-2022 (AC-EZD-2022-2, AC-EZD-2022-3; audit 2026-11-27 X6, X7): next.config.ts answers every path with a CSP
// that holds object-src 'none' and base-uri 'self' next to frame-ancestors 'self', a site-wide Referrer-Policy
// strict-origin-when-cross-origin (no-referrer on /c, /auth/confirm and /invite/<token>), HSTS with
// includeSubDomains, and no x-powered-by. The build header goes only to a caller with a session cookie.
// Expected values: the ticket's acceptance criteria and the audit rows. Next's own header matcher is run
// (unstable_getResponseFromNextConfig), so rule order and the cookie condition are tested as Next applies them.
// AC-EZD-2022-4: unit tests for the header changes; nothing here calls a live service.
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_BUILD_HEADER } from './app-version';

async function config() {
  return (await import('../../next.config')).default;
}

async function answer(pathname: string, cookie?: string) {
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
  const { unstable_getResponseFromNextConfig } = await import('next/experimental/testing/server');
  return unstable_getResponseFromNextConfig({
    url: `https://ezdraft.ezcontractorbinder.com${pathname}`,
    nextConfig: await config(),
    // The helper builds the Cookie header from this record (joined with ';'), replacing any cookie header given.
    cookies: Object.fromEntries(
      (cookie ?? '')
        .split(';')
        .map((c) => c.trim())
        .filter((c) => c !== '')
        .map((c) => [c.slice(0, c.indexOf('=')), c.slice(c.indexOf('=') + 1)]),
    ),
  });
}

const CSP = "frame-ancestors 'self'; object-src 'none'; base-uri 'self'";

describe('EZD-2022 browser protection headers', () => {
  it('every path carries the CSP, Referrer-Policy and HSTS', async () => {
    for (const p of ['/sign-in', '/projects', '/api/health', '/_next/static/chunks/a.js', '/robots.txt']) {
      const h = (await answer(p)).headers;
      expect(h.get('content-security-policy'), p).toBe(CSP);
      expect(h.get('referrer-policy'), p).toBe('strict-origin-when-cross-origin');
      expect(h.get('strict-transport-security'), p).toBe('max-age=63072000; includeSubDomains');
      expect(h.get('x-content-type-options'), p).toBe('nosniff');
    }
  });

  it('client links, the confirm page and invite links send no referrer', async () => {
    for (const p of ['/c', '/c/abc', '/c/abc/sheet', '/auth/confirm', '/invite/tok']) {
      expect((await answer(p)).headers.get('referrer-policy'), p).toBe('no-referrer');
    }
  });

  it('x-powered-by is off', async () => {
    expect((await config()).poweredByHeader).toBe(false);
  });

  it('robots.txt disallows everything', () => {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'robots.txt');
    expect(readFileSync(file, 'utf8')).toBe('User-agent: *\nDisallow: /\n');
  });
});

describe('EZD-2022 the build header goes only to signed-in callers', () => {
  const build = async () => (await config()).env?.EZD_APP_BUILD;

  it('no cookie, or no session cookie: no build header', async () => {
    for (const cookie of [
      undefined,
      '',
      'ezd_sign_in_lang=es',
      'ezd_signed_out=1; ezd_sign_in_email=a',
      'sb-ref-auth-token=',
      'xsb-ref-auth-token=v',
    ]) {
      for (const p of ['/sign-in', '/api/health', '/_next/static/chunks/a.js']) {
        expect((await answer(p, cookie)).headers.get(APP_BUILD_HEADER), `${p} ${cookie}`).toBeNull();
      }
    }
  });

  it('a session cookie, plain, prefixed or chunked, anywhere in the header: the build header', async () => {
    for (const cookie of [
      'sb-test-auth-token=v',
      '__Host-sb-prodref-auth-token=v',
      'sb-test-auth-token.0=v; sb-test-auth-token.1=w',
      'ezd_sign_in_lang=es; __Host-sb-prodref-auth-token.0=base64-abc',
    ]) {
      for (const p of ['/projects', '/api/health', '/_next/static/chunks/a.js']) {
        expect((await answer(p, cookie)).headers.get(APP_BUILD_HEADER), `${p} ${cookie}`).toBe(
          await build(),
        );
      }
    }
  });
});
