// EZD-111 D1-D9 (vault/plans/EZD-111.md section 4; AC-EZD-111-1 to -7, -9). Expected values: 03d sent_package
// columns; Q-0700 (03, 05, 10 rows: token hash only, recipient read on the server, refused before any write
// without a client, email_sent_at null on a failed email, the holder and lock_epoch unchanged); S15d:46 (Share
// link expiry, 30 days, editable); Q-0706 (day values 1 to 365); 03b rule 8 (holder name and the newest saved
// object's time); Q-0199 (a send never moves project.status); D-Link (appOrigin without Vercel env).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import { EmailInputError } from '../email/send';
import { clearStubOutbox, readStubOutbox } from '../email/test-harness/stub-transport';
import type { SendEmailInput, SendEmailResult } from '../email/types';
import { sendToClient } from './sends';
import { hashClientToken } from './token';

const sentry = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../errors/sentry', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../errors/sentry')>();
  return {
    ...orig,
    captureToSentry: (...args: Parameters<typeof orig.captureToSentry>) => {
      sentry.calls.push(args);
      return null;
    },
  };
});

const SENDER = ['view_projects', 'edit_model', 'send_to_client'] as const;
const ENV = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: 'EZ Draft Test <test@example.test>' };
const FIXTURE_TIME = '2026-11-01T10:00:00Z';

type Row = Record<string, unknown>;

const tokenOf = (link: string) => link.split('/').pop() as string;
const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

async function count(table: string, projectId: string): Promise<number> {
  const rows = await harnessSql().unsafe<{ n: string }[]>(
    `select count(*)::text as n from public.${table} where project_id = $1::uuid`,
    [projectId],
  );
  return Number(rows[0].n);
}

async function packages(projectId: string): Promise<Row[]> {
  return harnessSql()<Row[]>`
    select *, extract(epoch from (expires_at - created_at))::bigint as life_s
    from public.sent_package where project_id = ${projectId}::uuid order by created_at`;
}

const failing = async (input: SendEmailInput): Promise<SendEmailResult> => ({
  status: 'failed',
  errorCode: 'email_provider_error',
  link: input.link.url,
  transport: 'stub',
  messageId: null,
});

