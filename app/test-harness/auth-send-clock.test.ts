// EZD-1949: the injected Auth send clock and the mail fence that replace real waits in sign-in.test.ts and
// throttle.db.test.ts. Local stack. Auth's max_frequency (supabase/config.toml [auth.email], 1 s) still
// refuses a second send at once; after the clock's sleep the same send goes through, and the fence returns
// only once the email Auth sent after the step is in the catcher.
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupTestMembers, createPasswordMember } from './auth-users';
import { authSendClock, manualClock, sendAuthEmail } from './auth-send-clock';
import { countAuthEmails, mailFence } from './mail-catcher';
import { cleanup, closeHarness, createTenant } from './rls/fixtures';

const anon = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const otp = (email: string) =>
  anon().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });

describe('EZD-1949 Auth send clock and mail fence', () => {
  let tenant: string;

  beforeAll(async () => {
    tenant = await createTenant();
  });

  afterAll(async () => {
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  });

  it('C1 the manual clock moves only when slept on', async () => {
    const clock = manualClock(1_000);
    expect(clock.now()).toBe(1_000);
    await clock.sleep(250);
    expect(clock.now()).toBe(1_250);
  });

  it('C2 Auth still refuses a send inside max_frequency; after the clock sleeps it sends', async () => {
    const m = await createPasswordMember({ tenantId: tenant });
    const clock = authSendClock(m.email);
    expect((await otp(m.email)).error).toBeNull();
    const t0 = clock.now();
    expect((await otp(m.email)).error).not.toBeNull();
    await clock.sleep(1_100);
    expect(clock.now() - t0).toBeGreaterThanOrEqual(1_100);
    expect((await otp(m.email)).error).toBeNull();
    expect(await countAuthEmails(m.email)).toBe(2);
  });

  it('C3 the fence returns once a later email has arrived; earlier emails are already counted', async () => {
    const m = await createPasswordMember({ tenantId: tenant });
    const fence = await createPasswordMember({ tenantId: tenant });
    expect((await otp(m.email)).error).toBeNull();
    await mailFence(fence.email, () => sendAuthEmail(fence.email));
    expect(await countAuthEmails(fence.email)).toBe(1);
    expect(await countAuthEmails(m.email)).toBe(1);
    await mailFence(fence.email, () => sendAuthEmail(fence.email));
    expect(await countAuthEmails(fence.email)).toBe(2);
  });

  it('C4 the fence fails when no email comes', async () => {
    const m = await createPasswordMember({ tenantId: tenant });
    await expect(mailFence(m.email, async () => {}, 300)).rejects.toThrow(
      'mail-catcher: fence email not seen within 300 ms',
    );
  });
});
