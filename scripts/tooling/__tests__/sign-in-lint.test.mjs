// EZD-007e T24 (a), (b): the sign-in folders' lint block on the real flat config.
// Sources: vault/plans/EZD-007e.md section 4; R26 R17; R24 #40. Message wording is never compared.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const RULE = 'ezdraft/no-literal-ui-string';

function importFromRoot(name) {
  const req = createRequire(path.join(root, 'package.json'));
  return import(pathToFileURL(req.resolve(name)).href).then((mod) => mod.default ?? mod);
}

async function lint(code, filePath) {
  const { ESLint } = await importFromRoot('eslint');
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === RULE);
}

const FOLDERS = [
  'app/src/app/sign-in/x.tsx',
  'app/src/app/auth/confirm/x.tsx',
  'app/src/components/auth/X.tsx',
];
const comp = (body) => `export default function P({ t }) { return ${body}; }\n`;

describe('EZD-007e sign-in pages lint', () => {
  test('EZD-007e done when: the lint refuses literal text in the sign-in folders', async () => {
    const code = 'export default function P(){ return <p>Sign in</p>; }\n';
    for (const f of FOLDERS) {
      const msgs = await lint(code, f);
      assert.ok(msgs.length >= 1 && msgs.every((m) => m.severity === 2), `${f}: ${JSON.stringify(msgs)}`);
    }
  });

  test('EZD-007e T24 (b) key prefixes: only common. and error.', async () => {
    const f = 'app/src/app/sign-in/x.tsx';
    assert.equal((await lint(comp("<p>{t('office.x')}</p>"), f)).length, 1);
    assert.equal((await lint(comp("<p>{t('common.sign_in.title')}</p>"), f)).length, 0);
    assert.equal((await lint(comp("<p>{t('error.code_invalid')}</p>"), f)).length, 0);
  });
});

// EZD-007f T24 (c) (vault/plans/EZD-007f.md section 4; P-T24 (c); EZD-007e E4; R26 R17): the real
// sign-in folders lint clean on the real flat config, as EZD-026a L7.
describe('EZD-007f sign-in folders lint', () => {
  test('EZD-007f T24 (c) the sign-in folders lint clean', async () => {
    const { ESLint } = await importFromRoot('eslint');
    const eslint = new ESLint({ cwd: root });
    const results = await eslint.lintFiles([
      'app/src/app/sign-in/',
      'app/src/app/auth/confirm/',
      'app/src/components/auth/',
    ]);
    assert.ok(results.length >= 1, 'the folders hold files');
    const errors = results.reduce((s, r) => s + r.errorCount, 0);
    assert.equal(errors, 0, JSON.stringify(results.flatMap((r) => r.messages)));
  });
});
