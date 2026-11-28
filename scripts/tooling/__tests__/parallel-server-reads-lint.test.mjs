// EZD-2000 (AC-EZD-2000-1 (3); Q-0814 "a server page starts independent reads together"): ezdraft/parallel-server-reads
// on the real flat config. A bad example fails, the escape needs a reason, and the dependent and started-together
// shapes pass. Wording is never compared.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const RULE = 'ezdraft/parallel-server-reads';
const PAGE = 'app/src/app/(office)/ezd2000-fixture/page.tsx';

async function lint(code, filePath = PAGE) {
  const req = createRequire(path.join(root, 'package.json'));
  const { ESLint } = await import(pathToFileURL(req.resolve('eslint')).href);
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, { filePath: path.join(root, filePath) });
  return result.messages.filter((m) => m.ruleId === RULE);
}

const page = (body) => `
declare function loadA(): Promise<{ id: string }>;
declare function loadB(id?: string): Promise<number>;
declare const params: Promise<{ id: string }>;
export default async function Page() {
${body}
  return null;
}
`;

describe('EZD-2000 parallel server reads', () => {
  test('EZD-2000 two independent reads awaited one after another fail', async () => {
    const msgs = await lint(page('  const a = await loadA();\n  const b = await loadB();\n  void a; void b;'));
    assert.equal(msgs.length, 1, JSON.stringify(msgs));
    assert.equal(msgs[0].messageId, 'sequential');
    assert.equal(msgs[0].severity, 2);
  });

  test('EZD-2000 an independent bare await after a read fails too', async () => {
    const msgs = await lint(page('  const a = await loadA();\n  await loadB();\n  void a;'));
    assert.equal(msgs.length, 1, JSON.stringify(msgs));
  });

  test('EZD-2000 a layout is checked the same way', async () => {
    const msgs = await lint(
      page('  const a = await loadA();\n  const b = await loadB();\n  void a; void b;'),
      'app/src/app/(office)/ezd2000-fixture/layout.tsx',
    );
    assert.equal(msgs.length, 1, JSON.stringify(msgs));
  });

  test('EZD-2000 a later read that uses the earlier result passes', async () => {
    assert.deepEqual(await lint(page('  const a = await loadA();\n  const b = await loadB(a.id);\n  void b;')), []);
  });

  test('EZD-2000 a later read that uses a value derived from the earlier result passes', async () => {
    const body = '  const { id } = await loadA();\n  const key = id.trim();\n  const b = await loadB(key);\n  void b;';
    assert.deepEqual(await lint(page(body)), []);
  });

  test('EZD-2000 a guard on the earlier result between the two passes', async () => {
    const body = '  const a = await loadA();\n  if (!a) throw new Error("x");\n  const b = await loadB();\n  void b;';
    assert.deepEqual(await lint(page(body)), []);
  });

  test('EZD-2000 reads started together pass', async () => {
    assert.deepEqual(await lint(page('  const [a, b] = await Promise.all([loadA(), loadB()]);\n  void a; void b;')), []);
    const started = '  const aRead = loadA();\n  const bRead = loadB();\n  const a = await aRead;\n  const b = await bRead;\n  void a; void b;';
    assert.deepEqual(await lint(page(started)), []);
  });

  test('EZD-2000 request values (params, cookies) are not reads', async () => {
    const body = '  const { id } = await params;\n  const a = await loadA();\n  const p = await params;\n  void id; void a; void p;';
    assert.deepEqual(await lint(page(body)), []);
  });

  test('EZD-2000 the escape comment with a reason passes', async () => {
    const body =
      '  const a = await loadA();\n  // sequential-await: loadB reads the row loadA locks\n  const b = await loadB();\n  void a; void b;';
    assert.deepEqual(await lint(page(body)), []);
  });

  test('EZD-2000 the escape comment without a reason fails', async () => {
    const body = '  const a = await loadA();\n  // sequential-await:\n  const b = await loadB();\n  void a; void b;';
    const msgs = await lint(page(body));
    assert.equal(msgs.length, 1, JSON.stringify(msgs));
    assert.equal(msgs[0].messageId, 'noReason');
  });

  test("EZD-2000 a 'use client' page and a non-page file are not checked", async () => {
    const bad = '  const a = await loadA();\n  const b = await loadB();\n  void a; void b;';
    assert.deepEqual(await lint(`'use client';\n${page(bad)}`), []);
    assert.deepEqual(await lint(page(bad), 'app/src/app/(office)/ezd2000-fixture/helpers.tsx'), []);
  });

  test('EZD-2000 dev pages (404 in production) are not checked', async () => {
    const bad = '  const a = await loadA();\n  const b = await loadB();\n  void a; void b;';
    assert.deepEqual(await lint(page(bad), 'app/src/app/dev/ezd2000-fixture/page.tsx'), []);
    assert.deepEqual(await lint(page(bad), 'app/src/app/(office)/dev/ezd2000-fixture/page.tsx'), []);
  });
});
