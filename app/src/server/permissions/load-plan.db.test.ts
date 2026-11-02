// EZD-285 M1–M6 (vault/plans/EZD-285.md section 4; AC-EZD-285-2). Local stack. Each case creates a function
// in pg_temp inside withRollback, explains it with explainLoad (section 3) and judges the load with
// loadPlanProblems. Expected values: section 4 rows M1–M6, from the section 1 rules and the section 2 probes.
// Z is the section 4 value '00000000-0000-0000-0000-000000000001'::uuid.
import { afterAll, describe, expect, it } from 'vitest';
import { withRollback } from '../../../test-harness/rls/db';
import { closeHarness, harnessSql } from '../../../test-harness/rls/fixtures';
import { explainLoad, loadPlanProblems } from '../../../test-harness/permissions/load-plan';

const Z = `'00000000-0000-0000-0000-000000000001'::uuid`;

describe('EZD-285 D3 still fails a load that is not one indexed query', () => {
  afterAll(async () => {
    await closeHarness();
  }, 60000);

  it('M1 a single-statement load with an unindexed read of user_permission gives unindexed:user_permission', async () => {
    const problems = await withRollback(harnessSql(), async (tx) => {
      await tx.unsafe(
        `create function pg_temp.m1() returns setof text language sql stable as $$ select up.permission_key from public.user_permission up where up.granted $$`,
      );
      const load = await explainLoad(tx, 'pg_temp.m1()');
      return loadPlanProblems(load);
    });
    expect(problems).toEqual(['unindexed:user_permission']);
  });

  it('M2 a plpgsql body gives language:plpgsql', async () => {
    const problems = await withRollback(harnessSql(), async (tx) => {
      await tx.unsafe(
        `create function pg_temp.m2() returns setof uuid language plpgsql stable as $$ begin return query select m.id from public.membership m where m.id = ${Z}; end $$`,
      );
      const load = await explainLoad(tx, 'pg_temp.m2()');
      return loadPlanProblems(load);
    });
    expect(problems).toEqual(['language:plpgsql']);
  });

  it('M3 two statements give statements:2 and the second table is not scanned by the plan', async () => {
    const result = await withRollback(harnessSql(), async (tx) => {
      await tx.unsafe(
        `create function pg_temp.m3() returns setof uuid language sql stable as $$ select m.id from public.membership m where m.id = ${Z}; select mp.project_id from public.membership_project mp where mp.membership_id = ${Z} $$`,
      );
      const load = await explainLoad(tx, 'pg_temp.m3()');
      return { statements: load.statements, problems: loadPlanProblems(load) };
    });
    expect(result.statements).toBe(2);
    expect(result.problems).toEqual(['not_scanned:membership_project', 'statements:2']);
  });

  it('M4 a call to public.current_app_user_id() gives unsupported:public.current_app_user_id', async () => {
    const problems = await withRollback(harnessSql(), async (tx) => {
      await tx.unsafe(
        `create function pg_temp.m4() returns setof uuid language sql stable as $$ select public.current_app_user_id() $$`,
      );
      const load = await explainLoad(tx, 'pg_temp.m4()');
      return loadPlanProblems(load);
    });
    expect(problems).toEqual(['unsupported:public.current_app_user_id']);
  });

  it('M5 a quoted public name gives unsupported:"', async () => {
    const problems = await withRollback(harnessSql(), async (tx) => {
      await tx.unsafe(
        `create function pg_temp.m5() returns setof uuid language sql stable as $$ select m.id from "public"."membership" m $$`,
      );
      const load = await explainLoad(tx, 'pg_temp.m5()');
      return loadPlanProblems(load);
    });
    expect(problems).toEqual(['unsupported:"']);
  });

  it('M6 an upper-case PUBLIC name is read from the real table and gives not_cloned:public.membership', async () => {
    const result = await withRollback(harnessSql(), async (tx) => {
      await tx.unsafe(
        `create function pg_temp.m6() returns setof uuid language sql stable as $$ select m.id from PUBLIC.membership m where m.id = ${Z} $$`,
      );
      const load = await explainLoad(tx, 'pg_temp.m6()');
      return { statements: load.statements, problems: loadPlanProblems(load) };
    });
    expect(result.statements).toBe(1);
    expect(result.problems).toEqual(['not_cloned:public.membership']);
  });
});
