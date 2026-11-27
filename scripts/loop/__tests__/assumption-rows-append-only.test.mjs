// EZD-2015 (flaky-test audit 2026-11-27 row 8): builders reworded old rows in their own assumptions files, and
// vault/tools/assumptions-index.test.mjs (which pins old rows by a hash of their text) failed. The builder and fix
// prompts now say existing rows are only added to (AC-EZD-2015-1, AC-EZD-2015-2). loop.mjs starts the loop when
// imported, so its source is read as text and the rule's string literal is evaluated on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const loopSrc = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../loop.mjs'), 'utf8');

function ruleText() {
  const m = loopSrc.match(/^const ASSUMPTION_ROWS_APPEND_ONLY = ('(?:[^'\\\n]|\\.)*');$/m);
  assert.ok(m, 'loop.mjs defines ASSUMPTION_ROWS_APPEND_ONLY as one string literal');
  return Function(`return ${m[1]};`)();
}
// The body of a top-level function in loop.mjs, from its header to the next top-level closing brace.
function body(name) {
  const start = loopSrc.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `loop.mjs has function ${name}`);
  const end = loopSrc.indexOf('\n}\n', start);
  return loopSrc.slice(start, end);
}

test('EZD-2015 the rule says old assumption rows are only added to, never edited or removed (AC-EZD-2015-1)', () => {
  const rule = ruleText();
  assert.match(rule, /vault\/build\/assumptions/);
  assert.match(rule, /existing rows are only added to, never edited or removed/);
  // It tells the builder what to do instead: a new row in its own ticket file.
  assert.match(rule, /add a new row at the end of the "## Open" table of your own ticket file/);
});

test('EZD-2015 the builder prompt carries the rule (AC-EZD-2015-2)', () => {
  assert.match(body('builderPrompt'), /\bASSUMPTION_ROWS_APPEND_ONLY\b/);
});

test('EZD-2015 the fix prompt carries the rule, and every fix run gets that prompt (AC-EZD-2015-2)', () => {
  assert.match(body('fixRunPrompt'), /return `\$\{fixPrompt\(kind, detail\)\}\\n\\n\$\{ASSUMPTION_ROWS_APPEND_ONLY\}`;/);
  // No fix run is started with the bare fixPrompt.
  assert.doesNotMatch(loopSrc, /prompt: fixPrompt\(/);
  assert.equal(loopSrc.match(/prompt: fixRunPrompt\(kindOf, detail\)/g)?.length, 2);
});

test('EZD-2015 the develop repair build (its own prompt, not builderPrompt) carries the rule too', () => {
  assert.match(loopSrc, /const prompt = t\.prompt \? `\$\{t\.prompt\}\\n\\n\$\{ASSUMPTION_ROWS_APPEND_ONLY\}\\n\$\{lanesNote\(t\)\}`/);
});

// AC-EZD-2015-3: this file runs with the loop's own tests (scripts/loop/__tests__) and starts no docker, launchctl or
// child process: it never imports loop.mjs (which would start the loop), only reads it as text with node built-ins.
test('EZD-2015 this test reads loop.mjs as text and starts no docker, launchctl or child process (AC-EZD-2015-3)', () => {
  const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const imports = [...self.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['node:test', 'node:assert/strict', 'node:fs', 'node:path', 'node:url']);
  assert.doesNotMatch(self, /^import\s*['(]/m); // no bare or dynamic import either
});
