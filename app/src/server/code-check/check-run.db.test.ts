// EZD-611a (AC-EZD-611a-1..4; CLAUDE.md rule 4): code_rule and code_check_run under RLS, record_code_check_run and
// checkProject. Expected values: 03e code_rule (company rules belong to one company), 03c code_check_run, R19 (every
// rule is unverified until a licensed person checks it), the v1 edition fbc9_nec2023 (Q-0220; EZD-613) and the
// migration header (20261123100050_create_code_check_run.sql: Run code check and sight of the project, 42501; a bad
// edition, results or checkpoint, 22023). Calls go through the gated serverDb of `signIn`, as the routes do.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRuleRegistry, type CodeRule, type ModelDocument, type ModelObject } from '@ezdraft/geometry';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import { checkProject, recordCodeCheckRun } from './check-run';

const FBC9 = 'fbc9_nec2023';
const LEVEL = '00000000-0000-4000-8000-00000000a611';
const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

async function admin(table: string, op: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await op;
  if (error) throw new Error(`${table}: ${JSON.stringify(error)}`);
}

const companyRule = (tenantId: string, ruleId: string, verified: boolean) => ({
  tenant_id: tenantId,
  rule_id: ruleId,
  rule_group: 'Company rules',
  code: 'company',
  title: 'Company rule',
  applies_to: 'Rooms',
  check_text: 'Company check.',
  rule_type: 'automatic',
  rule_trigger: 'new_work',
  source: 'company',
  verified_at: verified ? new Date().toISOString() : null,
});

// A new bath with no ceiling: the test rules below return cannot-check for it.
const bath: ModelObject = {
  id: randomUUID(),
  type: 'room',
  data: {
    geometry: {
      boundary: [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 96 },
      ],
    },
    status: 'new',
    level: LEVEL,
    attributes: {
      name: 'Bath 2',
      floorLevel: 0,
      photos: [],
      roomType: 'bath',
      floorFinish: '',
      ceilingType: null,
      ceiling: null,
    },
    closureOverride: null,
  },
};
const model: ModelDocument = { objects: [bath] };

const testRule = (id: string): CodeRule => ({
  id,
  code: 'company',
  type: 'needs_data',
  trigger: 'new_work',
  sections: { [FBC9]: 'Company 1' },
  url: null,
  appliesTo: ['room'],
  test: (o) => (o.type === 'room' && o.data.attributes.ceiling === null ? { status: 'missing', need: 'ceiling height' } : { status: 'pass' }),
});

