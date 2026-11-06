// EZD-342 (vault/plans/EZD-342.md; Q-0600; Q-0599): server only. The one place the sign-in cookies are read,
// written and cleared. The name comes from appCookieName with the same https test as the Secure flag, so on https
// only the host-only prefixed name is honoured. A clear is a write with an empty value and maxAge 0 carrying the
// same flags (a delete without Secure and Path=/ does not clear a prefixed cookie). No helper catches.
import { cookies, headers } from 'next/headers';
import { appCookieName, isForwardedHttps, type SignInCookie } from '../../lib/auth/cookie-names';

export async function requestIsHttps(): Promise<boolean> {
  return isForwardedHttps(await headers());
}

export async function readAppCookie(base: SignInCookie): Promise<string | undefined> {
  const secure = await requestIsHttps();
  return (await cookies()).get(appCookieName(base, secure))?.value;
}

export async function setAppCookie(base: SignInCookie, value: string, maxAge: number): Promise<void> {
  const secure = await requestIsHttps();
  (await cookies()).set(appCookieName(base, secure), value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge,
  });
}

export async function clearAppCookie(base: SignInCookie): Promise<void> {
  const secure = await requestIsHttps();
  (await cookies()).set(appCookieName(base, secure), '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: 0,
  });
}
