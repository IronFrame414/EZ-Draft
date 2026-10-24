// EZD-021 T21 (a)-(f) (vault/plans/EZD-021.md section 4). node:test, pure. The base is EZD-023c's T14 base (a)
// plus Production AI_MODE = live. Expected: Q-0077 (Preview AI_MODE is set explicitly to stub or live; both
// modes are selectable per environment) and Step 6 (the rule runs only when AI_MODE is a required name).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const loadEnv = () => import('../env-check.mjs');

const THREE = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
];
const WITH_AI = [...THREE, 'AI_MODE'];
const PROD_URL = 'https://prodref123.supabase.co';
const DEV_URL = 'https://devref456.supabase.co';

const base = () => [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', target: ['production'], value: PROD_URL },
  { key: 'NEXT_PUBLIC_SUPABASE_URL', target: ['preview'], value: DEV_URL },
  { key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', target: ['production', 'preview'] },
  { key: 'SUPABASE_SECRET_KEY', target: ['production', 'preview'] },
  { key: 'EMAIL_TRANSPORT', target: ['preview'], value: 'stub' },
  { key: 'EMAIL_FROM', target: ['preview'] },
  { key: 'AI_MODE', target: ['production'], value: 'live' },
];
const withPreviewAi = (value) => [...base(), { key: 'AI_MODE', target: ['preview'], value }];
const PREVIEW_AI = { code: 'preview_ai_mode', name: 'AI_MODE', target: 'preview' };

describe('EZD-021 Preview AI_MODE rule in the release env check', () => {
  test('EZD-021 T21 evaluateVercelEnv accepts a Preview AI_MODE of stub or live and refuses anything else', async () => {
    const { evaluateVercelEnv } = await loadEnv();
    const run = (envs, requiredNames = WITH_AI) =>
      evaluateVercelEnv({ envs, requiredNames, prodRef: 'prodref123' });
    const ok = { ok: true, problems: [] };
    const refused = (result, id) => {
      assert.equal(result.ok, false, `(${id}) ok false`);
      assert.deepEqual(result.problems, [PREVIEW_AI], `(${id}) problems`);
    };

    assert.deepEqual(run(withPreviewAi('stub')), ok, '(a)');
    assert.deepEqual(run(withPreviewAi('live')), ok, '(b)');
    refused(run(base()), 'c');
    refused(run(withPreviewAi('test')), 'd');
    refused(run(withPreviewAi('')), 'e');

    const f = run(base(), THREE);
    assert.ok(
      !f.problems.some((p) => p.code === 'preview_ai_mode'),
      '(f) no preview_ai_mode problem',
    );
  });
});
