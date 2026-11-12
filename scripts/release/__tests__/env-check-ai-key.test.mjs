// EZD-5601 T19 (vault/plans/EZD-5601.md section 1 step 22, section 4; AC-EZD-5601-6). node:test, pure. The base
// is the fixture of env-check-ai.test.mjs plus a Preview AI_MODE of stub (so that rule stays quiet), with
// AI_KEY_ENCRYPTION_KEYS as a required name: a missing Production or Preview entry is a `missing` problem.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const loadEnv = () => import('../env-check.mjs');

const THREE = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
];
const WITH_AI = [...THREE, 'AI_MODE'];
const WITH_KEYS = [...WITH_AI, 'AI_KEY_ENCRYPTION_KEYS'];

const base = () => [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', target: ['production'], value: 'https://prodref123.supabase.co' },
  { key: 'NEXT_PUBLIC_SUPABASE_URL', target: ['preview'], value: 'https://devref456.supabase.co' },
  { key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', target: ['production', 'preview'] },
  { key: 'SUPABASE_SECRET_KEY', target: ['production', 'preview'] },
  { key: 'EMAIL_TRANSPORT', target: ['preview'], value: 'stub' },
  { key: 'EMAIL_FROM', target: ['preview'] },
  { key: 'AI_MODE', target: ['production'], value: 'live' },
  { key: 'AI_MODE', target: ['preview'], value: 'stub' },
];
const keyProblems = (result) =>
  result.problems.filter((p) => p.name === 'AI_KEY_ENCRYPTION_KEYS');

describe('EZD-5601 AI_KEY_ENCRYPTION_KEYS rule in the release env check', () => {
  test('EZD-5601 T19 evaluateVercelEnv wants the setting in Production and Preview when it is required', async () => {
    const { evaluateVercelEnv } = await loadEnv();
    const run = (extra, requiredNames = WITH_KEYS) =>
      evaluateVercelEnv({ envs: [...base(), ...extra], requiredNames, prodRef: 'prodref123' });

    const none = run([]);
    assert.deepEqual(keyProblems(none), [
      { code: 'missing', name: 'AI_KEY_ENCRYPTION_KEYS', target: 'production' },
      { code: 'missing', name: 'AI_KEY_ENCRYPTION_KEYS', target: 'preview' },
    ]);
    assert.equal(none.ok, false);

    const prodOnly = run([{ key: 'AI_KEY_ENCRYPTION_KEYS', target: ['production'] }]);
    assert.deepEqual(keyProblems(prodOnly), [
      { code: 'missing', name: 'AI_KEY_ENCRYPTION_KEYS', target: 'preview' },
    ]);

    const both = run([{ key: 'AI_KEY_ENCRYPTION_KEYS', target: ['production', 'preview'] }]);
    assert.deepEqual(both, { ok: true, problems: [] });

    const notRequired = run([], WITH_AI);
    assert.deepEqual(keyProblems(notRequired), []);
  });
});
