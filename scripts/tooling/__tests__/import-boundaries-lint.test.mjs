// EZD-020 L1-L9 (vault/plans/EZD-020.md section 4): ezdraft/import-boundaries on the real flat config.
// Sources: Step 2 (HEAVY_PACKAGES, EDITOR_CODE, EDITOR_CODE_IMPORTERS), Step 3, Step 4; 11 rule 7. Wording never compared.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const RULE = 'ezdraft/import-boundaries';

function importFromRoot(name) {
  const req = createRequire(path.join(root, 'package.json'));
  return import(pathToFileURL(req.resolve(name)).href).then((mod) => mod.default ?? mod);
}

async function eslint() {
  const { ESLint } = await importFromRoot('eslint');
  return new ESLint({ cwd: root });
}

async function lint(code, filePath) {
  const [result] = await (await eslint()).lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === RULE);
}

function reported(msgs, messageId, label) {
  assert.equal(msgs.length, 1, `${label}: expected exactly 1 message, got ${JSON.stringify(msgs)}`);
  assert.equal(msgs[0].severity, 2, label);
  assert.equal(msgs[0].messageId, messageId, label);
}
const allowed = (msgs, label) => assert.equal(msgs.length, 0, `${label}: ${JSON.stringify(msgs)}`);

const rel = (fromFile, target) => {
  const r = path.posix.relative(path.posix.dirname(fromFile), target);
  return r.startsWith('.') ? r : './' + r;
};

