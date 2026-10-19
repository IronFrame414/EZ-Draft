// EZD-001 · app unit-test project (vault/plans/EZD-001.md Step 2, Step 6.2).
// include keeps EZD-016a's Playwright *.spec.ts out. environment node until a component ticket adds a DOM environment.
// testNamePattern reads the gate's scope grep (Q-0006; scripts/gate.mjs); maxWorkers 4 (Q-0019 read as 4 per Q-0114).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // EZD-010b Step 6: first .tsx test; tsconfig jsx is preserve for Next.js, so Vite needs the automatic runtime.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    testNamePattern: process.env.EZD_TEST_GREP ? new RegExp(process.env.EZD_TEST_GREP) : undefined,
    maxWorkers: 4,
    // EZD-004b: local Supabase values into process.env; testTimeout for database calls.
    globalSetup: ['test-harness/supabase-env.global-setup.ts'],
    testTimeout: 15000,
    // EZD-008a: tests send through the stub transport, never a live provider (CLAUDE.md rule 6).
    env: { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: 'EZ Draft Test <test@example.test>' },
  },
});
