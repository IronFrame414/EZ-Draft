// EZD-383 N1-N7 (plan vault/plans/EZD-383.md section 4): the connections check, vault/tools/connections_check.mjs. A template v2
// plan whose changed files reach an entry of the shared-list register needs a Connections row for it. Expected values are the
// plan's problem texts (section 3, "Problem texts") and Decided rows. Node built-ins only; temp repositories.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REGISTER, connRow as L, initRepo, planV2, stepRow as S, writeRegister } from './fixtures/plan-checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = path.join(root, 'vault/tools/connections_check.mjs');
const mod = () => import(pathToFileURL(TOOL).href);
const run = (args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });
const USAGE = 'usage: node vault/tools/connections_check.mjs <plan> [--root <dir>]\n';
const planFile = (dir, text) => { const f = path.join(dir, 'plan.md'); writeFileSync(f, text); return f; };
const BASE = REGISTER.lists[0];
const entry = (over) => ({ ...BASE, ...over });
const without = (e, key) => { const c = { ...e }; delete c[key]; return c; };
const reached = (id, list, paths, test, pin) => `section 3: Connections: shared list ${id} (${list}) is reached by ${paths}; add a Connections row naming ${id} in Name and ${test}:<line> in File:line (pin "${pin}")`;
const N1_TEXT = reached('fx-pages', 'fixture page list', 'src/pages/a/page.tsx', 'tests/list.test.mjs', 'LIST pin text');
const n1Steps = () => [S(1, 'src/pages/a/page.tsx', 'change')];

