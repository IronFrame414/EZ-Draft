// EZD-000 · T1–T6, T26: docs/architecture.md, CLAUDE.md and the root workspace files.
// Sources: vault/plans/EZD-000.md (Tests table); vault/spec/sections/02-product-overview.md (Stack, Named tools);
// scripts/gate.mjs (`required`); Q-0005.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const archPath = path.join(root, 'docs', 'architecture.md');

const strip = (s) => s.replace(/`/g, '').trim();

function readArch() {
  assert.ok(existsSync(archPath), `docs/architecture.md must exist (${archPath})`);
  return readFileSync(archPath, 'utf8');
}

// Groups consecutive `|` lines into tables: { header: string[], rows: string[][] }.
function parseTables(md) {
  const tables = [];
  let cur = null;
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*\|/.test(line)) {
      const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      if (!cur) { cur = { header: cells.map(strip), rows: [] }; tables.push(cur); continue; }
      if (cur.rows.length === 0 && cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
      cur.rows.push(cells);
    } else {
      cur = null;
    }
  }
  return tables;
}

function tableWithHeader(md, header) {
  const t = parseTables(md).find((x) => x.header.join(' | ') === header.join(' | '));
  assert.ok(t, `docs/architecture.md must hold a table with header | ${header.join(' | ')} |`);
  return t;
}

// Package names are the backticked tokens of a Packages cell; `—` or no backticks = none.
function packagesIn(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean);
}

const NAMED_TOOLS_JOBS = [
  'Next.js mode',
  'Package manager and layout',
  'State store for the open model',
  'Schema and validation',
  'Unit tests / browser tests',
  'Styling and UI primitives',
  'Device storage',
  'Polygon math',
  'PDF writer',
  'DXF',
  'Email',
  'CI and repository',
  'Error reporting',
  'Database migrations',
];

const STACK_LAYERS = [
  'App shell',
  'Geometry core',
  '2D + 3D',
  'Polygon math',
  'Browser path tracing',
  'PDF in',
  'PDF out',
  'DXF in/out',
  'GLB / USDZ',
  'Database, auth, files',
  'Background jobs',
  'AI',
  'Offline',
  'Hosting',
];

const REQUIRED_HEADINGS = [
  '## Runtime',
  '## Named tools',
  '## Stack',
  '## Dependencies',
  '## Adding a dependency',
  '## Folder layout',
  '## Server-only data access and can()',
  '## Migrations',
  '## Errors and logging',
  '## Storage buckets and paths',
  '## Tests',
  '## Handoff',
  '## Machine checks',
];

const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const EMPTY_CHOICE = /^(|TBD|TODO|\?)$/i;

const sorted = (a) => [...a].sort();

test('EZD-000 T1 (AC-EZD-000-1) done when: Named tools table holds the 14 rows of 02 with a choice in each', () => {
  const t = tableWithHeader(readArch(), ['Job', 'Choice', 'Packages']);
  assert.equal(t.rows.length, 14, 'Named tools table must have exactly 14 rows (02 Named tools)');
  assert.deepEqual(sorted(t.rows.map((r) => strip(r[0]))), sorted(NAMED_TOOLS_JOBS));
  for (const r of t.rows) {
    assert.ok(!EMPTY_CHOICE.test(strip(r[1] || '')), `Named tools row "${r[0]}" needs a Choice`);
  }
});

test('EZD-000 T2: Stack table holds the 14 layers of 02 with a choice in each', () => {
  const t = tableWithHeader(readArch(), ['Layer', 'Choice', 'Packages']);
  assert.equal(t.rows.length, 14, 'Stack table must have exactly 14 rows (02 Stack)');
  assert.deepEqual(sorted(t.rows.map((r) => strip(r[0]))), sorted(STACK_LAYERS));
  for (const r of t.rows) {
    assert.ok(!EMPTY_CHOICE.test(strip(r[1] || '')), `Stack row "${r[0]}" needs a Choice`);
  }
});

test('EZD-000 T3: every package named in Named tools or Stack has one exact-version Dependencies row', () => {
  const md = readArch();
  const named = tableWithHeader(md, ['Job', 'Choice', 'Packages']);
  const stack = tableWithHeader(md, ['Layer', 'Choice', 'Packages']);
  const deps = tableWithHeader(md, ['Package', 'Version', 'Used in', 'Why', 'Added by']);

  const depNames = deps.rows.map((r) => strip(r[0]));
  const dupes = depNames.filter((n, i) => depNames.indexOf(n) !== i);
  assert.deepEqual(dupes, [], 'no package may appear twice in Dependencies');

  for (const r of deps.rows) {
    assert.match(strip(r[1] || ''), EXACT_VERSION, `Dependencies row "${r[0]}" must pin one exact version`);
  }

  const wanted = new Set();
  for (const r of [...named.rows, ...stack.rows]) for (const p of packagesIn(r[2] || '')) wanted.add(p);
  assert.ok(wanted.size > 0, 'the Packages cells must name at least one package');
  for (const p of wanted) {
    assert.ok(depNames.includes(p), `package "${p}" from Named tools / Stack has no Dependencies row`);
  }
});

test('EZD-000 T4: Dependencies lists every package the spec names', () => {
  const md = readArch();
  const deps = tableWithHeader(md, ['Package', 'Version', 'Used in', 'Why', 'Added by']);
  const names = deps.rows.map((r) => strip(r[0]));

  const exact = [
    'next', 'react', 'react-dom', 'typescript', 'pnpm', 'zustand', 'zod', 'vitest', '@playwright/test',
    'idb', 'pdfkit', 'dxf-parser', 'resend', 'three', '@react-three/fiber', 'three-bvh-csg',
    'three-gpu-pathtracer', 'pdfjs-dist', 'supabase',
  ];
  for (const n of exact) assert.ok(names.includes(n), `Dependencies must list "${n}" (02 Stack / Named tools)`);

  assert.ok(names.some((n) => n.startsWith('@radix-ui/') || n === 'radix-ui'), 'a Radix package row (02 Named tools)');
  assert.ok(names.some((n) => n.startsWith('workbox-')), 'a workbox-* row (02 Named tools)');
  assert.ok(names.some((n) => n.startsWith('@sentry/')), 'an @sentry/* row (02 Named tools)');
  assert.ok(names.some((n) => n.startsWith('@supabase/')), 'an @supabase/* row (02 Stack)');
  assert.ok(names.some((n) => n.toLowerCase().includes('clipper2')), 'a Clipper2 package row (02 Named tools)');

  const named = tableWithHeader(md, ['Job', 'Choice', 'Packages']);
  const dxf = named.rows.find((r) => strip(r[0]) === 'DXF');
  assert.ok(dxf, 'Named tools must have a DXF row');
  const dxfPkgs = packagesIn(dxf[2] || '');
  assert.equal(dxfPkgs.length, 2, 'the DXF row names exactly 2 packages (reader and writer)');
  assert.ok(dxfPkgs.includes('dxf-parser'), 'the DXF row names dxf-parser');
});

test('EZD-000 T5: the 13 required ## headings exist in order', () => {
  const headings = readArch().split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => /^## /.test(l));
  for (const h of REQUIRED_HEADINGS) assert.ok(headings.includes(h), `missing heading "${h}"`);
  const positions = REQUIRED_HEADINGS.map((h) => headings.indexOf(h));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'required headings must appear in the plan order');
});

test('EZD-000 T6 (AC-EZD-000-1): CLAUDE.md still exists with its build rules (Q-0005)', () => {
  const p = path.join(root, 'CLAUDE.md');
  assert.ok(existsSync(p), 'CLAUDE.md must exist');
  const md = readFileSync(p, 'utf8');
  // The setup kit's heading is `## Rules (every agent)`; the plan text (written 2026-10-11) names the
  // earlier wording `## Rules for every session and every agent`. Either proves the rules were kept.
  assert.ok(
    md.includes('## Rules (every agent)') || md.includes('## Rules for every session and every agent'),
    'CLAUDE.md must keep its Rules section',
  );
  assert.ok(md.includes('## Conventions file'), 'CLAUDE.md must keep its Conventions file section');
});

test('EZD-000 T26: root package.json has the gate scripts, pnpm pin and the four workspace globs', () => {
  const pkgPath = path.join(root, 'package.json');
  assert.ok(existsSync(pkgPath), 'root package.json must exist');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const scripts = pkg.scripts || {};
  for (const s of ['typecheck', 'lint', 'test', 'build']) {
    assert.equal(typeof scripts[s], 'string', `root script "${s}" required by scripts/gate.mjs`);
  }
  assert.ok(scripts.lint.includes('scripts/conventions/check.mjs'), 'lint must run scripts/conventions/check.mjs');
  assert.ok(typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('pnpm@'), 'packageManager must pin pnpm');

  const wsPath = path.join(root, 'pnpm-workspace.yaml');
  assert.ok(existsSync(wsPath), 'pnpm-workspace.yaml must exist');
  const globs = readFileSync(wsPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => /^\s*-\s*(.+?)\s*$/.exec(l))
    .filter(Boolean)
    .map((m) => m[1].replace(/^['"]|['"]$/g, ''));
  assert.deepEqual(sorted(globs), sorted(['app', 'packages/*', 'worker', 'spikes/*']));
});
