// EZD-028 spike test config (vault/plans/EZD-028.md Files table; Q-0019: one file at a time).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.mjs'],
    fileParallelism: false,
  },
});
