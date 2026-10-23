// EZD-021 Step 2 (vault/plans/EZD-021.md): `node --import preload.mjs` installs the guard in a Node process
// (the root node:test run and the app server under Playwright). Each blocked attempt is appended as one JSON
// line to EZD_NET_GUARD_LOG when set (never the path's query, headers or body). On exit with any attempt the
// hosts go to stderr and the exit code becomes 1.
import { appendFileSync } from 'node:fs';
import { blockedAttempts, installNetGuard } from './net-guard.mjs';

installNetGuard({
  onBlocked(attempt) {
    const log = process.env.EZD_NET_GUARD_LOG;
    if (!log) return;
    try {
      appendFileSync(log, JSON.stringify(attempt) + '\n');
    } catch {
      // The block itself still stands.
    }
  },
});

process.on('exit', () => {
  const attempts = blockedAttempts();
  if (attempts.length === 0) return;
  const hosts = [...new Set(attempts.map((a) => a.host))].join(', ');
  process.stderr.write(`Live network blocked in tests: ${hosts}\n`);
  process.exitCode = 1;
});
