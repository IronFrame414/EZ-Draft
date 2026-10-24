// EZD-031 spike test config (vault/plans/EZD-031.md Files table, Interface contract Package).
// The setup file is EZD-021's network guard: any non-loopback request fails the test.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['../../app/test-harness/net-guard/vitest.setup.ts'],
    fileParallelism: false,
  },
});
