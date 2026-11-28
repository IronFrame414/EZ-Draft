// EZD-007d T10 (vault/plans/EZD-007d.md sections 3 and 4; parent P-T10, Step 5): the pages that need no
// session. smoke: yes.
import { describe, expect, it } from 'vitest';
import { isPublicPath, PUBLIC_PATHS } from './public-paths';

describe('EZD-007d public paths', () => {
  it('EZD-007d T10 public paths @smoke', () => {
    for (const p of ['/sign-in', '/auth/confirm', '/api/health', '/api/anything', '/dev/tokens']) {
      expect(isPublicPath(p), p).toBe(true);
    }
    for (const p of ['/', '/projects', '/sign-in-x', '/auth', '/devx', '/settings/users']) {
      expect(isPublicPath(p), p).toBe(false);
    }
    expect(PUBLIC_PATHS).toEqual(['/sign-in', '/auth/confirm', '/api', '/dev', '/terms', '/invite', '/c']);
  });
});

// EZD-1707 T2 (vault/plans/EZD-1707.md sections 3, 4; step 6): /terms is public, its prefix-only neighbours are not.
describe('EZD-1707 public paths', () => {
  it('EZD-1707 T2 /terms is public and its look-alikes are not', () => {
    expect(isPublicPath('/terms')).toBe(true);
    expect(isPublicPath('/terms/')).toBe(true);
    expect(isPublicPath('/termsx')).toBe(false);
    expect(isPublicPath('/term')).toBe(false);
    expect(PUBLIC_PATHS).toEqual(['/sign-in', '/auth/confirm', '/api', '/dev', '/terms', '/invite', '/c']);
  });
});

// EZD-1202 (S18; vault/build/assumptions/EZD-1202.md Settled "Where the page and its data come from"): the client
// link page is public; its prefix-only neighbours are not.
describe('EZD-1202 public paths', () => {
  it('EZD-1202 /c/<token> is public and its look-alikes are not', () => {
    expect(isPublicPath('/c/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde')).toBe(true);
    expect(isPublicPath('/c')).toBe(true);
    expect(isPublicPath('/cx')).toBe(false);
    expect(isPublicPath('/clients')).toBe(false);
    expect(isPublicPath('/projects/c/x')).toBe(false);
  });
});
