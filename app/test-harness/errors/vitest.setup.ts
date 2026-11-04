// EZD-252 Step 7 (vault/plans/EZD-252.md): Vitest setup file. Gives this test file a fresh token, wraps fetch so
// every local Supabase request carries it, and throws after each test (and once after the file's last test, once
// in-flight requests settle) when the app wrote error_alert rows without holdErrorAlertLock. Pattern:
// test-harness/net-guard/vitest.setup.ts. A violation is reported once.
import { afterAll, afterEach } from 'vitest';
import {
  alertWriteGuardState,
  alertWriteViolationMessage,
  installAlertWriteFetchGuard,
  resetAlertWriteGuardState,
} from './alert-write-guard';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set: the app Vitest global setup reads it');
}

resetAlertWriteGuardState();
installAlertWriteFetchGuard(new URL(supabaseUrl).origin);

let reported = 0;

function failOnNewViolations(): void {
  const all = alertWriteGuardState().violations;
  const fresh = all.slice(reported);
  reported = all.length;
  if (fresh.length === 0) return;
  throw new Error(alertWriteViolationMessage(fresh));
}

afterEach(failOnNewViolations);
afterAll(async () => {
  await Promise.allSettled([...alertWriteGuardState().inFlight]);
  failOnNewViolations();
}, 15000);
