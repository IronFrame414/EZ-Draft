// EZD-020 Step 2 (vault/plans/EZD-020.md): the one list of import boundaries, read by the lint rule
// ezdraft/import-boundaries (eslint.config.mjs) and by the entry contents check (scripts/perf/js-contents.mjs).
// Plain data only. EZD-029's replace path edits the DXF names here (docs/architecture.md Named tools DXF row).

/** Each lazy module is a folder app/src/lazy/<name>/ with an index.ts or index.tsx (Step 3). */
export const LAZY_ROOT = 'app/src/lazy/';

/** Places a lazy-only library may be imported statically (11 rule 3, rule 7). */
export const LAZY_PLACES = ['app/src/lazy/', 'app/src/workers/'];

/** Editor-only code; app/src/editor/ is reserved for the store, canvas and tools (EZD-120b, EZD-207). */
export const EDITOR_CODE = [
  'app/src/components/shell/',
  'app/src/editor/',
  'app/src/app/(editor)/',
];

/** The places allowed to import editor code statically (app/src/app/dev/ covers /dev/shell, /dev/perf-probe). */
export const EDITOR_CODE_IMPORTERS = [
  'app/src/components/shell/',
  'app/src/editor/',
  'app/src/app/(editor)/',
  'app/src/lazy/',
  'app/src/app/dev/',
];

/**
 * Path aliases of app/tsconfig.json `paths`, resolved by ezdraft/import-boundaries (EZD-167). A new alias goes here in the same commit (test A6).
 */
export const PATH_ALIASES = [{ prefix: '@/', target: 'app/src/', appliesTo: 'app/' }];

/**
 * Matched in order; the first match wins. A name without a trailing `/` matches the exact name or `name/...`;
 * a name ending in `/` matches by prefix. `allowed` lists the path prefixes where a static import is allowed.
 */
export const HEAVY_PACKAGES = [
  {
    match: ['three/examples/jsm/exporters/', 'three/addons/exporters/'],
    category: 'heavy',
    allowed: [...LAZY_PLACES],
  },
  { match: ['three'], category: 'three', allowed: [...LAZY_PLACES, 'app/src/editor/'] },
  { match: ['three-bvh-csg'], category: 'heavy', allowed: [...LAZY_PLACES] },
  { match: ['three-gpu-pathtracer'], category: 'heavy', allowed: [...LAZY_PLACES] },
  { match: ['pdfjs-dist'], category: 'heavy', allowed: [...LAZY_PLACES, 'app/src/server/jobs/'] },
  { match: ['dxf-parser'], category: 'heavy', allowed: [...LAZY_PLACES, 'app/src/server/jobs/'] },
  { match: ['heic-to'], category: 'heavy', allowed: [...LAZY_PLACES] },
  // The DXF writer, provisional until EZD-029.
  {
    match: ['@tarikjabiri/dxf'],
    category: 'heavy',
    allowed: [...LAZY_PLACES, 'app/src/server/jobs/'],
  },
];

/**
 * EZD-2000 (AC-EZD-2000-1 (2); Q-0814 "heavy libraries stay out of first loads"; audit 2026-11-26 F3, F6): libraries
 * that are fine on the server, in a worker or loaded on first use, but never in a page's first-load bundle. Checked
 * in the bundles only, by the `contents.*` rows (scripts/perf/js-contents.mjs), as category `heavy`; not a lint
 * import ban, since server code imports zod everywhere and realtime arrives inside supabase-js. Full zod is its
 * classic and v3 builds; `zod/mini` (v4/mini, v4/core) is the small form and is not matched.
 */
export const FIRST_LOAD_PACKAGES = [
  { match: ['zod/v4/classic/', 'zod/v3/'], category: 'heavy', allowed: [] },
  { match: ['@supabase/realtime-js'], category: 'heavy', allowed: [] },
  // The image encoder (thumbnails, app/src/workers/thumbnail.worker.ts).
  { match: ['@jsquash/'], category: 'heavy', allowed: [] },
  // PDF writing (app/src/server/jobs/pdf-export/write-pdf.ts); pdf.js is in HEAVY_PACKAGES.
  { match: ['pdfkit'], category: 'heavy', allowed: [] },
];

/**
 * EZD-2000 (AC-EZD-2000-2 "record an allowance with its reason"): findings a page's contents check lets through, by
 * page path, each `{ key, reason }`. Read by scripts/perf/js-contents.mjs for every measurement of that page (the
 * perf rows and the e2e helpers alike); listed in the report's `allowed`, present or not.
 */
export const FIRST_LOAD_ALLOWANCES = {
  '/': [
    {
      key: 'pkg:@supabase/realtime-js',
      reason:
        'the notification bell loads realtime only after the load event and an idle moment (EZD-1997, lib/realtime/deferred.ts); the collector counts every script fetched before the page goes quiet, so it may land in the window',
    },
  ],
};

/** EZD-2000: what the `contents.*` rows look for in a bundle: HEAVY_PACKAGES, then FIRST_LOAD_PACKAGES. */
export const CONTENTS_PACKAGES = [...HEAVY_PACKAGES, ...FIRST_LOAD_PACKAGES];

/** The categories each entry's bundle must not contain (Step 2 ENTRY_RULES; sources in scripts/perf/budgets.mjs). */
export const ENTRY_RULES = {
  office: ['editor', 'three', 'heavy', 'lazy'],
  editor: ['heavy', 'lazy'],
  'field-pack': ['editor', 'three', 'heavy', 'lazy'],
  'client-link': ['editor', 'three', 'heavy', 'lazy'],
  'sign-in': ['editor', 'three', 'heavy', 'lazy'],
};

/** Named on every bundle report line, present or not (EZD-024, EZD-018, EZD-015 Risks). */
export const WATCH_PACKAGES = ['@sentry/', '@supabase/realtime-js', '@radix-ui/', 'radix-ui'];

/** True when `spec` matches the HEAVY_PACKAGES name `name` (exact or `name/...`; prefix when `name` ends in `/`). */
export function matchesName(spec, name) {
  if (name.endsWith('/')) return spec.startsWith(name);
  return spec === name || spec.startsWith(name + '/');
}

/** The first HEAVY_PACKAGES entry and name matching `spec`, or null. */
export function findHeavy(spec, packages = HEAVY_PACKAGES) {
  for (const entry of packages) {
    for (const name of entry.match) {
      if (matchesName(spec, name)) return { entry, name };
    }
  }
  return null;
}
