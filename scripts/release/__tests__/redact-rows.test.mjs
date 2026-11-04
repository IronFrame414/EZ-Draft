// EZD-152 T1 to T4, T9, T10, T11 (vault/plans/EZD-152.md section 4; Step 2 rules; Q-0288 (a); security-reviewer
// round 1 findings 1 and 2). node:test, pure. `dropRowLines` and `safeLines` of scripts/release/redact.mjs.
// Inputs and expected lines are the plan's rows; the field labels (DETAIL, CONTEXT, QUERY, LINE n, ERROR, HINT,
// NOTICE) are psql's own, English, upper case (plan "Decided for the builder": Field label language, Case of
// labels). A row block runs to the end of the output (Decided: Block end). The EZD-023c T15 cases stay in
// env-check.test.mjs.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const loadRedact = () => import('../redact.mjs');

/** `dropRowLines`, with a clear failure when the export is missing. */
async function loadDropRowLines() {
  const mod = await loadRedact();
  assert.equal(typeof mod.dropRowLines, 'function', 'scripts/release/redact.mjs exports dropRowLines');
  return mod.dropRowLines;
}

/** No element of `lines` holds any of `texts` (a plain boolean test per pair). */
function assertNoneHold(lines, texts, id) {
  for (const line of lines) {
    for (const text of texts) {
      assert.ok(!line.includes(text), `(${id}) output line ${JSON.stringify(line)} still holds ${JSON.stringify(text)}`);
    }
  }
}

