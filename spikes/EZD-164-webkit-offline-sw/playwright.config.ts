// EZD-164 Step 8 (vault/plans/EZD-164.md D-Config): the app's Playwright config, narrowed to the projects the spike needs.
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import base from '../../app/playwright.config';

export default defineConfig({
  ...base,
  testDir: path.join(__dirname, 'e2e'),
  outputDir: path.join(__dirname, 'out', 'test-results'),
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { ...base.use, serviceWorkers: 'allow' },
  projects: (base.projects ?? []).filter((p) =>
    ['desktop', 'ipad-landscape', 'phone'].includes(p.name ?? ''),
  ),
});
