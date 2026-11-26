// EZD-1948 (audit 2026-11-23 P4): the builder prompt and every fix-round prompt tell the builder to run typecheck, lint
// and the tests of the files it changed (the failing tests, in a fix round), and to run node scripts/check.mjs at most
// once, at the end. The effect is measured afterwards from usage.jsonl, not here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDER_TEST_STEP, CHECK_AT_MOST_ONCE, FIX_TEST_RULE, fixPromptBody } from '../test-scope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const loop = readFileSync(path.join(ROOT, 'scripts/loop.mjs'), 'utf8');
const fnBody = (name) => { const i = loop.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return loop.slice(i, loop.indexOf('\n}\n', i)); };

const targeted = (s) => {
  assert.match(s, /typecheck/);
  assert.match(s, /lint/);
  assert.match(s, /pnpm --filter app exec vitest run <file>/);
  assert.match(s, /pnpm --filter app exec playwright test <spec>/);
  assert.match(s, /not the whole suite/);
};
const atMostOnce = (s) => {
  assert.ok(s.includes(CHECK_AT_MOST_ONCE));
  assert.match(s, /`node scripts\/check\.mjs`[^.]*at most once, at the end/);
  assert.doesNotMatch(s, /until it passes/);
};

test('AC-EZD-1948-1: the builder step names typecheck, lint and the unit and e2e tests of the changed files', () => {
  targeted(BUILDER_TEST_STEP);
  assert.match(BUILDER_TEST_STEP, /^3\. /);
  assert.match(BUILDER_TEST_STEP, /unit and e2e tests of the files you changed/);
  atMostOnce(BUILDER_TEST_STEP);
});

test('AC-EZD-1948-1: builderPrompt in loop.mjs uses the step and no longer loops on check.mjs --fast', () => {
  const b = fnBody('builderPrompt');
  assert.match(b, /\bBUILDER_TEST_STEP,/);
  assert.doesNotMatch(b, /check\.mjs --fast` until it passes/);
  assert.match(loop, /import \{[^}]*BUILDER_TEST_STEP[^}]*\} from '\.\/loop\/test-scope\.mjs'/);
});

test('AC-EZD-1948-1: every fix-round prompt says the same for the failing tests', () => {
  targeted(FIX_TEST_RULE);
  assert.match(FIX_TEST_RULE, /the failing tests/);
  for (const kind of ['check', 'review', 'merge']) {
    const p = fixPromptBody(kind, 'DETAIL-LINES', 'app/src/server/db/database.types.ts');
    assert.ok(p.includes(FIX_TEST_RULE), kind);
    atMostOnce(p);
    assert.ok(p.endsWith('DETAIL-LINES'), kind);
  }
  assert.match(fixPromptBody('merge', '', 'app/src/server/db/database.types.ts'), /\(app\/src\/server\/db\/database\.types\.ts is not in the list/);
});

test('AC-EZD-1948-1/3: loop.mjs builds its fix prompts from fixPromptBody and keeps no copy of the old text', () => {
  assert.match(loop, /import \{[^}]*fixPromptBody as fixBody[^}]*\} from '\.\/loop\/test-scope\.mjs'/);
  assert.match(fnBody('fixPrompt'), /fixPromptBody\(kind, detail\)/);
  assert.match(fnBody('fixPromptBody'), /return fixBody\(kind, detail, TYPES_FILE\);/);
  assert.doesNotMatch(loop, /rerun the full check/);
  assert.doesNotMatch(loop, /full check until it passes/);
});

test('AC-EZD-1948-1: the develop-repair prompt follows the same test rule', () => {
  const i = loop.indexOf("title: 'Repair: develop fails the check'");
  assert.ok(i >= 0);
  assert.match(loop.slice(i, loop.indexOf('\n', loop.indexOf('`develop fails the full check', i))), /\$\{FIX_TEST_RULE\}/);
});
