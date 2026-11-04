// EZD-108 Step 6 (vault/plans/EZD-108.md Decided "changePassword", "setPassword", "Logging"; Q-0094;
// Q-0096 P5, P6; Q-0104; Q-0412; Q-0447 (a); Q-0465 (a)): change or set the signed-in user's own password.
// Change: the current password is checked by a sign-in on a fresh in-memory session (throttled as a
// password sign-in, which carries the security-check token), the new password is set on that fresh session, Auth then ends every other session
// (the cookie session too), and this device moves onto the fresh session. Set: on the cookie session;
// a session older than 24 h needs the reauthentication code Auth emails (secure_password_change).
// Passwords and codes are never logged, put in an Error, returned or stored; reports carry a code only.
import type { SupabaseClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import type { PasswordRequest } from '../../lib/profile/profile';
import { codeProblem, newPasswordProblem } from '../../lib/profile/profile';
import type { Session } from '../auth/session';
import { createSessionClient, type SessionCookieJar } from '../auth/supabase-server';
import {
  clientIp,
  throttleKey,
  throttleSettle,
  throttleTake,
  type ThrottleKind,
  type ThrottleTake,
} from '../auth/throttle';
import type { Database } from '../db/database.types';
import { reportError } from '../errors/report';
import { reportRouteFailure } from '../errors/route-failure';
import { hasPassword, sendPasswordEmail } from './profile';

const ROUTE = '/api/profile/password';

export type PasswordResult =
  | { status: 200; body: { status: 'done' | 'code_sent' } }
  | { status: 400 | 429 | 500; code: string };

export type PasswordDeps = { sendEmail: typeof sendPasswordEmail };

const DEFAULT_DEPS: PasswordDeps = { sendEmail: sendPasswordEmail };

const refuse = (status: 400 | 429 | 500, code: string): PasswordResult => ({ status, code });
const ok = (status: 'done' | 'code_sent'): PasswordResult => ({ status: 200, body: { status } });

function errorStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

// Network error (status 0) or HTTP 5xx from Auth (Q-0104 (i): neither counts).
function authUnavailable(error: unknown): boolean {
  const status = errorStatus(error);
  return status === 0 || (status !== undefined && status >= 500);
}

async function report(code: string): Promise<void> {
  await reportError(new Error(code), { source: 'function', location: ROUTE });
}

// A cookie jar kept in memory: the fresh session of a password change never reaches the browser.
export function createMemoryJar(): SessionCookieJar {
  const store = new Map<string, string>();
  return {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name, value, options) => {
      if (value === '' || options?.maxAge === 0) store.delete(name);
      else store.set(name, value);
    },
    isHttps: () => false,
  };
}

// Takes one throttle slot (Q-0094 limits). Null when the throttle is unavailable: reported, and the
// caller fails closed without calling Auth.
async function takeSlot(
  client: SupabaseClient<Database>,
  kind: ThrottleKind,
  email: string,
): Promise<ThrottleTake | null> {
  try {
    const ip = clientIp(await headers(), process.env);
    return await throttleTake(
      client,
      kind,
      throttleKey('email', email),
      ip === null ? null : throttleKey('ip', ip),
    );
  } catch {
    await report('auth_throttle_unavailable');
    return null;
  }
}

// The attempt's own rows stop counting (a successful check, an Auth 429 or 5xx; Q-0104 (i)).
async function settle(client: SupabaseClient<Database>, slot: ThrottleTake): Promise<void> {
  try {
    await throttleSettle(client, slot.attemptId, slot.ipAttemptId);
  } catch {
    await report('auth_throttle_unavailable');
  }
}

