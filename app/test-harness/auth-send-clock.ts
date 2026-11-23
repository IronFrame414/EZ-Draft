// EZD-1949 (audit 2026-11-23 P1): an injected clock for the local Supabase Auth email spacing, so tests no
// longer sleep out [auth.email] max_frequency between two sends to one address. Auth compares the time since
// the address's last send (auth.users recovery_sent_at for a sign-in code to a known user,
// confirmation_sent_at for an unconfirmed one) with max_frequency; authSendClock(email).sleep(ms) moves those
// times back by ms instead of waiting ms, so Auth sees the same gap. Auth's own window is unchanged.
// Test-only; never imported by app code.
import { createClient } from '@supabase/supabase-js';
import { harnessSql } from './rls/fixtures';

export type Clock = { now(): number; sleep(ms: number): Promise<void> };

export const realClock: Clock = {
  now: () => performance.now(),
  sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

// A clock that only moves when slept on (unit tests of the spacing helpers).
export function manualClock(start = 0): Clock {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  };
}

// Moves the address's last Auth send times back by ms (no row when Auth has no user for it).
export async function backdateAuthSends(email: string, ms: number): Promise<void> {
  const shift = Math.ceil(ms);
  await harnessSql()`
    update auth.users
    set confirmation_sent_at = confirmation_sent_at - ${shift}::int * interval '1 millisecond',
        recovery_sent_at = recovery_sent_at - ${shift}::int * interval '1 millisecond'
    where email = ${email.trim().toLowerCase()}`;
}

const clocks = new Map<string, Clock>();

// One clock per address: real time plus every sleep so far; a sleep backdates the address's Auth sends.
export function authSendClock(email: string): Clock {
  const key = email.trim().toLowerCase();
  let clock = clocks.get(key);
  if (!clock) {
    let ahead = 0;
    clock = {
      now: () => performance.now() + ahead,
      sleep: async (ms) => {
        await backdateAuthSends(key, ms);
        ahead += ms;
      },
    };
    clocks.set(key, clock);
  }
  return clock;
}

// Makes Auth send one sign-in email to an existing confirmed user (the sender for mailFence). Its earlier
// sends are moved back a minute first, so any max_frequency is past.
export async function sendAuthEmail(email: string): Promise<void> {
  await backdateAuthSends(email, 60_000);
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) throw new Error(`auth-send-clock: Auth refused the fence email: ${error.message}`);
}
