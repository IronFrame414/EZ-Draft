// EZD-2023 (audit 2026-11-27 X3): the builder and reviewer prompts make the ticket's Settled prep rows binding input.
// AC-EZD-2023-4: the new test for the prep-rows change. It reads source text and calls a pure function; it starts no
// docker, launchctl or child process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepRowsLine } from '../prep-rows.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('AC-EZD-2023-3: the builder line says the Settled rows of the prep file are binding alongside ACs, spec and decisions', () => {
  const line = prepRowsLine('EZD-9500', 'builder');
  assert.match(line, /vault\/build\/assumptions\/EZD-9500\.md/);
  assert.match(line, /"## Settled" rows/);
  assert.match(line, /binding input alongside the acceptance criteria, spec files and decisions/);
});

test('AC-EZD-2023-3: the reviewer line makes an unfollowed Settled row a blocking finding', () => {
  const line = prepRowsLine('EZD-9500', 'reviewer');
  assert.match(line, /vault\/build\/assumptions\/EZD-9500\.md/);
  assert.match(line, /"## Settled" rows/);
  assert.match(line, /binding input alongside the acceptance criteria, spec files and decisions/);
  assert.match(line, /blocking finding/);
});

test('AC-EZD-2023-3: scripts/loop.mjs puts the line into the builder prompt and the reviewer prompt', () => {
  const src = readFileSync(path.join(REPO, 'scripts/loop.mjs'), 'utf8');
  assert.match(src, /import \{ prepRowsLine \} from '\.\/loop\/prep-rows\.mjs';/);
  const body = (name) => {
    const i = src.indexOf(`function ${name}(`);
    assert.ok(i >= 0, name);
    return src.slice(i, src.indexOf('\nfunction ', i + 1));
  };
  assert.match(body('builderPrompt'), /prepRowsLine\(t\.id, 'builder'\)/);
  assert.match(body('reviewerPrompt'), /prepRowsLine\(t\.id, 'reviewer'\)/);
});