export async function changePassword(
  session: Session,
  req: Extract<PasswordRequest, { mode: 'change' }>,
  deps: PasswordDeps = DEFAULT_DEPS,
): Promise<PasswordResult> {
  const problem = newPasswordProblem(req.newPassword, req.confirmPassword, session.email);
  if (problem !== null) return refuse(400, problem);

  const client = createSessionClient();
  if (!(await hasPassword(client))) return refuse(400, 'invalid_input');

  const slot = await takeSlot(client, 'password', session.email);
  if (slot === null) return refuse(500, 'db_unavailable');
  if (!slot.allowed) {
    return refuse(429, slot.limitedBy === 'ip' ? 'ip_throttled' : 'current_password_throttled');
  }

  const fresh = createSessionClient(createMemoryJar());
  const signIn = await fresh.auth.signInWithPassword({
    email: session.email,
    password: req.currentPassword,
    options: { captchaToken: req.captchaToken || undefined },
  });
  if (signIn.error) {
    if (errorStatus(signIn.error) === 429) {
      await settle(client, slot);
      return refuse(429, 'too_many_requests');
    }
    // A refused security check is the person's to redo, not a fault (Q-0251 (a)): settled, not reported.
    if (errorCode(signIn.error) === 'captcha_failed') {
      await settle(client, slot);
      return refuse(400, 'captcha_failed');
    }
    if (authUnavailable(signIn.error)) {
      await settle(client, slot);
      await reportRouteFailure(signIn.error, ROUTE);
      return refuse(500, 'db_unavailable');
    }
    // Not settled, so it counts toward the 5 wrong passwords (Q-0094).
    return refuse(400, 'current_password_wrong');
  }
  await settle(client, slot);

  const updated = await fresh.auth.updateUser({ password: req.newPassword });
  if (updated.error) {
    const code = errorCode(updated.error);
    await fresh.auth.signOut({ scope: 'local' });
    if (code === 'same_password') return refuse(400, 'password_same');
    if (code === 'weak_password') return refuse(400, 'password_breached');
    await reportRouteFailure(updated.error, ROUTE);
    return refuse(500, 'db_unavailable');
  }

  // Auth has ended every other session of the user, the cookie session too: this device moves onto the
  // fresh session (a failure is reported and the fresh session signs out here; the password is changed, so
  // the answer stays 200).
  try {
    const { data } = await fresh.auth.getSession();
    const tokens = data.session;
    if (tokens === null) throw new Error('profile_session_move_failed');
    const moved = await createSessionClient().auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    if (moved.error) throw new Error('profile_session_move_failed');
  } catch {
    await report('profile_session_move_failed');
    try {
      await fresh.auth.signOut({ scope: 'local' });
    } catch {
      // The move already failed and is reported; a failed local sign-out changes nothing more.
    }
  }

  await deps.sendEmail('changed', session.email);
  return ok('done');
}

export async function setPassword(
  session: Session,
  req: Extract<PasswordRequest, { mode: 'set' }>,
  deps: PasswordDeps = DEFAULT_DEPS,
): Promise<PasswordResult> {
  const problem = newPasswordProblem(req.newPassword, req.confirmPassword, session.email);
  if (problem !== null) return refuse(400, problem);

  const client = createSessionClient();
  if (await hasPassword(client)) return refuse(400, 'invalid_input');

  let slot: ThrottleTake | null = null;
  if (req.code !== undefined) {
    // Checked by shape before any throttle slot or Auth call (Q-0447 (a)).
    if (codeProblem(req.code) !== null) return refuse(400, 'code_invalid');
    slot = await takeSlot(client, 'code', session.email);
    if (slot === null) return refuse(500, 'db_unavailable');
    if (!slot.allowed) {
      return refuse(429, slot.limitedBy === 'ip' ? 'ip_throttled' : 'code_throttled');
    }
  }

  const updated = await client.auth.updateUser(
    req.code === undefined
      ? { password: req.newPassword }
      : { password: req.newPassword, nonce: req.code },
  );
  if (updated.error) {
    const code = errorCode(updated.error);
    if (code === 'reauthentication_needed' && req.code === undefined) {
      const sent = await client.auth.reauthenticate();
      if (sent.error) {
        if (errorStatus(sent.error) === 429) return refuse(429, 'too_many_requests');
        await reportRouteFailure(sent.error, ROUTE);
        return refuse(500, 'db_unavailable');
      }
      return ok('code_sent');
    }
    // A wrong or stale code: not settled, not reported.
    if (
      code === 'reauthentication_not_valid' ||
      (code === 'reauthentication_needed' && req.code !== undefined)
    ) {
      return refuse(400, 'code_invalid');
    }
    if (code === 'weak_password') return refuse(400, 'password_breached');
    await reportRouteFailure(updated.error, ROUTE);
    return refuse(500, 'db_unavailable');
  }
  if (slot !== null) await settle(client, slot);

  await deps.sendEmail('set', session.email);
  return ok('done');
}
