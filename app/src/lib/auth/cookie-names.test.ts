// EZD-342 N1-N7 (vault/plans/EZD-342.md sections 3 and 4; AC-EZD-342-1 to 4; Q-0600; Q-0599): the one shared
// cookie-name module and the source scan that keeps every writer and reader on it. No database, no network.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { signedOutCookieName } from './device-sign-out';
import {
  SIGNED_OUT_COOKIE,
  SIGN_IN_EMAIL_COOKIE,
  appCookieName,
  isForwardedHttps,
  isSessionCookieName,
  readableCookies,
} from './cookie-names';

// Non-test source files under app/src (same helpers as session.test.ts T34).
const appSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(appSrc, '..', '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const isTestFile = (file: string) =>
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) ||
  file.split(path.sep).some((part) => part === 'test-harness' || part === 'test-utils');

const rel = (file: string) => path.relative(repoRoot, file).split(path.sep).join('/');

const withProto = (value?: string) => {
  const h = new Headers();
  if (value !== undefined) h.set('x-forwarded-proto', value);
  return h;
};

describe('EZD-342 cookie names', () => {
  it('N1 appCookieName prefixes on https only', () => {
    expect(appCookieName('ezd_sign_in_email', true)).toBe('__Host-ezd_sign_in_email');
    expect(appCookieName('ezd_sign_in_email', false)).toBe('ezd_sign_in_email');
    expect(appCookieName('sb-127-auth-token.0', true)).toBe('__Host-sb-127-auth-token.0');
  });

  it('N2 isForwardedHttps reads the first x-forwarded-proto value, case-sensitive', () => {
    expect(isForwardedHttps(withProto('https'))).toBe(true);
    expect(isForwardedHttps(withProto('https, http'))).toBe(true);
    expect(isForwardedHttps(withProto(' https '))).toBe(true);
    expect(isForwardedHttps(withProto('http, https'))).toBe(false);
    expect(isForwardedHttps(withProto('HTTPS'))).toBe(false);
    expect(isForwardedHttps(withProto())).toBe(false);
  });

  const LIST = [
    { name: 'sb-x-auth-token', value: 'a' },
    { name: '__Host-sb-x-auth-token', value: 'b' },
    { name: '__Host-sb-x-auth-token.0', value: 'c' },
    { name: 'ezd_sign_in_lang', value: 'es' },
    { name: '__host-ezd_sign_in_email', value: 'x@y.co' },
    { name: '__HOST-sb-y', value: 'd' },
    { name: '__Host-', value: 'e' },
    { name: 'keep', value: 'me' },
  ];

  it('N3 readableCookies on https keeps only exact __Host- names, prefix removed', () => {
    expect(readableCookies(LIST, true)).toEqual([
      { name: 'sb-x-auth-token', value: 'b' },
      { name: 'sb-x-auth-token.0', value: 'c' },
    ]);
  });

  it('N4 readableCookies on http returns a new array with every cookie unchanged', () => {
    const out = readableCookies(LIST, false);
    expect(out).toEqual(LIST);
    expect(out).not.toBe(LIST);
  });

  it('N5 isSessionCookieName', () => {
    expect(isSessionCookieName('sb-x-auth-token')).toBe(true);
    expect(isSessionCookieName('__Host-sb-x-auth-token.1')).toBe(true);
    expect(isSessionCookieName('xsb-a')).toBe(false);
    expect(isSessionCookieName('__Host-ezd_signed_out')).toBe(false);
    expect(isSessionCookieName('keep')).toBe(false);
  });

  it('N6 the marker name comes from the one name function', () => {
    expect(SIGNED_OUT_COOKIE).toBe('ezd_signed_out');
    expect(SIGN_IN_EMAIL_COOKIE).toBe('ezd_sign_in_email');
    expect(signedOutCookieName(true)).toBe(appCookieName(SIGNED_OUT_COOKIE, true));
    expect(signedOutCookieName(true)).toBe('__Host-ezd_signed_out');
    expect(signedOutCookieName(false)).toBe(appCookieName(SIGNED_OUT_COOKIE, false));
    expect(signedOutCookieName(false)).toBe('ezd_signed_out');
  });

  it('N7 no writer or reader skips the name function', () => {
    const sources = walk(appSrc).filter((f) => /\.[cm]?[jt]sx?$/.test(f) && !isTestFile(f));
    const files = sources.map((f) => ({ file: rel(f), body: readFileSync(f, 'utf8') }));
    const matching = (re: RegExp) =>
      files
        .filter((x) => re.test(x.body))
        .map((x) => x.file)
        .sort();

    expect(
      matching(
        /['"](?:__Host-|sb-|x-forwarded-proto['"]|ezd_sign_in_email['"]|ezd_sign_in_lang['"]|ezd_signed_out['"])/,
      ),
    ).toEqual(['app/src/lib/auth/cookie-names.ts']);
    expect(matching(/await cookies\(\)/)).toEqual([
      'app/src/server/auth/request-cookies.ts',
      'app/src/server/auth/supabase-server.ts',
    ]);
    expect(matching(/document\.cookie\s*=/)).toEqual(['app/src/lib/auth/device-sign-out.ts']);
    expect(matching(/\.cookies\.(?:set|delete)\(/)).toEqual(['app/src/proxy.ts']);
  });
});
