// EZD-021 T12 (vault/plans/EZD-021.md): the config the guard's child-process tests run the probes with
// (`vitest run --config test-harness/net-guard/probe.vitest.config.ts <probe>`). Same setup file as the app
// project, no database, no global setup; only the probes are included.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['test-harness/net-guard/probes/*.probe.ts'],
    setupFiles: ['test-harness/net-guard/vitest.setup.ts'],
    testTimeout: 15000,
  },
});
