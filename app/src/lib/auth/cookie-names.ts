// EZD-342 (vault/plans/EZD-342.md; Q-0600; Q-0599): every cookie name the app sets or reads, and the one https
// test. On https every app cookie carries the host-only prefix (Secure, Path=/, no Domain), so no sibling subdomain
// can plant one; on http (local and test runs) the plain names. Writers and readers both take the name from here.
// No imports: the browser and the request gate load this file.
export const HOST_COOKIE_PREFIX = '__Host-';
export const SIGN_IN_EMAIL_COOKIE = 'ezd_sign_in_email';
export const SIGN_IN_LANG_COOKIE = 'ezd_sign_in_lang';
export const SIGNED_OUT_COOKIE = 'ezd_signed_out';

export type SignInCookie = typeof SIGN_IN_EMAIL_COOKIE | typeof SIGN_IN_LANG_COOKIE;

export function appCookieName(base: string, secure: boolean): string {
  return secure ? HOST_COOKIE_PREFIX + base : base;
}

// The first forwarded-proto value, exactly https (case-sensitive).
export function isForwardedHttps(headers: { get(name: string): string | null }): boolean {
  return (headers.get('x-forwarded-proto') ?? '').split(',')[0].trim() === 'https';
}

// On https only prefixed cookies are read, with the prefix removed; a plain or look-alike name is dropped.
// On http every cookie, unchanged.
export function readableCookies(
  all: { name: string; value: string }[],
  secure: boolean,
): { name: string; value: string }[] {
  if (!secure) return [...all];
  return all
    .filter(
      (c) => c.name.startsWith(HOST_COOKIE_PREFIX) && c.name.length > HOST_COOKIE_PREFIX.length,
    )
    .map((c) => ({ name: c.name.slice(HOST_COOKIE_PREFIX.length), value: c.value }));
}

export function isSessionCookieName(name: string): boolean {
  return name.startsWith('sb-') || name.startsWith(HOST_COOKIE_PREFIX + 'sb-');
}