describe('EZD-111 send to client (database)', () => {
  let tenant = '';
  let customerId = '';
  let pApproved = '';
  let pDraft = '';
  let pNone = '';
  let pHold = '';
  let pEmpty = '';
  let pFail = '';
  let pDays = '';
  let pUnlisted = '';
  let sender: Member;
  let dana: Member;
  let s: Session;
  let danaS: Session;
  let plainS: Session;
  let listedS: Session;

  beforeAll(async () => {
    tenant = await createTenant();
    [pApproved, pDraft, pNone, pHold, pEmpty, pFail, pDays, pUnlisted] = await createProjects(tenant, 8);
    const sql = harnessSql();
    const [c] = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${tenant}::uuid, 'Zed Co', 'zedco@example.test') returning id`;
    customerId = c.id;
    await sql`update public.project set customer_id = ${customerId}::uuid
      where id in ${sql([pApproved, pDraft, pHold, pEmpty, pFail, pDays, pUnlisted])}`;
    await sql`update public.project set status = 'approved' where id = ${pApproved}::uuid`;
    await sql`update public.project set status = 'draft' where id = ${pDraft}::uuid`;

    sender = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, sender.membershipId, [...SENDER]);
    dana = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, dana.membershipId, [...SENDER]);
    await adminDb().from('app_user').update({ name: 'Dana Holder' }).eq('id', dana.appUserId);
    const plain = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, plain.membershipId, ['view_projects', 'edit_model']);
    const listed = await createMember({ tenantId: tenant, scope: 'listed', listed: [pDraft] });
    await setPermissions(tenant, listed.membershipId, [...SENDER]);

    s = await signIn(sender.email);
    danaS = await signIn(dana.email);
    plainS = await signIn(plain.email);
    listedS = await signIn(listed.email);
  }, 180000);

  beforeEach(() => {
    clearStubOutbox();
    sentry.calls = [];
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  const d1Tokens: string[] = [];

  it('D1 @smoke one send writes one row and one checkpoint, emails the client the link, and leaves the status', async () => {
    const r = await sendToClient(db(s), { projectId: pApproved, note: 'See page 2' }, { env: ENV });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const token = tokenOf(r.send.link);
    d1Tokens.push(token);
    expect(r.send.link).toBe('http://localhost:3000/c/' + token);

    const versions = await harnessSql()<{ id: string }[]>`
      select id from public.model_version where project_id = ${pApproved}::uuid`;
    expect(versions).toHaveLength(1);
    const rows = await packages(pApproved);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.tenant_id).toBe(tenant);
    expect(row.model_version_id).toBe(versions[0].id);
    expect(r.send.modelVersionId).toBe(versions[0].id);
    expect(row.kind).toBe('client');
    expect(row.recipients).toEqual([{ name: 'Zed Co', email: 'zedco@example.test' }]);
    expect(row.note).toBe('See page 2');
    expect(row.token_hash).toBe(hashClientToken(token));
    expect(row.email_sent_at).not.toBeNull();
    expect(row.created_by).toBe(sender.appUserId);
    expect(Number(row.life_s)).toBe(30 * 24 * 3600);
    expect(r.send.emailSent).toBe(true);
    expect(r.send.holder).toBeNull();

    const toClient = readStubOutbox().filter((m) => m.to === 'zedco@example.test');
    expect(toClient).toHaveLength(1);
    expect(toClient[0].text).toContain(r.send.link);

    const r2 = await sendToClient(db(s), { projectId: pDraft, note: null }, { env: ENV });
    expect(r2.ok).toBe(true);
    if (r2.ok) d1Tokens.push(tokenOf(r2.send.link));
    expect((await packages(pDraft))[0].note).toBeNull();

    const statuses = await harnessSql()<{ id: string; status: string }[]>`
      select id, status from public.project where id in (${pApproved}::uuid, ${pDraft}::uuid)`;
    expect(Object.fromEntries(statuses.map((x) => [x.id, x.status]))).toEqual({
      [pApproved]: 'approved',
      [pDraft]: 'draft',
    });
  });

  it('D2 the raw token is in no row of the send tables and in no Sentry report', async () => {
    const r = await sendToClient(db(s), { projectId: pFail, note: null }, { env: ENV, send: failing });
    expect(r.ok).toBe(true);
    const tokens = [...d1Tokens];
    if (r.ok) tokens.push(tokenOf(r.send.link));
    expect(tokens.length).toBe(3);
    for (const table of ['sent_package', 'model_version', 'job', 'notification', 'edit_lock', 'event_log']) {
      for (const token of tokens) {
        const rows = await harnessSql().unsafe<{ n: string }[]>(
          `select count(*)::text as n from public.${table} x where row_to_json(x)::text like $1`,
          [`%${token}%`],
        );
        expect(rows[0].n, `${table} holds a token`).toBe('0');
      }
    }
    for (const args of sentry.calls) {
      const text = JSON.stringify(args, (_k, v: unknown) =>
        v instanceof Error ? { message: v.message, name: v.name } : v,
      );
      for (const token of tokens) expect(text).not.toContain(token);
      expect(text).not.toContain('/c/');
    }
  });

  it('D3 a failed or refused email keeps the row with email_sent_at null and still answers the link; mark is the sender’s, once', async () => {
    let seen = -1;
    const before = (await packages(pFail)).length;
    const a = await sendToClient(
      db(s),
      { projectId: pFail, note: null },
      {
        env: ENV,
        send: async (input) => {
          seen = await count('sent_package', pFail);
          return failing(input);
        },
      },
    );
    expect(seen).toBe(before + 1);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.send.emailSent).toBe(false);
    expect(a.send.link).toMatch(/^http:\/\/localhost:3000\/c\/[A-Za-z0-9_-]{43}$/);

    const b = await sendToClient(
      db(s),
      { projectId: pFail, note: null },
      {
        env: ENV,
        send: async () => {
          throw new EmailInputError();
        },
      },
    );
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.send.emailSent).toBe(false);
    expect(b.send.link).toMatch(/\/c\/[A-Za-z0-9_-]{43}$/);

    const rows = await harnessSql()<{ id: string; email_sent_at: string | null }[]>`
      select id, email_sent_at from public.sent_package where id in (${a.send.id}::uuid, ${b.send.id}::uuid)`;
    expect(rows.map((x) => x.email_sent_at)).toEqual([null, null]);

    const byDana = await danaS.serverDb.rpc('mark_sent_package_emailed', { p_sent_package: a.send.id });
    expect(byDana.error).toBeNull();
    expect(byDana.data).toBe(false);
    const still = await harnessSql()<{ email_sent_at: string | null }[]>`
      select email_sent_at from public.sent_package where id = ${a.send.id}::uuid`;
    expect(still[0].email_sent_at).toBeNull();
    const first = await s.serverDb.rpc('mark_sent_package_emailed', { p_sent_package: a.send.id });
    expect(first.data).toBe(true);
    const second = await s.serverDb.rpc('mark_sent_package_emailed', { p_sent_package: a.send.id });
    expect(second.data).toBe(false);
  });

  it('D4 a project without a client is refused before anything is written', async () => {
    const r = await sendToClient(db(s), { projectId: pNone, note: null }, { env: ENV });
    expect(r).toEqual({ ok: false, code: 'no_client' });
    expect(await count('sent_package', pNone)).toBe(0);
    expect(await count('model_version', pNone)).toBe(0);
    expect(readStubOutbox()).toHaveLength(0);
  });

  it('D5 the function itself refuses a member without Send to client and a project out of scope', async () => {
    const args = {
      p_project: pUnlisted,
      p_token_hash: 'a'.repeat(64),
      p_note: null as unknown as string,
      p_expiry_days: 30,
    };
    const a = await plainS.serverDb.rpc('send_to_client', args);
    expect(a.error?.code).toBe('42501');
    const b = await listedS.serverDb.rpc('send_to_client', args);
    expect(b.error?.code).toBe('P0002');
    expect(await count('sent_package', pUnlisted)).toBe(0);
    expect(await count('model_version', pUnlisted)).toBe(0);
  });

  it('D6 a send by someone who does not hold the lock leaves the lock and names the holder with the newest saved time', async () => {
    const sql = harnessSql();
    const hold = async (projectId: string, holder: string | null) => {
      await sql`insert into public.edit_lock (project_id, tenant_id, lock_epoch, holder_app_user_id, since)
        values (${projectId}::uuid, ${tenant}::uuid, 5, ${holder}::uuid, ${holder === null ? null : sql`now()`})
        on conflict (project_id) do update set lock_epoch = 5, holder_app_user_id = excluded.holder_app_user_id,
          since = excluded.since`;
    };
    await hold(pHold, dana.appUserId);
    await sql`update public.model_object set updated_at = ${FIXTURE_TIME}::timestamptz
      where project_id = ${pHold}::uuid`;
    const objects = await sql<{ object_id: string }[]>`
      select object_id from public.model_object where project_id = ${pHold}::uuid and not deleted`;
    expect(objects.length).toBeGreaterThan(0);

    const r = await sendToClient(db(s), { projectId: pHold, note: null }, { env: ENV });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lock = await sql<{ lock_epoch: number; holder_app_user_id: string }[]>`
      select lock_epoch, holder_app_user_id from public.edit_lock where project_id = ${pHold}::uuid`;
    expect(Number(lock[0].lock_epoch)).toBe(5);
    expect(lock[0].holder_app_user_id).toBe(dana.appUserId);
    expect(r.send.holder?.name).toBe('Dana Holder');
    expect(Date.parse(r.send.holder?.savedAt as string)).toBe(Date.parse(FIXTURE_TIME));
    const v = await sql<{ model_json: { objects: { id: string }[] } }[]>`
      select model_json from public.model_version where id = ${r.send.modelVersionId}::uuid`;
    expect(v[0].model_json.objects.map((o) => o.id).sort()).toEqual(
      objects.map((o) => o.object_id).sort(),
    );

    // (a) no name: the holder's email
    await adminDb().from('app_user').update({ name: null }).eq('id', dana.appUserId);
    const a = await sendToClient(db(s), { projectId: pHold, note: null }, { env: ENV });
    expect(a.ok && a.send.holder?.name).toBe(dana.email);
    await adminDb().from('app_user').update({ name: 'Dana Holder' }).eq('id', dana.appUserId);

    // (b) the sender holds it
    await hold(pHold, sender.appUserId);
    const b = await sendToClient(db(s), { projectId: pHold, note: null }, { env: ENV });
    expect(b.ok && b.send.holder).toBeNull();

    // (c) free
    await hold(pHold, null);
    const c = await sendToClient(db(s), { projectId: pHold, note: null }, { env: ENV });
    expect(c.ok && c.send.holder).toBeNull();

    // (d) Dana holds a project with no objects
    await sql`delete from public.model_object where project_id = ${pEmpty}::uuid`;
    await hold(pEmpty, dana.appUserId);
    const d = await sendToClient(db(s), { projectId: pEmpty, note: null }, { env: ENV });
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.send.holder?.name).toBe('Dana Holder');
      expect(d.send.holder?.savedAt).toBeNull();
    }
  });

  it('D7 the function bounds the days, the hash and the note', async () => {
    const call = (over: Partial<Record<string, unknown>>) =>
      s.serverDb.rpc('send_to_client', {
        p_project: pDays,
        p_token_hash: 'b'.repeat(64),
        p_note: null,
        p_expiry_days: 30,
        ...over,
      });
    expect((await call({ p_expiry_days: 0 })).error?.code).toBe('22023');
    expect((await call({ p_expiry_days: 366 })).error?.code).toBe('22023');
    expect((await call({ p_token_hash: 'A'.repeat(64) })).error?.code).toBe('22023');
    expect((await call({ p_note: '' })).error?.code).toBe('22023');
    expect((await call({ p_note: 'x'.repeat(1001) })).error?.code).toBe('22023');
    expect(await count('sent_package', pDays)).toBe(0);
    const ok = await call({ p_expiry_days: 365 });
    expect(ok.error).toBeNull();
    const rows = await packages(pDays);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].life_s)).toBe(365 * 24 * 3600);
  });

  it('D8 the expiry follows the company Defaults Share link expiry', async () => {
    await harnessSql()`update public.tenant set defaults = defaults || '{"share_link_expiry": 7}'::jsonb
      where id = ${tenant}::uuid`;
    try {
      const r = await sendToClient(db(s), { projectId: pDraft, note: null }, { env: ENV });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const rows = await harnessSql()<{ life_s: string }[]>`
        select extract(epoch from (expires_at - created_at))::bigint::text as life_s
        from public.sent_package where id = ${r.send.id}::uuid`;
      expect(Number(rows[0].life_s)).toBe(7 * 24 * 3600);
    } finally {
      await harnessSql()`update public.tenant set defaults = defaults - 'share_link_expiry'
        where id = ${tenant}::uuid`;
    }
  });

  describeTenantIsolation('sent_package', {
    makeRow: async (tenantId, ctx) => {
      const { data, error } = await adminDb()
        .from('model_version')
        .insert({
          project_id: ctx.projectIds[0],
          tenant_id: tenantId,
          model_json: { objects: [] },
          schema_version: 1,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`model_version insert failed: ${error?.code}`);
      return {
        tenant_id: tenantId,
        project_id: ctx.projectIds[0],
        model_version_id: (data as { id: string }).id,
        kind: 'client',
        recipients: [{ name: 'x', email: 'x@example.test' }],
        token_hash: '0'.repeat(64),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      };
    },
  });
});
