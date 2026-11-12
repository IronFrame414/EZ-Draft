// EZD-383 K1-K11 (plan vault/plans/EZD-383.md section 4): the contract check, vault/tools/contract_check.mjs. Every path,
// export and signature a template v2 plan says exists or is new is checked against git HEAD of a throwaway repository.
// Expected values are the plan's problem texts (section 3, "Problem texts") and Decided rows. Node built-ins only.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PIPE_SIG, REPO_FILES, contractRow as C, initRepo, planV2, regressionRow, sharedRow, stepRow as S, connRow as L } from './fixtures/plan-checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = path.join(root, 'vault/tools/contract_check.mjs');
// Loaded inside each test so a missing module fails that test and not the whole file.
const mod = () => import(pathToFileURL(TOOL).href);
const lintMod = () => import(pathToFileURL(path.join(root, 'vault/tools/plan_lint.mjs')).href);
const run = (args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });
const USAGE = 'usage: node vault/tools/contract_check.mjs <plan> [--root <dir>]\n';
const planFile = (dir, text) => { const f = path.join(dir, 'plan.md'); writeFileSync(f, text); return f; };
const emptyDir = (t) => {
  const d = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'ezd383-empty-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const P = (i, s) => `section 1: Build steps row ${i}: ${s}`;
const I = (i, s) => `section 3: Interface contract row ${i}: ${s}`;

// The K2 repository: an untracked file on disk, and a tracked file removed from disk.
function k2(t) {
  const dir = initRepo(t);
  writeFileSync(path.join(dir, 'src/untracked.mjs'), 'export const u = 1;\n');
  rmSync(path.join(dir, 'docs/c.md'));
  const text = planV2({ steps: [S(1, 'src/missing.mjs', 'change'), S(2, 'src/a.mjs', 'new'), S(3, 'src/pages', 'new'), S(4, 'src/b.css', 'edit'), S(5, 'src/untracked.mjs', 'change'), S(6, 'docs/c.md', 'change')] });
  return { dir, text };
}
const K2_EXPECTED = [
  P(1, 'src/missing.mjs is marked change but is not at HEAD'),
  P(2, 'src/a.mjs is marked new but is at HEAD'),
  P(3, 'src/pages is marked new but is a folder at HEAD'),
  P(4, 'New / change is "edit", not new or change'),
  P(5, 'src/untracked.mjs is marked change but is not at HEAD'),
];

describe('EZD-383 K: contract check', () => {
  test('K1 a plan whose names all match passes', async (t) => {
    const dir = initRepo(t);
    const text = planV2();
    const { lintPlan } = await lintMod();
    assert.deepEqual(lintPlan(text, { allowQuestions: true }), []);
    const { checkContract } = await mod();
    assert.deepEqual(checkContract(text, { root: dir }), []);
    const plan = planFile(dir, text);
    const r = run([plan, '--root', dir]);
    assert.equal(r.stdout, `CONTRACT CHECK OK ${plan}\n`);
    assert.equal(r.status, 0);
  });

  test('K2 path claims against HEAD', async (t) => {
    const { dir, text } = k2(t);
    const { checkContract } = await mod();
    assert.deepEqual(checkContract(text, { root: dir }), K2_EXPECTED);
  });

  test('K3 path form', async (t) => {
    const dir = initRepo(t);
    const p6 = `a/${'b'.repeat(294)}.mjs`;
    const p7 = `a/${'b'.repeat(295)}.mjs`;
    assert.equal(p6.length, 300);
    assert.equal(p7.length, 301);
    const text = planV2({ steps: [S(1, '../x.mjs', 'change'), S(2, '/abs/x.mjs', 'change'), S(3, 'src/*.mjs', 'change'), S(4, '', 'change'), S(5, '`src/a.mjs`, `src/b.css`', 'change'), S(6, p6, 'change'), S(7, p7, 'change')] });
    const { checkContract } = await mod();
    assert.deepEqual(checkContract(text, { root: dir }), [
      P(1, '"../x.mjs" is not a repo-relative file path'),
      P(2, '"/abs/x.mjs" is not a repo-relative file path'),
      P(3, '"src/*.mjs" is not a repo-relative file path'),
      P(4, '"" is not a repo-relative file path'),
      P(5, 'names more than one path (one row per file)'),
      P(6, `${p6} is marked change but is not at HEAD`),
      P(7, `"${p7}" is not a repo-relative file path`),
    ]);
  });

  test('K4 Copy the pattern from', async (t) => {
    const dir = initRepo(t);
    const text = planV2({ steps: [S(1, 'src/a.mjs', 'change', 'src/missing.css'), S(2, 'src/a.mjs', 'change', 'none (first of its kind)'), S(3, 'src/a.mjs', 'change', '`src/b.css` (the .b rule)'), S(4, 'src/a.mjs', 'change', 'the a file')] });
    const { checkContract } = await mod();
    assert.deepEqual(checkContract(text, { root: dir }), [
      P(1, 'pattern file src/missing.css is not at HEAD'),
      P(4, 'Copy the pattern from "the a file" names no repo path (write a path, or start with none)'),
    ]);
  });

  test('K5 export and file claims', async (t) => {
    const dir = initRepo(t);
    const text = planV2({ contract: [
      C('export (exists)', 'nope', 'src/plain.mjs'), C('export (exists)', 'zeta', 'src/a.mjs'), C('export (new)', 'alpha', 'src/a.mjs'),
      C('export (exists)', 'alpha', 'src/gone.mjs'), C('file (new)', 'src/a.mjs'), C('file (exists)', 'src/gone.mjs'),
      C('export (exists)', 'delta', 'src/a.mjs'), C('export (exists)', 'default', 'src/a.mjs'), C('export (new)', 'omega', 'src/gone.mjs'),
      C('export (exists)', 'hidden', 'src/plain.mjs'),
    ] });
    const { checkContract } = await mod();
    assert.deepEqual(checkContract(text, { root: dir }), [
      I(1, 'src/plain.mjs does not export nope at HEAD'),
      I(2, 'src/a.mjs does not export zeta at HEAD (it has export *; name the file that declares it)'),
      I(3, 'alpha is marked new but src/a.mjs exports it at HEAD'),
      I(4, 'alpha is marked exists but src/gone.mjs is not at HEAD'),
      I(5, 'file src/a.mjs is marked new but is at HEAD'),
      I(6, 'file src/gone.mjs is marked exists but is not at HEAD'),
      I(10, 'src/plain.mjs does not export hidden at HEAD'),
    ]);
  });

  test('K6 signature claims', async (t) => {
    const dir = initRepo(t);
    const text = planV2({ contract: [C('signature (exists)', 'alpha(x): number', 'src/a.mjs'), C('signature (exists)', 'delta(a)', 'src/a.mjs'), C('signature (exists)', PIPE_SIG), C('signature (new)', 'fresh()', 'src/a.mjs')] });
    const { checkContract } = await mod();
    assert.deepEqual(checkContract(text, { root: dir }), [
      I(1, 'alpha takes 2 parameters at HEAD; the plan gives 1'),
      I(2, 'cannot read the parameters of delta in src/a.mjs at HEAD (declare it as export function or export const delta = (...) =>)'),
    ]);
  });

  test('K7 marker, Name form, file type and missing tables', async (t) => {
    const dir = initRepo(t);
    const { checkContract } = await mod();
    const check = (text) => checkContract(text, { root: dir });
    assert.deepEqual(check(planV2({ contract: [C('export', 'alpha', 'src/a.mjs'), C('export (exists)', 'alpha in src/a.mjs'), C('export (exists)', 'b', 'src/b.css'), C('route', '/x'), C('file (exists)', '../x.md')] })), [
      I(1, 'export row needs (new) or (exists) in its Kind cell'),
      I(2, 'Name "alpha in src/a.mjs" is not `name` from path (an export) or `name(params)` from path (a signature)'),
      I(3, 'src/b.css is not a JavaScript or TypeScript file, so its exports cannot be checked'),
      I(5, '"../x.md" is not a repo-relative file path'),
    ]);
    assert.deepEqual(check(planV2({ contract: null })), ['section 3: Interface contract: no table before the first ### block']);
    assert.deepEqual(check(planV2({ steps: null })), ['section 1: no Build steps table']);
    assert.deepEqual(check(planV2().replace('Copy the pattern from', 'Pattern')), ['section 1: Build steps table lacks the Path, New / change or Copy the pattern from column']);
    assert.deepEqual(check(planV2().replace('Name or path', 'Name')), ['section 3: Interface contract table lacks the Kind or Name or path column']);
    assert.deepEqual(check(planV2().replace('File:line', 'Where')), ['section 3: Connections table lacks the File:line column']);
  });

  test('K8 Connections, Shared lists and Regression list cells', async (t) => {
    const dir = initRepo(t);
    const text = planV2({
      connections: [L('c', 'docs/c.md:4'), L('c', 'docs/c.md'), L('c', 'src/gone.mjs:1'), L('c', 'docs/c.md:2-3, src/a.mjs:1'), L('c', 'docs/c.md:3-2'), L('c', 'docs/c.md:0'), L('c', 'docs/c.md:12345678')],
      shared: [sharedRow('src/gone.test.mjs'), sharedRow('none here')],
      regression: [regressionRow('src/gone.test.mjs')],
    });
    const { checkContract } = await mod();
    assert.deepEqual(checkContract(text, { root: dir }), [
      'section 3: Connections row 1: docs/c.md has 3 lines at HEAD; line 4 is past its end',
      'section 3: Connections row 2: "docs/c.md" is not <path>:<line>',
      'section 3: Connections row 3: src/gone.mjs is not at HEAD',
      'section 3: Connections row 5: "docs/c.md:3-2" ends before it starts',
      'section 3: Connections row 6: "docs/c.md:0" is not <path>:<line>',
      'section 3: Connections row 7: "docs/c.md:12345678" is not <path>:<line>',
      'section 3: Shared lists row 1: src/gone.test.mjs is not at HEAD',
      'section 3: Shared lists row 2: "none" is not a repo-relative file path',
      'section 4: Regression list row 1: src/gone.test.mjs is not at HEAD',
    ]);
  });

  test('K9 a v1 plan is skipped', async (t) => {
    const dir = initRepo(t);
    const text = planV2({ v1: true, steps: [S(1, 'src/missing.mjs', 'change')] });
    const plan = planFile(dir, text);
    const a = run([plan, '--root', dir]);
    assert.equal(a.stdout, `CONTRACT CHECK SKIP ${plan}: template v1\n`);
    assert.equal(a.status, 0);
    const b = run([plan, '--root', emptyDir(t)]);
    assert.equal(b.stdout, `CONTRACT CHECK SKIP ${plan}: template v1\n`);
    assert.equal(b.status, 0);
    const { checkContract } = await mod();
    assert.deepEqual(checkContract(text, { root: dir }), []);
  });

  test('K10 CLI errors and FAIL format', async (t) => {
    const dir = initRepo(t);
    const plan = planFile(dir, planV2());
    for (const args of [[], [plan, '--x'], [plan, '--root'], [plan, plan]]) {
      const r = run(args);
      assert.equal(r.status, 2, `usage exit for ${JSON.stringify(args)}`);
      assert.equal(r.stdout, USAGE);
    }
    const missing = path.join(dir, 'nope.md');
    const e = run([missing]);
    assert.equal(e.status, 2);
    assert.ok(e.stdout.startsWith(`CONTRACT CHECK ERROR ${missing}: cannot read the plan:`), e.stdout);
    const f = run([plan, '--root', emptyDir(t)]);
    assert.equal(f.status, 2);
    assert.ok(f.stdout.startsWith(`CONTRACT CHECK ERROR ${plan}: cannot read HEAD of `), f.stdout);
    const k = k2(t);
    const bad = planFile(k.dir, k.text);
    const g = run([bad, '--root', k.dir]);
    assert.equal(g.status, 1);
    assert.equal(g.stdout, `CONTRACT CHECK FAIL ${bad} (5)\n${K2_EXPECTED.map((p) => `- ${p}\n`).join('')}`);
    const big = planV2();
    const huge = planFile(dir, big + ' '.repeat(2000001 - Buffer.byteLength(big)));
    const h = run([huge, '--root', dir]);
    assert.equal(h.status, 2);
    assert.equal(h.stdout, `CONTRACT CHECK ERROR ${huge}: the plan is over 2000000 bytes\n`);
  });

  test('K11 paramCount and exportedNames', async () => {
    const { paramCount, exportedNames } = await mod();
    const counts = [['', 0], ['  ', 0], ['a', 1], ['text, { allowQuestions = false, headings = null } = {}', 2], ['m: Map<string, number>, f: (x: number) => void', 2],
      ["s = 'a,b', t = \"c,d\"", 2], ['a, b,', 2], ['cb: (a: number, b: string) => Promise<[number, string]>', 1], ['...rest', 1]];
    for (const [params, n] of counts) assert.equal(paramCount(params), n, `paramCount(${JSON.stringify(params)})`);
    const text = `${REPO_FILES['src/a.mjs']}export async function* gen() {}\nexport type T = 1;\nexport interface I {}\nexport class K {}\nexport { type U, v } from './v.mjs';\nexport * as ns from './ns.mjs';\n/* export const c1 = 1; */\n// export const c2 = 2;\n`;
    const { names, star } = exportedNames(text);
    assert.deepEqual([...names].sort(), ['I', 'K', 'T', 'U', 'alpha', 'beta', 'default', 'delta', 'gen', 'ns', 'v']);
    assert.equal(star, true);
  });
});
