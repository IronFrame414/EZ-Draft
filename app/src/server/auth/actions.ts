'use server';
// EZD-007d Step 3 (vault/plans/EZD-007d.md section 3; parent P-Step 3; D3; Q-0167 (a); Q-0169 (a);
// Q-0174 (a)): the sign-in Server Actions. They return codes, never text (EZD-007e owns the wording).
// Nothing is logged; codes, token hashes and emails never appear in an error message.
// EZD-033 Step 3 (vault/plans/EZD-033.md; Q-0091; Q-0094; Q-0104): password sign-in, and the app throttle
// on every action that reaches Supabase Auth. A slot is taken before Auth is called; a refused slot calls
// nothing. The password is never logged, put in an Error, returned or written to a cookie.
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { PASSWORD_MAX_BYTES } from '../../lib/auth/password-rules';
import type { Database } from '../db/database.types';
import { reportError } from '../errors/report';
import { completeSignIn } from './complete-sign-in';
import { createSessionClient } from './supabase-server';
import { clientIp, throttleKey, throttleSettle, throttleTake, type ThrottleKind } from './throttle';

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email());
const CODE_PATTERN = /^\d{6}$/;

async function isHttps(): Promise<boolean> {
  const proto = (await headers()).get('x-forwarded-proto');
  return (proto ?? '').split(',')[0].trim() === 'https';
}

async function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: await isHttps(),
    maxAge,
  };
}

function parseEmail(value: FormDataEntryValue | null | undefined): string | null {
  const parsed = EmailSchema.safeParse(typeof value === 'string' ? value : '');
  return parsed.success ? parsed.data : null;
}

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

// Every reportError call in the sign-in actions (Step 3): a code only, never an email or a password.
async function reportSignIn(code: string): Promise<void> {
  await reportError(new Error(code), { source: 'function', location: 'auth.sign_in' });
}

type Slot = {
  client: SupabaseClient<Database>;
  allowed: boolean;
  limitedBy: 'ip' | 'password' | 'code' | 'email' | null;
  attemptId: string | null;
  ipAttemptId: string | null;
};

// Builds the action's session client and takes one throttle slot. Null when the throttle is unavailable (the
// gate secret missing or the database call failing): reported, and the action fails closed (Step 3).
async function takeSlot(kind: ThrottleKind, email: string | null): Promise<Slot | null> {
  try {
    const client = createSessionClient();
    const ip = clientIp(await headers(), process.env);
    const ipKey = ip === null ? null : throttleKey('ip', ip);
    const emailKey = email === null ? null : throttleKey('email', email);
    return { client, ...(await throttleTake(client, kind, emailKey, ipKey)) };
  } catch {
    await reportSignIn('auth_throttle_unavailable');
    return null;
  }
}

// The attempt's own rows stop counting (a successful check, an Auth 429 or 5xx; Q-0104 (i)).
async function settle(slot: Slot): Promise<void> {
  try {
    await throttleSettle(slot.client, slot.attemptId, slot.ipAttemptId);
  } catch {
    await reportSignIn('auth_throttle_unavailable');
  }
}

export async function signInWithPassword(formData: FormData): Promise<{
  error:
    | 'invalid_email'
    | 'password_wrong'
    | 'password_throttled'
    | 'ip_throttled'
    | 'no_access'
    | 'too_many_requests'
    | 'unavailable';
}> {
  const email = parseEmail(formData.get('email'));
  if (!email) return { error: 'invalid_email' };
  // As typed: no trimming, no normalization (Q-0103).
  const field = formData.get('password');
  const password = typeof field === 'string' ? field : '';

  const slot = await takeSlot('password', email);
  if (!slot) return { error: 'unavailable' };
  if (!slot.allowed) {
    return { error: slot.limitedBy === 'ip' ? 'ip_throttled' : 'password_throttled' };
  }
  // No stored password is empty or longer than 72 bytes (Q-0094); both rows stay counted.
  if (password === '' || new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return { error: 'password_wrong' };
  }

  const { error } = await slot.client.auth.signInWithPassword({ email, password });
  if (error) {
    if (errorStatus(error) === 429) {
      await settle(slot);
      return { error: 'too_many_requests' };
    }
    if (authUnavailable(error)) {
      await settle(slot);
      await reportSignIn('auth_password_unavailable');
      return { error: 'unavailable' };
    }
    // Wrong password, unknown email, unconfirmed account: one answer (ticket Done when; Q-0091).
    return { error: 'password_wrong' };
  }

  await settle(slot);
  if ((await completeSignIn(slot.client)) === 'no_access') return { error: 'no_access' };
  (await cookies()).delete('ezd_sign_in_email');
  redirect('/');
}

