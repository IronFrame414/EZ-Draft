// EZD-001 · geometry unit-test project (vault/plans/EZD-001.md Step 1, Step 6.2).
// environment node: the package runs in the browser, Web Workers and Node with no DOM (02 Stack; 11 Rules 3).
// testNamePattern reads the gate's scope grep (Q-0006; scripts/gate.mjs); maxWorkers 4 (Q-0019 read as 4 per Q-0114).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testNamePattern: process.env.EZD_TEST_GREP ? new RegExp(process.env.EZD_TEST_GREP) : undefined,
    maxWorkers: 4,
  },
});