// W: the second package of the Named tools DXF row (provisional until EZD-029).
function dxfPackages() {
  const md = readFileSync(path.join(root, 'docs', 'architecture.md'), 'utf8');
  const row = md.split(/\r?\n/).find((l) => /^\|\s*DXF\s*\|/.test(l));
  assert.ok(row, 'Named tools has a DXF row');
  const cells = row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  return [...cells[cells.length - 1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}
const W = () => dxfPackages()[1];

const BASE_SPECS = [
  'three',
  'three/examples/jsm/exporters/GLTFExporter.js',
  'three/addons/exporters/USDZExporter.js',
  '@react-three/fiber',
  'three-bvh-csg',
  'three-gpu-pathtracer',
  'pdfjs-dist',
  'dxf-parser',
];
const allSpecs = () => [...BASE_SPECS, W()];
const imp = (s) => `import x from '${s}';\nexport default x;\n`;

describe('EZD-020 import boundaries lint', () => {
  test('EZD-020 done when: a static Three.js import added to the Projects page fails lint @smoke', async () => {
    const code = "import * as THREE from 'three';\nexport default function Page() { return null; }\n";
    for (const f of [
      'app/src/app/(office)/page.tsx',
      'app/src/app/(office)/dev/entry/office/page.tsx',
    ]) {
      reported(await lint(code, f), 'heavyPackage', f);
    }
    const real = 'app/src/app/(office)/dev/entry/office/page.tsx';
    const [res] = await (await eslint()).lintFiles([real]);
    assert.equal(res.messages.filter((m) => m.ruleId === RULE).length, 0, 'real placeholder is clean');
  });

  test('EZD-020 L2 heavy packages refused outside their places', async () => {
    const files = [
      'app/src/components/phone/P.tsx',
      'app/src/app/(field)/dev/entry/field/page.tsx',
      'app/src/app/(client)/dev/entry/client/page.tsx',
      'app/src/lib/x.ts',
      'packages/geometry/src/x.ts',
    ];
    for (const f of files) {
      for (const s of allSpecs()) {
        reported(await lint(imp(s), f), 'heavyPackage', `${f} ${s}`);
      }
    }
    const f = 'app/src/lib/x.ts';
    const forms = [
      "import { Mesh } from 'three';\nexport const m = new Mesh();\n",
      "import 'three';\n",
      "export * from 'three';\n",
      "export { Mesh } from 'three';\n",
      "const t = require('three');\nexport default t;\n",
    ];
    for (const code of forms) reported(await lint(code, f), 'heavyPackage', code);
  });

  test('EZD-020 L3 allowed forms and places', async () => {
    const f = 'app/src/lib/x.ts';
    for (const code of [
      "export const load = () => import('three');\n",
      "import type { Mesh } from 'three';\nexport type M = Mesh;\n",
      "import { type Mesh } from 'three';\nexport type M = Mesh;\n",
      "export type { Mesh } from 'three';\n",
    ]) {
      allowed(await lint(code, f), code);
    }
    for (const place of ['app/src/lazy/scene-3d/index.ts', 'app/src/workers/x.worker.ts']) {
      for (const s of allSpecs()) allowed(await lint(imp(s), place), `${place} ${s}`);
    }
    for (const s of ['three', '@react-three/fiber']) {
      allowed(await lint(imp(s), 'app/src/editor/canvas/C.tsx'), `editor ${s}`);
    }
    for (const s of ['pdfjs-dist', 'dxf-parser', W()]) {
      allowed(await lint(imp(s), 'app/src/server/jobs/x.ts'), `jobs ${s}`);
    }
    allowed(await lint("import 'three';\n", 'app/src/lib/x.test.ts'), 'test file');
  });

  test('EZD-020 L4 editor limits', async () => {
    for (const s of [
      'three/examples/jsm/exporters/GLTFExporter.js',
      'three-bvh-csg',
      'three-gpu-pathtracer',
      'pdfjs-dist',
    ]) {
      reported(await lint(imp(s), 'app/src/editor/canvas/C.tsx'), 'heavyPackage', s);
    }
    reported(await lint(imp('three'), 'app/src/app/(editor)/x/page.tsx'), 'heavyPackage', 'editor group');
  });

  test('EZD-020 L5 lazy folders', async () => {
    const probe = 'app/src/app/dev/lazy/LazyProbe.tsx';
    const spec = '../../../lazy/dev-sample';
    reported(
      await lint(`import { sampleMarker } from '${spec}';\nexport default sampleMarker;\n`, probe),
      'lazyStatic',
      '(a)',
    );
    allowed(await lint(`export const load = () => import('${spec}');\n`, probe), '(b)');
    allowed(await lint(`import type { X } from '${spec}';\nexport type Y = X;\n`, probe), '(c)');
    allowed(
      await lint(
        "import { sampleMarker } from './index';\nexport default sampleMarker;\n",
        'app/src/lazy/dev-sample/b.ts',
      ),
      '(d)',
    );
    reported(
      await lint(
        "import { sampleMarker } from '../dev-sample';\nexport default sampleMarker;\n",
        'app/src/lazy/sheets/a.ts',
      ),
      'lazyStatic',
      '(e)',
    );
  });

  test('EZD-020 L6 editor code boundary', async () => {
    const shell = 'app/src/components/shell/EditorFrame';
    const bad = [
      'app/src/components/phone/P.tsx',
      'app/src/components/states/S.tsx',
      'app/src/app/(field)/dev/entry/field/page.tsx',
      'app/src/app/(client)/dev/entry/client/page.tsx',
      'app/src/app/(office)/dev/entry/office/page.tsx',
      'app/src/lib/x.ts',
    ];
    for (const f of bad) {
      const code = `import x from '${rel(f, shell)}';\nexport default x;\n`;
      reported(await lint(code, f), 'editorOnly', f);
    }
    const office = 'app/src/app/(office)/page.tsx';
    reported(
      await lint(`import x from '${rel(office, 'app/src/editor/store')}';\nexport default x;\n`, office),
      'editorOnly',
      office,
    );
    const good = [
      'app/src/app/(editor)/dev/entry/editor/page.tsx',
      'app/src/app/dev/shell/page.tsx',
      'app/src/components/shell/Y.tsx',
      'app/src/editor/x.ts',
      'app/src/lazy/sheets/x.ts',
    ];
    for (const f of good) {
      const code = `import x from '${rel(f, shell)}';\nexport default x;\n`;
      allowed(await lint(code, f), f);
    }
  });

  test('EZD-020 L7 repo is clean', { timeout: 300000 }, async () => {
    const results = await (await eslint()).lintFiles(['app/src', 'packages/geometry/src']);
    const found = results.flatMap((r) =>
      r.messages.filter((m) => m.ruleId === RULE).map((m) => `${r.filePath}: ${m.messageId}`),
    );
    assert.deepEqual(found, []);
  });

  test('EZD-020 L8 lists match the conventions file', async () => {
    const b = await import(pathToFileURL(path.join(root, 'eslint-rules', 'boundaries.mjs')).href);
    const md = readFileSync(path.join(root, 'docs', 'architecture.md'), 'utf8');
    const depNames = new Set(
      md
        .split(/\r?\n/)
        .map((l) => /^\|\s*`([^`]+)`\s*\|\s*`[^`]+`\s*\|/.exec(l))
        .filter(Boolean)
        .map((m) => m[1]),
    );
    const matches = b.HEAVY_PACKAGES.flatMap((e) => (Array.isArray(e.match) ? e.match : [e.match]));
    for (const m of matches) {
      let name;
      if (m.startsWith('three/')) name = 'three';
      else if (m.startsWith('@react-three/')) {
        assert.ok([...depNames].some((d) => d.startsWith('@react-three/')), m);
        continue;
      } else name = m;
      assert.ok(depNames.has(name), `Dependencies has a row for ${name}`);
    }
    for (const p of dxfPackages()) {
      assert.equal(p === undefined, false);
      assert.ok(matches.includes(p), `HEAVY_PACKAGES matches DXF package ${p}`);
    }
    const cfg = await (await eslint()).calculateConfigForFile('app/src/app/(office)/page.tsx');
    const opts = cfg.rules[RULE][1];
    assert.deepEqual(opts.packages, b.HEAVY_PACKAGES);
    assert.deepEqual(opts.lazyRoot, b.LAZY_ROOT);
    assert.deepEqual(opts.editorCode, b.EDITOR_CODE);
    assert.deepEqual(opts.editorCodeImporters, b.EDITOR_CODE_IMPORTERS);
  });

  test('EZD-020 L9 rule wired at error level', async () => {
    const e = await eslint();
    const on = (await e.calculateConfigForFile('app/src/app/(office)/page.tsx')).rules[RULE];
    assert.ok(on, 'rule configured for app source');
    assert.ok(on[0] === 2 || on[0] === 'error', `level ${on[0]}`);
    const off = (await e.calculateConfigForFile('app/src/lib/x.test.ts')).rules?.[RULE];
    const level = Array.isArray(off) ? off[0] : off;
    assert.ok(level === undefined || level === 0 || level === 'off', `test file level ${level}`);
  });
});

// EZD-167 (vault/plans/EZD-167.md section 4): the import-boundaries rule reads the `@/` path alias of app/.
describe('EZD-167 import boundaries path alias', () => {
  const PROBE = 'app/src/app/dev/lazy/LazyProbe.tsx';
  const SAMPLE = '@/lazy/dev-sample';
  // Dynamic import: a missing export reads as undefined and fails its own assertion, not the whole file.
  const boundaries = () =>
    import(pathToFileURL(path.join(root, 'eslint-rules', 'boundaries.mjs')).href);
  const readJson = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));

  test('EZD-167 done when: a static import of @/lazy/dev-sample from outside the folder is reported', async () => {
    const forms = [
      `import { sampleMarker } from '${SAMPLE}';\nexport default sampleMarker;\n`,
      `import '${SAMPLE}';\n`,
      `export * from '${SAMPLE}';\n`,
      `export { sampleMarker } from '${SAMPLE}';\n`,
      `const m = require('${SAMPLE}');\nexport default m;\n`,
    ];
    for (const f of [PROBE, 'app/src/lib/x.ts']) {
      for (const code of forms) reported(await lint(code, f), 'lazyStatic', `${f} ${code}`);
    }
  });

  test('EZD-167 A2 aliased import() and type-only imports stay allowed', async () => {
    allowed(await lint(`export const load = () => import('${SAMPLE}');\n`, PROBE), 'import()');
    allowed(
      await lint(`import type { X } from '${SAMPLE}';\nexport type Y = X;\n`, PROBE),
      'import type',
    );
    allowed(
      await lint(
        `import { sampleMarker } from '${SAMPLE}';\nexport default sampleMarker;\n`,
        'app/src/lazy/dev-sample/b.ts',
      ),
      'a module imports itself through the alias',
    );
  });

  test('EZD-167 A3 aliased import into another lazy module is reported', async () => {
    reported(
      await lint(
        `import { sampleMarker } from '${SAMPLE}';\nexport default sampleMarker;\n`,
        'app/src/lazy/sheets/a.ts',
      ),
      'lazyStatic',
      'sheets to dev-sample',
    );
  });

  test('EZD-167 A4 editor code through the alias is reported outside the editor', async () => {
    const code = "import x from '@/components/shell/EditorFrame';\nexport default x;\n";
    const bad = [
      'app/src/components/phone/P.tsx',
      'app/src/components/states/S.tsx',
      'app/src/app/(field)/dev/entry/field/page.tsx',
      'app/src/app/(client)/dev/entry/client/page.tsx',
      'app/src/app/(office)/dev/entry/office/page.tsx',
      'app/src/lib/x.ts',
    ];
    for (const f of bad) reported(await lint(code, f), 'editorOnly', f);
    reported(
      await lint("import x from '@/editor/store';\nexport default x;\n", 'app/src/app/(office)/page.tsx'),
      'editorOnly',
      'app/src/app/(office)/page.tsx',
    );
    const good = [
      'app/src/app/(editor)/dev/entry/editor/page.tsx',
      'app/src/app/dev/shell/page.tsx',
      'app/src/components/shell/Y.tsx',
      'app/src/editor/x.ts',
      'app/src/lazy/sheets/x.ts',
    ];
    for (const f of good) allowed(await lint(code, f), f);
  });

  test('EZD-167 A5 the alias applies under app/ only; packages and other specs are unaffected', async () => {
    allowed(
      await lint(
        `import { sampleMarker } from '${SAMPLE}';\nexport default sampleMarker;\n`,
        'packages/geometry/src/x.ts',
      ),
      'packages/geometry',
    );
    reported(await lint(imp('@react-three/fiber'), 'app/src/lib/x.ts'), 'heavyPackage', '@react-three/fiber');
    allowed(await lint(imp('@/lib/x'), 'app/src/app/(office)/page.tsx'), '@/lib/x');
  });

  test('EZD-167 A6 the alias list matches every tsconfig path the rule uses', async () => {
    const b = await boundaries();
    assert.ok(Array.isArray(b.PATH_ALIASES), 'eslint-rules/boundaries.mjs exports PATH_ALIASES');
    const pkgTsconfigs = readdirSync(path.join(root, 'packages'))
      .map((n) => path.join('packages', n, 'tsconfig.json'))
      .filter((rel) => existsSync(path.join(root, rel)));
    assert.ok(pkgTsconfigs.length > 0, 'packages/*/tsconfig.json found');

    // (i) every app/tsconfig.json path is one `@/*` style alias; the derived list equals PATH_ALIASES.
    // The target is the app-relative value with its `*` and trailing `/` removed, joined under app/, plus one `/`.
    const paths = readJson(path.join('app', 'tsconfig.json')).compilerOptions?.paths ?? {};
    const derived = Object.entries(paths).map(([key, values]) => {
      assert.ok(key.endsWith('/*'), `app/tsconfig.json path ${key} ends with /*`);
      assert.ok(
        Array.isArray(values) && values.length === 1 && typeof values[0] === 'string' && values[0].endsWith('/*'),
        `app/tsconfig.json path ${key} maps to exactly one target ending /*`,
      );
      const dir = path.posix.join('app', values[0].slice(0, -1).replace(/\/$/, ''));
      return { prefix: key.slice(0, -1), target: dir + '/', appliesTo: 'app/' };
    });
    assert.deepEqual(derived, b.PATH_ALIASES);

    // (ii) the rule's list is exactly the one alias the app uses today.
    assert.deepEqual(b.PATH_ALIASES, [{ prefix: '@/', target: 'app/src/', appliesTo: 'app/' }]);

    // (iii) no baseUrl anywhere, and no paths outside app/tsconfig.json: a new alias must fail until the rule knows it.
    for (const rel of [path.join('app', 'tsconfig.json'), 'tsconfig.base.json', ...pkgTsconfigs]) {
      assert.equal(readJson(rel).compilerOptions?.baseUrl, undefined, `${rel} has no baseUrl`);
    }
    for (const rel of ['tsconfig.base.json', ...pkgTsconfigs]) {
      assert.equal(readJson(rel).compilerOptions?.paths, undefined, `${rel} has no paths`);
    }
  });

  test('EZD-167 A7 the config passes the alias list to the rule', async () => {
    const b = await boundaries();
    assert.ok(Array.isArray(b.PATH_ALIASES), 'eslint-rules/boundaries.mjs exports PATH_ALIASES');
    const cfg = await (await eslint()).calculateConfigForFile('app/src/app/(office)/page.tsx');
    assert.deepEqual(cfg.rules[RULE][1].aliases, b.PATH_ALIASES);
  });
});
