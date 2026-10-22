// EZD-016b T8 (vault/plans/EZD-016b.md, Tests; Step 7): the builder's wiring. Root devDependencies
// for the three readers at their Dependencies-row versions with `root` in Used in; the
// fixtures:generate script; .gitattributes lines; the docs/architecture.md Fixtures subsection and
// Folder layout entries; and the conventions check (EZD-000 C1) passing.
// GLTFLoader runs in Node 22 (T5 uses it), so the Step 7 fallback does not apply and three is required.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const read = (/** @type {string} */ rel) => readFileSync(path.join(repo, rel), 'utf8');

const READERS = ['dxf-parser', 'pdfjs-dist', 'three'];

/** The body of a `## <title>` section of docs/architecture.md, up to the next `## ` heading. */
function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l === `## ${title}`);
  assert.ok(start >= 0, `docs/architecture.md has ## ${title}`);
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n');
}

/** The body of a `### <title>` subsection inside a section text, up to the next `##`/`###`. */
function subsection(text, title) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === `### ${title}`);
  assert.ok(start >= 0, `### ${title} is under its ## section`);
  let end = lines.findIndex((l, i) => i > start && /^#{2,3} /.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n');
}

describe('EZD-016b fixtures wiring', () => {
  it('T8 wiring: root devDependencies, script, .gitattributes, docs, conventions check', () => {
    const pkg = JSON.parse(read('package.json'));
    const doc = read('docs/architecture.md');
    const deps = section(doc, 'Dependencies');
    for (const name of READERS) {
      const row = deps
        .split('\n')
        .map((l) => l.split('|').map((c) => c.trim()))
        .find((cells) => cells[1] === `\`${name}\``);
      assert.ok(row, `Dependencies row for ${name}`);
      const version = row[2].replace(/`/g, '');
      const usedIn = row[3].split(',').map((s) => s.trim());
      assert.equal(pkg.devDependencies?.[name], version, `root devDependency ${name} = ${version}`);
      assert.ok(usedIn.includes('root'), `${name} Used in contains root (${row[3]})`);
    }
    assert.equal(
      pkg.scripts?.['fixtures:generate'],
      'node scripts/fixtures/generate-synthetic.mjs',
      'root script fixtures:generate',
    );

    const attrs = read('.gitattributes')
      .split('\n')
      .map((l) => l.trim().split(/\s+/).join(' '));
    assert.ok(attrs.includes('*.glb binary'), '.gitattributes *.glb binary');
    assert.ok(attrs.includes('*.dxf text eol=lf'), '.gitattributes *.dxf text eol=lf');

    const fixtures = subsection(section(doc, 'Tests'), 'Fixtures (EZD-016b)');
    for (const words of ['fixtures/manifest.json', 'fixtures/synthetic/', 'fixtures:generate']) {
      assert.ok(fixtures.includes(words), `### Fixtures (EZD-016b) names ${words}`);
    }
    const layout = section(doc, 'Folder layout');
    assert.ok(/(^|[\s`])fixtures\//m.test(layout), '## Folder layout names fixtures/');
    assert.ok(layout.includes('scripts/fixtures/'), '## Folder layout names scripts/fixtures/');

    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const check = spawnSync(process.execPath, ['scripts/conventions/check.mjs', '.'], {
      cwd: repo,
      encoding: 'utf8',
      env,
      timeout: 180_000,
    });
    assert.equal(check.status, 0, `conventions check: ${check.stdout}${check.stderr}`);
  });
});