describe('EZD-152 psql row lines never reach release, backup or restore output', () => {
  // T1 ---------------------------------------------------------------------------------------------------------
  test('EZD-152 dropRowLines drops DETAIL and CONTEXT', async () => {
    const dropRowLines = await loadDropRowLines();
    const input = Object.freeze([
      'psql:<stdin>:7: ERROR:  duplicate key value violates unique constraint "app_user_email_key"',
      'DETAIL:  Key (email)=(client@example.test) already exists.',
      'CONTEXT:  COPY app_user, line 1: "11111111-1111-4111-8111-111111111111\tclient@example.test\tAna Client"',
    ]);
    const copy = [...input];

    const out = dropRowLines(input);

    assert.deepEqual(out, [
      'psql:<stdin>:7: ERROR:  duplicate key value violates unique constraint "app_user_email_key"',
    ]);
    assert.deepEqual([...input], copy, 'the input list is not changed (pure)');
  });

  // T2 ---------------------------------------------------------------------------------------------------------
  test('EZD-152 dropRowLines drops a row block and every line after it', async () => {
    const dropRowLines = await loadDropRowLines();

    assert.deepEqual(
      dropRowLines([
        'ERROR:  x',
        'CONTEXT:  PL/pgSQL function f() line 3 at RAISE',
        'client@example.test second line',
        'HINT:  y',
        'psql:<stdin>:9: NOTICE:  z',
      ]),
      ['ERROR:  x'],
      'the HINT and NOTICE lines after the block are gone too',
    );
  });

  // T3 ---------------------------------------------------------------------------------------------------------
  test('EZD-152 dropRowLines drops LINE n and its caret', async () => {
    const dropRowLines = await loadDropRowLines();

    assert.deepEqual(
      dropRowLines([
        'psql:<stdin>:3: ERROR:  syntax error at or near "x"',
        "LINE 1: INSERT INTO public.app_user VALUES ('client@example.test', x);",
        `${' '.repeat(65)}^`,
      ]),
      ['psql:<stdin>:3: ERROR:  syntax error at or near "x"'],
      '(a) the LINE n field and its caret line',
    );

    // (b) a list with no row field comes back equal, and as a new array.
    const plain = ['ERROR: relation exists', 'NOTICE: ok'];
    const out = dropRowLines(plain);
    assert.deepEqual(out, ['ERROR: relation exists', 'NOTICE: ok'], '(b) equal');
    assert.notStrictEqual(out, plain, '(b) a new array, not the input');
  });

  // T4 ---------------------------------------------------------------------------------------------------------
  test('EZD-152 safeLines drops row lines before redacting and masking', async () => {
    const { safeLines } = await loadRedact();

    const out = safeLines(
      [
        'ERROR: a',
        'at postgresql://u:S3cret@h:5432/db',
        'NOTICE:  b',
        '  DETAIL:  Failing row contains (Ana Client, S3cret).',
        'HINT:  c',
      ],
      ['S3cret'],
    );
    assert.deepEqual(
      out,
      ['ERROR: a', 'at postgresql://u:***@h:5432/db', 'NOTICE:  b'],
      '(a) the URL line is kept redacted (redactUrl runs before the mask filter); from DETAIL: to the end is gone',
    );
    assertNoneHold(out, ['S3cret', 'Ana Client', 'DETAIL', 'HINT'], 'a');

    // (b) still the last 20 lines (EZD-023c T15 (h)).
    const many = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`);
    assert.deepEqual(safeLines(many, []), many.slice(5), '(b) lines 6-25');
  });

  // T9 ---------------------------------------------------------------------------------------------------------
  test('EZD-152 dropRowLines replaces the quoted value of an ERROR line', async () => {
    const dropRowLines = await loadDropRowLines();

    const out = dropRowLines([
      'psql:<stdin>:4: ERROR:  invalid input syntax for type uuid: "client@example.test"', // (a)
      'ERROR:  invalid input value for enum project_status: "Ana "Client": 305"', // (b)
      'ERROR:  relation "public.app_user" does not exist', // (c)
      'ERROR:  invalid input syntax for type uuid: "Ana Client" at character 8', // (d)
      'ERROR:  bad value: "a b"', // (e) the string holds U+2028
      'NOTICE:  value: "kept"', // (f)
      'ERROR:  malformed array literal: "{Ana', // (g) the quote does not close ...
      'Client}"', // (g) ... so this line and everything after it is gone
      'HINT:  y',
    ]);

    assert.deepEqual(out, [
      'psql:<stdin>:4: ERROR:  invalid input syntax for type uuid: "<value>"',
      'ERROR:  invalid input value for enum project_status: "<value>"',
      'ERROR:  relation "public.app_user" does not exist',
      'ERROR:  invalid input syntax for type uuid: "<value>" at character 8',
      'ERROR:  bad value: "<value>"',
      'NOTICE:  value: "kept"',
      'ERROR:  malformed array literal: "<value>"',
    ]);
    assertNoneHold(out, ['client@example.test', 'Ana', '305', ' '], 'a-g');

    // (h) an opening quote as the last character is the unclosed case.
    assert.deepEqual(dropRowLines(['ERROR:  bad: "', 'next']), ['ERROR:  bad: "<value>"'], '(h)');
  });

  // T10 --------------------------------------------------------------------------------------------------------
  test('EZD-152 dropRowLines drops a QUERY field', async () => {
    const dropRowLines = await loadDropRowLines();

    // (a) QUERY is the first row line.
    const a = dropRowLines([
      'ERROR:  relation "x" does not exist',
      "QUERY:  insert into x values ('Ana Client')",
      'CONTEXT:  PL/pgSQL function inline_code_block line 3 at SQL statement',
    ]);
    assert.deepEqual(a, ['ERROR:  relation "x" does not exist'], '(a)');
    assertNoneHold(a, ['Ana Client', 'QUERY'], 'a');

    // (b) probe case 3 as psql prints it by default.
    const b = dropRowLines([
      'ERROR:  invalid input syntax for type uuid: "Ana Client"',
      "LINE 1: SELECT 'Ana Client'::uuid",
      `${' '.repeat(15)}^`,
      "QUERY:  SELECT 'Ana Client'::uuid",
      'CONTEXT:  PL/pgSQL function inline_code_block line 1 at PERFORM',
    ]);
    assert.deepEqual(b, ['ERROR:  invalid input syntax for type uuid: "<value>"'], '(b)');
    assertNoneHold(b, ['Ana Client', 'QUERY'], 'b');
  });

  // T11 --------------------------------------------------------------------------------------------------------
  test('EZD-152 dropRowLines keeps nothing after a row block, whatever a continuation line starts with', async () => {
    const dropRowLines = await loadDropRowLines();
    const leaked = ['Ana Client', '305 Palm Way', 'INFO', 'LOG', 'NOTICE', 'HINT', 'PL/pgSQL'];

    // (a) the reviewer's probe: a continuation line that starts with a label and a colon.
    const a = dropRowLines([
      'ERROR:  null value in column "name" of relation "project" violates not-null constraint',
      'DETAIL:  Failing row contains (1, Ana Client, first line',
      'INFO: second line, 305 Palm Way).',
      'NOTICE:  z',
      'HINT:  h',
    ]);
    assert.deepEqual(
      a,
      ['ERROR:  null value in column "name" of relation "project" violates not-null constraint'],
      '(a)',
    );
    assertNoneHold(a, leaked, 'a');

    // (b) probe case 5 under terse: the value runs on into a line that starts with a label.
    const b = dropRowLines([
      'ERROR:  invalid input syntax for type integer: "first line',
      'LOG:  second line 305 Palm Way" at character 8',
      'psql:<stdin>:9: NOTICE:  after',
    ]);
    assert.deepEqual(b, ['ERROR:  invalid input syntax for type integer: "<value>"'], '(b)');
    assertNoneHold(b, leaked, 'b');

    // (c) shaped as probe case 4 under the default verbosity; the last line is psql's bare continuation line.
    const c = dropRowLines([
      'ERROR:  null value in column "name" of relation "tenant" violates not-null constraint',
      'DETAIL:  Failing row contains (00000000-0000-4000-8000-0000000000aa, null, null).',
      'CONTEXT:  SQL statement "insert into public.tenant (id, name) values (\'Ana Client\', null)"',
      'PL/pgSQL function inline_code_block line 1 at SQL statement',
    ]);
    assert.deepEqual(
      c,
      ['ERROR:  null value in column "name" of relation "tenant" violates not-null constraint'],
      '(c)',
    );
    assertNoneHold(c, leaked, 'c');
  });
});