export async function requestSignIn(
  formData: FormData,
): Promise<
  | { step: 'code' }
  | {
      error:
        'invalid_email' | 'too_many_requests' | 'email_throttled' | 'ip_throttled' | 'unavailable';
    }
> {
  const email = parseEmail(formData.get('email'));
  if (!email) return { error: 'invalid_email' };

  // Never settled: every request counts (Q-0094; Q-0104 (i)).
  const slot = await takeSlot('email', email);
  if (!slot) return { error: 'unavailable' };
  if (!slot.allowed) {
    return { error: slot.limitedBy === 'ip' ? 'ip_throttled' : 'email_throttled' };
  }

  const { error } = await slot.client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    const status = errorStatus(error);
    if (status === 429 && errorCode(error) === 'over_request_rate_limit') {
      return { error: 'too_many_requests' };
    }
    // Same answer for every address: the hook's refusal (403) and every other 429 (Q-0174 (a)).
    if (status !== 403 && status !== 429) throw new Error('sign_in_request_failed');
  }

  (await cookies()).set('ezd_sign_in_email', email, await cookieOptions(900));
  return { step: 'code' };
}

export async function verifySignInCode(formData: FormData): Promise<{
  error:
    | 'code_invalid'
    | 'no_access'
    | 'too_many_requests'
    | 'code_throttled'
    | 'ip_throttled'
    | 'unavailable';
}> {
  const jar = await cookies();
  const field = formData.get('email');
  const email = parseEmail(
    typeof field === 'string' && field !== '' ? field : jar.get('ezd_sign_in_email')?.value,
  );
  const codeField = formData.get('code');
  const code = typeof codeField === 'string' ? codeField.trim() : '';
  if (!email || !CODE_PATTERN.test(code)) return { error: 'code_invalid' };

  const slot = await takeSlot('code', email);
  if (!slot) return { error: 'unavailable' };
  if (!slot.allowed) {
    return { error: slot.limitedBy === 'ip' ? 'ip_throttled' : 'code_throttled' };
  }

  const { error } = await slot.client.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) {
    if (errorStatus(error) === 429) {
      await settle(slot);
      return { error: 'too_many_requests' };
    }
    if (authUnavailable(error)) {
      await settle(slot);
      await reportSignIn('auth_code_unavailable');
      return { error: 'unavailable' };
    }
    return { error: 'code_invalid' };
  }

  await settle(slot);
  if ((await completeSignIn(slot.client)) === 'no_access') return { error: 'no_access' };
  jar.delete('ezd_sign_in_email');
  redirect('/');
}

export async function confirmSignInLink(formData: FormData): Promise<{
  error: 'link_invalid' | 'no_access' | 'too_many_requests' | 'ip_throttled' | 'unavailable';
}> {
  const tokenHash = formData.get('token_hash');
  const type = formData.get('type');
  if (typeof tokenHash !== 'string' || tokenHash === '' || type !== 'email') {
    return { error: 'link_invalid' };
  }

  // The link carries no email, so only the IP count applies.
  const slot = await takeSlot('link', null);
  if (!slot) return { error: 'unavailable' };
  if (!slot.allowed) return { error: 'ip_throttled' };

  const { error } = await slot.client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  if (error) {
    if (errorStatus(error) === 429) {
      await settle(slot);
      return { error: 'too_many_requests' };
    }
    if (authUnavailable(error)) {
      await settle(slot);
      await reportSignIn('auth_link_unavailable');
      return { error: 'unavailable' };
    }
    return { error: 'link_invalid' };
  }

  await settle(slot);
  if ((await completeSignIn(slot.client)) === 'no_access') return { error: 'no_access' };
  (await cookies()).delete('ezd_sign_in_email');
  redirect('/');
}

export async function signOut(): Promise<never> {
  try {
    await createSessionClient().auth.signOut({ scope: 'local' });
  } catch {
    // Missing env or secret: nothing to end on this device; still go to the sign-in page.
  }
  redirect('/sign-in');
}

export async function setSignInLanguage(formData: FormData): Promise<void> {
  const lang = formData.get('lang') === 'es' ? 'es' : 'en';
  (await cookies()).set('ezd_sign_in_lang', lang, await cookieOptions(34560000));
}

// EZD-007f Step 3 (vault/plans/EZD-007f.md F2): "Use a different email" deletes the email cookie.
export async function clearSignInEmail(): Promise<void> {
  (await cookies()).delete('ezd_sign_in_email');
}
