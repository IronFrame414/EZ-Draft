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

// EZD-1930: the security headers on every answer (docs/architecture.md Security headers).
// EZD-2022 (audit 2026-11-27 X6): the policy also bars plugins (object-src 'none') and a planted <base> tag
// (base-uri 'self'); a site-wide Referrer-Policy; HSTS for the subdomains too (Vercel's 2-year max-age, no preload).
const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

// EZD-2022 (audit 2026-11-27 X7): the build number goes only to a caller that sends a session cookie (plain sb-…
// on http, __Host-sb-… on https; chunked names end in .<n>), so a signed-out visitor does not learn the deploy time.
// Next matches the whole Cookie header against this pattern (anchored at both ends).
const SESSION_COOKIE_PATTERN = '(?:.*;\\s*)?(?:__Host-)?sb-[^=;\\s]+-auth-token(?:\\.\\d+)?=[^;\\s]+.*';

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  // EZD-2022 (audit 2026-11-27 X6): no x-powered-by header.
  poweredByHeader: false,
  turbopack: {
    root: workspaceRoot,
    // EZD-1995 (AC-EZD-1995-1; Q-0814): a lazy screen's messages file is replaced by its own slice of the catalog,
    // so no browser file holds the whole catalog (app/tools/screen-messages-loader.cjs).
    rules: {
      '*.messages.ts': {
        loaders: [path.join(__dirname, 'tools', 'screen-messages-loader.cjs')],
        as: '*.js',
      },
    },
  },
  // EZD-020 Step 5 (vault/plans/EZD-020.md): browser source maps for the entry contents check in the gate and CI
  // builds; Vercel builds (VERCEL=1) emit none, so no source map is published on a deploy.
  productionBrowserSourceMaps: process.env.VERCEL !== '1',
  // EZD-202 Build step 13 (vault/plans/EZD-202.md): the geometry package ships TypeScript source.
  transpilePackages: ['@ezdraft/geometry'],
  // EZD-1996 (AC-EZD-1996-1; audit 2026-11-26 F2; Q-0814): CSS is split along each page's imports, so a page
  // downloads only the styles its screens use instead of one merged file for the whole app.
  experimental: {
    cssChunking: 'graph',
  },
  // EZD-305: the import job reads PDFs with pdf.js's Node build on the server (job run on enqueue); it loads its own
  // worker module at run time, so it is required from node_modules, not bundled.
  // EZD-715: the PDF export job writes with PDFKit, which reads its own data files at run time, so it is required from
  // node_modules too.
  // EZD-2032: the client sheet images read the drawing fonts' outlines with fontkit (pdfkit's own copy), kept external
  // like pdfkit.
  serverExternalPackages: ['pdfjs-dist', 'pdfkit', 'fontkit'],
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
      {
        source: '/:path*',
        has: [{ type: 'header', key: 'cookie', value: SESSION_COOKIE_PATTERN }],
        headers: [{ key: 'x-ezdraft-app-build', value: APP_BUILD }],
      },
      // EZD-1930 (audit 2026-11-23 S6): every page and /api answer. frame-ancestors is 'self', not 'none', because
      // Run benchmark frames the editor from the same origin (docs/architecture.md Benchmark runs, Framing). No
      // shipped feature uses the camera, microphone or location (photos come from a file input), so all three are off.
      { source: '/:path*', headers: SECURITY_HEADERS },
      { source: '/auth/confirm', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      // EZD-105: the invite token is in the path; never sent on as a referrer.
      { source: '/invite/:token', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      // EZD-2022 (AC-EZD-2022-2): a client link's token is in the path too. A later rule wins over the site-wide one.
      { source: '/c', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      { source: '/c/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      // EZD-013 Step 8 (vault/plans/EZD-013.md D11): the worker script is never cached, so updates arrive at once.
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
