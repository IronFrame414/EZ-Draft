// EZD-152 T7, T8 and T12 (vault/plans/EZD-152.md section 4): `failureLines(err)` of scripts/backup/restore.mjs, the
// lines the restore CLI prints for a failed step, and `scratchPsqlArgs` of scripts/backup/scratch.mjs, the argument
// list of the restore's psql runner (T12 scratch part; the release part of T12 is the edited constants of
// psql-env.test.mjs (EZD-041 T1) and invocations.test.mjs (EZD-023d (h), (l)) and covers `PSQL_ARGS`). Expected values come from the plan's rows and the CLI's current output
// shape (prefix `  | `, then the JSON line). Pure: no Docker, no stack, no network; importing restore.mjs starts
// nothing because its CLI runs only when the file is the entry script.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const loadRestore = () => import('../restore.mjs');
const loadScratch = () => import('../scratch.mjs');

/** `failureLines`, with a clear failure when the export is missing. */
async function loadFailureLines() {
  const mod = await loadRestore();
  assert.equal(typeof mod.failureLines, 'function', 'scripts/backup/restore.mjs exports failureLines');
  return mod.failureLines;
}

describe('EZD-152 restore failure lines', () => {
  // T7 ---------------------------------------------------------------------------------------------------------
  test('EZD-152 done when: a restore failure whose stderr has a CONTEXT row prints no row text', async () => {
    const failureLines = await loadFailureLines();

    const lines = failureLines({
      code: 'data_load_failed',
      masked: [],
      stderr:
        'psql:<stdin>:9: ERROR:  null value in column "name" of relation "project" violates not-null constraint\n' +
        'DETAIL:  Failing row contains (11111111-1111-4111-8111-111111111111, Ana Client, 305 Palm Way).\n' +
        'CONTEXT:  COPY project, line 3: "11111111-1111-4111-8111-111111111111\tAna Client\t305 Palm Way"\n',
    });

    assert.deepEqual(lines, [
      '  | psql:<stdin>:9: ERROR:  null value in column "name" of relation "project" violates not-null constraint',
      '{"ok":false,"code":"data_load_failed"}',
    ]);
    for (const line of lines) {
      for (const text of ['Ana Client', '305 Palm Way']) {
        assert.ok(!line.includes(text), `line ${JSON.stringify(line)} still holds ${text}`);
      }
    }
  });

  // T8 ---------------------------------------------------------------------------------------------------------
  test("EZD-152 failureLines keeps the CLI's other rules", async () => {
    const failureLines = await loadFailureLines();

    // (a) not an object with a code: internal_error, no child lines.
    assert.deepEqual(failureLines(new Error('boom')), ['{"ok":false,"code":"internal_error"}'], '(a)');

    // (b) a code outside ^[a-z][a-z0-9_]{0,63}$ is internal_error; stderr still prints when masked is an array.
    assert.deepEqual(
      failureLines({ code: 'Bad Code', stderr: 'x', masked: [] }),
      ['  | x', '{"ok":false,"code":"internal_error"}'],
      '(b)',
    );

    // (c) a masked value removes the lines holding it.
    assert.deepEqual(
      failureLines({ code: 'scratch_start_failed', stderr: 'key sk_TEST here\nstarted', masked: ['sk_TEST'] }),
      ['  | started', '{"ok":false,"code":"scratch_start_failed"}'],
      '(c)',
    );

    // (d) no masked array: the child's lines are not printed at all.
    assert.deepEqual(
      failureLines({ code: 'data_load_failed', stderr: 'ERROR: y' }),
      ['{"ok":false,"code":"data_load_failed"}'],
      '(d)',
    );
  });

  // T12 (scratch part) ------------------------------------------------------------------------------------------
  test('EZD-152 both psql runners pass VERBOSITY=terse', async () => {
    const mod = await loadScratch();
    assert.equal(typeof mod.scratchPsqlArgs, 'function', 'scripts/backup/scratch.mjs exports scratchPsqlArgs');
    const { scratchPsqlArgs } = mod;

    assert.deepEqual(
      scratchPsqlArgs('c', { user: 'supabase_admin', extra: ['--single-transaction'] }),
      [
        'exec', '-i', 'c', 'psql', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=terse', '--single-transaction',
        '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-t', '-A',
      ],
      '(a) user and extra',
    );
    assert.deepEqual(
      scratchPsqlArgs('c'),
      [
        'exec', '-i', 'c', 'psql', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=terse',
        '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A',
      ],
      '(b) defaults',
    );
    assert.notStrictEqual(scratchPsqlArgs('c'), scratchPsqlArgs('c'), '(c) a new array on every call');
  });
});
