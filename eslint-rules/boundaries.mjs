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
  { match: ['@react-three/'], category: 'three', allowed: [...LAZY_PLACES, 'app/src/editor/'] },
  { match: ['three-bvh-csg'], category: 'heavy', allowed: [...LAZY_PLACES] },
  { match: ['three-gpu-pathtracer'], category: 'heavy', allowed: [...LAZY_PLACES] },
  { match: ['pdfjs-dist'], category: 'heavy', allowed: [...LAZY_PLACES, 'app/src/server/jobs/'] },
  { match: ['dxf-parser'], category: 'heavy', allowed: [...LAZY_PLACES, 'app/src/server/jobs/'] },
  // The DXF writer, provisional until EZD-029.
  {
    match: ['@tarikjabiri/dxf'],
    category: 'heavy',
    allowed: [...LAZY_PLACES, 'app/src/server/jobs/'],
  },
];

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
