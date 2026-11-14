// EZD-421 (Q-0753 (a); Q-0052 (c)): the shared rule for a route body whose call failed after the session read
// succeeded. When the failure is one a lost session can cause and a fresh read confirms the session has ended,
// the route answers 401 not_signed_in with Cache-Control: no-store (the requireApiSession body, EZD-349) and
// reports nothing. Every other case, the confirm step failing included, keeps the route's own 500 and report
// (fail closed toward the alert). Nothing here widens what an anon call may read: the confirm step makes the
// same getClaims and current_app_user_id calls getSession makes.
import { accessTokenEnded } from './session';
import { createSessionClient } from './supabase-server';

// PostgREST: 42501 is the denied privilege an anon call or an ended session's policy helper gets;
// PGRST301 / PGRST303 are a rejected or expired JWT.
const DATABASE_CODES = new Set(['42501', 'PGRST301', 'PGRST303']);
// Supabase Auth error codes for a session that no longer exists or a token that is no longer accepted.
const AUTH_CODES = new Set([
  'session_not_found',
  'session_expired',
  'bad_jwt',
  'refresh_token_not_found',
  'refresh_token_already_used',
]);

// Whether the error (or an error it wraps as `cause`) has a form a lost session can cause.
export function sessionLossForm(error: unknown): boolean {
  let e: unknown = error;
  for (let depth = 0; depth < 5 && typeof e === 'object' && e !== null; depth += 1) {
    const { code, name, cause } = e as { code?: unknown; name?: unknown; cause?: unknown };
    if (typeof code === 'string' && (DATABASE_CODES.has(code) || AUTH_CODES.has(code))) return true;
    if (name === 'AuthSessionMissingError') return true;
    e = cause;
  }
  return false;
}

function authRefused(error: unknown): boolean {
  const { status, name } = error as { status?: unknown; name?: unknown };
  if (name === 'AuthSessionMissingError') return true;
  // A 4xx from Auth (refresh token not found, session not found, bad JWT) refuses the session; a
  // retryable or 5xx error says nothing about it.
  return name === 'AuthApiError' && typeof status === 'number' && status >= 400 && status < 500;
}

// A fresh read, not getSession()'s per-request cache. Ended: no session left in the cookies, Auth refuses
// it, the verified token's exp has passed, or current_app_user_id() returns null (an ended session or
// deactivated user, Q-0052 (c)). Anything else, a throw included, is not ended.
async function confirmEnded(): Promise<boolean> {
  try {
    const client = createSessionClient();
    const { data, error } = await client.auth.getClaims();
    if (error) return authRefused(error);
    const claims = data?.claims;
    if (!claims?.sub) return true;
    if (accessTokenEnded(claims.exp, Date.now())) return true;
    const user = await client.rpc('current_app_user_id');
    if (user.error) return user.error.code === '42501' && accessTokenEnded(claims.exp, Date.now());
    return (user.data as string | null) === null;
  } catch {
    return false;
  }
}

// True only when the error has a session-loss form and the fresh read confirms the session ended. Never throws.
export async function sessionEnded(error: unknown): Promise<boolean> {
  try {
    if (!sessionLossForm(error)) return false;
    return await confirmEnded();
  } catch {
    return false;
  }
}

// The route guard: a 401 to return for an ended session, or null to keep the route's own 500 and report.
export async function endedSessionResponse(error: unknown): Promise<Response | null> {
  if (!(await sessionEnded(error))) return null;
  return Response.json(
    { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}
