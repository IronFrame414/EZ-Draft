// EZD-2006 (AC-EZD-2006-1, AC-EZD-2006-3; security audit 2026-11-27 S3): resolve_share_link writes
// share_link.viewed at most once per share link per hour. Further views in that hour return the same result
// and write nothing; a revoked or expired link still resolves to nothing (S18 States, EZD-1201). event_log is
// append-only, so the "older than an hour" case inserts a backdated viewed row through the service-role
// harness (Q-0697: SQL now() cannot be faked; the append-only trigger covers update and delete only).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
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
import { clearStubOutbox } from '../email/test-harness/stub-transport';
import { sendToClient } from '../sends/sends';
import { resolveShareLink, revokeShareLink } from './share-links';

const ENV = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: 'EZ Draft Test <test@example.test>' };
const noIp = async () => null;

async function viewedRows(sentPackageId: string): Promise<number> {
  const rows = await harnessSql()<{ n: number }[]>`
    select count(*)::int as n from public.event_log
    where object_id = ${sentPackageId}::uuid and action = 'share_link.viewed'`;
  return rows[0].n;
}

describe('EZD-2006 client link views are logged at most once per link per hour (database)', () => {
  let tenant = '';
  let projectId = '';
  let companyName = '';
  let s: Session;

  beforeAll(async () => {
    tenant = await createTenant();
    [projectId] = await createProjects(tenant, 1);
    const sql = harnessSql();
    const [t] = await sql<{ name: string }[]>`select name from public.tenant where id = ${tenant}::uuid`;
    companyName = t.name;
    const [c] = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${tenant}::uuid, 'Zed Co', 'zedco@example.test') returning id`;
    await sql`update public.project set customer_id = ${c.id}::uuid where id = ${projectId}::uuid`;
    const sender = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, sender.membershipId, ['view_projects', 'edit_model', 'send_to_client']);
    s = await signIn(sender.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  const db = () => s.serverDb as unknown as SupabaseClient<Database>;

  async function send() {
    clearStubOutbox();
    const r = await sendToClient(db(), { projectId, note: null }, { env: ENV, requestIp: noIp });
    if (!r.ok) throw new Error(`send failed: ${r.code}`);
    return { id: r.send.id, token: r.send.link.split('/').pop() as string };
  }

  async function backdatedView(sentPackageId: string, minutes: number): Promise<void> {
    await harnessSql()`
      insert into public.event_log (tenant_id, action, object_type, object_id, details, at)
      values (${tenant}::uuid, 'share_link.viewed', 'sent_package', ${sentPackageId}::uuid,
        jsonb_build_object('projectId', ${projectId}::text), now() - make_interval(mins => ${minutes}))`;
  }

  it('V1 20 view calls in a row write one event row and each returns the same result', async () => {
    const link = await send();
    const first = await resolveShareLink(link.token, { view: true });
    expect(first).toMatchObject({ status: 'active', sentPackageId: link.id, projectId, company: companyName });
    for (let i = 1; i < 20; i += 1) {
      expect(await resolveShareLink(link.token, { view: true })).toEqual(first);
    }
    expect(await viewedRows(link.id)).toBe(1);
  });

  it('V2 views at the same moment still write one event row', async () => {
    const link = await send();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => resolveShareLink(link.token, { view: true })),
    );
    for (const r of results) expect(r.status).toBe('active');
    expect(await viewedRows(link.id)).toBe(1);
  });

  it('V3 the limit is per link: a second link logs its own view', async () => {
    const a = await send();
    const b = await send();
    await resolveShareLink(a.token, { view: true });
    await resolveShareLink(b.token, { view: true });
    await resolveShareLink(a.token, { view: true });
    expect(await viewedRows(a.id)).toBe(1);
    expect(await viewedRows(b.id)).toBe(1);
  });

  it('V4 a view 59 minutes after the last logged one writes nothing; after 61 minutes it is logged', async () => {
    const recent = await send();
    await backdatedView(recent.id, 59);
    expect((await resolveShareLink(recent.token, { view: true })).status).toBe('active');
    expect(await viewedRows(recent.id)).toBe(1);

    const old = await send();
    await backdatedView(old.id, 61);
    expect((await resolveShareLink(old.token, { view: true })).status).toBe('active');
    expect(await viewedRows(old.id)).toBe(2);
    await resolveShareLink(old.token, { view: true });
    expect(await viewedRows(old.id)).toBe(2);
  });

  it('V5 a revoked or expired link still resolves to nothing and logs no view', async () => {
    const revoked = await send();
    expect((await revokeShareLink(db(), revoked.id)).ok).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      expect(await resolveShareLink(revoked.token, { view: true })).toEqual({ status: 'not_found' });
    }
    expect(await viewedRows(revoked.id)).toBe(0);

    const expired = await send();
    await harnessSql()`update public.sent_package set created_at = now() - interval '31 days',
      expires_at = now() - interval '1 second' where id = ${expired.id}::uuid`;
    for (let i = 0; i < 3; i += 1) {
      expect(await resolveShareLink(expired.token, { view: true })).toEqual({
        status: 'expired',
        company: companyName,
      });
    }
    expect(await viewedRows(expired.id)).toBe(0);
  });
});
