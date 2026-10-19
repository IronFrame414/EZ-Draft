// EZD-001 · app unit-test project (vault/plans/EZD-001.md Step 2, Step 6.2).
// include keeps EZD-016a's Playwright *.spec.ts out. environment node until a component ticket adds a DOM environment.
// testNamePattern reads the gate's scope grep (Q-0006; scripts/gate.mjs); maxWorkers 4 (Q-0019 read as 4 per Q-0114).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    testNamePattern: process.env.EZD_TEST_GREP ? new RegExp(process.env.EZD_TEST_GREP) : undefined,
    maxWorkers: 4,
  },
});
