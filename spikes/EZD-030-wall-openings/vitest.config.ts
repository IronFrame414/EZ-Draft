// EZD-030 spike test config (vault/plans/EZD-030.md Files table).
// environment node: the spike holds the geometry package's rules, no DOM (02 Stack Geometry core; EZD-001 Step 1).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    benchmark: {
      include: ['src/**/*.bench.ts'],
    },
  },
});