describe('EZD-383 N: connections check', () => {
  test('N1 a changed file that reaches a register entry without a row fails', async (t) => {
    const dir = initRepo(t);
    writeRegister(dir);
    const text = planV2({ steps: n1Steps() });
    const { checkConnections } = await mod();
    assert.deepEqual(checkConnections(text, { root: dir }), [N1_TEXT]);
    const plan = planFile(dir, text);
    const r = run([plan, '--root', dir]);
    assert.equal(r.stdout, `CONNECTIONS CHECK FAIL ${plan} (1)\n- ${N1_TEXT}\n`);
    assert.equal(r.status, 1);
  });

  test('N2 a plan with the row passes; an unreached file needs none', async (t) => {
    const dir = initRepo(t);
    writeRegister(dir);
    const text = planV2({ steps: n1Steps(), connections: [L('c', 'docs/c.md:3'), L('shared list fx-pages', 'tests/list.test.mjs:1')] });
    const { checkConnections } = await mod();
    assert.deepEqual(checkConnections(text, { root: dir }), []);
    const plan = planFile(dir, text);
    const r = run([plan, '--root', dir]);
    assert.equal(r.stdout, `CONNECTIONS CHECK OK ${plan}\n`);
    assert.equal(r.status, 0);
    assert.deepEqual(checkConnections(planV2(), { root: dir }), []);
  });

  test('N3 what counts as the row', async (t) => {
    const dir = initRepo(t);
    writeRegister(dir);
    const { checkConnections } = await mod();
    const extras = [
      L('fx-pages', 'docs/c.md:1'),
      L('fixture pages', 'tests/list.test.mjs:1'),
      L('fx-pages-old', 'tests/list.test.mjs:1'),
      L('fx-pages', 'Tests/list.test.mjs:1'),
      L('fx-pages', 'tests/lıst.test.mjs:1'),
    ];
    for (const extra of extras) {
      assert.deepEqual(checkConnections(planV2({ steps: n1Steps(), connections: [L('c', 'docs/c.md:3'), extra] }), { root: dir }), [N1_TEXT], extra);
    }
    const both = planV2({ steps: [S(1, 'src/pages/a/page.tsx', 'change'), S(2, 'src/pages/b/page.tsx', 'new', 'none')] });
    assert.deepEqual(checkConnections(both, { root: dir }), [reached('fx-pages', 'fixture page list', 'src/pages/a/page.tsx, src/pages/b/page.tsx', 'tests/list.test.mjs', 'LIST pin text')]);
  });

  test('N4 glob semantics', async (t) => {
    const dir = initRepo(t);
    const star = entry({ id: 'fx-star', list: 'star list', reaches: ['src/*.mjs'], read: 'r' });
    const dot = entry({ id: 'fx-dot', list: 'dot list', reaches: ['**/x.ts'], read: 'r' });
    writeRegister(dir, { version: 1, lists: [BASE, star, dot] });
    const { checkConnections } = await mod();
    const steps = [S(1, 'src/sub/y.mjs', 'new', 'none'), S(2, 'src/pages/page.tsx', 'new', 'none'), S(3, '.hidden/x.ts', 'change')];
    const first = reached('fx-pages', 'fixture page list', 'src/pages/page.tsx', 'tests/list.test.mjs', 'LIST pin text');
    assert.deepEqual(checkConnections(planV2({ steps }), { root: dir }), [first]);
    assert.deepEqual(checkConnections(planV2({ steps: [...steps, S(4, 'src/a.mjs', 'change')] }), { root: dir }), [
      first,
      reached('fx-star', 'star list', 'src/a.mjs', 'tests/list.test.mjs', 'LIST pin text'),
    ]);
  });

  test('N5 register validation', async (t) => {
    const dir = initRepo(t);
    const { checkConnections } = await mod();
    const check = (data) => { writeRegister(dir, data); return checkConnections(planV2(), { root: dir }); };
    const reg = (...lists) => ({ version: 1, lists });
    assert.deepEqual(check(reg(
      BASE,
      entry({ id: 'Bad_ID' }),
      entry({}),
      entry({ id: 'e-extra', note: 'x' }),
      without(entry({ id: 'e-missing' }), 'read'),
      entry({ id: 'e-testform', test: '../x' }),
      entry({ id: 'e-test', test: 'tests/none.test.mjs' }),
      entry({ id: 'e-pin', pin: 'NOT THERE' }),
      entry({ id: 'e-glob', reaches: ['src/{a,b}.mjs'] }),
      entry({ id: 'e-nomatch', reaches: ['src/nothing/*.mjs'] }),
      entry({ id: 'e-empty', reaches: [] }),
      entry({ id: 'e-src', sources: ['X-1'] }),
      entry({ id: 'e-list', list: '' }),
    )), [
      'register entry 2: id must be 1 to 60 of a-z, 0-9 and single hyphens',
      'register fx-pages: duplicate id',
      'register e-extra: unknown key note',
      'register e-missing: missing key read',
      'register e-testform: test "../x" is not a repo-relative file path',
      'register e-test: test tests/none.test.mjs is not at HEAD',
      'register e-pin: pin "NOT THERE" is not in tests/list.test.mjs at HEAD',
      'register e-glob: glob "src/{a,b}.mjs" may use only letters, digits, . _ - / and *, with no empty, . or .. part and no leading /',
      'register e-nomatch: glob "src/nothing/*.mjs" matches no file at HEAD',
      'register e-empty: reaches must be an array of 1 to 50 globs',
      'register e-src: sources must be an array of 1 to 20 IDs like L-021 or EZD-292',
      'register e-list: list must be a string of 1 to 200 characters',
    ]);
    assert.deepEqual(check({ version: 2, lists: [], extra: 1 }), ['register: unknown key extra', 'register: version must be 1', 'register: lists must be an array of 1 to 500 entries']);
    const glob = 'src/pages/**/page.tsx';
    assert.deepEqual(check(reg(
      entry({ id: 'a'.repeat(60), list: 'x'.repeat(200), read: 'r'.repeat(300), reaches: Array(50).fill(glob), sources: Array(20).fill('L-049') }),
      entry({ id: 'b'.repeat(61) }),
      entry({ id: 'e-l201', list: 'x'.repeat(201) }),
      entry({ id: 'e-r51', reaches: Array(51).fill(glob) }),
      entry({ id: 'e-s21', sources: Array(21).fill('L-049') }),
    )), [
      'register entry 2: id must be 1 to 60 of a-z, 0-9 and single hyphens',
      'register e-l201: list must be a string of 1 to 200 characters',
      'register e-r51: reaches must be an array of 1 to 50 globs',
      'register e-s21: sources must be an array of 1 to 20 IDs like L-021 or EZD-292',
    ]);
    assert.deepEqual(check(reg(...Array.from({ length: 501 }, (_, i) => entry({ id: `e-${i + 1}` })))), ['register: lists must be an array of 1 to 500 entries']);
    assert.deepEqual(check([]), ['register: the register must be a JSON object']);
  });

  test('N6 an unreadable register stops the check', async (t) => {
    const dir = initRepo(t);
    const plan = planFile(dir, planV2());
    const a = run([plan, '--root', dir]);
    assert.equal(a.status, 2);
    assert.ok(a.stdout.startsWith(`CONNECTIONS CHECK ERROR ${plan}: cannot read the register `), a.stdout);
    mkdirSync(path.join(dir, 'vault'), { recursive: true });
    const file = path.join(dir, 'vault/shared-lists.json');
    writeFileSync(file, '{');
    const b = run([plan, '--root', dir]);
    assert.equal(b.status, 2);
    assert.ok(b.stdout.startsWith(`CONNECTIONS CHECK ERROR ${plan}: the register `), b.stdout);
    assert.ok(b.stdout.includes(' is not JSON: '), b.stdout);
    writeFileSync(file, ' '.repeat(1000001));
    const c = run([plan, '--root', dir]);
    assert.equal(c.status, 2);
    assert.ok(c.stdout.startsWith(`CONNECTIONS CHECK ERROR ${plan}: the register `), c.stdout);
    assert.ok(c.stdout.endsWith(' is over 1000000 bytes\n'), c.stdout);
    const big = planV2();
    const huge = planFile(dir, big + ' '.repeat(2000001 - Buffer.byteLength(big)));
    const d = run([huge, '--root', dir]);
    assert.equal(d.status, 2);
    assert.equal(d.stdout, `CONNECTIONS CHECK ERROR ${huge}: the plan is over 2000000 bytes\n`);
  });

  test('N7 v1 skip, usage and missing blocks', async (t) => {
    const dir = initRepo(t);
    const v1 = planFile(dir, planV2({ v1: true, steps: n1Steps() }));
    const a = run([v1, '--root', dir]);
    assert.equal(a.stdout, `CONNECTIONS CHECK SKIP ${v1}: template v1\n`);
    assert.equal(a.status, 0);
    const plan = planFile(dir, planV2());
    for (const args of [[], [plan, '--x']]) {
      const r = run(args);
      assert.equal(r.status, 2);
      assert.equal(r.stdout, USAGE);
    }
    writeRegister(dir);
    const { checkConnections } = await mod();
    assert.ok(checkConnections(planV2({ steps: null }), { root: dir }).includes('section 1: no Build steps table, so the changed files cannot be read'));
    assert.ok(checkConnections(planV2({ connections: null }), { root: dir }).includes('section 3: no ### Connections table'));
  });
});
