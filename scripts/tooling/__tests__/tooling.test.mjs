// EZD-001 · T4–T16: repo tooling (vault/plans/EZD-001.md section 4; interface contract section 3).
// Sources: 02 Stack / Named tools; 11 Rules 3, Where each output is produced; PROCESS.md section 14; PROCESS-EZDRAFT.md
// section 5; Q-0006, Q-0019 read as 4 (Q-0114), Q-0139 (a), Q-0140 (a); CLAUDE.md rule 7; scripts/gate.mjs lines 29–71.
// Run by the root `node --test "scripts/**/*.test.mjs"`. Temp files go under os.tmpdir(), except T9's probe (plan T9).
// Tests match exit codes, rule IDs, check IDs and paths, not message wording.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const appDir = path.join(root, 'app');
const geoDir = path.join(root, 'packages', 'geometry');
const gateScript = path.join(root, 'scripts', 'gate.mjs');
const checkScript = path.join(root, 'scripts', 'conventions', 'check.mjs');

const tmpRoots = [];
after(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});
function tmpDir(prefix) {
  const d = mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpRoots.push(d);
  return d;
}

/** Child env: never inherit the gate's scope grep (scripts/gate.mjs line 71); each case sets its own. */
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (!('EZD_TEST_GREP' in extra)) delete env.EZD_TEST_GREP;
  return env;
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', env: childEnv(opts.env || {}), cwd: opts.cwd || root, timeout: 300_000 });
}

