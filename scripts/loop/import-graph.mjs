// Footprints include the tests of the files they claim (EZD-1942, audit 2026-11-23 W3). A builder that changes a source
// file usually changes the tests that import it too; when the footprint left those tests out, the loop found them only
// as DRIFT just before the merge, after another lane may already have been editing them. After the footprint step the
// loop adds every test or spec file that imports a claimed file, found by a static import scan of app/, packages/ and
// scripts/. The scan reads files only (no git, no build) and runs on develop's read-only footprint checkout, never in a
// lane. Node built-ins only.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const SCAN_DIRS = ['app', 'packages', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', 'dist', 'build', 'coverage', 'out', 'playwright-report', 'test-results', '.git', '.vercel', 'public']);
const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const RESOLVE_EXT = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json'];

// A test or spec file: *.test.*, *.spec.*, or anything under a __tests__ folder.
export const isTest = (f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) || /(^|\/)__tests__\//.test(f);

// A folder's index file re-exports the folder (a barrel). Hundreds of tests import `@ezdraft/geometry`, so claiming
// the barrel would pull in nearly every test; a barrel's importers are not the tests a change edits. Barrels are not
// followed.
export const isBarrel = (f) => /(^|\/)index\.[cm]?[jt]sx?$/.test(f);

// The module specifiers a file names: import/export ... from, bare import, dynamic import(), require(), vi.mock().
const SPEC_RES = [
  /\b(?:import|export)\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\b(?:vi|jest)\.(?:mock|doMock|importActual)\s*\(\s*['"]([^'"\n]+)['"]/g,
];
export function specifiers(src) {
  const out = new Set();
  for (const re of SPEC_RES) for (const m of String(src).matchAll(re)) out.add(m[1]);
  return [...out];
}

function walk(root, rel, out) {
  let entries;
  try { entries = readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(root, r, out); }
    else if (e.isFile() || e.isSymbolicLink()) out.push(r);
  }
}

// Package names to their source entry points, from each workspace package.json under packages/ ("exports" or "main").
function workspacePackages(root, files) {
  const map = new Map();
  for (const f of files) {
    if (!/^packages\/[^/]+\/package\.json$/.test(f)) continue;
    try {
      const pj = JSON.parse(readFileSync(path.join(root, f), 'utf8'));
      const dir = path.posix.dirname(f);
      const exp = typeof pj.exports === 'string' ? { '.': pj.exports } : (pj.exports || (pj.main ? { '.': pj.main } : {}));
      for (const [k, v] of Object.entries(exp)) {
        const target = typeof v === 'string' ? v : (v?.import || v?.default);
        // EZD-1905: a subpath pattern ("./*": "./src/*/index.ts") is kept as written, `*` and all; resolveSpecifier fills it.
        if (typeof target === 'string') map.set(k === '.' ? pj.name : `${pj.name}/${k.replace(/^\.\//, '')}`, k.includes('*') ? `${dir}/${target.replace(/^\.\//, '')}` : path.posix.normalize(`${dir}/${target}`));
      }
    } catch {}
  }
  return map;
}

