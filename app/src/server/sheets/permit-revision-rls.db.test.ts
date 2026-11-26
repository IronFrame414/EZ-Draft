// EZD-717 (CLAUDE.md rule 4; 03b rule 1; 03c permit_revision, electrical_calc): one company can never read or change
// another company's issued revisions, stored load calcs or issued PDFs, and never issues on its project. Within a
// company, a member scoped to listed projects sees only those projects' revisions. The exports bucket opens to a
// member only for an issued revision's own job folder (storage_exports_issued_select); every other export stays
// closed.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
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
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import type { Database } from '../db/database.types';
import { attachRevisionExport, issuedPdf, issuePermitSet, loadPermitRevisions } from './issue-revision';

const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;
const ISSUER = ['view_projects', 'edit_model', 'issue_permit_sets', 'issue_revisions'] as const;

const newVersion = async (tenant: string, project: string) => {
  const [v] = await harnessSql()<{ id: string }[]>`
    insert into public.model_version (project_id, tenant_id, model_json, schema_version)
    values (${project}::uuid, ${tenant}::uuid, '{"objects":[]}'::jsonb, 1) returning id`;
  return v!.id;
};

describe('EZD-717 permit_revision and electrical_calc RLS', () => {
  describeTenantIsolation('permit_revision', {
    makeRow: async (t, ctx) => ({
      tenant_id: t,
      project_id: ctx.projectIds[0],
      rev_no: 0,
      model_version_id: await newVersion(t, ctx.projectIds[0]!),
      description: 'Permit set',
    }),
    update: { export_job_id: randomUUID() },
  });

  describeTenantIsolation('electrical_calc', {
    makeRow: async (t, ctx) => ({
      tenant_id: t,
      project_id: ctx.projectIds[0],
      model_version_id: await newVersion(t, ctx.projectIds[0]!),
      case: 'proposed',
      method: 'standard',
      inputs: {},
      results: {},
    }),
    update: { method: 'optional' },
  });

  describe('issue, export record and issued PDF across companies and scopes', () => {
    let tA = '';
    let pA = '';
    let pHidden = '';
    let a: Session;
    let listed: Session;
    let b: Session;
    let revId = '';
    let jobId = '';
    let otherJob = '';

    beforeAll(async () => {
      tA = await createTenant();
      [pA, pHidden] = await createProjects(tA, 2);
      const ma = await createMember({ tenantId: tA, scope: 'all' });
      await setPermissions(tA, ma.membershipId, [...ISSUER]);
      const ml = await createMember({ tenantId: tA, scope: 'listed', listed: [pA] });
      await setPermissions(tA, ml.membershipId, [...ISSUER]);
      const tB = await createTenant();
      const mb = await createMember({ tenantId: tB, scope: 'all' });
      await setPermissions(tB, mb.membershipId, [...ISSUER]);
      a = await signIn(ma.email);
      listed = await signIn(ml.email);
      b = await signIn(mb.email);

      const r = await issuePermitSet(db(a), { projectId: pA, description: null, electrical: null, ip: null });
      if (!r.ok) throw new Error(r.code);
      revId = r.permitRevisionId;
      const jobs = await adminDb()
        .from('job')
        .insert([
          {
            tenant_id: tA,
            project_id: pA,
            kind: 'export',
            payload: {},
            status: 'done',
            max_attempts: 3,
            progress: 100,
            result: {},
          },
          {
            tenant_id: tA,
            project_id: pA,
            kind: 'export',
            payload: {},
            status: 'done',
            max_attempts: 3,
            progress: 100,
            result: {},
          },
        ])
        .select('id');
      if (jobs.error) throw jobs.error;
      [jobId, otherJob] = (jobs.data as { id: string }[]).map((j) => j.id);
      for (const job of [jobId, otherJob]) {
        const up = await adminDb()
          .storage.from('exports')
          .upload(`${tA}/${pA}/${job}/combined.pdf`, new Uint8Array([37, 80, 68, 70]), {
            contentType: 'application/pdf',
          });
        if (up.error) throw up.error;
      }
      await adminDb()
        .from('job')
        .update({
          result: {
            files: [
              {
                name: '336 Golfview Rd buildingplans Rev 0.pdf',
                key: 'combined',
                sheets: ['A0.0'],
                bucket: 'exports',
                path: `${tA}/${pA}/${jobId}/combined.pdf`,
              },
            ],
          },
        })
        .eq('id', jobId);
    }, 180000);

    afterAll(async () => {
      await adminDb()
        .storage.from('exports')
        .remove([`${tA}/${pA}/${jobId}/combined.pdf`, `${tA}/${pA}/${otherJob}/combined.pdf`]);
      await cleanup();
      await closeHarness();
    });

    it("another company's member cannot issue on the project, record its export or see its revisions", async () => {
      expect(await issuePermitSet(db(b), { projectId: pA, description: null, electrical: null, ip: null })).toEqual({
        ok: false,
        code: 'project_not_found',
      });
      await expect(attachRevisionExport(db(b), revId, jobId)).rejects.toMatchObject({ code: 'P0002' });
      expect(await loadPermitRevisions(db(b), pA)).toEqual([]);
      expect(await issuedPdf(db(b), pA, 0)).toBeNull();
      const signed = await b.serverDb.storage.from('exports').createSignedUrl(`${tA}/${pA}/${jobId}/combined.pdf`, 60);
      expect(signed.data).toBeNull();
    });

    it('a listed member sees only the projects it lists', async () => {
      expect(await issuePermitSet(db(listed), { projectId: pHidden, description: null, electrical: null, ip: null }))
        .toEqual({ ok: false, code: 'project_not_found' });
      expect((await loadPermitRevisions(db(listed), pA)).map((r) => r.revNo)).toEqual([0]);
    });

    it("the issue's own export job is recorded once, and only its folder opens to the company's members", async () => {
      await attachRevisionExport(db(a), revId, jobId);
      await expect(attachRevisionExport(db(a), revId, otherJob)).rejects.toMatchObject({ code: 'P0002' });
      const pdf = await issuedPdf(db(listed), pA, 0);
      expect(pdf).toMatchObject({ revNo: 0, status: 'done', file: { name: '336 Golfview Rd buildingplans Rev 0.pdf' } });
      expect(pdf!.file!.url).toContain(`${jobId}/combined.pdf`);
      const other = await a.serverDb.storage.from('exports').createSignedUrl(`${tA}/${pA}/${otherJob}/combined.pdf`, 60);
      expect(other.data).toBeNull();
    });
  });
});
