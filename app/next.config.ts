// EZD-001: worktrees live inside the main checkout (.claude/worktrees/<T>) and Next.js infers the project root from the
// nearest lockfile upward, so both roots are pinned to this checkout's workspace root (vault/plans/EZD-001.md Step 2).
import path from 'node:path';
import type { NextConfig } from 'next';

const workspaceRoot = path.resolve(__dirname, '..');

// EZD-299a (Q-0626): one build number per build. EZD-134 (03b Architecture rule 12; Q-0530): every answer names it
// in x-ezdraft-app-build (a header rule below, not the request gate: Next copies the gate's answer headers onto
// the request, which would make every save look current), so a page of an older build knows to reload once its
// outbox is empty. The save route still refuses an older build itself (EZD-299a).
const APP_BUILD = String(Math.floor(Date.now() / 1000));

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  // EZD-020 Step 5 (vault/plans/EZD-020.md): browser source maps for the entry contents check in the gate and CI
  // builds; Vercel builds (VERCEL=1) emit none, so no source map is published on a deploy.
  productionBrowserSourceMaps: process.env.VERCEL !== '1',
  // EZD-202 Build step 13 (vault/plans/EZD-202.md): the geometry package ships TypeScript source.
  transpilePackages: ['@ezdraft/geometry'],
  // EZD-305: the import job reads PDFs with pdf.js's Node build on the server (job run on enqueue); it loads its own
  // worker module at run time, so it is required from node_modules, not bundled.
  serverExternalPackages: ['pdfjs-dist'],
  // EZD-299a Build step 5 (vault/plans/EZD-299a.md Decided D-Build; Q-0626): one build number per build, inlined
  // into the browser and server bundles, so a save from an older app is refused (app/src/lib/app-version.ts).
  // EZD-237 (vault/plans/EZD-237.md D-Version; Q-0664): the deploy's commit, which a benchmark run names.
  env: {
    EZD_APP_BUILD: APP_BUILD,
    EZD_APP_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA ?? '',
  },
  // EZD-007f Step 9 (vault/plans/EZD-007f.md F3): the confirm page's token_hash never leaves in a Referer.
  async headers() {
    return [
      { source: '/:path*', headers: [{ key: 'x-ezdraft-app-build', value: APP_BUILD }] },
      { source: '/auth/confirm', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      // EZD-105: the invite token is in the path; never sent on as a referrer.
      { source: '/invite/:token', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      // EZD-013 Step 8 (vault/plans/EZD-013.md D11): the worker script is never cached, so updates arrive at once.
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
