// EZD-2000 (AC-EZD-2000-1 (4); Q-0814 "a page sends only its own messages"; EZD-1995): ezdraft/page-own-messages on
// the real flat config. Handing the whole office catalog to a page fails; the page's own list passes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const RULE = 'ezdraft/page-own-messages';
const PAGE = 'app/src/app/(office)/ezd2000-fixture/page.tsx';

async function lint(code, filePath = PAGE) {
  const req = createRequire(path.join(root, 'package.json'));
  const { ESLint } = await import(pathToFileURL(req.resolve('eslint')).href);
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, { filePath: path.join(root, filePath) });
  return result.messages.filter((m) => m.ruleId === RULE);
}

const page = (expr) => `
declare function catalogFor(surface: string, language: string): Record<string, string>;
declare function pageMessages(page: string): Record<string, string>;
declare function MessagesProvider(p: { language: string; messages: Record<string, string>; children?: unknown }): null;
export default function Page() {
  return <MessagesProvider language="en" messages={${expr}} />;
}
`;

describe('EZD-2000 page own messages', () => {
  test('EZD-2000 the whole office catalog on a page fails', async () => {
    const msgs = await lint(page("catalogFor('office', 'en')"));
    assert.equal(msgs.length, 1, JSON.stringify(msgs));
    assert.equal(msgs[0].messageId, 'wholeCatalog');
    assert.equal(msgs[0].severity, 2);
  });

  test('EZD-2000 a catalog whose surface is not written out fails', async () => {
    const msgs = await lint(page('catalogFor(surface, "en")').replace('export default', 'declare const surface: string;\nexport default'));
    assert.equal(msgs.length, 1, JSON.stringify(msgs));
  });

  test("EZD-2000 the page's own list passes", async () => {
    assert.deepEqual(await lint(page("pageMessages('projects')")), []);
  });

  test('EZD-2000 the sign-in and field catalogs pass', async () => {
    assert.deepEqual(await lint(page("catalogFor('sign_in', 'en')")), []);
    assert.deepEqual(await lint(page("catalogFor('field', 'en')")), []);
  });

  test('EZD-2000 a server file that renders a page provider is checked too (audit F1 settings-root.tsx)', async () => {
    const msgs = await lint(page("catalogFor('office', 'en')"), 'app/src/server/settings/ezd2000-fixture-root.tsx');
    assert.equal(msgs.length, 1, JSON.stringify(msgs));
  });

  test('EZD-2000 test helpers are not checked', async () => {
    assert.deepEqual(await lint(page("catalogFor('office', 'en')"), 'app/src/editor/ezd2000-fixture.test-helpers.tsx'), []);
  });

  test('EZD-2000 dev pages are not checked', async () => {
    assert.deepEqual(await lint(page("catalogFor('office', 'en')"), 'app/src/app/dev/ezd2000-fixture/page.tsx'), []);
  });
});
