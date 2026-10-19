// EZD-001: worktrees live inside the main checkout (.claude/worktrees/<T>) and Next.js infers the project root from the
// nearest lockfile upward, so both roots are pinned to this checkout's workspace root (vault/plans/EZD-001.md Step 2).
import path from 'node:path';
import type { NextConfig } from 'next';

const workspaceRoot = path.resolve(__dirname, '..');

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
