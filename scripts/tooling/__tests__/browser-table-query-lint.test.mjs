// EZD-133 L1-L7 (vault/plans/EZD-133.md section 4; AC-EZD-133-1): ezdraft/no-browser-table-query on the real flat
// config. Sources: Decided D1 (browser code), D2 (config), D3 (dataClientImport), D4 (dataCall). Messages are
// never compared, only messageId and severity.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const RULE = 'ezdraft/no-browser-table-query';
const S = '@supabase/';

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
  // L-019: a file that does not parse must not read as "0 reports".
  const fatal = result.messages.filter((m) => m.fatal);
  assert.deepEqual(fatal, [], `${filePath}: fatal messages`);
  return result.messages.filter((m) => m.ruleId === RULE);
}

const ids = (msgs) => msgs.map((m) => m.messageId);
function expectOnly(msgs, expected, label) {
  assert.deepEqual(ids(msgs), expected, `${label}: ${JSON.stringify(msgs)}`);
  for (const m of msgs) assert.equal(m.severity, 2, label);
}

const PROBE = 'app/src/lib/probe.ts';
const L1_BODY = `import { createBrowserClient as c } from '${S}ssr';\nc('u','k').from('project').select('id');\n`;

describe('EZD-133 no-browser-table-query lint', () => {
  test('L1 a client component that imports the data client and queries a table is reported twice', async () => {
    const code = `'use client';\n${L1_BODY}`;
    const msgs = await lint(code, 'app/src/components/probe/Probe.tsx');
    expectOnly(msgs, ['dataClientImport', 'dataCall'], 'L1');
  });

  test('L2 the same code in a route handler (server code) is clean', async () => {
    const msgs = await lint(L1_BODY, 'app/src/app/api/p/route.ts');
    expectOnly(msgs, [], 'L2');
  });

  test('L3 one dataCall per from, rpc and schema call; a server path wins over nothing and a directive wins over a server path', async () => {
    for (const [code, file, label] of [
      ["db.from('c').insert({});\n", PROBE, 'from in app/src/lib'],
      ["db.from('c').insert({});\n", 'packages/geometry/src/probe.ts', 'from in packages'],
      ["x.rpc('a');\n", PROBE, 'rpc'],
      ["a.b.schema('a');\n", PROBE, 'schema'],
      ["f().from('t');\n", PROBE, 'call result'],
      ["'use client';\ndb.from('x');\n", 'app/src/server/probe.ts', 'directive in server path'],
    ]) {
      expectOnly(await lint(code, file), ['dataCall'], label);
    }
  });

  test('L4 each value import form of the data client packages is one dataClientImport', async () => {
    const forms = [
      `import * as s from '${S}supabase-js';\n`,
      `export { c } from '${S}supabase-js';\n`,
      `export * from '${S}postgrest-js';\n`,
      `import('${S}ssr');\n`,
      `import(\`${S}ssr\`);\n`,
      `require('${S}ssr');\n`,
      `import r = require('${S}ssr');\n`,
      `import x from '${S}ssr/dist/index.js';\n`,
    ];
    for (const code of forms) {
      expectOnly(await lint(code, PROBE), ['dataClientImport'], code);
    }
  });

  test('L5 type-only imports, realtime-js and typed-array or Buffer from are clean', async () => {
    const forms = [
      `import type { S } from '${S}supabase-js';\n`,
      `import { type S } from '${S}supabase-js';\n`,
      `import { R } from '${S}realtime-js';\n`,
      "Array.from('ab');\n",
      'Uint8Array.from([1]);\n',
      "Buffer.from('x');\n",
    ];
    for (const code of forms) {
      expectOnly(await lint(code, PROBE), [], code);
    }
  });

  test('L6 a page is server code unless it has the directive; a test file is never linted by the rule', async () => {
    const page = 'app/src/app/(office)/probe/page.tsx';
    expectOnly(await lint("db.from('p');\n", page), [], 'page without directive');
    expectOnly(await lint("'use client';\ndb.from('p');\n", page), ['dataCall'], 'page with directive');
    expectOnly(await lint(`'use client';\n${L1_BODY}`, 'app/src/lib/probe.test.ts'), [], 'test file');
  });

  test('L7 the real config turns the rule on as an error for app/src and packages, with the two decided options', async () => {
    const e = await eslint();
    for (const file of ['app/src/lib/probe.ts', 'packages/geometry/src/probe.ts']) {
      const config = await e.calculateConfigForFile(path.join(root, file));
      const entry = config.rules?.[RULE];
      assert.ok(Array.isArray(entry), `${file}: rule configured`);
      assert.equal(entry[0], 2, `${file}: severity error`);
      assert.deepEqual(Object.keys(entry[1] ?? {}).sort(), ['rootDir', 'serverPaths'], file);
      assert.equal(path.resolve(entry[1].rootDir), root, `${file}: rootDir is the config folder`);
      assert.ok(Array.isArray(entry[1].serverPaths), `${file}: serverPaths`);
    }
    const results = await e.lintFiles(['app/src', 'packages/*/src/**']);
    assert.ok(results.length > 0, 'files were linted');
    assert.deepEqual(
      results.filter((r) => r.fatalErrorCount !== 0).map((r) => r.filePath),
      [],
    );
    const found = results.flatMap((r) =>
      r.messages.filter((m) => m.ruleId === RULE).map((m) => `${r.filePath}: ${m.messageId}`),
    );
    assert.deepEqual(found, []);
  });
});
