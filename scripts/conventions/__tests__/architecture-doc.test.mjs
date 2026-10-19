// EZD-000 · T1–T6, T26: docs/architecture.md, CLAUDE.md and the root workspace files.
// Sources: vault/plans/EZD-000.md (Tests table); vault/spec/sections/02-product-overview.md (Stack, Named tools);
// scripts/gate.mjs (`required`); Q-0005.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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

// ---------- EZD-010a T12 part a: docs updated ----------
// Sources: vault/plans/EZD-010a.md (Step 4, Tests T12); EZD-000 T5; Q-0026 (a), Q-0040 (c), Q-0057 (b).

test('EZD-010a T12 (a): the ## headings are exactly the 13 required, in order', () => {
  const headings = readArch().split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => /^## /.test(l));
  assert.deepEqual(headings, REQUIRED_HEADINGS);
});

test('EZD-010a T12 (b): the Design tokens, fonts and icons subsection exists', () => {
  const lines = readArch().split(/\r?\n/).map((l) => l.trimEnd());
  assert.ok(lines.includes('### Design tokens, fonts and icons'), 'missing ### Design tokens, fonts and icons');
});

test('EZD-010a T12 (c): Machine checks table has a C10 row', () => {
  const t = tableWithHeader(readArch(), ['ID', 'Rule', 'Check', 'Built by']);
  assert.ok(t.rows.some((r) => strip(r[0]) === 'C10'), 'Machine checks table needs a row with ID C10');
});

test('EZD-010a T12 (d): the doc names --ez-, Q-0026, --ez-radius-6 and --ez-radius-14', () => {
  const md = readArch();
  for (const s of ['--ez-', 'Q-0026', '--ez-radius-6', '--ez-radius-14']) {
    assert.ok(md.includes(s), `docs/architecture.md must contain ${s}`);
  }
});

test('EZD-010a T12 (e): the conventions check exits 0 on the repository root', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'conventions', 'check.mjs'), root], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout || ''}${r.stderr || ''}`);
});

test('EZD-010a T12 (f): .prettierignore has the line app/src/styles/tokens.css', () => {
  const p = path.join(root, '.prettierignore');
  assert.ok(existsSync(p), '.prettierignore must exist');
  const lines = readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trimEnd());
  assert.ok(lines.includes('app/src/styles/tokens.css'), '.prettierignore needs the line app/src/styles/tokens.css');
});

// EZD-010b · T12 part b (vault/plans/EZD-010b.md section 4).
test('EZD-010b T12 (a): the 13 required ## headings still equal REQUIRED_HEADINGS in order', () => {
  const headings = readArch().split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => /^## /.test(l));
  assert.deepEqual(headings, REQUIRED_HEADINGS);
});

test('EZD-010b T12 (b): architecture.md names icons.json, icons:build and icons:fetch', () => {
  const md = readArch();
  for (const s of ['icons.json', 'icons:build', 'icons:fetch']) {
    assert.ok(md.includes(s), `docs/architecture.md must contain ${s}`);
  }
});

test('EZD-010b T12 (c): Machine checks has an icons.test.ts row built by EZD-010b', () => {
  const t = tableWithHeader(readArch(), ['ID', 'Rule', 'Check', 'Built by']);
  assert.ok(
    t.rows.some((r) => (r[2] || '').includes('icons.test.ts') && strip(r[3] || '') === 'EZD-010b'),
    'a row whose Check contains icons.test.ts and whose Built by is EZD-010b',
  );
});

test('EZD-010b T12 (d): the ICON_COMMIT in icons-fetch.mjs appears in architecture.md', () => {
  const p = path.join(root, 'app', 'scripts', 'icons-fetch.mjs');
  assert.ok(existsSync(p), 'app/scripts/icons-fetch.mjs must exist');
  const lines = readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => /^export const ICON_COMMIT = /.test(l));
  assert.equal(lines.length, 1, 'exactly one ICON_COMMIT line');
  const m = lines[0].match(/^export const ICON_COMMIT = '([0-9a-f]{40})';/);
  assert.ok(m, 'ICON_COMMIT is 40 lower-case hex');
  assert.ok(readArch().includes(m[1]), 'docs/architecture.md must name the ICON_COMMIT value');
});

test('EZD-010b T12 (e): .prettierignore has the generated icon lines', () => {
  const p = path.join(root, '.prettierignore');
  assert.ok(existsSync(p), '.prettierignore must exist');
  const lines = readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trimEnd());
  for (const l of ['app/src/components/icon/icon-names.generated.ts', 'app/public/icons/']) {
    assert.ok(lines.includes(l), `.prettierignore needs the line ${l}`);
  }
});

test('EZD-010b T12 (f): the conventions check exits 0 on the repository root', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'conventions', 'check.mjs'), root], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout || ''}${r.stderr || ''}`);
});

