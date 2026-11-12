// EZD-364 T1-T2 (AC-EZD-364-1): launcher units keep long background gates (vault/plans/EZD-364.md sections 3 and 4, D-Limit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('T1: UNIT_ENV_LIMITS is frozen with the two limits and no default-timeout key', async () => {
  const { UNIT_ENV_LIMITS } = await import('./unit-env.mjs');
  assert.ok(Object.isFrozen(UNIT_ENV_LIMITS));
  assert.equal(UNIT_ENV_LIMITS.BASH_MAX_TIMEOUT_MS, '7200000');
  assert.equal(UNIT_ENV_LIMITS.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS, '0');
  assert.equal('BASH_DEFAULT_TIMEOUT_MS' in UNIT_ENV_LIMITS, false);
});

test('T2: run.mjs imports UNIT_ENV_LIMITS and applies it inside runUnit', async () => {
  // The import line is checked first so this fails with the same missing module while unit-env.mjs does not exist.
  await import('./unit-env.mjs');
  const src = readFileSync(path.join(repo, 'scripts/run.mjs'), 'utf8');
  const importLine = src.split('\n').find((l) => l.startsWith('import') && l.includes('UNIT_ENV_LIMITS'));
  assert.ok(importLine, 'run.mjs has no import of UNIT_ENV_LIMITS');
  assert.ok(importLine.includes("'./launcher/unit-env.mjs'") || importLine.includes('"./launcher/unit-env.mjs"'));
  const start = src.indexOf('function runUnit');
  assert.ok(start >= 0, 'runUnit not found in scripts/run.mjs');
  const after = src.slice(start + 1);
  const m = after.search(/\n(async )?function [A-Za-z]/);
  const body = m >= 0 ? src.slice(start, start + 1 + m) : src.slice(start);
  assert.ok(body.includes('Object.assign(env, UNIT_ENV_LIMITS)'), 'runUnit must contain Object.assign(env, UNIT_ENV_LIMITS)');
});
