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
  // EZD-020 Step 5 (vault/plans/EZD-020.md): browser source maps for the entry contents check in the gate and CI
  // builds; Vercel builds (VERCEL=1) emit none, so no source map is published on a deploy.
  productionBrowserSourceMaps: process.env.VERCEL !== '1',
  // EZD-007f Step 9 (vault/plans/EZD-007f.md F3): the confirm page's token_hash never leaves in a Referer.
  async headers() {
    return [
      { source: '/auth/confirm', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
    ];
  },
};

export default nextConfig;