/** JSON from `tsc --showConfig` run inside a package through pnpm. */
function showConfig(filter) {
  const r = run('pnpm', ['--filter', filter, 'exec', 'tsc', '-p', '.', '--showConfig']);
  assert.equal(r.status, 0, `tsc --showConfig for ${filter} failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout);
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** Import a root devDependency resolved from the repo root (not from this file's folder). */
function importFromRoot(name) {
  const req = createRequire(path.join(root, 'package.json'));
  return import(pathToFileURL(req.resolve(name)).href).then((mod) => mod.default ?? mod);
}

const EXCLUDED = ['/vault/', '/spikes/', '/.claude/'];
/** True when the repo-relative form of `p` enters an excluded folder (the worktree itself lives under .claude/worktrees/). */
function entersExcluded(p) {
  const rel = '/' + path.relative(root, p).split(path.sep).join('/') + '/';
  return EXCLUDED.some((seg) => rel.includes(seg));
}

describe('EZD-001 repo tooling', () => {
  // ---------- T4 ----------
  test('EZD-001 T4: geometry has no DOM or Node types', () => {
    const cfg = showConfig('@ezdraft/geometry');
    const lib = cfg.compilerOptions?.lib;
    assert.ok(Array.isArray(lib) && lib.length > 0, 'compilerOptions.lib must be present');
    assert.ok(!lib.some((l) => /dom/i.test(l)), `lib must have no DOM entry, got ${JSON.stringify(lib)}`);
    const types = cfg.compilerOptions?.types ?? [];
    assert.ok(!types.includes('node'), `types must not include node, got ${JSON.stringify(types)}`);

    const base = path.join(geoDir, 'tsconfig.json');
    const probeCase = (name, source) => {
      const d = tmpDir(`ezd001-t4-${name}-`);
      const probe = path.join(d, 'probe.ts');
      writeFileSync(probe, source);
      const cfgPath = path.join(d, 'tsconfig.json');
      writeFileSync(cfgPath, JSON.stringify({ extends: base, include: [], files: [probe] }));
      return run('pnpm', ['--filter', '@ezdraft/geometry', 'exec', 'tsc', '--noEmit', '-p', cfgPath]);
    };
    const a = probeCase('a', 'export const t = document.title;\n');
    assert.notEqual(a.status, 0, '(a) a DOM access must fail the geometry type check');
    assert.ok(/document/.test(a.stdout + a.stderr), '(a) the error names document');
    const b = probeCase('b', 'export const n: number = 1;\n');
    assert.equal(b.status, 0, `(b) plain TypeScript must pass: ${b.stdout}${b.stderr}`);
  });

  // ---------- T5 ----------
  test('EZD-001 T5: strict typing in app and geometry', () => {
    assert.equal(showConfig('@ezdraft/app').compilerOptions?.strict, true, 'app strict');
    assert.equal(showConfig('@ezdraft/geometry').compilerOptions?.strict, true, 'geometry strict');
  });

  // ---------- T6 ----------
  test('EZD-001 T6: TypeScript stays inside its package', () => {
    const appPkg = readJson(path.join(appDir, 'package.json'));
    if (/\bnext typegen\b/.test(appPkg.scripts?.typecheck || '')) {
      run('pnpm', ['--filter', '@ezdraft/app', 'exec', 'next', 'typegen']);
    }
    for (const [filter, dir] of [['@ezdraft/app', appDir], ['@ezdraft/geometry', geoDir]]) {
      const files = showConfig(filter).files;
      assert.ok(Array.isArray(files) && files.length > 0, `${filter}: showConfig files list present`);
      for (const f of files) {
        const abs = path.resolve(dir, f);
        assert.ok(abs.startsWith(dir + path.sep), `${filter}: ${f} is inside ${dir}`);
        assert.ok(!entersExcluded(abs), `${filter}: ${f} is not under vault/, spikes/ or .claude/`);
      }
    }
  });

  // ---------- T7 ----------
  test('EZD-001 T7: ESLint ignores vault/, spikes/ and .claude/ and lints app and geometry', async () => {
    const { ESLint } = await importFromRoot('eslint');
    const eslint = new ESLint({ cwd: root });
    for (const p of ['vault/tools/next_ticket.mjs', 'spikes/EZD-027-canvas/page.tsx', '.claude/worktrees/EZD-999/app/src/app/page.tsx']) {
      assert.equal(await eslint.isPathIgnored(p), true, `${p} must be ignored`);
    }
    for (const p of ['app/src/app/page.tsx', 'packages/geometry/src/index.ts']) {
      assert.equal(await eslint.isPathIgnored(p), false, `${p} must be linted`);
    }
  });

  // ---------- T8 ----------
  test('EZD-001 T8: ESLint configs per package', async () => {
    const { ESLint } = await importFromRoot('eslint');
    const eslint = new ESLint({ cwd: root });
    const appCfg = await eslint.calculateConfigForFile('app/src/app/page.tsx');
    const geoCfg = await eslint.calculateConfigForFile('packages/geometry/src/index.ts');
    assert.ok(Object.keys(appCfg.plugins || {}).includes('@next/next'), 'app config has the @next/next plugin');
    assert.ok(!Object.keys(geoCfg.plugins || {}).includes('@next/next'), 'geometry config has no @next/next plugin');
    const [result] = await eslint.lintText('const unused = 1;\n', { filePath: 'packages/geometry/src/probe.ts' });
    const hits = result.messages.filter((m) => m.ruleId === '@typescript-eslint/no-unused-vars' && m.severity === 2);
    assert.ok(hits.length >= 1, `expected an error from @typescript-eslint/no-unused-vars, got ${JSON.stringify(result.messages)}`);
  });

  // ---------- T9 ----------
  test('EZD-001 T9: Vitest discovery from the root never enters .claude/, vault/ or spikes/', () => {
    const probeDir = path.join(root, '.claude', 'worktrees', '__ezd001_probe__', 'packages', 'geometry', 'src');
    const probe = path.join(probeDir, 'probe.test.ts');
    try {
      mkdirSync(probeDir, { recursive: true });
      writeFileSync(probe, "import { test } from 'vitest';\ntest('probe', () => { throw new Error('probe'); });\n");
      const r = run('pnpm', ['exec', 'vitest', 'list', '--filesOnly', '--json']);
      assert.equal(r.status, 0, `vitest list failed: ${r.stderr}`);
      const start = r.stdout.indexOf('[');
      assert.ok(start >= 0, 'vitest list prints a JSON array');
      const files = JSON.parse(r.stdout.slice(start)).map((e) => (typeof e === 'string' ? e : e.file));
      const rels = files.map((f) => path.relative(root, f).split(path.sep).join('/'));
      assert.ok(rels.includes('packages/geometry/src/index.test.ts'), `lists the geometry test, got ${JSON.stringify(rels)}`);
      for (const f of files) assert.ok(!entersExcluded(f), `${f} is outside .claude/, vault/ and spikes/`);
    } finally {
      rmSync(path.join(root, '.claude', 'worktrees', '__ezd001_probe__'), { recursive: true, force: true });
    }
  });

  // ---------- T10 ----------
  test('EZD-001 T10: package wiring', () => {
    const app = readJson(path.join(appDir, 'package.json'));
    assert.equal(app.name, '@ezdraft/app');
    assert.equal(app.private, true);
    for (const s of ['dev', 'build', 'start', 'typecheck', 'lint', 'test']) assert.equal(typeof app.scripts?.[s], 'string', `app script ${s}`);
    assert.ok(app.scripts.build.startsWith('next build'), 'app build starts with next build');

    const geo = readJson(path.join(geoDir, 'package.json'));
    assert.equal(geo.name, '@ezdraft/geometry');
    assert.equal(geo.private, true);
    assert.equal(geo.type, 'module');
    assert.equal(geo.exports?.['.'], './src/index.ts');
    for (const s of ['typecheck', 'lint', 'test']) assert.equal(typeof geo.scripts?.[s], 'string', `geometry script ${s}`);
    assert.equal(geo.scripts.build, undefined, 'geometry has no build script');
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const dep of ['react', 'react-dom', 'next']) {
        assert.ok(!(dep in (geo[field] || {})), `geometry ${field} must not contain ${dep}`);
      }
    }

    const rootPkg = readJson(path.join(root, 'package.json'));
    for (const s of ['typecheck', 'lint', 'test', 'build']) {
      const cmd = rootPkg.scripts?.[s];
      assert.equal(typeof cmd, 'string', `root script ${s}`);
      for (const token of ['pnpm -r', '--if-present', '"!./spikes/**"', `run ${s}`]) {
        assert.ok(cmd.includes(token), `root ${s} keeps "${token}" (EZD-000 fan-out): ${cmd}`);
      }
    }
    assert.ok(rootPkg.scripts.lint.includes('scripts/conventions/check.mjs'), 'root lint runs the conventions check');
    assert.ok(rootPkg.scripts.test.includes('scripts/**/*.test.mjs'), 'root test runs the repo node:test files');
    assert.ok(rootPkg.scripts.test.includes('--test-concurrency=4'), 'root test sets --test-concurrency=4 (Q-0019 read as 4, Q-0114)');
    assert.equal(typeof rootPkg.scripts.format, 'string', 'root format script');
    assert.equal(typeof rootPkg.scripts['format:check'], 'string', 'root format:check script');

    const ws = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
    const lines = ws.split(/\r?\n/);
    assert.ok(lines.some((l) => /^workspaceConcurrency:\s*1\s*$/.test(l)), 'pnpm-workspace.yaml has top-level workspaceConcurrency: 1 (Q-0139 (a))');
    assert.ok(!lines.some((l) => /^dangerouslyAllowAllBuilds:\s*true\s*$/.test(l)), 'no allow-all build setting (Q-0140 (a))');
    const ab = lines.findIndex((l) => /^allowBuilds:\s*$/.test(l));
    if (ab >= 0) {
      for (let i = ab + 1; i < lines.length; i++) {
        const l = lines[i];
        if (l.trim() === '' || /^\s*#/.test(l)) continue;
        if (!/^\s/.test(l)) break;
        assert.ok(!/^\s*-\s/.test(l), `allowBuilds is a map, not a list (EZD-000 T26): ${l}`);
        const m = /^\s+(['"]?)([^'":]+)\1:\s*(.+?)\s*$/.exec(l);
        assert.ok(m, `allowBuilds entry is "<package>: <value>": ${l}`);
        assert.equal(m[3], 'false', `allowBuilds entry ${m[2]} must be false (Q-0140 (a))`);
      }
    }
  });

  // ---------- T11 ----------
  test('EZD-001 T11: dependencies registered in docs/architecture.md and C1 passes', () => {
    const doc = readFileSync(path.join(root, 'docs', 'architecture.md'), 'utf8');
    const rows = new Map();
    for (const line of doc.split(/\r?\n/)) {
      const m = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*$/.exec(line);
      if (m) rows.set(m[1], { version: m[2], addedBy: m[5].trim() });
    }
    for (const name of ['eslint', '@eslint/js', 'typescript-eslint', 'eslint-config-next', 'prettier', '@types/node', '@types/react', '@types/react-dom']) {
      assert.ok(rows.has(name), `Dependencies row for ${name}`);
      assert.equal(rows.get(name).addedBy, 'EZD-001', `${name} Added by`);
    }
    for (const name of ['next', 'react', 'react-dom', 'typescript', 'vitest']) {
      assert.ok(rows.has(name), `Dependencies row for ${name}`);
      assert.equal(rows.get(name).addedBy, 'EZD-000', `${name} Added by stays EZD-000`);
    }
    const r = run('node', [checkScript, root]);
    assert.equal(r.status, 0, `conventions check must pass:\n${r.stdout}${r.stderr}`);
  });

  // ---------- T12 ----------
  test('EZD-001 T12: Prettier scope', async () => {
    const prettier = await importFromRoot('prettier');
    const opts = { ignorePath: [path.join(root, '.gitignore'), path.join(root, '.prettierignore')] };
    for (const p of ['vault/PROCESS.md', 'scripts/gate.mjs', '.github/workflows/ci.yml', 'docs/architecture.md', 'spikes/EZD-027-canvas/a.ts']) {
      const info = await prettier.getFileInfo(path.join(root, p), opts);
      assert.equal(info.ignored, true, `${p} must be ignored by Prettier`);
    }
    for (const p of ['app/src/app/page.tsx', 'packages/geometry/src/index.ts']) {
      const info = await prettier.getFileInfo(path.join(root, p), opts);
      assert.equal(info.ignored, false, `${p} must be formatted by Prettier`);
    }
  });

  // ---------- T13 ----------
  test('EZD-001 T13: gate scope selection', () => {
    const base = tmpDir('ezd001-t13-');
    const scope = (name, extra = []) => {
      const d = path.join(base, name);
      mkdirSync(d, { recursive: true });
      const r = run('node', [gateScript, d, ...extra, '--print-scope']);
      return { r, json: r.status === 0 ? JSON.parse(r.stdout.trim().split(/\r?\n/).find((l) => l.startsWith('{'))) : null };
    };
    const grepFor = (n) => `(?:EZD-${n}\\d{2}[a-z]?(?![0-9]))|@smoke`;
    const cases = [
      ['EZD-001', [], 0],
      ['EZD-133', [], 1],
      ['EZD-1710', [], 17],
      ['EZD-026a', [], 0],
      ['develop', ['--phase', '3'], 3],
    ];
    let grepB;
    for (const [name, extra, phase] of cases) {
      const { r, json } = scope(name, extra);
      assert.equal(r.status, 0, `${name} ${extra.join(' ')} exits 0: ${r.stderr}`);
      assert.equal(json.mode, 'phase', `${name}: mode`);
      assert.equal(json.phase, phase, `${name}: phase`);
      assert.equal(json.grep, grepFor(phase), `${name}: grep`);
      if (name === 'EZD-133') grepB = json.grep;
    }
    const e = scope('develop');
    assert.equal(e.r.status, 0);
    assert.equal(e.json.mode, 'full', '(e) develop folder runs the full suite');
    const f = scope('EZD-133', ['--full']);
    assert.equal(f.r.status, 0);
    assert.equal(f.json.mode, 'full', '(f) --full overrides the folder name');
    const h = scope('develop', ['--phase', 'x']);
    assert.notEqual(h.r.status, 0, '(h) a bad --phase exits non-zero');

    const re = new RegExp(grepB);
    for (const s of ['EZD-133 x', 'EZD-101a x', 'EZD-001 y @smoke']) assert.ok(re.test(s), `grep matches "${s}"`);
    for (const s of ['EZD-1001 x', 'EZD-001 x']) assert.ok(!re.test(s), `grep does not match "${s}"`);
  });

  // ---------- T14 ----------
  test('EZD-001 T14: Vitest honours the scope grep', () => {
    const T1 = 'EZD-001 geometry package done when: loads with no DOM @smoke';
    const runCase = (label, env) => {
      const out = path.join(tmpDir(`ezd001-t14-${label}-`), 'report.json');
      const r = run('pnpm', ['--filter', '@ezdraft/geometry', 'exec', 'vitest', 'run', '--reporter=json', `--outputFile=${out}`], { env });
      assert.ok(existsSync(out), `(${label}) JSON report written: ${r.stdout}${r.stderr}`);
      const report = readJson(out);
      const t1 = report.testResults.flatMap((f) => f.assertionResults).find((a) => a.fullName === T1);
      assert.ok(t1, `(${label}) T1 present in the report by full name`);
      return { r, report, t1 };
    };
    const a = runCase('a', { EZD_TEST_GREP: '(?:EZD-0\\d{2}[a-z]?(?![0-9]))|@smoke' });
    assert.equal(a.t1.status, 'passed', '(a) phase 0 grep runs T1');
    assert.equal(a.r.status, 0);
    const b = runCase('b', { EZD_TEST_GREP: 'EZD-1\\d{2}[a-z]?(?![0-9])' });
    assert.notEqual(b.t1.status, 'passed', '(b) phase 1 grep without @smoke skips T1');
    assert.equal(b.report.numFailedTests, 0, '(b) nothing fails');
    assert.equal(b.r.status, 0, '(b) exit 0');
    const c = runCase('c', { EZD_TEST_GREP: '(?:EZD-1\\d{2}[a-z]?(?![0-9]))|@smoke' });
    assert.equal(c.t1.status, 'passed', '(c) phase 1 grep with @smoke runs T1');
    const d = runCase('d', {});
    assert.equal(d.t1.status, 'passed', '(d) no grep runs T1');
    assert.equal(d.r.status, 0);
  });

  // ---------- T15 ----------
  test('EZD-001 T15: worker limits in the package Vitest configs', () => {
    for (const p of [path.join(appDir, 'vitest.config.ts'), path.join(geoDir, 'vitest.config.ts')]) {
      const text = readFileSync(p, 'utf8');
      assert.ok(/\bmaxWorkers\s*:\s*4\b/.test(text), `${p} sets maxWorkers to 4 (Q-0114)`);
      assert.ok(text.includes('EZD_TEST_GREP'), `${p} reads EZD_TEST_GREP`);
    }
  });

  // ---------- T16 ----------
  test('EZD-001 T16: C9 test files carry a ticket ID', () => {
    const PNPM = '9.1.0';
    const archDoc = [
      '# Architecture (fixture)', '', '## Dependencies', '',
      '| Package | Version | Used in | Why | Added by |', '| --- | --- | --- | --- | --- |',
      `| \`pnpm\` | \`${PNPM}\` | root | fixture | EZD-000 |`, '',
    ].join('\n');
    const fixture = (file, content) => {
      const d = tmpDir('ezd001-t16-');
      const files = {
        'docs/architecture.md': archDoc,
        'pnpm-workspace.yaml': 'packages:\n  - app\n  - packages/*\n  - worker\n  - spikes/*\n',
        'package.json': JSON.stringify({ name: 'ezdraft', private: true, packageManager: `pnpm@${PNPM}` }),
        'app/package.json': JSON.stringify({ name: '@ezdraft/app', private: true }),
        'packages/geometry/package.json': JSON.stringify({ name: '@ezdraft/geometry', private: true }),
        [file]: content,
      };
      for (const [rel, text] of Object.entries(files)) {
        const p = path.join(d, ...rel.split('/'));
        mkdirSync(path.dirname(p), { recursive: true });
        writeFileSync(p, text);
      }
      const r = run('node', [checkScript, d]);
      return { r, c9: (r.stdout + r.stderr).split(/\r?\n/).filter((l) => l.startsWith('[C9]')) };
    };
    const vitestHead = "import { describe, test } from 'vitest';\n";
    const pwHead = "import { test } from '@playwright/test';\n";

    const a = fixture('packages/geometry/src/a.test.ts', `${vitestHead}describe('EZD-201 parse', () => { test('x', () => {}); });\n`);
    assert.deepEqual(a.c9, [], '(a) a describe with a ticket ID passes');
    const b = fixture('packages/geometry/src/a.test.ts', `${vitestHead}describe('parse', () => { test('x', () => {}); });\n`);
    assert.ok(b.c9.some((l) => l.includes('packages/geometry/src/a.test.ts')), `(b) [C9] names the file: ${b.r.stdout}`);
    assert.equal(b.r.status, 1, '(b) exit 1');
    const c = fixture('app/e2e/s.spec.ts', `${pwHead}test.describe('EZD-016a sign-in', () => { test('x', async () => {}); });\n`);
    assert.deepEqual(c.c9, [], '(c) test.describe with a lettered ticket ID passes');
    const d = fixture('app/e2e/s.spec.ts', `${pwHead}test('signs in', async () => {});\n`);
    assert.ok(d.c9.some((l) => l.includes('app/e2e/s.spec.ts')), `(d) [C9] names the file: ${d.r.stdout}`);
    assert.equal(d.r.status, 1, '(d) exit 1');
    const e = fixture('spikes/EZD-027-canvas/x.test.ts', `${vitestHead}test('x', () => {});\n`);
    assert.deepEqual(e.c9, [], '(e) spikes are outside the scan');
    const f = fixture('app/src/test-utils/h.test.ts', `${vitestHead}test('x', () => {});\n`);
    assert.deepEqual(f.c9, [], '(f) test-utils is exempt');
  });
});
