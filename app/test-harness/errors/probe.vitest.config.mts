// EZD-252 (vault/plans/EZD-252.md section 3): the config alert-write-guard.test.ts T1 and T2 run the probes with
// (`vitest run --config test-harness/errors/probe.vitest.config.mts <probe>`). Same setup files as the app
// project; no global setup: the child inherits the parent's env and the trigger is already installed.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['test-harness/errors/probes/*.probe.ts'],
    setupFiles: ['test-harness/net-guard/vitest.setup.ts', 'test-harness/errors/vitest.setup.ts'],
    testTimeout: 15000,
    // The five-key env block of app/vitest.config.mts.
    env: {
      EMAIL_TRANSPORT: 'stub',
      EMAIL_FROM: 'EZ Draft Test <test@example.test>',
      SENTRY_TRANSPORT: 'stub',
      ALERT_EMAIL_TO: 'owner@example.test',
      AI_MODE: 'stub',
    },
  },
});
