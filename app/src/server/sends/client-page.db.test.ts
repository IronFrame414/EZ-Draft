// EZD-1202 (AC-EZD-1202-1 "The page shows the sent version label and no cost data"; vault/build/assumptions/
// EZD-1202.md Settled rows "Where the page and its data come from", "Version label", "Test for AC-EZD-1202-1"):
// GET /api/c/[token] and the page's loader, against the local database. Expected values:
//   - label: board S18Client "Version 3 · sent Sep 26" (the third send of a project is Version 3, R24 #26); after
//     Rev 0 a client send is the next Rev, "Rev 1" (S13 rule 12; 09h Revision rules; EZD-719 "Numbering").
//   - no cost data: 03b rules 2 and 11; 11 Security "Company costs are never sent to client views": no key of
//     MONEY_FIELDS (EZD-133) and no cost, sell, markup or price key, with a fixture that holds catalog costs and
//     prices and design option cost lines.
//   - states: S18 States "Expired: This link has expired. Ask [Company] to renew it." (company name only); unknown,
//     malformed and revoked links are not found (09p Token #2-#4).
//   - headers: no-store, no-referrer, noindex (Settled row).
import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  anonDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { GET } from '../../app/api/c/[token]/route';
import { versionLabel } from '../../components/client/client-page-model';
import type { Database } from '../db/database.types';
import { MONEY_FIELDS } from '../db/money-fields';
import { clearStubOutbox } from '../email/test-harness/stub-transport';
import { loadClientPage } from './client-page';
import { hashClientToken } from './token';
import { sendToClient } from './sends';

const ENV = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: 'EZ Draft Test <test@example.test>' };
const SEP_26 = '2026-09-26T16:00:00Z';

const norm = (k: string) => k.toLowerCase().replace(/[_-]/g, '');
const MONEY_KEYS = new Set(MONEY_FIELDS.flatMap((f) => [norm(f.column), ...f.responseKeys.map(norm)]));

function keysOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) keysOf(v, out);
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysOf(v, out);
    }
  }
  return out;
}

const address = () => `198.19.${randomInt(0, 256)}.${randomInt(1, 255)}`;

async function get(token: string): Promise<Response> {
  return GET(
    new Request(`http://localhost:3000/api/c/${token}`, { headers: { 'x-forwarded-for': address() } }),
    { params: Promise.resolve({ token }) },
  );
}