test('EZD-010c T12 (a): the ## headings equal REQUIRED_HEADINGS', () => {
  const heads = readArch().split(/\r?\n/).filter((l) => /^## /.test(l)).map((l) => l.trimEnd());
  assert.deepEqual(heads, REQUIRED_HEADINGS);
});

test('EZD-010c T12 (b): the font text is in architecture.md', () => {
  const md = readArch();
  for (const s of ['fonts.ts', '@fontsource/instrument-sans', '@fontsource/dm-mono', 'OFL-1.1', 'next/font/local', 'src/app/dev/<name>/']) {
    assert.ok(md.includes(s), `docs/architecture.md must contain ${s}`);
  }
});

test('EZD-010c T12 (c): Machine checks row for no-icon-font.test.ts built by EZD-010c', () => {
  const t = tableWithHeader(readArch(), ['ID', 'Rule', 'Check', 'Built by']);
  assert.ok(
    t.rows.some((r) => (r[2] || '').includes('no-icon-font.test.ts') && strip(r[3] || '') === 'EZD-010c'),
    'a row whose Check contains no-icon-font.test.ts and whose Built by is EZD-010c',
  );
});

test('EZD-010c T12 (d): the conventions check exits 0 on the repository root', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'conventions', 'check.mjs'), root], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout || ''}${r.stderr || ''}`);
});

test('EZD-026a D1: docs describe the message helper, the catalogs and the lint', () => {
  const md = readArch();
  const headings = md.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => /^## /.test(l));
  assert.deepEqual(headings, REQUIRED_HEADINGS);
  assert.ok(md.split(/\r?\n/).some((l) => l.trimEnd() === '### Messages and language (t())'), 'heading ### Messages and language (t())');
  for (const s of [
    'ezdraft/no-literal-ui-string', 'eslint-rules/', '(field)', '(client)', 'components/phone',
    'app/src/lib/messages/', 'app/src/server/messages/', 'createT', 'useT', 'catalogFor', 'SPANISH_NAMESPACES', 'Q-0030',
  ]) {
    assert.ok(md.includes(s), `docs/architecture.md must contain ${s}`);
  }
  const t = tableWithHeader(md, ['ID', 'Rule', 'Check', 'Built by']);
  for (const [file, by] of [['messages-lint.test.mjs', 'EZD-026a'], ['catalog.test.ts', 'EZD-026d'], ['message-keys.test.ts', 'EZD-026d']]) {
    assert.ok(
      t.rows.some((r) => (r[2] || '').includes(file) && strip(r[3] || '') === by),
      `a Machine checks row whose Check contains ${file} and Built by is ${by}`,
    );
  }
  const deps = tableWithHeader(md, ['Package', 'Version', 'Used in', 'Why', 'Added by']);
  assert.ok(!deps.rows.some((r) => strip(r[4] || '') === 'EZD-026a'), 'no Dependencies row added by EZD-026a');
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'conventions', 'check.mjs'), root], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout || ''}${r.stderr || ''}`);
});
