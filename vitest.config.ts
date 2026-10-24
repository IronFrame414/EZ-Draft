// EZD-001 · root Vitest projects (vault/plans/EZD-001.md Step 3). A root `vitest` run reaches only the package projects,
// never vault/, spikes/ or .claude/worktrees/ (PROCESS.md section 14; PROCESS-EZDRAFT.md section 5).
// The root `test` script stays EZD-000's fan-out; this file serves root-level runs such as `pnpm exec vitest list`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['app/vitest.config.ts', 'packages/*/vitest.config.ts'],
  },
});