describe('EZD-611a code_rule, code_check_run and record_code_check_run', () => {
  let tenantA = '';
  let tenantB = '';
  let projectA = '';
  let projectA2 = '';
  let projectB = '';
  let versionA = '';
  let versionA2 = '';
  let checker: Session; // tenant A, all projects, run_code_check
  let plain: Session; // tenant A, all projects, no run_code_check
  let listed: Session; // tenant A, run_code_check, sees projectA only
  let checkerB: Session; // tenant B, run_code_check

  const record = (s: Session, project: string, version: string | null, edition: unknown, warnings: unknown) =>
    db(s).rpc('record_code_check_run', {
      p_project: project,
      p_model_version: version as string,
      p_edition: edition as string,
      p_warnings: warnings as never,
    });

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    [projectA, projectA2] = await createProjects(tenantA, 2);
    [projectB] = await createProjects(tenantB, 1);
    const version = async (project: string, tenant: string) => {
      const { data, error } = await adminDb()
        .from('model_version')
        .insert({ project_id: project, tenant_id: tenant, model_json: { objects: [] }, schema_version: 1 })
        .select('id')
        .single();
      if (error) throw new Error(JSON.stringify(error));
      return (data as { id: string }).id;
    };
    versionA = await version(projectA, tenantA);
    versionA2 = await version(projectA2, tenantA);

    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['view_projects', 'run_code_check']);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, ['view_projects', 'edit_model']);
    const m3 = await createMember({ tenantId: tenantA, scope: 'listed', listed: [projectA] });
    await setPermissions(tenantA, m3.membershipId, ['view_projects', 'run_code_check']);
    const m4 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m4.membershipId, ['view_projects', 'run_code_check']);
    checker = await signIn(m1.email);
    plain = await signIn(m2.email);
    listed = await signIn(m3.email);
    checkerB = await signIn(m4.email);

    await admin(
      'code_rule',
      adminDb()
        .from('code_rule')
        .insert([
          companyRule(tenantA, 'CO-611A-1', true),
          companyRule(tenantA, 'CO-611A-2', false),
          companyRule(tenantB, 'CO-611A-2', true),
        ]),
    );
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  describe('code_rule', () => {
    it('every member reads the catalog rules, every one unverified (R19)', async () => {
      for (const s of [checker, checkerB]) {
        const all = await db(s).from('code_rule').select('id', { count: 'exact', head: true }).is('tenant_id', null);
        expect(all.error).toBeNull();
        expect(all.count).toBe(1248);
        const verified = await db(s)
          .from('code_rule')
          .select('id', { count: 'exact', head: true })
          .is('tenant_id', null)
          .not('verified_at', 'is', null);
        expect(verified.count).toBe(0);
      }
    });

    it("a member reads their own company's rules, not another company's", async () => {
      const { data } = await db(checker).from('code_rule').select('rule_id, tenant_id').eq('code', 'company');
      expect(data?.map((r) => r.rule_id).sort()).toEqual(['CO-611A-1', 'CO-611A-2']);
      expect(new Set(data?.map((r) => r.tenant_id))).toEqual(new Set([tenantA]));
    });

    it('a member cannot change, add or remove a catalog rule', async () => {
      const upd = await db(checker)
        .from('code_rule')
        .update({ verified_at: new Date().toISOString() })
        .eq('rule_id', 'R3-053')
        .is('tenant_id', null)
        .select('id');
      expect(upd.data ?? []).toEqual([]);
      const del = await db(checker).from('code_rule').delete().eq('rule_id', 'R3-053').is('tenant_id', null).select('id');
      expect(del.data ?? []).toEqual([]);
      const ins = await db(checker).from('code_rule').insert({ ...companyRule(tenantA, 'CO-611A-9', true) });
      expect(ins.error?.code).toBe('42501');
      const [row] = await harnessSql()`
        select verified_at from public.code_rule where rule_id = 'R3-053' and tenant_id is null`;
      expect(row?.verified_at).toBeNull();
    });
  });

  describe('record_code_check_run', () => {
    it('stores a run a member of the project reads back', async () => {
      const warnings = [{ ruleId: 'R3-053', status: 'fail' }];
      const r = await record(checker, projectA, versionA, FBC9, warnings);
      expect(r.error).toBeNull();
      const { data } = await db(listed).from('code_check_run').select('*').eq('id', r.data as string).single();
      expect(data).toMatchObject({
        tenant_id: tenantA,
        project_id: projectA,
        model_version_id: versionA,
        edition: FBC9,
        warnings,
        accepted_notes: [],
      });
    });

    it('stores an on-demand run with no checkpoint', async () => {
      const r = await record(checker, projectA, null, FBC9, []);
      expect(r.error).toBeNull();
    });

    it('refuses a member without Run code check', async () => {
      expect((await record(plain, projectA, null, FBC9, [])).error?.code).toBe('42501');
    });

    it('refuses a project the member cannot see', async () => {
      expect((await record(listed, projectA2, null, FBC9, [])).error?.code).toBe('42501');
      expect((await record(checkerB, projectA, null, FBC9, [])).error?.code).toBe('42501');
      expect((await record(checker, projectB, null, FBC9, [])).error?.code).toBe('42501');
    });

    it("refuses an unknown edition, results that are not a list, or another project's checkpoint", async () => {
      expect((await record(checker, projectA, null, 'fbc7_nec2017', [])).error?.code).toBe('22023');
      expect((await record(checker, projectA, null, FBC9, { ruleId: 'x' })).error?.code).toBe('22023');
      expect((await record(checker, projectA, versionA2, FBC9, [])).error?.code).toBe('22023');
    });

    it('a member cannot write code_check_run directly', async () => {
      const ins = await db(checker)
        .from('code_check_run')
        .insert({ tenant_id: tenantA, project_id: projectA, edition: FBC9, warnings: [] });
      expect(ins.error?.code).toBe('42501');
    });

    it('recordCodeCheckRun returns the new id', async () => {
      const id = await recordCodeCheckRun(db(checker), {
        projectId: projectA,
        modelVersionId: null,
        edition: FBC9,
        results: [],
      });
      const { data } = await db(checker).from('code_check_run').select('id').eq('id', id);
      expect(data).toEqual([{ id }]);
    });
  });

  describe('checkProject', () => {
    const registry = () =>
      createRuleRegistry([{ code: 'company', edition: FBC9, rules: [testRule('CO-611A-1'), testRule('CO-611A-2')] }]);

    it("runs the project's edition, tags only unverified rules and stores the run", async () => {
      const out = await checkProject(db(checker), { projectId: projectA, model, registry: registry() });
      expect(out?.edition).toBe(FBC9);
      // CO-611A-1 is verified in this company; CO-611A-2 only in tenant B's, so here it stays unverified.
      expect(out?.results.map((r) => [r.ruleId, r.status, r.need, r.unverified, r.severity])).toEqual([
        ['CO-611A-1', 'cannot_check', 'ceiling height', false, 'warning'],
        ['CO-611A-2', 'cannot_check', 'ceiling height', true, 'warning'],
      ]);
      const [row] = await harnessSql()`select warnings from public.code_check_run where id = ${out?.runId as string}::uuid`;
      expect(row?.warnings).toEqual(JSON.parse(JSON.stringify(out?.results)));
    });

    it('a rule set of another edition does not run', async () => {
      const other = createRuleRegistry([{ code: 'company', edition: 'fbc8_nec2020', rules: [testRule('CO-611A-1')] }]);
      const out = await checkProject(db(checker), { projectId: projectA, model, registry: other });
      expect(out?.results).toEqual([]);
    });

    it('a project the member cannot see reads as null', async () => {
      expect(await checkProject(db(listed), { projectId: projectA2, model, registry: registry() })).toBeNull();
    });
  });

  describeTenantIsolation('code_rule', {
    makeRow: (t) => companyRule(t, `CO-ISO-${randomUUID().slice(0, 8)}`, false),
    update: { title: 'Changed' },
  });

  describeTenantIsolation('code_check_run', {
    makeRow: (t, ctx) => ({ tenant_id: t, project_id: ctx.projectIds[0], edition: FBC9, warnings: [] }),
    update: { warnings: [{ changed: true }] },
  });
});
