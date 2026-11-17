// EZD-111 R1, R2 (vault/plans/EZD-111.md section 4; AC-EZD-111-8). Expected values: 03b rule 11 and Q-0700 (the
// link resolves to its sent package only while not expired or revoked); 09p Token #2-#4 (expired, revoked,
// deleted project); D-Resolver (a malformed token makes no database call).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
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
import type { Database } from '../db/database.types';
import { clearStubOutbox } from '../email/test-harness/stub-transport';
import { resolveClientLink } from './resolve';
import { sendToClient } from './sends';

const ENV = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: 'EZ Draft Test <test@example.test>' };

describe('EZD-111 client link resolver', () => {
  let tenant = '';
  let projects: string[] = [];
  let s: Session;

  beforeAll(async () => {
    tenant = await createTenant();
    projects = await createProjects(tenant, 2);
    const sql = harnessSql();
    const [c] = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${tenant}::uuid, 'Zed Co', 'zedco@example.test') returning id`;
    await sql`update public.project set customer_id = ${c.id}::uuid where id in ${sql(projects)}`;
    const sender = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, sender.membershipId, ['view_projects', 'edit_model', 'send_to_client']);
    s = await signIn(sender.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  async function send(projectId: string) {
    clearStubOutbox();
    const r = await sendToClient(
      s.serverDb as unknown as SupabaseClient<Database>,
      { projectId, note: null },
      { env: ENV },
    );
    if (!r.ok) throw new Error(`send failed: ${r.code}`);
    return { send: r.send, token: r.send.link.split('/').pop() as string };
  }

  it('R1 @smoke a sent link resolves to its sent package', async () => {
    const { send: sent, token } = await send(projects[0]);
    const rows = await harnessSql()<{ expires_at: Date }[]>`
      select expires_at from public.sent_package where id = ${sent.id}::uuid`;
    const got = await resolveClientLink(token);
    expect(got).toEqual({
      sentPackageId: sent.id,
      tenantId: tenant,
      projectId: projects[0],
      modelVersionId: sent.modelVersionId,
      kind: 'client',
      expiresAt: expect.any(String),
    });
    expect(Date.parse(got?.expiresAt as string)).toBe(rows[0].expires_at.getTime());
  });

  it('R2 unknown, malformed, expired, revoked and deleted-project links resolve to nothing', async () => {
    // (a) unknown
    expect(await resolveClientLink('Z'.repeat(43))).toBeNull();
    // (b) malformed: no database call
    const rpc = vi.fn();
    expect(await resolveClientLink('short', { rpc } as unknown as SupabaseClient<Database>)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();

    // (c) day 29 resolves, day 31 does not
    const { send: sent, token } = await send(projects[0]);
    const sql = harnessSql();
    await sql`update public.sent_package set expires_at = now() + interval '1 day' where id = ${sent.id}::uuid`;
    expect((await resolveClientLink(token))?.sentPackageId).toBe(sent.id);
    await sql`update public.sent_package set created_at = now() - interval '31 days',
      expires_at = now() - interval '1 second' where id = ${sent.id}::uuid`;
    expect(await resolveClientLink(token)).toBeNull();

    // (d) revoked
    const r2 = await send(projects[0]);
    await sql`update public.sent_package set revoked_at = now() where id = ${r2.send.id}::uuid`;
    expect(await resolveClientLink(r2.token)).toBeNull();

    // (e) the project deleted
    const r3 = await send(projects[1]);
    expect((await resolveClientLink(r3.token))?.projectId).toBe(projects[1]);
    const del = await adminDb().from('project').delete().eq('id', projects[1]);
    expect(del.error).toBeNull();
    expect(await resolveClientLink(r3.token)).toBeNull();
    const left = await sql<{ n: string }[]>`
      select count(*)::text as n from public.sent_package where project_id = ${projects[1]}::uuid`;
    expect(left[0].n).toBe('0');
  });
});
