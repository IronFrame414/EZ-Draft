// EZD-1905 (AC-EZD-1905-2): ezdraft/geometry-root-index-frozen on the real flat config. A new export line in
// packages/geometry/src/index.ts fails lint; the same line in an area's own index.ts is clean. Messages are never
// compared, only messageId and severity.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { FROZEN_ROOT_EXPORTS } from '../../../eslint-rules/geometry-root-index-frozen.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const RULE = 'ezdraft/geometry-root-index-frozen';
const ROOT_INDEX = 'packages/geometry/src/index.ts';
const today = readFileSync(path.join(root, ROOT_INDEX), 'utf8');

function importFromRoot(name) {
  const req = createRequire(path.join(root, 'package.json'));
  return import(pathToFileURL(req.resolve(name)).href).then((mod) => mod.default ?? mod);
}

let eslintInstance;
async function lint(code, filePath) {
  if (!eslintInstance) {
    const { ESLint } = await importFromRoot('eslint');
    eslintInstance = new ESLint({ cwd: root });
  }
  const [result] = await eslintInstance.lintText(code, { filePath: path.join(root, filePath) });
  const fatal = result.messages.filter((m) => m.fatal);
  assert.deepEqual(fatal, [], `${filePath}: fatal messages`);
  return result.messages.filter((m) => m.ruleId === RULE);
}

function expectReports(msgs, count, label) {
  assert.equal(msgs.length, count, `${label}: ${JSON.stringify(msgs)}`);
  for (const m of msgs) {
    assert.equal(m.messageId, 'newExport', label);
    assert.equal(m.severity, 2, label);
  }
}

describe('EZD-1905 geometry root index is frozen', () => {
  test('the frozen list is exactly the export lines the root index has, in order (every export kept)', () => {
    const sources = [...today.matchAll(/^export \* from '([^']+)';$/gm)].map((m) => m[1]);
    assert.deepEqual(sources, [...FROZEN_ROOT_EXPORTS]);
    assert.equal(today.match(/^export\b/gm).length, FROZEN_ROOT_EXPORTS.length, 'no other export statement');
  });

  test('the root index as it is today lints clean', async () => {
    expectReports(await lint(today, ROOT_INDEX), 0, 'today');
  });

  test('a new export * line in the root index fails', async () => {
    expectReports(await lint(`${today}export * from './new-area';\n`, ROOT_INDEX), 1, 'new area');
  });

  test('every other kind of new export line in the root index fails', async () => {
    for (const line of [
      "export { area } from './rooms/area';",
      "export * as rooms from './rooms';",
      "export type { Point } from './vec';",
      'export const x = 1;',
      'export default 1;',
      "export * from './cabinets';",
    ]) {
      expectReports(await lint(`${today}${line}\n`, ROOT_INDEX), 1, line);
    }
  });

  test('the same new line in an area index (rooms/index.ts) is clean', async () => {
    expectReports(await lint("export * from './new-file';\n", 'packages/geometry/src/rooms/index.ts'), 0, 'area');
  });
});
