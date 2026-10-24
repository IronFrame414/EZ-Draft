// EZD-016a Step 2 (vault/plans/EZD-016a.md): sign a person in through the app's real link page
// (/auth/confirm, confirm-submit; EZD-007d confirmSignInLink accepts only type=email, actions.ts line 96)
// without sending an email. The Auth admin API (secret key) runs in Node only. The membership check comes
// before createUser, because admin createUser bypasses the before-user-created hook (pre-split V7;
// docs/architecture.md Auth and session). 429 from generateLink: up to 5 retries, 1,000 ms apart
// (planner's choice). signInWithCode (EZD-007f) stays for tests that need the email path.
import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JOSH_EMAIL } from '../../test-utils/seed-ids';
import { adminDb } from '../rls/fixtures';
import { withEmailLock } from './email-lock';
import { sessionClaims, sessionDbs, type SessionClaims } from './session-claims';

export type SignedIn = SessionClaims & {
  accessToken: string;
  serverDb: SupabaseClient;
  browserDb: SupabaseClient;
};

const RETRIES_429 = 5;
const RETRY_GAP_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hasActiveMembership(email: string): Promise<boolean> {
  const { data, error } = await adminDb()
    .from('app_user')
    .select('id, membership!inner(id)')
    .eq('email', email)
    .eq('membership.status', 'active')
    .limit(1);
  if (error) throw new Error(`sign-in failed for ${email}: membership lookup ${error.code}`);
  return (data ?? []).length > 0;
}

async function ensureAuthUser(email: string): Promise<void> {
  const { error } = await adminDb().auth.admin.createUser({ email, email_confirm: true });
  if (!error) return;
  // Pinned stack: an existing address answers code email_exists (HTTP 422).
  if (error.code === 'email_exists') return;
  throw new Error(`sign-in failed for ${email}: createUser ${error.code ?? error.status}`);
}

async function hashedToken(email: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await adminDb().auth.admin.generateLink({ type: 'magiclink', email });
    if (error) {
      if (error.status === 429 && attempt < RETRIES_429) {
        await sleep(RETRY_GAP_MS);
        continue;
      }
      throw new Error(`sign-in failed for ${email}: generateLink ${error.code ?? error.status}`);
    }
    const token = data.properties?.hashed_token;
    if (!token)
      throw new Error(`sign-in failed for ${email}: generateLink returned no hashed_token`);
    return token;
  }
}

export async function signInAs(page: Page, rawEmail: string): Promise<SignedIn> {
  const email = rawEmail.toLowerCase();
  return withEmailLock(email, async () => {
    if (!(await hasActiveMembership(email))) throw new Error(`no active membership for ${email}`);
    await ensureAuthUser(email);
    const token = await hashedToken(email);
    await page.goto(`/auth/confirm?token_hash=${encodeURIComponent(token)}&type=email`);
    await page.getByTestId('confirm-submit').click();
    const errorBox = page.getByTestId('confirm-error');
    await Promise.race([
      page.waitForURL((u) => u.pathname === '/'),
      errorBox.waitFor({ state: 'visible' }),
    ]);
    if (await errorBox.isVisible()) {
      throw new Error(`sign-in failed for ${email}: ${(await errorBox.textContent()) ?? ''}`);
    }
    const context = page.context();
    return { ...(await sessionClaims(context)), ...(await sessionDbs(context)) };
  });
}

export function signInAsOwner(page: Page): Promise<SignedIn> {
  return signInAs(page, JOSH_EMAIL);
}
