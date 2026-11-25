// EZD-1954 · C11: a literal font size in a CSS module fails the conventions check (AC-EZD-1954-3; audit 2026-11-23 U5).
// Each case is a temporary folder holding one CSS file; other checks may complain about the bare folder, so only the
// [C11] lines are read. The last test runs the check on the repository itself: no literal font size is left (AC-EZD-1954-2).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const checkScript = path.join(root, 'scripts', 'conventions', 'check.mjs');

const tmpRoots = [];
after(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});

function c11Lines(dir) {
  const r = spawnSync(process.execPath, [checkScript, dir], { encoding: 'utf8' });
  return `${r.stdout || ''}${r.stderr || ''}`.split('\n').filter((l) => l.startsWith('[C11]'));
}

function repoWith(file, css) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd1954-c11-'));
  tmpRoots.push(dir);
  const full = path.join(dir, ...file.split('/'));
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, css);
  return dir;
}

const FAIL_CASES = [
  ['a', 'app/src/x.module.css', '.a{font-size:13px}'],
  ['b', 'app/src/x.module.css', '.a{font-size: 12.5px;color:var(--ez-ink)}'],
  ['c', 'app/src/x.module.css', '.a{font: 400 14px var(--ez-font-sans)}'],
  ['d', 'app/src/x.module.css', '.a{font: 500 13px/1.4 var(--ez-font-mono)}'],
  ['e', 'app/src/x.module.css', '.a{font-size:1rem}'],
  ['f', 'app/src/x.module.css', '@media (min-width:600px){.a{font-size:9px}}'],
  ['g', 'app/src/deep/folder/y.module.css', '.a{FONT-SIZE:.5PX}'],
];

const PASS_CASES = [
  ['h', 'app/src/x.module.css', '.a{font-size:var(--ez-text-13)}'],
  ['i', 'app/src/x.module.css', '.a{font: 400 var(--ez-text-14) var(--ez-font-sans)}'],
  ['j', 'app/src/x.module.css', '.a{font-size:1.2em}.b{font-size:inherit}.c{font:inherit}'],
  ['k', 'app/src/x.module.css', '/* font-size: 13px */ .a{padding:13px;line-height:18px}'],
  ['l', 'app/src/styles/tokens.css', ':root{--ez-text-13:13px}'],
  ['m', 'app/src/__fixtures__/z.module.css', '.a{font-size:13px}'],
];

for (const [id, file, css] of FAIL_CASES) {
  test(`EZD-1954 AC-EZD-1954-3 (${id}): C11 fails ${file} with ${css}`, () => {
    const lines = c11Lines(repoWith(file, css));
    assert.equal(lines.length, 1, lines.join('\n'));
    assert.ok(lines[0].startsWith(`[C11] ${file}: `), lines[0]);
    assert.match(lines[0], /var\(--ez-text-\*\)/);
  });
}

for (const [id, file, css] of PASS_CASES) {
  test(`EZD-1954 AC-EZD-1954-3 (${id}): C11 passes ${file} with ${css}`, () => {
    assert.deepEqual(c11Lines(repoWith(file, css)), []);
  });
}

test('EZD-1954 AC-EZD-1954-2: no CSS module in the repository writes a literal font size', () => {
  assert.deepEqual(c11Lines(root), []);
});