describe('EZD-1202 client page data', () => {
  let tenant = '';
  let other = '';
  let projects: string[] = [];
  let otherProjects: string[] = [];
  let s: Session;
  let so: Session;

  async function send(session: Session, projectId: string) {
    clearStubOutbox();
    const r = await sendToClient(
      session.serverDb as unknown as SupabaseClient<Database>,
      { projectId, note: null },
      { env: ENV },
    );
    if (!r.ok) throw new Error(`send failed: ${r.code}`);
    return { send: r.send, token: r.send.link.split('/').pop() as string };
  }

  async function setup(name: string, n: number) {
    const t = await createTenant();
    const ps = await createProjects(t, n);
    const sql = harnessSql();
    await sql`update public.tenant set name = ${name},
      contact = '{"phone": "(904) 555-0100", "email": "office@example.test"}'::jsonb where id = ${t}::uuid`;
    const [c] = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${t}::uuid, 'Pat Hendricks', ${`pat-${randomUUID()}@example.test`}) returning id`;
    await sql`update public.project set customer_id = ${c.id}::uuid, name = 'Hendricks kitchen'
      where id = ${ps[0]}::uuid`;
    await sql`update public.project set customer_id = ${c.id}::uuid where id in ${sql(ps)}`;
    const sender = await createMember({ tenantId: t, scope: 'all' });
    await setPermissions(t, sender.membershipId, ['view_projects', 'edit_model', 'send_to_client']);
    return { t, ps, session: await signIn(sender.email) };
  }

  beforeAll(async () => {
    const a = await setup('Worth Properties', 3);
    tenant = a.t;
    projects = a.ps;
    s = a.session;
    const b = await setup('Other Builders', 1);
    other = b.t;
    otherProjects = b.ps;
    so = b.session;
    const sql = harnessSql();
    // Cost data the page must never carry (catalog costs and prices, design option cost lines).
    await sql`insert into public.catalog_item
      (tenant_id, category, subcategory, line, name, model, width, depth, height, unit_cost, sell_price, markup_pct)
      values (${tenant}::uuid, 'cabinets', 'sink_base', 'Shaker', 'Sink base', 'SB36', 36, 24, 34.5, 412.5, 577.75, 40)`;
    await sql`insert into public.design_option_cost_line (tenant_id, project_id, option_id, item, qty, unit_cost, sort)
      values (${tenant}::uuid, ${projects[0]}::uuid, ${randomUUID()}::uuid, 'Three beams', 3, 412.5, 0)`;
  }, 240000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-EZD-1202-1 @smoke the page shows the sent version label: the third send is "Version 3 · sent Sep 26"', async () => {
    await send(s, projects[0]);
    await send(s, projects[0]);
    const { send: sent, token } = await send(s, projects[0]);
    expect(sent.versionNo).toBe(3);
    await harnessSql()`update public.sent_package set created_at = ${SEP_26}::timestamptz where id = ${sent.id}::uuid`;

    const res = await get(token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { page: Record<string, unknown> };
    expect(body.page).toMatchObject({
      company: 'Worth Properties',
      contact: { phone: '(904) 555-0100', email: 'office@example.test' },
      project: { name: 'Hendricks kitchen' },
      version: { kind: 'version', no: 3 },
      reminderLeadDays: 7,
      sharesSheets: false,
    });
    const version = body.page.version as { kind: 'version'; no: number; sentAt: string };
    expect(Date.parse(version.sentAt)).toBe(Date.parse(SEP_26));
    const label = versionLabel(version, 'America/New_York');
    expect(label).toEqual({ key: 'client.version_sent', params: { n: 3, date: 'Sep 26' } });
  });

  it('AC-EZD-1202-1 the page carries no cost data: no money field, no cost, sell, markup or price key', async () => {
    const { token } = await send(s, projects[0]);
    const res = await get(token);
    expect(res.status).toBe(200);
    const text = await res.text();
    const keys = keysOf(JSON.parse(text));
    expect(keys.length).toBeGreaterThan(5);
    expect(keys.filter((k) => MONEY_KEYS.has(norm(k)))).toEqual([]);
    expect(keys.filter((k) => /cost|sell|markup|price/i.test(k))).toEqual([]);
    expect(text).not.toContain('412.5');
    expect(text).not.toContain('577.75');
    // The page itself renders from the same loader.
    const loaded = await loadClientPage(token);
    expect(keysOf(loaded).filter((k) => /cost|sell|markup|price/i.test(k) || MONEY_KEYS.has(norm(k)))).toEqual([]);
  });

  it('after Rev 0 a client send is labelled "Rev 1 · sent {date}"', async () => {
    const first = await send(s, projects[1]);
    await harnessSql()`insert into public.permit_revision (tenant_id, project_id, rev_no, model_version_id, sent_to)
      values (${tenant}::uuid, ${projects[1]}::uuid, 0, ${first.send.modelVersionId}::uuid, 'department')`;
    const { send: sent, token } = await send(s, projects[1]);
    expect(sent.revNo).toBe(1);
    await harnessSql()`update public.sent_package set created_at = ${SEP_26}::timestamptz where id = ${sent.id}::uuid`;
    const r = await loadClientPage(token);
    expect(r.status).toBe('active');
    if (r.status !== 'active') return;
    expect(r.page.version.kind).toBe('rev');
    expect(r.page.version.no).toBe(1);
    expect(versionLabel(r.page.version, 'America/New_York')).toEqual({
      key: 'client.rev_sent',
      params: { n: 1, date: 'Sep 26' },
    });
  });

  it("the company's reminder lead comes with the page (Defaults share_link_reminder_lead)", async () => {
    await harnessSql()`update public.tenant set defaults = defaults || '{"share_link_reminder_lead": 3}'::jsonb
      where id = ${tenant}::uuid`;
    try {
      const { token } = await send(s, projects[2]);
      const r = await loadClientPage(token);
      expect(r.status === 'active' && r.page.reminderLeadDays).toBe(3);
    } finally {
      await harnessSql()`update public.tenant set defaults = defaults - 'share_link_reminder_lead'
        where id = ${tenant}::uuid`;
    }
  });

  it('every answer is no-store, no-referrer and noindex', async () => {
    const { token } = await send(s, projects[0]);
    for (const res of [await get(token), await get('Z'.repeat(43))]) {
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('x-robots-tag')).toBe('noindex');
    }
  });

  it('an expired link answers 410 with the company name only', async () => {
    const { send: sent, token } = await send(s, projects[2]);
    await harnessSql()`update public.sent_package set created_at = now() - interval '2 days', expires_at = now() - interval '1 minute'
      where id = ${sent.id}::uuid`;
    const res = await get(token);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: { code: 'share_link_expired', message_key: 'error.share_link_expired' },
      company: 'Worth Properties',
    });
    expect(await loadClientPage(token)).toEqual({ status: 'expired', company: 'Worth Properties' });
  });

  it('unknown, malformed and revoked links answer 404 share_link_not_found', async () => {
    const { send: sent, token } = await send(s, projects[2]);
    await harnessSql()`update public.sent_package set revoked_at = now() where id = ${sent.id}::uuid`;
    for (const t of [token, 'Z'.repeat(43), 'short']) {
      const res = await get(t);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('share_link_not_found');
    }
  });

  it("one company's link shows that company's send only", async () => {
    const mine = await send(s, projects[0]);
    const theirs = await send(so, otherProjects[0]);
    const a = await loadClientPage(mine.token);
    const b = await loadClientPage(theirs.token);
    expect(a.status === 'active' && a.page.company).toBe('Worth Properties');
    expect(b.status === 'active' && b.page.company).toBe('Other Builders');
    expect(JSON.stringify(b)).not.toContain('Worth Properties');
    expect(other).not.toBe(tenant);
  });

  it("a locked company's link answers 404 share_link_unavailable, and client_page itself answers nothing (Q-0795)", async () => {
    const c = await setup('Locked Builders', 1);
    const { token } = await send(c.session, c.ps[0]);
    await harnessSql()`insert into public.billing_account (tenant_id, stripe_customer_id, status, lapsed_at)
      values (${c.t}::uuid, ${`cus_${randomUUID().replace(/-/g, '')}`}, 'canceled', now() - interval '15 days')`;
    const res = await get(token);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('share_link_unavailable');
    const direct = await anonDb({ gate: true }).rpc('client_page', { p_token_hash: hashClientToken(token) });
    expect(direct.error).toBeNull();
    expect(direct.data).toBeNull();
  });

  it('a link of a deleted project answers 404 share_link_not_found', async () => {
    const { token } = await send(s, projects[2]);
    await harnessSql()`delete from public.project where id = ${projects[2]}::uuid`;
    const res = await get(token);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('share_link_not_found');
    const direct = await anonDb({ gate: true }).rpc('client_page', { p_token_hash: hashClientToken(token) });
    expect(direct.data).toBeNull();
  });

  it('client_page is executable signed out (anon) only', async () => {
    const sql = harnessSql();
    const rows = await sql<{ ok: boolean }[]>`
      select has_function_privilege('authenticated', 'public.client_page(text)', 'execute') as ok`;
    expect(rows[0].ok).toBe(false);
    const anon = await sql<{ ok: boolean }[]>`
      select has_function_privilege('anon', 'public.client_page(text)', 'execute') as ok`;
    expect(anon[0].ok).toBe(true);
  });
});
