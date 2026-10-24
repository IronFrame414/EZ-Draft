// Spec restructure (Q-0218; vault/questions/interview-plan-2026-10-20.md "Restructure and reading map"): spec section files
// moved word for word into smaller area files. This proves, section by section, that the moved text joined equals the
// original section in the frozen vault/spec/spec.md, that every spec file is 20,000 characters or fewer, and that each old
// file is a short pointer naming its new files.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { specSection, partBody, assemble, rangeProblems, MAX_CHARS } = await import(pathToFileURL(path.join(root, 'scripts/spec/split.mjs')).href);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/spec/splits.json'), 'utf8'));
const spec = fs.readFileSync(path.join(root, 'vault/spec/spec.md'), 'utf8');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('SPLIT helpers', () => {
  const doc = ['# Top', '', '## A', 'a1', '### A.1', 'a11', '## B', 'b1', ''].join('\n');
  test('SPLIT T1: specSection returns a heading through the line before the next heading of the same or higher level', () => {
    assert.equal(specSection(doc, '## A'), ['## A', 'a1', '### A.1', 'a11'].join('\n'));
    assert.equal(specSection(doc, '### A.1'), ['### A.1', 'a11'].join('\n'));
    assert.equal(specSection(doc, '## B'), ['## B', 'b1', ''].join('\n'));
    assert.equal(specSection(doc, '## Missing'), null);
  });
  test('SPLIT T2: partBody drops the three-line part header and keeps the rest exactly', () => {
    assert.equal(partBody('# Title\n<!-- moved -->\n\nline 1\n\nline 3\n'), 'line 1\n\nline 3\n');
  });
  test('SPLIT T3: assemble puts every part chunk back in source-line order', () => {
    const entry = { parts: [{ lines: [[3, 4]] }, { lines: [[1, 2], [5, 5]] }] };
    assert.equal(assemble(entry, ['c\nd\n', 'a\nb\ne\n']), 'a\nb\nc\nd\ne\n');
  });
  test('SPLIT T4: rangeProblems reports a gap, an overlap and a short end', () => {
    assert.deepEqual(rangeProblems({ parts: [{ lines: [[1, 2]] }, { lines: [[3, 5]] }] }, 5), []);
    assert.match(rangeProblems({ parts: [{ lines: [[1, 2]] }, { lines: [[4, 5]] }] }, 5).join(), /gap/);
    assert.match(rangeProblems({ parts: [{ lines: [[1, 3]] }, { lines: [[3, 5]] }] }, 5).join(), /overlap/);
    assert.match(rangeProblems({ parts: [{ lines: [[1, 4]] }] }, 5).join(), /end/);
  });
  test('SPLIT T5: a changed or dropped line makes the joined text differ from the original', () => {
    const entry = { parts: [{ lines: [[1, 2]] }] };
    assert.notEqual(assemble(entry, ['a\nB\n']), 'a\nb\n');
    assert.throws(() => assemble(entry, ['a\n']), /line count/);
  });
});

describe('SPLIT spec restructure Q-0218', () => {
  test('SPLIT T6: the manifest covers 03, 09 and the four X- screens renamed S19 to S22', () => {
    const sources = manifest.map((e) => e.source);
    for (const s of ['vault/spec/sections/03-data-model.md', 'vault/spec/sections/09-calculations-and-rules.md']) assert.ok(sources.includes(s), s);
    const renamed = manifest.filter((e) => /screens\/X-/.test(e.source));
    assert.equal(renamed.length, 4);
    for (const e of renamed) assert.match(e.parts[0].file, /screens\/S(19|20|21|22)-/);
  });
  for (const entry of manifest) {
    test(`SPLIT T7: ${entry.source}: moved text joined equals the original section in spec.md`, () => {
      const original = specSection(spec, entry.heading);
      assert.ok(original, `heading ${entry.heading} not found in spec.md`);
      const lineCount = original.trimEnd().split('\n').length;
      assert.deepEqual(rangeProblems(entry, lineCount), []);
      const bodies = entry.parts.map((p) => partBody(read(p.file)));
      assert.equal(assemble(entry, bodies).trimEnd(), original.trimEnd());
    });
    test(`SPLIT T8: ${entry.source}: each new file is at most 20,000 characters and names its source and Q-0218`, () => {
      for (const p of entry.parts) {
        const text = read(p.file);
        assert.ok(text.length <= MAX_CHARS, `${p.file} is ${text.length} characters`);
        const [title, note] = text.split('\n');
        assert.match(title, /^# \S/);
        assert.ok(note.includes(entry.source) && note.includes('Q-0218'), `${p.file} line 2`);
      }
    });
    test(`SPLIT T9: ${entry.source}: the old file is a short pointer that links every new file`, () => {
      const text = read(entry.source);
      assert.ok(text.length < 3000, `${entry.source} is ${text.length} characters`);
      assert.ok(text.startsWith(entry.heading + '\n'));
      assert.ok(text.includes('Q-0218'));
      for (const p of entry.parts) {
        const link = `(${path.relative(path.dirname(entry.source), p.file)})`;
        assert.ok(text.includes(link), `${entry.source} lacks ${link}`);
      }
    });
  }
  test('SPLIT T10: every spec file under vault/spec/sections/ is 20,000 characters or fewer', () => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(path.join(root, 'vault/spec/sections')).filter((f) => f.endsWith('.md'))) {
      const n = fs.readFileSync(f, 'utf8').length;
      assert.ok(n <= MAX_CHARS, `${path.relative(root, f)} is ${n} characters`);
    }
  });
});
