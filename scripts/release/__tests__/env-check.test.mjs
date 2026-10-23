// EZD-023c T14 and T15 (vault/plans/EZD-023c.md section 4). node:test, pure. Expected problems come from the plan's
// Step 2 rules and the T14 table (11 Operations "Preview deploys use the dev database"; Q-0041; Q-0159 (a);
// Q-0160 (a)); refs and redaction from T15 and Step 3 (Q-0112 finding 7).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const loadEnv = () => import('../env-check.mjs');
const loadRedact = () => import('../redact.mjs');

const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'];
const PROD_REF = 'prodref123';
const PROD_URL = 'https://prodref123.supabase.co';
const DEV_URL = 'https://devref456.supabase.co';

const base = () => [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', target: ['production'], value: PROD_URL },
  { key: 'NEXT_PUBLIC_SUPABASE_URL', target: ['preview'], value: DEV_URL },
  { key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', target: ['production', 'preview'] },
  { key: 'SUPABASE_SECRET_KEY', target: ['production', 'preview'] },
  { key: 'EMAIL_TRANSPORT', target: ['preview'], value: 'stub' },
  { key: 'EMAIL_FROM', target: ['preview'] },
];
const PREVIEW_URL_INDEX = 1;

const problem = (code, name, target) => ({ code, name, target });
const PREVIEW_URL = problem('preview_uses_prod', 'NEXT_PUBLIC_SUPABASE_URL', 'preview');
const EMAIL = problem('preview_email', 'EMAIL_TRANSPORT', 'preview');

describe('EZD-023c Vercel env rules, refs and redaction', () => {
  test('EZD-023c T14 evaluateVercelEnv, envExampleNames', async () => {
    const { evaluateVercelEnv, envExampleNames } = await loadEnv();
    const run = (envs, extra = {}) =>
      evaluateVercelEnv({ envs, requiredNames: REQUIRED, prodRef: PROD_REF, ...extra });
    const edit = (fn) => {
      const e = base();
      fn(e);
      return e;
    };
    const ok = { ok: true, problems: [] };
    const one = (result, p, id) => {
      assert.equal(result.ok, false, `(${id}) ok false`);
      assert.deepEqual(result.problems, [p], `(${id}) problems`);
    };

    assert.deepEqual(run(base()), ok, '(a)');
    one(run(edit((e) => (e[PREVIEW_URL_INDEX].value = PROD_URL))), PREVIEW_URL, 'b');
    one(
      run(edit((e) => (e[0].value = DEV_URL))),
      problem('production_not_prod', 'NEXT_PUBLIC_SUPABASE_URL', 'production'),
      'c',
    );
    one(
      run(edit((e) => (e[3].target = ['preview']))),
      problem('missing', 'SUPABASE_SECRET_KEY', 'production'),
      'd',
    );
    one(
      run(edit((e) => (e[2].target = ['production']))),
      problem('missing', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'preview'),
      'e',
    );
    one(
      run(edit((e) => delete e[PREVIEW_URL_INDEX].value)),
      problem('unreadable', 'NEXT_PUBLIC_SUPABASE_URL', 'preview'),
      'f',
    );
    one(run(edit((e) => e.splice(4, 1))), EMAIL, 'g');
    assert.deepEqual(
      run(
        edit((e) => {
          e[4].value = 'resend';
          e.push({ key: 'RESEND_API_KEY', target: ['preview'] });
        }),
      ),
      ok,
      '(h)',
    );
    one(
      run(edit((e) => (e[4].value = 'resend'))),
      problem('preview_email', 'RESEND_API_KEY', 'preview'),
      'i',
    );
    one(run(edit((e) => (e[4].value = 'smtp'))), EMAIL, 'j');
    one(
      run(edit((e) => (e[PREVIEW_URL_INDEX].value = 'https://db.example.com'))),
      problem('unreadable', 'NEXT_PUBLIC_SUPABASE_URL', 'preview'),
      'k',
    );
    one(
      run(base(), { prodRef: null }),
      problem('prod_ref_unknown', 'BACKUP_SOURCE_DB_URL', null),
      'l',
    );
    one(
      run(
        edit((e) =>
          e.push({
            key: 'NEXT_PUBLIC_SUPABASE_URL',
            target: ['preview'],
            gitBranch: 'develop',
            value: PROD_URL,
          }),
        ),
      ),
      PREVIEW_URL,
      'm',
    );
    assert.deepEqual(run(edit((e) => (e[PREVIEW_URL_INDEX].target = 'preview'))), ok, '(n)');
    one(run(edit((e) => (e[4].value = ' stub'))), EMAIL, 'o');

    assert.deepEqual(envExampleNames('# c\n\nA_B=\r\nC=x\n'), ['A_B', 'C'], '(p)');
    assert.throws(() => envExampleNames('export FOO=\n'), /env_example_invalid/, '(q)');

    one(
      run(edit((e) => e.splice(5, 1))),
      problem('missing', 'EMAIL_FROM', 'preview'),
      'r',
    );
    const GATE = [...REQUIRED, 'SUPABASE_API_GATE_SECRET'];
    const gateEnvs = (targets) => [...base(), ...targets.map((t) => ({ key: 'SUPABASE_API_GATE_SECRET', target: t }))];
    one(
      run(gateEnvs([['production']]), { requiredNames: GATE }),
      problem('missing', 'SUPABASE_API_GATE_SECRET', 'preview'),
      's',
    );
    assert.deepEqual(run(gateEnvs([['production'], ['preview']]), { requiredNames: GATE }), ok, '(t)');

    const stub = (...entries) => [...base(), ...entries.map((e) => ({ key: 'EMAIL_STUB_DIR', ...e }))];
    one(run(stub({ target: ['preview'] })), problem('stub_dir_set', 'EMAIL_STUB_DIR', 'preview'), 'u');
    one(run(stub({ target: ['production'] })), problem('stub_dir_set', 'EMAIL_STUB_DIR', 'production'), 'v');
    const w = run(
      stub(
        { target: ['preview'], gitBranch: 'develop' },
        { target: ['production', 'preview'], gitBranch: 'develop' },
      ),
    );
    assert.equal(w.ok, false, '(w) ok false');
    assert.deepEqual(
      w.problems,
      [
        problem('stub_dir_set', 'EMAIL_STUB_DIR', 'production'),
        problem('stub_dir_set', 'EMAIL_STUB_DIR', 'preview'),
      ],
      '(w) production before preview, each once',
    );
    assert.deepEqual(run(stub({ target: ['development'] })), ok, '(x)');
  });

  test('EZD-023c T15 refs and redaction', async () => {
    const { supabaseRefFromApiUrl, supabaseRefFromDbUrl } = await loadEnv();
    const { redactUrl, safeLines } = await loadRedact();
    const direct = 'postgresql://postgres:secret@db.abcd1234.supabase.co:5432/postgres';

    assert.equal(supabaseRefFromApiUrl('https://abcd1234.supabase.co'), 'abcd1234', '(a)');
    assert.equal(
      supabaseRefFromDbUrl(
        'postgresql://postgres.abcd1234:p%40ss@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
      ),
      'abcd1234',
      '(b)',
    );
    assert.equal(supabaseRefFromDbUrl(direct), 'abcd1234', '(c)');
    assert.equal(supabaseRefFromDbUrl('not a url'), null, '(d)');
    assert.equal(
      redactUrl(direct),
      'postgresql://postgres:***@db.abcd1234.supabase.co:5432/postgres',
      '(e)',
    );
    assert.equal(supabaseRefFromApiUrl('https://abcd1234.supabase.co/'), 'abcd1234', '(f) trailing slash');
    assert.equal(supabaseRefFromApiUrl('http://abcd1234.supabase.co'), null, '(f) http');
    assert.equal(supabaseRefFromApiUrl('https://abcd1234.supabase.co.evil.test'), null, '(f) other host');

    assert.deepEqual(
      safeLines(
        [
          'ERROR: relation exists',
          'at postgresql://postgres.prodref123:S3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
          'duplicate key for owner.test@example.com',
          'password p@ss/x rejected',
        ],
        ['S3cret', 'owner.test@example.com', 'p@ss/x'],
      ),
      [
        'ERROR: relation exists',
        'at postgresql://postgres.prodref123:***@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
      ],
      '(g)',
    );
    const many = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`);
    assert.deepEqual(safeLines(many, []), many.slice(5), '(h)');
    assert.deepEqual(safeLines(['abc'], ['']), ['abc'], '(i)');
  });

  test('EZD-023c DECRYPTED_ENTRIES lists only the four values the release reads', async () => {
    const { DECRYPTED_ENTRIES } = await loadEnv();
    assert.ok(Object.isFrozen(DECRYPTED_ENTRIES));
    assert.deepEqual(
      [...DECRYPTED_ENTRIES],
      [
        { key: 'NEXT_PUBLIC_SUPABASE_URL', target: 'production' },
        { key: 'NEXT_PUBLIC_SUPABASE_URL', target: 'preview' },
        { key: 'EMAIL_TRANSPORT', target: 'preview' },
        { key: 'AI_MODE', target: 'preview' },
      ],
    );
  });
});
