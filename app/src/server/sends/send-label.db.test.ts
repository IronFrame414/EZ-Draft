// EZD-719 (AC-EZD-719-1 "A client send before permit is labeled Version 1"; S13 Controls "Send to client ...
// numbered Version N before Rev 0, Rev N after"; S13 rule 12; R24 #26; 09h Revision rules; 03c permit_revision
// sent_to). Expected values: R24 #26 and 09p Numbering (the first client send of a project is Version 1);
// vault/build/assumptions/EZD-719.md Settled (after Rev 0 a client send is the next Rev N, a permit_revision row
// sent_to 'client', with Send to client only; the send records the Sheets screen's set; a send never changes
// project.status, Q-0700 05).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
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
import { sendLabel, type SendSet } from '../../lib/sends/sends';
import { issuePermitSet, loadPermitRevisions } from '../sheets/issue-revision';
import { sendToClient } from './sends';

const SEND = ['view_projects', 'edit_model', 'send_to_client'] as const;
const ENV = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: 'EZ Draft Test <test@example.test>' };
const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

describe('EZD-719 send set to client (database)', () => {
  let tenant = '';
  let pBefore = '';
  let pAfter = '';
  let issuer: Session;
  let sender: Session;

  const send = async (s: Session, projectId: string, set: SendSet | null = null) => {
    const r = await sendToClient(db(s), { projectId, note: null, set }, { env: ENV, requestIp: async () => null, kick: () => {} });
    if (!r.ok) throw new Error('send refused: ' + r.code);
    return r.send;
  };
  const issue = async (projectId: string) => {
    const r = await issuePermitSet(db(issuer), { projectId, description: null, electrical: null, ip: null });
    if (!r.ok) throw new Error('issue refused: ' + r.code);
    return r;
  };
  const status = async (projectId: string) =>
    (await harnessSql()<{ status: string }[]>`select status from public.project where id = ${projectId}::uuid`)[0]!
      .status;
  const revisions = (projectId: string) =>
    harnessSql()<{ rev_no: number; sent_to: string; model_version_id: string }[]>`
      select rev_no, sent_to, model_version_id from public.permit_revision
      where project_id = ${projectId}::uuid order by rev_no`;

  let release: () => Promise<void>;

  beforeAll(async () => {
    // EZD-2032: set sends enqueue job rows (queue-lock.ts).
    release = await holdJobQueueShared();
    tenant = await createTenant();
    [pBefore, pAfter] = await createProjects(tenant, 2);
    const sql = harnessSql();
    const [c] = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${tenant}::uuid, 'Zed Co', 'zedco@example.test') returning id`;
    await sql`update public.project set customer_id = ${c!.id}::uuid where tenant_id = ${tenant}::uuid`;
    const a = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, a.membershipId, [...SEND, 'issue_permit_sets', 'issue_revisions']);
    const b = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, b.membershipId, [...SEND]);
    issuer = await signIn(a.email);
    sender = await signIn(b.email);
  }, 180000);

  afterAll(async () => {
    try {
      await cleanup();
      await closeHarness();
    } finally {
      await release?.();
    }
  });

  it('AC-EZD-719-1 @smoke a client send before permit is labeled Version 1', async () => {
    const before = await status(pBefore);
    const sent = await send(sender, pBefore, { kind: 'permit', id: null });
    expect(sent.versionNo).toBe(1);
    expect(sent.revNo).toBeNull();
    expect(sendLabel(sent)).toEqual({ kind: 'version', no: 1 });
    // Before Rev 0 a send writes no revision.
    expect(await revisions(pBefore)).toEqual([]);
    const logs = await harnessSql()<{ details: Record<string, unknown> }[]>`
      select details from public.event_log where object_id = ${pBefore}::uuid and action = 'version.sent'`;
    expect(logs).toHaveLength(1);
    expect(logs[0]!.details).toMatchObject({ version_no: 1, rev_no: null });
    const [row] = await harnessSql()<{ sheet_set_kind: string | null; sheet_set_id: string | null }[]>`
      select sheet_set_kind, sheet_set_id from public.sent_package where id = ${sent.id}::uuid`;
    expect(row).toEqual({ sheet_set_kind: 'permit', sheet_set_id: null });
    // Q-0700 05: a send never changes project.status.
    expect(await status(pBefore)).toBe(before);
  });

  it('after Rev 0 a client send is the next Rev, sent to the client, and the next issue counts on from it', async () => {
    expect(sendLabel(await send(sender, pAfter))).toEqual({ kind: 'version', no: 1 });
    const r0 = await issue(pAfter);
    expect(r0.revNo).toBe(0);
    // Send to client alone is enough: no Issue switch.
    const setId = '00000000-0000-4000-8000-000000000719';
    const second = await send(sender, pAfter, { kind: 'client', id: setId });
    expect(second.versionNo).toBe(2);
    expect(second.revNo).toBe(1);
    expect(sendLabel(second)).toEqual({ kind: 'rev', no: 1 });
    expect(await revisions(pAfter)).toEqual([
      { rev_no: 0, sent_to: 'department', model_version_id: r0.modelVersionId },
      { rev_no: 1, sent_to: 'client', model_version_id: second.modelVersionId },
    ]);
    const [row] = await harnessSql()<{ sheet_set_kind: string | null; sheet_set_id: string | null }[]>`
      select sheet_set_kind, sheet_set_id from public.sent_package where id = ${second.id}::uuid`;
    expect(row).toEqual({ sheet_set_kind: 'client', sheet_set_id: setId });
    // The department's next issue never reuses the client's number.
    expect((await issue(pAfter)).revNo).toBe(2);
    const third = await send(sender, pAfter);
    expect([third.versionNo, third.revNo]).toEqual([3, 3]);
    expect((await loadPermitRevisions(db(sender), pAfter)).map((r) => r.revNo)).toEqual([0, 1, 2, 3]);
  });

  it('a set with an unknown kind, or an id with no kind, is refused with nothing written', async () => {
    const count = async () =>
      Number(
        (await harnessSql()<{ n: string }[]>`
          select count(*)::text as n from public.sent_package where project_id = ${pBefore}::uuid`)[0]!.n,
      );
    const before = await count();
    for (const args of [
      { p_sheet_set_kind: 'field' },
      { p_sheet_set_id: '00000000-0000-4000-8000-000000000719' },
    ]) {
      const r = await db(sender).rpc('send_to_client', {
        p_project: pBefore,
        p_token_hash: 'a'.repeat(64),
        p_note: null as never,
        p_expiry_days: 30,
        ...args,
      });
      expect(r.error?.code).toBe('22023');
    }
    expect(await count()).toBe(before);
  });
});
