// EZD-026a · L1-L7: the phone-screen lint rule ezdraft/no-literal-ui-string on the real flat config.
// Sources: vault/plans/EZD-026a.md sections 3 and 4; R26 R17; 11 rule 7. Message wording is never compared.
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

const comp = (body) => `export default function P({ t, ok, n, err, k }) { return ${body}; }\n`;
const L1_CODE = 'export default function P(){ return <button>Save</button>; }\n';
const FIELD = 'app/src/components/field/X.tsx';
const CLIENT = 'app/src/components/client/X.tsx';
const TESTPAGE = 'app/src/app/dev/messages/X.tsx';

describe('EZD-026a phone-screen lint', () => {
  test('EZD-026a done when: lint fails on a literal string in a phone-screen component', async () => {
    for (const f of [
      'app/src/app/(field)/x/page.tsx',
      'app/src/components/field/X.tsx',
      'app/src/components/phone/X.tsx',
      'app/src/app/(client)/x/page.tsx',
      'app/src/components/client/X.tsx',
    ]) {
      const msgs = await lint(L1_CODE, f);
      assert.ok(
        msgs.some((m) => m.severity === 2 && m.messageId === 'literal'),
        `${f}: expected a literal error from the rule, got ${JSON.stringify(msgs)}`,
      );
    }
  });

  test('EZD-026a L2 office files are not in scope', async () => {
    for (const f of ['app/src/components/shell/Header.tsx', 'app/src/app/page.tsx']) {
      assert.equal((await lint(L1_CODE, f)).length, 0, f);
    }
  });

  test('EZD-026a L3 allowed forms', async () => {
    const probes = [
      "<button>{t('field.x')}</button>",
      "<span>{' · '}</span>",
      '<span>12</span>',
      '<span>1/64</span>',
      '<div className="a" data-x="Yes" role="dialog" id="b" lang="es" />',
      '<Button variant="primary" type="button" />',
      '<a href="/x" />',
    ];
    for (const p of probes) {
      const msgs = await lint(comp(p), FIELD);
      assert.equal(msgs.length, 0, `${p}: ${JSON.stringify(msgs)}`);
    }
  });

  test('EZD-026a L4 reported forms', async () => {
    const probes = [
      '<input placeholder="Name" />',
      '<img alt="Plan" />',
      '<b title="Hi" />',
      '<X aria-label="Close" />',
      '<Dialog confirmLabel="OK" />',
      "<Toast message={'Saved'} />",
      "<p>{'Saved'}</p>",
      '<p>{`Saved ${n}`}</p>',
      "<p>{ok ? 'Yes' : 'No'}</p>",
      "<p>{err && 'Failed'}</p>",
      '<p>Guardar</p>',
      '<p>ñ</p>',
      '<>Save</>',
    ];
    for (const p of probes) {
      const msgs = await lint(comp(p), FIELD);
      assert.ok(
        msgs.some((m) => m.severity === 2 && m.messageId === 'literal'),
        `${p}: expected a literal error, got ${JSON.stringify(msgs)}`,
      );
    }
  });

  test('EZD-026a L5 key namespaces', async () => {
    const reported = [
      [FIELD, "t('office.header.share')"],
      [FIELD, "t('client.x')"],
      [FIELD, 't(`office.x`)'],
      [CLIENT, "t('field.x')"],
      [TESTPAGE, "t('office.x')"],
    ];
    const clean = [
      [FIELD, "t('field.x')"],
      [FIELD, "t('common.x')"],
      [FIELD, "t('error.x')"],
      [FIELD, 't(k)'],
      [CLIENT, "t('client.x')"],
      [TESTPAGE, "t('dev.x')"],
    ];
    for (const [f, call] of reported) {
      const msgs = await lint(comp(`<p>{${call}}</p>`), f);
      assert.equal(msgs.length, 1, `${f} ${call}: ${JSON.stringify(msgs)}`);
      assert.equal(msgs[0].messageId, 'keyNamespace', `${f} ${call}`);
    }
    for (const [f, call] of clean) {
      const msgs = await lint(comp(`<p>{${call}}</p>`), f);
      assert.equal(msgs.length, 0, `${f} ${call}: ${JSON.stringify(msgs)}`);
    }
  });

  test('EZD-026a L6 test files are exempt', async () => {
    for (const f of [
      'app/src/app/(field)/x/page.test.tsx',
      'app/src/components/field/X.spec.tsx',
      'app/src/components/client/X.test.tsx',
      'app/src/app/dev/messages/X.test.tsx',
    ]) {
      assert.equal((await lint(L1_CODE, f)).length, 0, f);
    }
  });

  test('EZD-026a L7 the test-page folder lints clean', async () => {
    const { ESLint } = await importFromRoot('eslint');
    const eslint = new ESLint({ cwd: root });
    const results = await eslint.lintFiles(['app/src/app/dev/messages']);
    assert.ok(results.length >= 1, 'the folder holds files');
    const errors = results.reduce((s, r) => s + r.errorCount, 0);
    assert.equal(errors, 0, JSON.stringify(results.flatMap((r) => r.messages)));
  });
});

