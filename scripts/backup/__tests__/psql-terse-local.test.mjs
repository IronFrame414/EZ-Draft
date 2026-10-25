// EZD-152 T13 (vault/plans/EZD-152.md section 4; Steps 2a and 2b; Decided: T13 stack and writes, T13 expected text).
// The restore's psql runner (`scratchPsqlArgs`) against psql 17.11 in the main local stack's database container
// (started by the gate's `db:up`): with `-v VERBOSITY=terse` psql prints only `SEVERITY:  message` lines, never a
// DETAIL, QUERY, CONTEXT or LINE n field. The expected text is the plan's probe recording (section 2, cases 1, 3, 4),
// asserted exactly. Every statement only raises or fails, so nothing is committed (case (c) reads the count back).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { exec, inScope, MAIN_DB_CONTAINER } from './local-fixture.mjs';
import { safeLines } from '../../release/redact.mjs';

const loadScratch = () => import('../scratch.mjs');

const TENANT_ID = '00000000-0000-4000-8000-0000000000aa';
const UUID_ERROR = 'ERROR:  invalid input syntax for type uuid: "Ana Client" at character 8';

/** Runs `input` through psql in the main stack's database container with `args`; stderr as lines (one trailing newline stripped). */
function runPsql(args, input) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8' });
  return {
    status: r.status,
    lines: r.stderr.replace(/\r?\n$/, '').split('\n'),
    stderr: r.stderr,
  };
}

describe('EZD-152 psql row fields on the local stack', { skip: !inScope('EZD-152') }, () => {
  test('EZD-152 psql prints no row field under VERBOSITY=terse', async () => {
    const mod = await loadScratch();
    assert.equal(typeof mod.scratchPsqlArgs, 'function', 'scripts/backup/scratch.mjs exports scratchPsqlArgs');
    const { scratchPsqlArgs } = mod;
    const args = scratchPsqlArgs(MAIN_DB_CONTAINER);

    // (a) the bootstrap's done and already-done codes are primary NOTICE and ERROR lines (probe case 1).
    const a = runPsql(
      args,
      "do $$ begin raise notice 'ezd_bootstrap_done'; end $$;\n" +
        "do $$ begin raise exception 'ezd_bootstrap_already_done'; end $$;\n",
    );
    assert.equal(a.status, 3, `(a) exit status; stderr: ${JSON.stringify(a.stderr)}`);
    assert.deepEqual(a.lines, ['NOTICE:  ezd_bootstrap_done', 'ERROR:  ezd_bootstrap_already_done'], '(a)');

    // (b) a client value in a failing cast: no LINE n, QUERY or CONTEXT (probe case 3); safeLines hides the value.
    const bInput = "do $$ begin perform 'Ana Client'::uuid; end $$;\n";
    const b = runPsql(args, bInput);
    assert.equal(b.status, 3, `(b) exit status; stderr: ${JSON.stringify(b.stderr)}`);
    assert.deepEqual(b.lines, [UUID_ERROR], '(b)');
    assert.deepEqual(
      safeLines(b.lines, []),
      ['ERROR:  invalid input syntax for type uuid: "<value>" at character 8'],
      '(b) safeLines',
    );

    // (c) a not-null violation: no DETAIL "Failing row contains" and no CONTEXT (probe case 4); nothing committed.
    const c = runPsql(
      args,
      `do $$ begin insert into public.tenant (id, name) values ('${TENANT_ID}', null); end $$;\n`,
    );
    assert.equal(c.status, 3, `(c) exit status; stderr: ${JSON.stringify(c.stderr)}`);
    assert.deepEqual(
      c.lines,
      ['ERROR:  null value in column "name" of relation "tenant" violates not-null constraint'],
      '(c)',
    );
    assert.equal(exec(`select count(*) from public.tenant where id = '${TENANT_ID}';`), '0', '(c) no row written');

    // (d) control: the same statement as (b) without the two flag elements prints the fields, so the flag is what
    // removes them.
    const without = [...args];
    const at = without.indexOf('VERBOSITY=terse');
    assert.ok(at >= 1, '(d) the argument list holds VERBOSITY=terse');
    without.splice(at - 1, 2);
    assert.ok(!without.includes('VERBOSITY=terse'), '(d) the control list has no VERBOSITY flag');
    const d = runPsql(without, bInput);
    assert.equal(d.status, 3, `(d) exit status; stderr: ${JSON.stringify(d.stderr)}`);
    for (const label of ['LINE 1:', 'QUERY:', 'CONTEXT:']) {
      assert.equal(
        d.lines.filter((l) => l.startsWith(label)).length,
        1,
        `(d) exactly one line starts ${label}; lines: ${JSON.stringify(d.lines)}`,
      );
    }
  });
});
