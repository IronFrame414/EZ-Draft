// EZD-383 D-Fix (vault/plans/EZD-383.md, "Fixture helper"): the temp repository, the register file and the plan text
// that contract-check.test.mjs, connections-check.test.mjs and the R tests of ledger-lock.test.mjs share.
// Node built-ins only; no network.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GIT_ISOLATION } from '../../gate-env.mjs';
import { GIT_BIN } from '../../../vault/tools/trusted-git.mjs';
import { V2_BLOCKS } from '../../../vault/tools/plan_lint.mjs';

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

export const REPO_FILES = Object.freeze({
  'src/a.mjs': "export function alpha(x, { y = 1, z } = {}) {\n  return x;\n}\nexport const beta = async (m, n) => m;\nconst gamma = 1;\nexport { gamma as delta };\nexport default 3;\nexport * from './star.mjs';\n",
  'src/plain.mjs': 'export const one = 1;\n// export const hidden = 1;\n',
  'src/b.css': '.b {}\n',
  'docs/c.md': 'one\ntwo\nthree\n',
  'tests/list.test.mjs': "test('LIST pin text', () => {});\n",
  'src/pages/a/page.tsx': 'export default function A() { return null; }\n',
  'src/x.ts': 'export const x = 1;\n',
  '.hidden/x.ts': 'export const x = 2;\n',
});

export const REGISTER = deepFreeze({
  version: 1,
  lists: [{ id: 'fx-pages', list: 'fixture page list', test: 'tests/list.test.mjs', pin: 'LIST pin text', reaches: ['src/pages/**/page.tsx'], read: 'the count in LIST pin text', sources: ['L-049'] }],
});

// A signature Name cell: a backslash, then a vertical bar, between "1 " and " 2".
export const PIPE_SIG = '`beta(m, n): Promise<1 \\| 2>` from `src/a.mjs`';

const ID = { GIT_AUTHOR_NAME: 'f', GIT_AUTHOR_EMAIL: 'f@x.invalid', GIT_COMMITTER_NAME: 'f', GIT_COMMITTER_EMAIL: 'f@x.invalid' };
const git = (cwd, args) => {
  const r = spawnSync(GIT_BIN, args, { cwd, encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: cwd, ...GIT_ISOLATION, ...ID } });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

export function initRepo(t, files = REPO_FILES) {
  const dir = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'ezd383-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, ['init', '-q', '--initial-branch=develop']);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'one']);
  return dir;
}

export function writeRegister(dir, data = REGISTER) {
  const file = path.join(dir, 'vault/shared-lists.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

const line = (cells) => `| ${cells.join(' | ')} |`;
const tick = (s) => `\`${s}\``;

export function stepRow(n, p, kind, pattern = 'src/b.css') {
  const pathCell = p !== '' && !p.includes('`') ? tick(p) : p;
  const patternCell = !/\s/.test(pattern) && !pattern.includes('`') ? tick(pattern) : pattern;
  return line([String(n), pathCell, kind, 'none', patternCell, '`node --test`']);
}
export function contractRow(kind, name, p = null) {
  let nameCell;
  if (p !== null) nameCell = `${tick(name)} from ${tick(p)}`;
  else nameCell = !/\s/.test(name) && !name.includes('`') ? tick(name) : name;
  return line([kind, nameCell, 'fixture']);
}
export const connRow = (name, fileLine) => line(['test', name, fileLine, 'none']);
export const sharedRow = (testFile) => line(['fixture list', testFile, '1', '1']);
export const regressionRow = (testFile) => line([testFile, 'none', 'fixture']);

const TESTS_ROW = '| U1 | AC-EZD-900-1 | unit | 2 | "2" | Q-0001 | inline | none | unit | no |';
const CONTRACT_HEAD = ['| Kind (file / export / signature / route / props / data-testid) | Name or path | Details |', '| --- | --- | --- |'];
const STEPS_HEAD = ['| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |', '| --- | --- | --- | --- | --- | --- |'];

export function planV2({ v1 = false, steps, contract, connections, shared, regression } = {}) {
  const opt = (v, dflt) => (v === undefined ? dflt : v);
  const stepsV = opt(steps, [stepRow(1, 'src/a.mjs', 'change'), stepRow(2, 'src/new.mjs', 'new', 'none (first of its kind)')]);
  const contractV = opt(contract, [
    contractRow('file (exists)', 'docs/c.md'), contractRow('file (new)', 'src/new.mjs'),
    contractRow('export (exists)', 'delta', 'src/a.mjs'),
    contractRow('signature (exists)', 'alpha(x, opts): number', 'src/a.mjs'),
    contractRow('export (new)', 'omega', 'src/new.mjs'), contractRow('route', '/x'),
  ]);
  const connV = opt(connections, [connRow('c', 'docs/c.md:3')]);
  const sharedV = opt(shared, [sharedRow('tests/list.test.mjs')]);
  const regV = opt(regression, [regressionRow('docs/c.md')]);
  const custom = { Connections: connV, 'Shared lists': sharedV, 'Regression list': regV };

  const v2block = (b) => {
    const head = [line(b.columns), line(b.columns.map(() => '---'))];
    if (b.title === 'Tests') return `### Tests\n${[...head, TESTS_ROW].join('\n')}\n`;
    const v = b.title in custom ? custom[b.title] : 'None: fixture';
    if (v === null) return '';
    return `### ${b.title}\n${[...head, ...(Array.isArray(v) ? v : [v])].join('\n')}\n`;
  };
  const blocksOf = (n) => V2_BLOCKS.filter((b) => b.section === n).map(v2block).filter(Boolean).join('\n');

  const s1 = [];
  if (stepsV !== null) s1.push(`### Build steps\n${[...STEPS_HEAD, ...(Array.isArray(stepsV) ? stepsV : [stepsV])].join('\n')}\n`);
  s1.push('### Decided for the builder\nNone\n', '### Do not touch\nNone\n', blocksOf(1));
  const s3 = [];
  if (contractV !== null) s3.push(`${[...CONTRACT_HEAD, ...(Array.isArray(contractV) ? contractV : [contractV])].join('\n')}\n`);
  s3.push(blocksOf(3));

  return [
    '# EZD-900 · Fixture', '',
    '- **ACs:** AC-EZD-900-1', '- **Complexity:** medium', '- **User-visible result:** the fixture works.',
    ...(v1 ? [] : ['- Template: v2']), '',
    '## 1. What to build', s1.join('\n'),
    '## 2. Sources', 'Architecture: none beyond the core', '',
    '## 3. Interface contract', s3.join('\n'),
    '## 4. Tests', blocksOf(4),
    '## 5. Visual checklist', blocksOf(5),
    '## 6. Proposed wording', 'None', '',
    '## 7. Security review', 'security-review: no', '',
    '## 8. Complexity and model recommendation', 'medium.', '',
    '## 9. Dependencies', blocksOf(9),
    '## 10. Open questions', 'None', '',
  ].join('\n');
}
