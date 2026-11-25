// EZD-1977 (AC-EZD-1977-1, -2): the return path check. Kept: a path starting with one "/". Ignored (null, so the
// person lands on Projects): other hosts, "//", schemes, backslashes, whitespace, encoded variants, the sign-in
// pages themselves, and anything that is not a string.
import { describe, expect, it } from 'vitest';
import { returnPath, signInUrl } from './return-path';

describe('EZD-1977 returnPath', () => {
  it.each([
    ['/settings/users', '/settings/users'],
    ['/projects/abc/field', '/projects/abc/field'],
    ['/projects/abc?tab=plan', '/projects/abc?tab=plan'],
    ['/settings/users#top', '/settings/users'],
    ['/settings/./users', '/settings/users'],
    ['/projects/../settings/users', '/settings/users'],
  ])('keeps the same-origin path %s', (raw, want) => {
    expect(returnPath(raw)).toBe(want);
  });

  it.each([
    'https://evil.example/settings',
    'http://evil.example',
    '//evil.example',
    '//evil.example/settings/users',
    '///evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    ' /settings',
    '%2F%2Fevil.example',
    '/%2F%2Fevil.example',
    '/%2f%2fevil.example',
    '/%5Cevil.example',
    '/%5cevil.example',
    '/%09/evil.example',
    '/%E0%A4%A',
    '/.//evil.example',
    '/a/..//evil.example',
    '/%2e//evil.example',
    '/%2E/%2e//evil.example',
    '/a/%2e%2e//evil.example',
    '/./%2F/evil.example',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,hi',
    'evil.example',
    'settings/users',
    '',
    '/',
    '/sign-in',
    '/sign-in?next=/settings',
    '/auth/confirm?token_hash=x&type=email',
    `/${'a'.repeat(2048)}`,
  ])('ignores %j', (raw) => {
    expect(returnPath(raw)).toBeNull();
  });

  it.each([undefined, null, 42, ['/settings/users'], { path: '/settings' }])(
    'ignores the non-string %j',
    (raw) => {
      expect(returnPath(raw)).toBeNull();
    },
  );
});

describe('EZD-1977 signInUrl', () => {
  const origin = 'http://localhost:3000';

  it('is a bare /sign-in for Projects', () => {
    expect(signInUrl(origin, '/', '').toString()).toBe('http://localhost:3000/sign-in');
  });

  it('carries the asked-for path and query as next', () => {
    const url = signInUrl(origin, '/settings/users', '?tab=a');
    expect(url.pathname).toBe('/sign-in');
    expect(url.searchParams.get('next')).toBe('/settings/users?tab=a');
  });

  it('drops the _rsc parameter', () => {
    const url = signInUrl(origin, '/settings/users', '?_rsc=1x2y');
    expect(url.searchParams.get('next')).toBe('/settings/users');
  });

  it('keeps no next for a path that is not safe', () => {
    expect(signInUrl(origin, '//evil.example', '').search).toBe('');
  });
});
