// EZD-021 Step 2 (vault/plans/EZD-021.md): Vitest setup file. Installs the live-network guard and, after each
// test, throws when any blocked attempt was recorded during it, so a test that swallows the guard's error still
// fails (ticket: "a test that reaches a live provider fails the suite"). A final check after the file's last
// test catches attempts made in beforeAll or afterAll.
import { afterAll, afterEach } from 'vitest';
import { blockedAttempts, installNetGuard } from './net-guard.mjs';

installNetGuard();

let reported = blockedAttempts().length;

function failOnNewAttempts(): void {
  const all = blockedAttempts();
  const fresh = all.slice(reported);
  reported = all.length;
  if (fresh.length === 0) return;
  const hosts = [...new Set(fresh.map((a) => a.host))].join(', ');
  throw new Error(`Live network blocked in tests: ${hosts}`);
}

afterEach(failOnNewAttempts);
afterAll(failOnNewAttempts);
