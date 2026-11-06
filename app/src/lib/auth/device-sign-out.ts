// EZD-120d Build step 10 (vault/plans/EZD-120d.md section 3 and Decided "Offline sign-out"; Q-0581; Q-0048 (a)):
// sign out on this device. When the server cannot be reached the session cookies (httpOnly) stay, so a marker
// cookie is written and the page goes to /sign-in; the request gate deletes the session at the first request
// that reaches the server. No imports: the request gate and the browser both load this file.
export const SIGNED_OUT_COOKIE = 'ezd_signed_out';

// Q-0599: on https the marker is a `__Host-` cookie (Secure, Path=/, no Domain), so no subdomain or plain-http
// page can plant it; on http (local and test runs) the plain name. The browser and the request gate both take the
// name from here, each honouring only its own.
export function signedOutCookieName(secure: boolean): string {
  return secure ? `__Host-${SIGNED_OUT_COOKIE}` : SIGNED_OUT_COOKIE;
}

const MARKER_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

type Env = {
  document: Pick<Document, 'cookie'>;
  location: Pick<Location, 'protocol' | 'replace'>;
};

export async function signOutOnDevice(
  action: () => Promise<unknown>,
  env: Env = { document, location },
): Promise<void> {
  try {
    await action();
  } catch (error) {
    // A successful sign-out redirects: Next rejects the action with a redirect error, which Next handles.
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) throw error;
    const https = env.location.protocol === 'https:';
    const secure = https ? '; Secure' : '';
    env.document.cookie = `${signedOutCookieName(https)}=1; Path=/${secure}; Max-Age=${MARKER_MAX_AGE_SECONDS}; SameSite=Lax`;
    env.location.replace('/sign-in');
  }
}
