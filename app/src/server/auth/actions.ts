'use server';
// EZD-007d Step 3 (vault/plans/EZD-007d.md section 3; parent P-Step 3; D3; Q-0167 (a); Q-0169 (a);
// Q-0174 (a)): the sign-in Server Actions. They return codes, never text (EZD-007e owns the wording).
// Nothing is logged; codes, token hashes and emails never appear in an error message.
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { completeSignIn } from './complete-sign-in';
import { createSessionClient } from './supabase-server';

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

export async function requestSignIn(
  formData: FormData,
): Promise<{ step: 'code' } | { error: 'invalid_email' | 'too_many_requests' }> {
  const email = parseEmail(formData.get('email'));
  if (!email) return { error: 'invalid_email' };

  const client = createSessionClient();
  const { error } = await client.auth.signInWithOtp({
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

export async function verifySignInCode(
  formData: FormData,
): Promise<{ error: 'code_invalid' | 'no_access' | 'too_many_requests' }> {
  const jar = await cookies();
  const field = formData.get('email');
  const email = parseEmail(
    typeof field === 'string' && field !== '' ? field : jar.get('ezd_sign_in_email')?.value,
  );
  const codeField = formData.get('code');
  const code = typeof codeField === 'string' ? codeField.trim() : '';
  if (!email || !CODE_PATTERN.test(code)) return { error: 'code_invalid' };

  const client = createSessionClient();
  const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) {
    return errorStatus(error) === 429 ? { error: 'too_many_requests' } : { error: 'code_invalid' };
  }

  if ((await completeSignIn(client)) === 'no_access') return { error: 'no_access' };
  jar.delete('ezd_sign_in_email');
  redirect('/');
}

export async function confirmSignInLink(
  formData: FormData,
): Promise<{ error: 'link_invalid' | 'no_access' | 'too_many_requests' }> {
  const tokenHash = formData.get('token_hash');
  const type = formData.get('type');
  if (typeof tokenHash !== 'string' || tokenHash === '' || type !== 'email') {
    return { error: 'link_invalid' };
  }

  const client = createSessionClient();
  const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  if (error) {
    return errorStatus(error) === 429 ? { error: 'too_many_requests' } : { error: 'link_invalid' };
  }

  if ((await completeSignIn(client)) === 'no_access') return { error: 'no_access' };
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
