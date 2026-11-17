// EZD-121 V1-V9 (AC-EZD-121-1 to -4, -6, -7). Expected values: examples 09p Numbering (version_no = 1 + the
// highest sent version_no; none → Version 1; 1, 2 → 3; two at once → 2 and 3; 149 → 150; nothing changed → still a
// new number); Q-0700 03 row "Freezing sent versions" (is_sent, version_no, sent_to, sent_at fixed once set; a
// sent or named row is never deleted, service_role included, except by the project Delete cascade; unique
// (project_id, version_no) where is_sent); 03b rule 7 (model_json never changes); S20 Events emitted
// (version.sent); EZD-109 (event_log row in the change's transaction); S01 Data shown and Q-0700 05 (the card's
// number, null before any send).
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
import type { Database, Json } from '../db/database.types';
import { listProjects } from '../projects/projects';
import { sendToClient } from './sends';

const SENDER = ['view_projects', 'edit_model', 'send_to_client'] as const;
const ENV = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: 'EZ Draft Test <test@example.test>' };
const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

type VersionRow = {
  id: string;
  is_sent: boolean;
  version_no: number | null;
  sent_to: string | null;
  sent_at: string | null;
};

const sentRows = (project: string) =>
  harnessSql()<VersionRow[]>`
    select id, is_sent, version_no, sent_to, sent_at from public.model_version
    where project_id = ${project}::uuid and is_sent order by version_no`;

const send = async (s: Session, projectId: string) => {
  const r = await sendToClient(db(s), { projectId, note: null }, { env: ENV, requestIp: async () => null });
  if (!r.ok) throw new Error('send refused: ' + r.code);
  return r.send;
};

// A sent row written straight to the table (the 149-sent example), as service_role does.
async function seedSent(tenant: string, project: string, no: number): Promise<void> {
  await harnessSql()`
    insert into public.model_version
      (project_id, tenant_id, model_json, schema_version, is_sent, version_no, sent_to, sent_at)
    values (${project}::uuid, ${tenant}::uuid, '{"objects":[]}'::jsonb, 1, true, ${no}, 'Zed Co', now())`;
}

