// EZD-1201 (AC-EZD-1201-1, AC-EZD-1201-2). Expected values: S18 States ("Expired: This link has expired. Ask
// [Company] to renew it. Contractor renews for 30 days."); 11 Security ("Share links: random token, 30-day
// expiry, renewable, revocable"); S15d Defaults (Share link expiry 30 days, reminder lead 7 days); 07
// share_link.expiring ("Reminder before 30-day expiry (lead time is a company setting)"); S18 Events emitted
// (share_link.viewed, share_link.expired, share_link.renewed); Q-0700 10 row (Send to client and project scope;
// the token's hash only). Ageing a link backdates created_at and expires_at through the service-role harness
// (Q-0697: SQL now() cannot be faked).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { POST as resolveRoute } from '../../app/api/share-links/resolve/route';
import type { Database } from '../db/database.types';
import { clearStubOutbox } from '../email/test-harness/stub-transport';
import { sendToClient } from '../sends/sends';
import {
  listShareLinks,
  renewShareLink,
  resolveShareLink,
  revokeShareLink,
  sweepShareLinkRemindersWith,
} from './share-links';

const ENV = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: 'EZ Draft Test <test@example.test>' };
const SENDER = ['view_projects', 'edit_model', 'send_to_client'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
// The renew runs on the database clock; allow a minute between it and the test's clock.
const SLACK_MS = 60 * 1000;
const noIp = async () => null;

const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

type EventRow = { action: string; object_type: string; object_id: string; actor_app_user_id: string | null };

async function events(sentPackageId: string): Promise<EventRow[]> {
  return harnessSql()<EventRow[]>`
    select action, object_type, object_id::text, actor_app_user_id::text from public.event_log
    where object_id = ${sentPackageId}::uuid order by at, action`;
}

async function expire(sentPackageId: string): Promise<void> {
  await harnessSql()`update public.sent_package set created_at = now() - interval '31 days',
    expires_at = now() - interval '1 second' where id = ${sentPackageId}::uuid`;
}

async function row(sentPackageId: string) {
  const rows = await harnessSql()<
    { expires_at: Date; renewed_at: Date | null; revoked_at: Date | null; reminder_sent_at: Date | null }[]
  >`select expires_at, renewed_at, revoked_at, reminder_sent_at from public.sent_package
    where id = ${sentPackageId}::uuid`;
  return rows[0];
}

function resolveRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/share-links/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('EZD-1201 share links (database)', () => {
  let tenant = '';
  let otherTenant = '';
  let companyName = '';
  let projects: string[] = [];
  let s: Session;
  let plainS: Session;
  let listedS: Session;
  let otherS: Session;
  let senderId = '';

  beforeAll(async () => {
    tenant = await createTenant();
    otherTenant = await createTenant();
    projects = await createProjects(tenant, 3);
    const sql = harnessSql();
    const [t] = await sql<{ name: string }[]>`select name from public.tenant where id = ${tenant}::uuid`;
    companyName = t.name;
    const [c] = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${tenant}::uuid, 'Zed Co', 'zedco@example.test') returning id`;
    await sql`update public.project set customer_id = ${c.id}::uuid where id in ${sql(projects)}`;

    const sender = await createMember({ tenantId: tenant, scope: 'all' });
    senderId = sender.appUserId;
    await setPermissions(tenant, sender.membershipId, [...SENDER]);
    const plain = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, plain.membershipId, ['view_projects', 'edit_model']);
    const listed = await createMember({ tenantId: tenant, scope: 'listed', listed: [projects[2]] });
    await setPermissions(tenant, listed.membershipId, [...SENDER]);
    const other = await createMember({ tenantId: otherTenant, scope: 'all' });
    await setPermissions(otherTenant, other.membershipId, [...SENDER]);

    s = await signIn(sender.email);
    plainS = await signIn(plain.email);
    listedS = await signIn(listed.email);
    otherS = await signIn(other.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  async function send(projectId = projects[0]) {
    clearStubOutbox();
    const r = await sendToClient(db(s), { projectId, note: null }, { env: ENV, requestIp: noIp });
    if (!r.ok) throw new Error(`send failed: ${r.code}`);
    return { id: r.send.id, token: r.send.link.split('/').pop() as string };
  }

  it('SL1 @smoke an expired token returns the expired response with the company name only (AC-EZD-1201-1)', async () => {
    const link = await send();
    const active = await resolveShareLink(link.token);
    expect(active).toMatchObject({ status: 'active', sentPackageId: link.id, projectId: projects[0] });

    await expire(link.id);
    expect(await resolveShareLink(link.token)).toEqual({ status: 'expired', company: companyName });

    const res = await resolveRoute(resolveRequest({ token: link.token }));
    expect(res.status).toBe(410);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      error: { code: 'share_link_expired', message_key: 'error.share_link_expired' },
      company: companyName,
    });

    // share_link.expired is written with no actor (the client is signed out), on the share link.
    // Once per expiry, however often the expired link is opened.
    const logged = (await events(link.id)).filter((e) => e.action === 'share_link.expired');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ object_type: 'sent_package', actor_app_user_id: null });
  });

  it('SL2 @smoke Renew restores the same link for 30 days (AC-EZD-1201-2)', async () => {
    const link = await send();
    await expire(link.id);
    expect((await resolveShareLink(link.token)).status).toBe('expired');

    const before = Date.now();
    const r = await renewShareLink(db(s), link.id, { requestIp: noIp });
    const after = Date.now();
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const stored = await row(link.id);
    expect(stored.expires_at.getTime()).toBeGreaterThanOrEqual(before + 30 * DAY_MS - SLACK_MS);
    expect(stored.expires_at.getTime()).toBeLessThanOrEqual(after + 30 * DAY_MS + SLACK_MS);
    expect(stored.renewed_at).not.toBeNull();
    expect(Date.parse(r.link.expiresAt)).toBe(stored.expires_at.getTime());

    const again = await resolveShareLink(link.token);
    expect(again).toMatchObject({ status: 'active', sentPackageId: link.id });
    const res = await resolveRoute(resolveRequest({ token: link.token }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      link: { status: 'active', expiresAt: expect.any(String) },
    });

    const renewed = (await events(link.id)).filter((e) => e.action === 'share_link.renewed');
    expect(renewed).toHaveLength(1);
    expect(renewed[0]).toMatchObject({ object_type: 'sent_package', actor_app_user_id: senderId });
  });

  it('SL3 the renew follows the company Defaults Share link expiry', async () => {
    const link = await send();
    await harnessSql()`update public.tenant set defaults = defaults || '{"share_link_expiry": 10}'::jsonb
      where id = ${tenant}::uuid`;
    try {
      const before = Date.now();
      const r = await renewShareLink(db(s), link.id, { requestIp: noIp });
      expect(r.ok).toBe(true);
      const stored = await row(link.id);
      expect(stored.expires_at.getTime()).toBeGreaterThanOrEqual(before + 10 * DAY_MS - SLACK_MS);
      expect(stored.expires_at.getTime()).toBeLessThanOrEqual(Date.now() + 10 * DAY_MS + SLACK_MS);
    } finally {
      await harnessSql()`update public.tenant set defaults = defaults - 'share_link_expiry'
        where id = ${tenant}::uuid`;
    }
  });

  it('SL4 a revoked link is not found and cannot be renewed', async () => {
    const link = await send();
    const r = await revokeShareLink(db(s), link.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await resolveShareLink(link.token)).toEqual({ status: 'not_found' });
    const res = await resolveRoute(resolveRequest({ token: link.token }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'share_link_not_found', message_key: 'error.share_link_not_found' },
    });

    expect(await renewShareLink(db(s), link.id, { requestIp: noIp })).toEqual({ ok: false, code: 'revoked' });
    const second = await revokeShareLink(db(s), link.id);
    expect(second.ok && second.link.revokedAt).toBe(r.link.revokedAt);
  });

  it('SL5 unknown and malformed tokens are not found', async () => {
    expect(await resolveShareLink('Z'.repeat(43))).toEqual({ status: 'not_found' });
    expect(await resolveShareLink('short')).toEqual({ status: 'not_found' });
    expect((await resolveRoute(resolveRequest({ token: 'Z'.repeat(43) }))).status).toBe(404);
    expect((await resolveRoute(resolveRequest({}))).status).toBe(400);
  });

  it('SL6 renew, revoke and list need Send to client and project scope; another company sees nothing', async () => {
    const link = await send(projects[0]);
    for (const session of [plainS]) {
      expect(await renewShareLink(db(session), link.id, { requestIp: noIp })).toEqual({
        ok: false,
        code: 'permission_denied',
      });
      expect(await revokeShareLink(db(session), link.id)).toEqual({ ok: false, code: 'permission_denied' });
      expect(await listShareLinks(db(session), projects[0])).toEqual({ ok: false, code: 'permission_denied' });
    }
    for (const session of [listedS, otherS]) {
      expect(await renewShareLink(db(session), link.id, { requestIp: noIp })).toEqual({
        ok: false,
        code: 'not_found',
      });
      expect(await revokeShareLink(db(session), link.id)).toEqual({ ok: false, code: 'not_found' });
      expect(await listShareLinks(db(session), projects[0])).toEqual({ ok: false, code: 'not_found' });
    }
    const stored = await row(link.id);
    expect(stored.renewed_at).toBeNull();
    expect(stored.revoked_at).toBeNull();
  });

  it('SL7 the Share panel list shows each link on or off, its recipient and expiry, and no token', async () => {
    const live = await send(projects[1]);
    const old = await send(projects[1]);
    await expire(old.id);
    const off = await send(projects[1]);
    await revokeShareLink(db(s), off.id);

    const r = await listShareLinks(db(s), projects[1]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byId = new Map(r.links.map((l) => [l.id, l]));
    expect(byId.get(live.id)).toMatchObject({
      status: 'active',
      recipient: { name: 'Zed Co', email: 'zedco@example.test' },
      versionNo: expect.any(Number),
      renewedAt: null,
      revokedAt: null,
    });
    expect(byId.get(old.id)?.status).toBe('expired');
    expect(byId.get(off.id)?.status).toBe('revoked');
    // Newest first by send time; expire() moved the old link's send 31 days back.
    expect(r.links.map((l) => l.id)).toEqual([off.id, live.id, old.id]);
    const text = JSON.stringify(r.links);
    for (const l of [live, old, off]) expect(text).not.toContain(l.token);
    expect(text).not.toContain('token_hash');
  });

  it('SL8 view records share_link.viewed; a data lookup does not', async () => {
    const link = await send();
    await resolveShareLink(link.token);
    expect((await events(link.id)).filter((e) => e.action === 'share_link.viewed')).toHaveLength(0);
    await resolveShareLink(link.token, { view: true });
    const viewed = (await events(link.id)).filter((e) => e.action === 'share_link.viewed');
    expect(viewed).toHaveLength(1);
    expect(viewed[0]).toMatchObject({ object_type: 'sent_package', actor_app_user_id: null });
  });

  it('SL9 the reminder goes once per link inside the company lead time, and again after a renew', async () => {
    const sql = harnessSql();
    const soon = await send(projects[0]);
    const later = await send(projects[0]);
    const off = await send(projects[0]);
    // Default lead 7 days: 6 days left is inside it, 8 days left is not; a revoked link is never reminded.
    await sql`update public.sent_package set expires_at = now() + interval '6 days' where id = ${soon.id}::uuid`;
    await sql`update public.sent_package set expires_at = now() + interval '8 days' where id = ${later.id}::uuid`;
    await sql`update public.sent_package set expires_at = now() + interval '6 days' where id = ${off.id}::uuid`;
    await revokeShareLink(db(s), off.id);

    const jobs = adminDb() as unknown as SupabaseClient<Database>;
    await sweepShareLinkRemindersWith(jobs);
    expect((await row(soon.id)).reminder_sent_at).not.toBeNull();
    expect((await row(later.id)).reminder_sent_at).toBeNull();
    expect((await row(off.id)).reminder_sent_at).toBeNull();
    await sweepShareLinkRemindersWith(jobs);
    const expiring = (await events(soon.id)).filter((e) => e.action === 'share_link.expiring');
    expect(expiring).toHaveLength(1);
    expect(expiring[0]).toMatchObject({ object_type: 'sent_package', actor_app_user_id: null });
    expect((await events(later.id)).filter((e) => e.action === 'share_link.expiring')).toHaveLength(0);

    // A renew clears the stamp, so the next expiry reminds again.
    await renewShareLink(db(s), soon.id, { requestIp: noIp });
    expect((await row(soon.id)).reminder_sent_at).toBeNull();
    await sql`update public.sent_package set expires_at = now() + interval '1 day' where id = ${soon.id}::uuid`;
    await sweepShareLinkRemindersWith(jobs);
    expect((await events(soon.id)).filter((e) => e.action === 'share_link.expiring')).toHaveLength(2);
  });

  it('SL10 the reminder lead time is the company setting', async () => {
    const sql = harnessSql();
    await sql`update public.tenant set defaults = defaults || '{"share_link_reminder_lead": 3}'::jsonb
      where id = ${tenant}::uuid`;
    try {
      const four = await send(projects[0]);
      const two = await send(projects[0]);
      await sql`update public.sent_package set expires_at = now() + interval '4 days' where id = ${four.id}::uuid`;
      await sql`update public.sent_package set expires_at = now() + interval '2 days' where id = ${two.id}::uuid`;
      await sweepShareLinkRemindersWith(adminDb() as unknown as SupabaseClient<Database>);
      expect((await row(four.id)).reminder_sent_at).toBeNull();
      expect((await row(two.id)).reminder_sent_at).not.toBeNull();
    } finally {
      await sql`update public.tenant set defaults = defaults - 'share_link_reminder_lead'
        where id = ${tenant}::uuid`;
    }
  });

  it('SL11 only the service role runs the reminder sweep', async () => {
    const { error } = await db(s).rpc('sweep_share_link_reminders');
    expect(error?.code).toBe('42501');
  });
});