// Resolves a specifier written in `from` to a repo file in `known`, or null (an outside package).
export function resolveSpecifier(spec, from, known, packages = new Map()) {
  let base;
  if (spec.startsWith('./') || spec.startsWith('../')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else if (spec.startsWith('@/') && from.startsWith('app/')) base = `app/src/${spec.slice(2)}`;
  else if (packages.has(spec) && !spec.includes('*')) return packages.get(spec);
  else return resolvePackagePattern(spec, known, packages);
  base = base.replace(/\?.*$/, '');
  if (known.has(base)) return base;
  // TypeScript ESM style: `./x.js` written for x.ts.
  const stem = base.replace(/\.(js|jsx|mjs|cjs)$/, '');
  for (const ext of RESOLVE_EXT) if (known.has(stem + ext)) return stem + ext;
  for (const ext of RESOLVE_EXT) if (known.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
  return null;
}

// EZD-1905: `@ezdraft/geometry/<area>` through a `*` subpath pattern, as Node and the bundlers match it: the text the
// `*` stands for may not be empty, and the filled target must be a repo file.
function resolvePackagePattern(spec, known, packages) {
  for (const [key, target] of packages) {
    const star = key.indexOf('*');
    if (star < 0) continue;
    const pre = key.slice(0, star);
    const post = key.slice(star + 1);
    if (spec.length <= pre.length + post.length || !spec.startsWith(pre) || !spec.endsWith(post)) continue;
    const filled = path.posix.normalize(target.replace('*', spec.slice(pre.length, spec.length - post.length)));
    if (known.has(filled)) return filled;
  }
  return null;
}

// EZD-1905: a package subpath barrel (`@ezdraft/geometry/benchmark` is `benchmark/index.ts`) stands for the files it
// re-exports, so a test that imports an area still joins the claim on the file it uses. One level, relative re-exports
// only; the package root barrel is never expanded (it would pull in nearly every test).
function barrelTargets(root, barrel, known) {
  let src;
  try { src = readFileSync(path.join(root, barrel), 'utf8'); } catch { return []; }
  const out = [];
  for (const m of src.matchAll(/\bexport\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"](\.[^'"\n]+)['"]/g)) {
    const t = resolveSpecifier(m[1], barrel, known);
    if (t) out.push(t);
  }
  return out;
}

// Scans the repo once: { importers: Map<file, Set<test file>>, files, ms }. Only test files' imports are recorded,
// because only tests are added to a claim.
export function buildTestImportGraph(root, dirs = SCAN_DIRS) {
  const t0 = Date.now();
  const files = [];
  for (const d of dirs) walk(root, d, files);
  const known = new Set(files);
  const packages = workspacePackages(root, files);
  const importers = new Map();
  for (const f of files) {
    if (!CODE.test(f) || !isTest(f)) continue;
    let src;
    try { src = readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
    for (const s of specifiers(src)) {
      const target = resolveSpecifier(s, f, known, packages);
      if (!target || target === f) continue;
      const subpathBarrel = isBarrel(target) && !packages.has(s) && !s.startsWith('.') && !s.startsWith('@/');
      for (const t of [target, ...(subpathBarrel ? barrelTargets(root, target, known) : [])]) {
        if (t === f) continue;
        if (!importers.has(t)) importers.set(t, new Set());
        importers.get(t).add(f);
      }
    }
  }
  return { importers, files: known, ms: Date.now() - t0 };
}

// The test files that import any of `claimed` (directly), not already in it, sorted. Barrels, `<new>` placeholders and
// `skip` (the shared files every lane may edit, e.g. the message catalogs) are not followed, nor is a file more than
// `maxPerFile` tests import: such a file is a hub (a test helper, a registry) whose importers a change rarely edits, and
// claiming them all would stop other lanes for nothing. Returns { added, hubs: [{ file, tests }] }.
export function testsFor(graph, claimed, { skip = new Set(), maxPerFile = MAX_PER_FILE } = {}) {
  const have = new Set(claimed);
  const out = new Set();
  const hubs = [];
  for (const f of claimed) {
    if (f.includes('<new>') || isBarrel(f) || skip.has(f)) continue;
    const tests = graph.importers.get(f);
    if (!tests) continue;
    if (tests.size > maxPerFile) { hubs.push({ file: f, tests: tests.size }); continue; }
    for (const t of tests) if (!have.has(t)) out.add(t);
  }
  return { added: [...out].sort(), hubs };
}
export const MAX_PER_FILE = 25;

// One scan per develop commit: the footprint step calls this for each ticket, and develop moves only on a merge.
const cache = { key: null, graph: null };
export function withImportingTests(root, files, { key = null, skip, maxPerFile } = {}) {
  let graph = key && cache.key === key ? cache.graph : null;
  if (!graph) { graph = buildTestImportGraph(root); if (key) { cache.key = key; cache.graph = graph; } }
  const { added, hubs } = testsFor(graph, files, { skip, maxPerFile });
  return { files: [...new Set([...files, ...added])].sort(), added, hubs, ms: graph.ms };
}