describe('EZD-121 sent versions and numbering (database)', () => {
  let tenant = '';
  let other = '';
  let pCount = '';
  let pRace = '';
  let p149 = '';
  let pSame = '';
  let pFreeze = '';
  let pDelete = '';
  let pList = '';
  let pNever = '';
  let s: Session;
  let s2: Session;
  let otherS: Session;

  beforeAll(async () => {
    tenant = await createTenant();
    [pCount, pRace, p149, pSame, pFreeze, pDelete, pList, pNever] = await createProjects(tenant, 8);
    const sql = harnessSql();
    const [c] = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${tenant}::uuid, 'Zed Co', 'zedco@example.test') returning id`;
    await sql`update public.project set customer_id = ${c.id}::uuid where tenant_id = ${tenant}::uuid`;
    const a = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, a.membershipId, [...SENDER]);
    const b = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, b.membershipId, [...SENDER]);
    other = await createTenant();
    const o = await createMember({ tenantId: other, scope: 'all' });
    await setPermissions(other, o.membershipId, [...SENDER]);
    s = await signIn(a.email);
    s2 = await signIn(b.email);
    otherS = await signIn(o.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('V1 @smoke two sends give Version 1 and Version 2, a third Version 3 (AC-EZD-121-1)', async () => {
    const r1 = await send(s, pCount);
    const r2 = await send(s, pCount);
    const r3 = await send(s, pCount);
    expect([r1.versionNo, r2.versionNo, r3.versionNo]).toEqual([1, 2, 3]);
    const rows = await sentRows(pCount);
    expect(rows.map((r) => r.version_no)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.id)).toEqual([r1.modelVersionId, r2.modelVersionId, r3.modelVersionId]);
    for (const r of rows) {
      expect(r.is_sent).toBe(true);
      expect(r.sent_to).toBe('Zed Co');
      expect(r.sent_at).not.toBeNull();
    }
  });

  it('V2 no cap: with 149 sent the next send is Version 150 (09p example 4)', async () => {
    for (let n = 1; n <= 149; n++) await seedSent(tenant, p149, n);
    expect((await send(s, p149)).versionNo).toBe(150);
  });

  it('V3 two sends at the same moment get different numbers, 2 and 3 (AC-EZD-121-3; 09p example 3)', async () => {
    expect((await send(s, pRace)).versionNo).toBe(1);
    const [x, y] = await Promise.all([send(s, pRace), send(s2, pRace)]);
    expect([x.versionNo, y.versionNo].sort()).toEqual([2, 3]);
    expect((await sentRows(pRace)).map((r) => r.version_no)).toEqual([1, 2, 3]);
  });

  it('V3b the unique index refuses a second row with a sent number already used', async () => {
    await expect(seedSent(tenant, pRace, 2)).rejects.toMatchObject({ code: '23505' });
  });

  it('V4 every send writes a fresh checkpoint, even with no change since the last (AC-EZD-121-4; 09p example 5)', async () => {
    const count = async () =>
      Number(
        (
          await harnessSql()<{ n: string }[]>`
            select count(*)::text as n from public.model_version where project_id = ${pSame}::uuid`
        )[0].n,
      );
    const a = await send(s, pSame);
    const b = await send(s, pSame);
    expect(b.modelVersionId).not.toBe(a.modelVersionId);
    expect(await count()).toBe(2);
    expect(b.versionNo).toBe(2);
  });

  it('V5 a sent version cannot change, for service_role or the table owner (AC-EZD-121-2)', async () => {
    const v = await send(s, pFreeze);
    const changes: Record<string, unknown>[] = [
      { model_json: { objects: [{ id: 'x' }] } },
      { is_sent: false },
      { version_no: 99 },
      { sent_to: 'Someone else' },
      { sent_at: '2026-01-01T00:00:00Z' },
    ];
    for (const change of changes) {
      const { error } = await adminDb().from('model_version').update(change).eq('id', v.modelVersionId);
      expect(error?.code, JSON.stringify(change)).toBe('55000');
    }
    await expect(
      harnessSql()`update public.model_version set version_no = 7 where id = ${v.modelVersionId}::uuid`,
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      harnessSql()`update public.model_version set sent_at = now() where id = ${v.modelVersionId}::uuid`,
    ).rejects.toMatchObject({ code: '55000' });
    const [row] = await sentRows(pFreeze);
    expect(row.version_no).toBe(1);
    expect(row.sent_to).toBe('Zed Co');
    // A thumbnail path is not one of the frozen columns (EZD-224 writes it after a checkpoint).
    const { error } = await adminDb()
      .from('model_version')
      .update({ preview_path: `${tenant}/${pFreeze}/thumb/${v.modelVersionId}.webp` })
      .eq('id', v.modelVersionId);
    expect(error).toBeNull();
  });

  it('V6 sent and named rows cannot be deleted by any caller; a working row can; project Delete cascades (AC-EZD-121-2)', async () => {
    const v = await send(s, pDelete);
    const [named] = await harnessSql()<{ id: string }[]>`
      insert into public.model_version (project_id, tenant_id, model_json, schema_version, is_snapshot, label)
      values (${pDelete}::uuid, ${tenant}::uuid, '{"objects":[]}'::jsonb, 1, true, 'Kept') returning id`;
    const [working] = await harnessSql()<{ id: string }[]>`
      insert into public.model_version (project_id, tenant_id, model_json, schema_version)
      values (${pDelete}::uuid, ${tenant}::uuid, '{"objects":[]}'::jsonb, 1) returning id`;

    for (const id of [v.modelVersionId, named.id]) {
      const { error } = await adminDb().from('model_version').delete().eq('id', id);
      expect(error?.code).toBe('55000');
      await expect(
        harnessSql()`delete from public.model_version where id = ${id}::uuid`,
      ).rejects.toMatchObject({ code: '55000' });
    }
    // The member's own session has no delete grant at all.
    await db(s).from('model_version').delete().eq('id', v.modelVersionId);
    const { error } = await adminDb().from('model_version').delete().eq('id', working.id);
    expect(error).toBeNull();

    const left = await harnessSql()<{ id: string }[]>`
      select id from public.model_version where project_id = ${pDelete}::uuid order by id`;
    expect(left.map((r) => r.id).sort()).toEqual([v.modelVersionId, named.id].sort());

    await harnessSql()`delete from public.project where id = ${pDelete}::uuid`;
    const gone = await harnessSql()<{ n: string }[]>`
      select count(*)::text as n from public.model_version where project_id = ${pDelete}::uuid`;
    expect(gone[0].n).toBe('0');
  });

  it('V7 version.sent writes an event_log row and is broadcast on the project channel (AC-EZD-121-7)', async () => {
    const v = await send(s, pList);
    const logs = await harnessSql()<{ action: string; object_type: string; details: Json }[]>`
      select action, object_type, details from public.event_log
      where object_id = ${pList}::uuid and action = 'version.sent'`;
    expect(logs).toHaveLength(1);
    expect(logs[0].object_type).toBe('project');
    expect(logs[0].details).toMatchObject({ model_version_id: v.modelVersionId, version_no: 1 });
    const casts = await harnessSql()<{ payload: Record<string, unknown> }[]>`
      select payload from realtime.messages
      where topic = ${'project:' + pList} and event = 'version.sent'`;
    expect(casts).toHaveLength(1);
    expect(casts[0].payload).toMatchObject({ modelVersionId: v.modelVersionId, versionNo: 1 });
    expect(JSON.stringify(casts[0].payload)).not.toContain('zedco@example.test');
  });

  it('V8 the project list carries the newest sent number, and null before any send (AC-EZD-121-6)', async () => {
    await send(s, pList);
    const page = await listProjects(db(s), { tab: 'all', sort: 'edited', after: null });
    const byId = Object.fromEntries(page.items.map((i) => [i.id, i.versionNo]));
    expect(byId[pList]).toBe(2);
    expect(byId[pCount]).toBe(3);
    expect(byId[pNever]).toBeNull();
  });

  it('V9 another company can neither read these versions nor send this project', async () => {
    const { data } = await db(otherS).from('model_version').select('id').eq('project_id', pCount);
    expect(data ?? []).toEqual([]);
    const r = await sendToClient(db(otherS), { projectId: pCount, note: null }, { env: ENV });
    expect(r.ok).toBe(false);
    expect((await sentRows(pCount)).map((x) => x.version_no)).toEqual([1, 2, 3]);
    const page = await listProjects(db(otherS), { tab: 'all', sort: 'edited', after: null });
    expect(page.items.map((i) => i.id)).not.toContain(pCount);
  });
});