describe('EZD-014a phone folder lint', () => {
  test('EZD-014a done when: the phone folder passes the phone lint', async () => {
    const { ESLint } = await importFromRoot('eslint');
    const eslint = new ESLint({ cwd: root });
    const results = await eslint.lintFiles(['app/src/components/phone']);
    const names = results.map((r) => path.basename(r.filePath));
    for (const f of ['PhoneFrame.tsx', 'PhoneHeader.tsx', 'EditorPhoneNotice.tsx']) {
      assert.ok(names.includes(f), `${f} is linted`);
    }
    const msgs = results.flatMap((r) => r.messages);
    assert.equal(msgs.filter((m) => m.ruleId === RULE).length, 0, JSON.stringify(msgs));
    assert.equal(results.reduce((s, r) => s + r.errorCount, 0), 0, JSON.stringify(msgs));
  });
});

describe('EZD-015a states folder lint', () => {
  const STATES = 'app/src/components/states/X.tsx';

  test('EZD-015a L1 literal text and a foreign key prefix are reported, a common key is not', async () => {
    const a = await lint('export default function X(){ return <p>Retry</p>; }\n', STATES);
    assert.ok(a.length >= 1, 'literal text reported');
    assert.ok(a.every((m) => m.severity === 2));
    const b = await lint(comp("<p>{t('office.header.share')}</p>"), STATES);
    assert.ok(b.length >= 1, 'office key reported');
    assert.ok(b.every((m) => m.severity === 2));
    const c = await lint(comp("<p>{t('common.retry')}</p>"), STATES);
    assert.equal(c.length, 0);
  });

  test('EZD-015a L1 the states folder lints clean', async () => {
    const { ESLint } = await importFromRoot('eslint');
    const eslint = new ESLint({ cwd: root });
    const results = await eslint.lintFiles(['app/src/components/states']);
    const names = results.map((r) => path.basename(r.filePath));
    for (const f of [
      'Skeleton.tsx',
      'StateButton.tsx',
      'InlineError.tsx',
      'OfflineBanner.tsx',
      'AsyncView.tsx',
    ]) {
      assert.ok(names.includes(f), `${f} is linted`);
    }
    const msgs = results.flatMap((r) => r.messages);
    assert.equal(msgs.filter((m) => m.ruleId === RULE).length, 0, JSON.stringify(msgs));
    assert.equal(results.reduce((s, r) => s + r.errorCount, 0), 0, JSON.stringify(msgs));
  });
});

// EZD-136 L1 (vault/plans/EZD-136.md section 4; step 18): the disclaimer folder joins the phone-screen
// block (prefixes common., field., error.), following the EZD-015a L1 pattern.
describe('EZD-136 disclaimer folder lint', () => {
  const DISCLAIMER = 'app/src/components/disclaimer/X.tsx';

  test('EZD-136 L1 literal text and a foreign key prefix are reported, the disclaimer key is not, and the folder lints clean', async () => {
    const a = await lint('export default function X(){ return <p>Notice</p>; }\n', DISCLAIMER);
    assert.ok(a.length >= 1, 'literal text reported');
    assert.ok(a.every((m) => m.severity === 2));
    const b = await lint(comp("<p>{t('office.header.share')}</p>"), DISCLAIMER);
    assert.ok(b.length >= 1, 'office key reported');
    assert.ok(b.every((m) => m.severity === 2));
    const c = await lint(comp("<p>{t('common.disclaimer')}</p>"), DISCLAIMER);
    assert.equal(c.length, 0);

    const { ESLint } = await importFromRoot('eslint');
    const eslint = new ESLint({ cwd: root });
    const results = await eslint.lintFiles(['app/src/components/disclaimer']);
    const names = results.map((r) => path.basename(r.filePath));
    assert.ok(names.includes('Disclaimer.tsx'), 'Disclaimer.tsx is linted');
    const msgs = results.flatMap((r) => r.messages);
    assert.equal(msgs.filter((m) => m.ruleId === RULE).length, 0, JSON.stringify(msgs));
    assert.equal(results.reduce((s, r) => s + r.errorCount, 0), 0, JSON.stringify(msgs));
  });
});
