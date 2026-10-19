#!/usr/bin/env node
// EZD-000 · Conventions check C1–C8 (vault/plans/EZD-000.md, Step 3; docs/architecture.md, Machine checks).
// EZD-001 · C9 test files carry a ticket ID (vault/plans/EZD-001.md, Step 6.1; Q-0006).
// Plain Node 22, no dependencies. Usage: node scripts/conventions/check.mjs [rootDir]
// Prints one line per violation, `[Cn] <repo-relative path>: <problem>`, and exits 1 if any; else prints a pass line and exits 0.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const problems = [];

function fail(check, file, problem) {
  problems.push(`[${check}] ${file}: ${problem}`);
}

// ---------- helpers ----------

/** Repo-relative path with forward slashes. */
function rel(abs) {
  return path.relative(root, abs).split(path.sep).join('/');
}

function abs(relPath) {
  return path.join(root, ...relPath.split('/'));
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Direct subdirectories of a repo-relative folder (repo-relative, sorted). */
function subdirs(relDir) {
  const d = abs(relDir);
  if (!isDir(d)) return [];
  return readdirSync(d)
    .filter((n) => isDir(path.join(d, n)))
    .sort()
    .map((n) => `${relDir}/${n}`);
}

/** Folders never read by any walk (plan Step 3). */
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.git', '.claude', 'vault', 'fixtures', '__fixtures__', '__tests__']);

/** Every file under a repo-relative folder, skipping SKIP_DIRS. Returns repo-relative paths. */
function walk(relDir) {
  const out = [];
  const start = abs(relDir);
  if (!isDir(start)) return out;
  const stack = [start];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile()) {
        out.push(rel(full));
      }
    }
  }
  return out.sort();
}

function readJson(relPath) {
  try {
    return JSON.parse(readFileSync(abs(relPath), 'utf8'));
  } catch (e) {
    fail('C1', relPath, `cannot parse JSON (${e.message})`);
    return null;
  }
}

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const TEST_DIR = /(^|\/)(e2e|test-utils|test-harness|__tests__|fixtures|__fixtures__)\//;

function isTestFile(relPath) {
  return TEST_FILE.test(relPath) || TEST_DIR.test(relPath);
}

/** Import / require / export-from specifiers found by a text scan (plan Risks: text scans, not a parser). */
function importSpecifiers(text) {
  const specs = [];
  const patterns = [
    /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, // import x from 'a'; export { y } from 'a'
    /\bimport\s*['"]([^'"]+)['"]/g, // import 'a'
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // import('a')
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // require('a')
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) specs.push(m[1]);
  }
  return specs;
}

function importsPackage(specs, name) {
  return specs.some((s) => s === name || s.startsWith(`${name}/`));
}

// ---------- docs/architecture.md Dependencies table ----------

