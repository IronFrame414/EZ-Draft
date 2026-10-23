// EZD-027 Files table: spike Playwright config. Projects desktop and ipad-landscape use EZD-016a's values
// (vault/plans/EZD-016a.md Step 1; Q-0053). No surface project (plan Approach). One worker so two
// browsers never compete for the GPU while timing (Q-0019).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4027' },
  webServer: {
    command: 'node server.mjs --port 4027 --out out/test',
    cwd: import.meta.dirname,
    url: 'http://127.0.0.1:4027/health',
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 },
    },
    {
      name: 'ipad-landscape',
      use: {
        ...devices['iPad Pro 11 landscape'],
        viewport: { width: 1180, height: 820 },
        deviceScaleFactor: 2,
      },
    },
  ],
});
