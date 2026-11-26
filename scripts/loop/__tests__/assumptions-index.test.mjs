// EZD-1953 (audit 2026-11-23 B6, O1). The gate runs scripts/ tests only, so this file runs the tool's own tests
// (vault/tools/assumptions-index.test.mjs: AC-EZD-1953-1, AC-EZD-1953-2) and checks the builder prompt (AC-EZD-1953-3).
// loop.mjs starts the loop when imported, so the prompt is read as text.
import '../../../vault/tools/assumptions-index.test.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownAssumptions } from '../lanes.mjs';

const loopSrc = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../loop.mjs'), 'utf8');

test('EZD-1953 the builder prompt sends assumptions to the ticket\'s own file, not the shared one (AC-EZD-1953-3)', () => {
  assert.equal(ownAssumptions('EZD-1953'), 'vault/build/assumptions/EZD-1953.md');
  assert.doesNotMatch(loopSrc, /record it in vault\/build\/assumptions\.md/);
  assert.match(loopSrc, /record it \(and any wording for Josh, rule 6\) in your own ticket file \$\{ownAssumptions\(t\.id\)\}, not in vault\/build\/assumptions\.md/);
  assert.match(loopSrc, /your assumptions file \$\{ownAssumptions\(t\.id\)\} \(no claim needed\)/);
  // The shared-files line no longer offers assumptions.md to builders.
  assert.match(loopSrc, /\.filter\(\(f\) => f !== 'vault\/build\/assumptions\.md'\)/);
});

test('EZD-1953 the loop rebuilds the index and checklist after each merge (AC-EZD-1953-1, AC-EZD-1953-2)', () => {
  assert.match(loopSrc, /if \(res === 'merged'\) commitAssumptionsIndex\(t\.id\);/);
});