const ARCH = 'docs/architecture.md';
const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function stripCell(cell) {
  return cell.replace(/`/g, '').trim();
}

/** Returns { rows: Map<name, version> } or null when the file or table is missing. */
function readDependenciesTable() {
  if (!isFile(abs(ARCH))) return null;
  const lines = readFileSync(abs(ARCH), 'utf8').split(/\r?\n/);
  let i = lines.findIndex((l) => /^##\s+Dependencies\s*$/.test(l));
  if (i < 0) return null;
  // Find the table header inside the section.
  let header = -1;
  for (let j = i + 1; j < lines.length; j++) {
    if (/^##\s/.test(lines[j])) break;
    if (/^\|\s*Package\s*\|\s*Version\s*\|/.test(lines[j])) {
      header = j;
      break;
    }
  }
  if (header < 0) return null;
  const rows = new Map();
  for (let j = header + 2; j < lines.length; j++) {
    const line = lines[j];
    if (!/^\|/.test(line)) break;
    const cells = line.split('|').slice(1, -1).map(stripCell);
    const [name, version] = cells;
    if (!name) continue;
    if (rows.has(name)) {
      fail('C1', ARCH, `package ${name} is listed twice in the Dependencies table`);
      continue;
    }
    if (!EXACT_VERSION.test(version || '')) {
      fail('C1', ARCH, `package ${name} has a non-exact Version "${version}" (one exact x.y.z required)`);
    }
    rows.set(name, version);
  }
  return { rows };
}

// ---------- package.json discovery ----------

// The only package.json files C1 reads (plan C1): the root, app, each packages/<name>, worker, each spikes/<name>.
function packageJsonFiles() {
  const dirs = ['', 'app', ...subdirs('packages'), 'worker', ...subdirs('spikes')];
  return dirs
    .map((d) => (d ? `${d}/package.json` : 'package.json'))
    .filter((p) => isFile(abs(p)));
}

const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const PINNED_FIELDS = new Set(['dependencies', 'devDependencies', 'optionalDependencies']);

function depEntries(pkg) {
  const out = [];
  for (const field of DEP_FIELDS) {
    const obj = pkg[field];
    if (!obj || typeof obj !== 'object') continue;
    for (const [name, spec] of Object.entries(obj)) out.push({ field, name, spec: String(spec) });
  }
  return out;
}

const pkgFiles = packageJsonFiles();
const pkgs = new Map(); // relPath -> parsed json
for (const p of pkgFiles) {
  const json = readJson(p);
  if (json) pkgs.set(p, json);
}

// ---------- C1 Dependencies listed and pinned ----------

function checkC1() {
  if (pkgs.size === 0) return;
  const table = readDependenciesTable();
  if (!table) {
    fail('C1', ARCH, 'file or its Dependencies table (`| Package | Version | Used in | Why | Added by |`) is missing');
    return;
  }
  const { rows } = table;
  for (const [file, pkg] of pkgs) {
    for (const { field, name, spec } of depEntries(pkg)) {
      if (spec.startsWith('workspace:')) continue;
      if (!rows.has(name)) {
        fail('C1', file, `${field} ${name}@${spec} has no row in the ${ARCH} Dependencies table`);
        continue;
      }
      if (PINNED_FIELDS.has(field) && spec !== rows.get(name)) {
        fail('C1', file, `${field} ${name} is "${spec}" but the ${ARCH} Dependencies row pins ${rows.get(name)}`);
      }
    }
  }
  const rootPkg = pkgs.get('package.json');
  if (rootPkg) {
    const want = rows.has('pnpm') ? `pnpm@${rows.get('pnpm')}` : null;
    if (!want) fail('C1', ARCH, 'the Dependencies table has no pnpm row (needed for the root packageManager field)');
    else if (rootPkg.packageManager !== want) {
      fail('C1', 'package.json', `packageManager is "${rootPkg.packageManager ?? ''}" but the pnpm Dependencies row requires "${want}"`);
    }
  }
}

// ---------- C2 Workspace layout ----------

const WORKSPACE_FILE = 'pnpm-workspace.yaml';
const WANTED_GLOBS = ['app', 'packages/*', 'worker', 'spikes/*'];

/** Minimal reader for the `packages:` list of pnpm-workspace.yaml (block list or inline list). */
function readWorkspaceGlobs(text) {
  const lines = text.split(/\r?\n/);
  const globs = [];
  const unquote = (s) => s.trim().replace(/^['"]|['"]$/g, '').trim();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^packages:\s*(.*)$/);
    if (!m) continue;
    const inline = m[1].trim();
    if (inline.startsWith('[')) {
      const inner = inline.replace(/^\[|\]\s*(#.*)?$/g, '');
      for (const part of inner.split(',')) if (unquote(part)) globs.push(unquote(part));
      return globs;
    }
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (/^\s*$/.test(l) || /^\s*#/.test(l)) continue;
      const item = l.match(/^\s+-\s*(.+?)\s*(#.*)?$/);
      if (!item) break;
      globs.push(unquote(item[1]));
    }
    return globs;
  }
  return globs;
}

function checkC2() {
  if (pkgs.size === 0) return;
  if (!isFile(abs(WORKSPACE_FILE))) {
    fail('C2', WORKSPACE_FILE, `missing; packages must be exactly ${WANTED_GLOBS.join(', ')}`);
  } else {
    const globs = readWorkspaceGlobs(readFileSync(abs(WORKSPACE_FILE), 'utf8'));
    const have = new Set(globs);
    for (const g of WANTED_GLOBS) if (!have.has(g)) fail('C2', WORKSPACE_FILE, `packages is missing "${g}"`);
    for (const g of have) if (!WANTED_GLOBS.includes(g)) fail('C2', WORKSPACE_FILE, `packages has an extra entry "${g}" (allowed: ${WANTED_GLOBS.join(', ')})`);
  }
  for (const [file, pkg] of pkgs) {
    if (file === 'package.json') continue; // the workspace root is not a workspace package
    if (pkg.private !== true) fail('C2', file, 'workspace package must set "private": true');
    if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@ezdraft/')) {
      fail('C2', file, `workspace package name "${pkg.name ?? ''}" must start with @ezdraft/`);
    }
  }
}

// ---------- C3 Geometry has no UI ----------

const GEOMETRY = 'packages/geometry';
const UI_PACKAGE = /^(react|react-dom|next|radix-ui|@react-three\/.*|@radix-ui\/.*)$/;
const UI_FILE = /\.(tsx|jsx|css|scss)$/;

function checkC3() {
  const pkg = pkgs.get(`${GEOMETRY}/package.json`);
  if (pkg) {
    for (const { field, name } of depEntries(pkg)) {
      if (UI_PACKAGE.test(name)) fail('C3', `${GEOMETRY}/package.json`, `${field} ${name} is a UI package; the geometry package has no UI code`);
    }
  }
  for (const file of walk(GEOMETRY)) {
    if (UI_FILE.test(file)) fail('C3', file, 'UI file in the geometry package (no .tsx, .jsx, .css or .scss allowed)');
  }
}

// ---------- shared source scan for C4, C6, C7, C8 ----------

const SCAN_ROOTS = ['app', 'packages', 'worker'];
const sourceFiles = SCAN_ROOTS.flatMap((r) => walk(r)).filter((f) => SOURCE_EXT.test(f));
const sourceText = new Map(sourceFiles.map((f) => [f, readFileSync(abs(f), 'utf8')]));
const sourceSpecs = new Map(sourceFiles.map((f) => [f, importSpecifiers(sourceText.get(f))]));

// ---------- C4 Spikes are never imported ----------

function checkC4() {
  for (const file of sourceFiles) {
    if (isTestFile(file)) continue;
    for (const spec of sourceSpecs.get(file)) {
      if (spec.includes('spikes/') || spec.startsWith('@ezdraft/spike')) {
        fail('C4', file, `imports "${spec}"; spike code is never imported by app, packages or worker`);
      }
    }
  }
  for (const [file, pkg] of pkgs) {
    if (file.startsWith('spikes/')) continue;
    for (const { field, name } of depEntries(pkg)) {
      if (name.startsWith('@ezdraft/spike')) fail('C4', file, `${field} ${name} is a spike package; spikes are never depended on`);
    }
  }
}

// ---------- C5 Migration names ----------

const MIGRATIONS = 'supabase/migrations';
const MIGRATION_NAME = /^(\d{14})_[a-z0-9]+(_[a-z0-9]+)*\.sql$/;

function checkC5() {
  const dir = abs(MIGRATIONS);
  if (!isDir(dir)) return;
  const seen = new Map(); // timestamp -> first file
  for (const name of readdirSync(dir).sort()) {
    if (!isFile(path.join(dir, name))) continue;
    const file = `${MIGRATIONS}/${name}`;
    const m = name.match(MIGRATION_NAME);
    if (!m) {
      fail('C5', file, 'migration name must be <14-digit UTC timestamp>_<snake_case_description>.sql');
      continue;
    }
    const ts = m[1];
    if (seen.has(ts)) fail('C5', file, `timestamp ${ts} is also used by ${seen.get(ts)}; timestamps must be unique`);
    else seen.set(ts, file);
  }
}

// ---------- C6 PDFKit only in jobs ----------

const JOBS_DIR = 'app/src/server/jobs/';

function checkC6() {
  for (const file of sourceFiles) {
    if (isTestFile(file)) continue;
    if (importsPackage(sourceSpecs.get(file), 'pdfkit') && !file.startsWith(JOBS_DIR)) {
      fail('C6', file, `imports pdfkit; PDFKit is used only in job handlers under ${JOBS_DIR}`);
    }
  }
}

// ---------- C7 Test file naming ----------

function checkC7() {
  for (const file of sourceFiles) {
    const specs = sourceSpecs.get(file);
    const base = path.posix.basename(file);
    if (importsPackage(specs, 'vitest')) {
      const exempt = /(^|\/)(test-utils|test-harness)\//.test(file)
        || /^vitest\.(config|workspace)\./.test(base)
        || /\.setup\.ts$/.test(base);
      if (!exempt && !/\.test\.tsx?$/.test(base)) {
        fail('C7', file, 'imports vitest but is not named *.test.ts or *.test.tsx');
      }
    }
    if (importsPackage(specs, '@playwright/test')) {
      const exempt = /(^|\/)(test-harness|fixtures)\//.test(file) || /^playwright\.config\./.test(base);
      if (!exempt && !/\.spec\.ts$/.test(base)) {
        fail('C7', file, 'imports @playwright/test but is not named *.spec.ts');
      }
    }
  }
}

// ---------- C8 No console outside the logger ----------

const CONSOLE_ROOTS = /^(app\/src\/|packages\/[^/]+\/src\/|worker\/src\/)/;
const CONSOLE_CALL = /\bconsole\s*\.\s*[A-Za-z_$][\w$]*\s*\(/;

function checkC8() {
  for (const file of sourceFiles) {
    if (!CONSOLE_ROOTS.test(file) || isTestFile(file)) continue;
    if (path.posix.basename(file) === 'logger.ts') continue;
    const code = sourceText.get(file)
      .split(/\r?\n/)
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)) // skip whole-line comments
      .join('\n');
    if (CONSOLE_CALL.test(code)) fail('C8', file, 'calls console.*; log through logger.ts only');
  }
}

// ---------- C9 Test files carry a ticket ID (EZD-001 Step 6.1; Q-0006) ----------

// Every Vitest or Playwright test file has a top-level describe (test.describe in Playwright) whose title starts with the
// owning ticket ID, so the gate's phase scope (EZD_TEST_GREP) can find it. Files under test-utils/ and test-harness/ and
// config files are exempt, as in C7. The walk already skips __tests__/, fixtures/, .claude/ and vault/; spikes/ is not scanned.
const C9_FILE = /\.(test\.tsx?|spec\.ts)$/;
const C9_EXEMPT = /(^|\/)(test-utils|test-harness)\//;
const C9_CONFIG = /^(vitest|playwright)\.(config|workspace)\./;
const TICKET_DESCRIBE = /\bdescribe(?:\.\w+)*\(\s*['"`]EZD-\d{3,4}[a-z]?\b/;

function checkC9() {
  for (const file of sourceFiles) {
    if (!C9_FILE.test(file) || C9_EXEMPT.test(file) || C9_CONFIG.test(path.posix.basename(file))) continue;
    if (!TICKET_DESCRIBE.test(sourceText.get(file))) {
      fail('C9', file, "no top-level describe whose title starts with the owning ticket ID, e.g. describe('EZD-001 …', …)");
    }
  }
}

// ---------- run ----------

checkC1();
checkC2();
checkC3();
checkC4();
checkC5();
checkC6();
checkC7();
checkC8();
checkC9();

if (problems.length) {
  for (const line of problems) console.log(line);
  console.log(`conventions check: ${problems.length} violation${problems.length === 1 ? '' : 's'} (see docs/architecture.md, Machine checks)`);
  process.exit(1);
}
console.log(`conventions check: C1–C9 pass (${rel(root) || '.'})`);
