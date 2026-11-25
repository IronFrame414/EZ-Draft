// EZD-1960: the live signed-in UI audit run (report only, not part of the gate). It points at an app that is
// already running on AUDIT_BASE_URL (default http://127.0.0.1:3960) against the base stack (lane 0, port 54321).
// Run: env -u EZD_LANE npx playwright test -c audit/ui-live-2026-11-24/audit.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: __dirname,
  testMatch: '*.audit.ts',
  outputDir: '/tmp/ezd1960/test-results',
  workers: 1,
  timeout: 15 * 60 * 1000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:3960',
    actionTimeout: 20_000,
    navigationTimeout: 120_000,
  },
});
