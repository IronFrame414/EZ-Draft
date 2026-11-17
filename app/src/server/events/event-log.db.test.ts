// EZD-109 database tests (AC-EZD-109-1 to -4; vault/plans/EZD-109.md section 4 D1-D8, plus D9-D11 for the
// EZD-106 and EZD-107 writers this ticket wires up). Expected values: Q-0695 decisions 03 row 33 (columns:
// company, actor, actor name, action, object type and id, details, time, IP; only a definer function writes
// and no API role reads; kept for the life of the company; permission, role, membership and invite changes
// write in the same transaction, so a failed log write fails the change; the default sink reports a failure
// and never undoes the action); Q-0697 decisions 10 row 66 (a system action has actor and IP null); 00h
// glossary "Remove" (the name stays on the event log); the plan's "Database columns" bounds.
// Rows written outside withRollback are removed by the tenant delete in afterAll (the cascade the
// append-only guard lets through).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TransactionSql, withRollback } from '../../../test-harness/rls/db';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  anonDb,
  claimsOf,
  cleanup,
  closeHarness,
  createAppUser,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { addUser, PRESET_KEYS, roleId } from '../../../test-harness/users/fixtures';
import { createEmitter } from './emit';
import { createEventLogSink } from './event-log';

type LogRow = {
  id: string;
  tenant_id: string;
  actor_app_user_id: string | null;
  actor_name: string | null;
  action: string;
  object_type: string;
  object_id: string;
  details: unknown;
  ip: string | null;
  at: Date;
};

type RpcResult = { data: unknown; error: { code: string; message: string } | null };

const rowsFor = async (objectId: string, sql: TransactionSql | ReturnType<typeof harnessSql> = harnessSql()) =>
  sql<LogRow[]>`
    select id, tenant_id, actor_app_user_id, actor_name, action, object_type, object_id, details,
      host(ip) as ip, at
    from public.event_log where object_id = ${objectId}::uuid order by at, id`;

async function asUser(tx: TransactionSql, accessToken: string): Promise<void> {
  await tx.unsafe('set local role authenticated');
  await tx`select set_config('request.jwt.claims', ${JSON.stringify(claimsOf(accessToken))}, true)`;
}

async function codeOf(tx: TransactionSql, run: (sp: TransactionSql) => Promise<unknown>) {
  try {
    await tx.savepoint(async (sp) => {
      await run(sp);
    });
    return null;
  } catch (e) {
    return { code: (e as { code?: string }).code, message: (e as Error).message };
  }
}

describe('EZD-109 event_log', () => {
  let a: string;
  let b: string;
  let owner: Member;
  let other: Member;
  let deactivated: Member;
  let target: Member;
  let so: Session;
  let sb: Session;
  let sd: Session;

  beforeAll(async () => {
    a = await createTenant();
    b = await createTenant();
    owner = await addUser(a, { preset: 'owner', name: 'Ann Owner' });
    target = await addUser(a, { preset: 'crew', name: 'Cal Crew' });
    other = await addUser(b, { preset: 'owner', name: 'Bob Other' });
    deactivated = await createMember({ tenantId: a, scope: 'all' });
    so = await signIn(owner.email);
    sb = await signIn(other.email);
    sd = await signIn(deactivated.email);
    await harnessSql()`update public.membership set status = 'deactivated'
      where id = ${deactivated.membershipId}::uuid`;
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  describeTenantIsolation('event_log', {
    makeRow: (t, ctx) => ({
      tenant_id: t,
      actor_app_user_id: ctx.member.appUserId,
      actor_name: 'Iso Actor',
      action: 'user_permission.updated',
      object_type: 'membership',
      object_id: ctx.member.membershipId,
      details: {},
    }),
  });

  it('D1 a permission change writes its row with actor and IP', async () => {
    await withRollback(harnessSql(), async (tx) => {
      await tx`insert into public.user_permission (tenant_id, membership_id, permission_key, granted)
        values (${a}::uuid, ${target.membershipId}::uuid, 'see_company_costs', false)
        on conflict (membership_id, permission_key) do update set granted = false`;
      await tx.unsafe(`
        create function private.ezd109_permission_change(p_membership uuid, p_ip inet) returns void
        language plpgsql security definer set search_path = '' as $$
        begin
          update public.user_permission set granted = true
          where membership_id = p_membership and permission_key = 'see_company_costs';
          perform private.write_event_log('user_permission.updated', 'membership', p_membership,
            jsonb_build_object('keys', jsonb_build_array('see_company_costs')), p_ip);
        end $$;
        grant execute on function private.ezd109_permission_change(uuid, inet) to authenticated;`);
      await asUser(tx, so.accessToken);
      await tx`select private.ezd109_permission_change(${target.membershipId}::uuid, '203.0.113.7')`;
      await tx`select private.ezd109_permission_change(${target.membershipId}::uuid, null)`;
      await tx.unsafe('reset role');
      const [g] = await tx<{ granted: boolean }[]>`select granted from public.user_permission
        where membership_id = ${target.membershipId}::uuid and permission_key = 'see_company_costs'`;
      expect(g.granted).toBe(true);
      const [{ now }] = await tx<{ now: Date }[]>`select now() as now`;
      // Both rows share the transaction's now(), so they are told apart by their IP, not their order.
      const rows = (await rowsFor(target.membershipId, tx)).sort(
        (x, y) => Number(x.ip === null) - Number(y.ip === null),
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        tenant_id: a,
        actor_app_user_id: owner.appUserId,
        actor_name: 'Ann Owner',
        action: 'user_permission.updated',
        object_type: 'membership',
        object_id: target.membershipId,
        details: { keys: ['see_company_costs'] },
        ip: '203.0.113.7',
      });
      expect(rows[0].at.getTime()).toBe(now.getTime());
      expect(rows[1].ip).toBeNull();
    });
  });

  it('D2 a failed log write undoes the change', async () => {
    await withRollback(harnessSql(), async (tx) => {
      await tx`insert into public.user_permission (tenant_id, membership_id, permission_key, granted)
        values (${a}::uuid, ${target.membershipId}::uuid, 'see_company_costs', false)
        on conflict (membership_id, permission_key) do update set granted = false`;
      await tx.unsafe(`
        create function private.ezd109_permission_change_bad(p_membership uuid) returns void
        language plpgsql security definer set search_path = '' as $$
        begin
          update public.user_permission set granted = true
          where membership_id = p_membership and permission_key = 'see_company_costs';
          perform private.write_event_log('Bad Action', 'membership', p_membership, '{}', null);
        end $$;
        grant execute on function private.ezd109_permission_change_bad(uuid) to authenticated;`);
      await asUser(tx, so.accessToken);
      const failed = await codeOf(tx, (sp) =>
        sp`select private.ezd109_permission_change_bad(${target.membershipId}::uuid)`,
      );
      await tx.unsafe('reset role');
      expect(failed?.code).toBe('23514');
      const [g] = await tx<{ granted: boolean }[]>`select granted from public.user_permission
        where membership_id = ${target.membershipId}::uuid and permission_key = 'see_company_costs'`;
      expect(g.granted).toBe(false);
      expect(await rowsFor(target.membershipId, tx)).toHaveLength(0);
    });
  });

  it('D3 no API role reads or writes; rows are append-only', async () => {
    const sql = harnessSql();
    for (const r of ['anon']) {
      for (const p of ['select', 'insert', 'update', 'delete']) {
        const [x] = await sql<{ ok: boolean }[]>`
          select has_table_privilege(${r}, 'public.event_log', ${p}) as ok`;
        expect(x.ok, `${r} ${p}`).toBe(false);
      }
    }
    for (const r of ['anon', 'authenticated', 'service_role']) {
      for (const f of [
        'private.write_event_log(text,text,uuid,jsonb,inet)',
        'private.write_event_log_as(text,uuid,uuid,text,uuid,jsonb,inet)',
        'private.event_log_actor()',
      ]) {
        const [x] = await sql<{ ok: boolean }[]>`select has_function_privilege(${r}, ${f}, 'execute') as ok`;
        expect(x.ok, `${r} ${f}`).toBe(false);
      }
      const [x] = await sql<{ ok: boolean }[]>`select has_function_privilege(${r},
        'public.log_event(uuid,text,text,uuid,jsonb,inet)', 'execute') as ok`;
      expect(x.ok, r).toBe(r === 'authenticated');
    }

    // A row of the member's own company, committed, then read and written through the API as that member.
    const own = randomUUID();
    const wrote = (await so.serverDb.rpc('log_event', {
      p_tenant_id: a,
      p_action: 'customer.created',
      p_object_type: 'customer',
      p_object_id: own,
      p_details: { customerId: own },
      p_ip: null as unknown as string,
    })) as unknown as RpcResult;
    expect(wrote.error).toBeNull();
    const read = await so.serverDb.from('event_log').select('*');
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
    const ins = await so.serverDb.from('event_log').insert({
      tenant_id: a,
      actor_app_user_id: owner.appUserId,
      actor_name: 'x',
      action: 'customer.created',
      object_type: 'customer',
      object_id: randomUUID(),
    });
    expect(ins.error?.code).toBe('42501');
    const upd = await so.serverDb
      .from('event_log')
      .update({ action: 'user.removed' })
      .eq('object_id', own)
      .select('*');
    expect(upd.data ?? []).toEqual([]);
    const del = await so.serverDb.from('event_log').delete().eq('object_id', own).select('*');
    expect(del.data ?? []).toEqual([]);
    const anon = await anonDb({ gate: true }).from('event_log').select('*');
    expect(anon.error?.code).toBe('42501');
    const [kept] = await rowsFor(own);
    expect(kept.action).toBe('customer.created');

    await withRollback(sql, async (tx) => {
      const t = (await tx<{ id: string }[]>`
        insert into public.tenant (name) values (${`EZD-109 ${randomUUID().slice(0, 8)}`}) returning id`)[0].id;
      const spare = await createAppUser();
      await tx`update public.app_user set name = 'Sam Spare' where id = ${spare.appUserId}::uuid`;
      const obj = randomUUID();
      await tx`select private.write_event_log_as('customer.created', ${t}::uuid, ${spare.appUserId}::uuid,
        'customer', ${obj}::uuid, '{}', null)`;
      const refused = [
        await codeOf(tx, (sp) => sp`update public.event_log set action = 'user.removed'
          where object_id = ${obj}::uuid`),
        await codeOf(tx, (sp) => sp`update public.event_log set actor_app_user_id = null,
          details = '{"x":1}' where object_id = ${obj}::uuid`),
        await codeOf(tx, (sp) => sp`delete from public.event_log where object_id = ${obj}::uuid`),
      ];
      for (const r of refused) expect(r).toEqual({ code: 'P0001', message: 'event_log_append_only' });

      await tx`delete from public.app_user where id = ${spare.appUserId}::uuid`;
      const [afterUser] = await rowsFor(obj, tx);
      expect(afterUser.actor_app_user_id).toBeNull();
      expect(afterUser.actor_name).toBe('Sam Spare');

      await tx`delete from public.tenant where id = ${t}::uuid`;
      expect(await rowsFor(obj, tx)).toHaveLength(0);
    });
  });

  it('D4 a system action writes actor null', async () => {
    const [p] = await createProjects(a, 1);
    await withRollback(harnessSql(), async (tx) => {
      await tx`select private.write_event_log_as('lock.auto_released', ${a}::uuid, null, 'project',
        ${p}::uuid, '{}', null)`;
      const rows = await rowsFor(p, tx);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenant_id: a,
        actor_app_user_id: null,
        actor_name: null,
        ip: null,
        action: 'lock.auto_released',
        object_type: 'project',
      });
      const withIp = await codeOf(tx, (sp) =>
        sp`select private.write_event_log_as('lock.auto_released', ${a}::uuid, null, 'project',
          ${p}::uuid, '{}', '203.0.113.7')`,
      );
      expect(withIp).toEqual({ code: '22023', message: 'event_log_system_ip' });
    });
  });

  it('D5 write_event_log refuses a call with no actor claims', async () => {
    await withRollback(harnessSql(), async (tx) => {
      const r = await codeOf(tx, (sp) =>
        sp`select private.write_event_log('user_permission.updated', 'membership',
          ${target.membershipId}::uuid, '{}', null)`,
      );
      expect(r?.code).toBe('42501');
      expect(await rowsFor(target.membershipId, tx)).toHaveLength(0);
    });
  });

  it("D6 log_event writes the caller's own row and refuses everyone else", async () => {
    const call = async (s: Session, over: Record<string, unknown> = {}) => {
      const id = randomUUID();
      const r = (await s.serverDb.rpc('log_event', {
        p_tenant_id: a,
        p_action: 'customer.created',
        p_object_type: 'customer',
        p_object_id: id,
        p_details: { customerId: id },
        p_ip: '198.51.100.4',
        ...over,
      } as never)) as unknown as RpcResult;
      return { code: r.error?.code ?? null, rows: await rowsFor(id) };
    };

    const ok = await call(so);
    expect(ok.code).toBeNull();
    expect(ok.rows).toHaveLength(1);
    expect(ok.rows[0]).toMatchObject({
      tenant_id: a,
      actor_app_user_id: owner.appUserId,
      actor_name: 'Ann Owner',
      ip: '198.51.100.4',
      action: 'customer.created',
      object_type: 'customer',
    });

    for (const s of [sb, sd]) {
      const r = await call(s);
      expect(r.code).toBe('42501');
      expect(r.rows).toHaveLength(0);
    }

    const bad: [Record<string, unknown>, string][] = [
      [{ p_action: 'Customer.Created' }, '23514'],
      [{ p_action: 'a.' + 'b'.repeat(63) }, '23514'],
      [{ p_object_type: 'a'.repeat(41) }, '23514'],
      [{ p_details: [] }, '23514'],
      [{ p_details: { s: 'x'.repeat(16376) } }, '23514'],
      [{ p_action: '' }, '23514'],
      [{ p_object_type: '' }, '23514'],
      [{ p_action: null }, '23502'],
      [{ p_object_type: null }, '23502'],
      [{ p_object_id: null }, '23502'],
    ];
    for (const [over, code] of bad) {
      const r = await call(so, over);
      expect(r.code, JSON.stringify(over).slice(0, 60)).toBe(code);
      expect(r.rows).toHaveLength(0);
    }
    for (const over of [
      { p_action: 'a.' + 'b'.repeat(62) },
      { p_object_type: 'a'.repeat(40) },
      { p_details: { s: 'x'.repeat(16375) } },
    ]) {
      const r = await call(so, over);
      expect(r.code, JSON.stringify(over).slice(0, 60)).toBeNull();
      expect(r.rows).toHaveLength(1);
    }
  });

  it('D7 the real sink writes through the emitter', async () => {
    const { emit } = createEmitter({
      sinks: [
        createEventLogSink({
          client: () => so.serverDb as never,
          requestIp: async () => '198.51.100.4',
        }),
      ],
    });
    const before = await rowsFor(a);
    await emit('tenant.updated', { fields: ['name'] }, { tenantId: a, actorId: owner.appUserId });
    const rows = (await rowsFor(a)).filter((r) => r.action === 'tenant.updated');
    expect(rows.length - before.filter((r) => r.action === 'tenant.updated').length).toBe(1);
    expect(rows.at(-1)).toMatchObject({
      tenant_id: a,
      action: 'tenant.updated',
      object_type: 'tenant',
      object_id: a,
      actor_app_user_id: owner.appUserId,
      details: { fields: ['name'] },
      ip: '198.51.100.4',
    });
  });

  it('D8 invite acceptance at sign-in writes user.joined in its transaction', async () => {
    await withRollback(harnessSql(), async (tx) => {
      const authUserId = randomUUID();
      const email = `ezd109-${randomUUID().slice(0, 12)}@example.test`;
      await tx`insert into auth.users (id, email, email_confirmed_at, aud, role)
        values (${authUserId}::uuid, ${email}, now(), 'authenticated', 'authenticated')`;
      const sessionId = randomUUID();
      await tx`insert into auth.sessions (id, user_id) values (${sessionId}::uuid, ${authUserId}::uuid)`;
      const [u] = await tx<{ id: string }[]>`
        insert into public.app_user (email) values (${email}) returning id`;
      const [t] = await tx<{ id: string }[]>`
        insert into public.tenant (name) values (${`EZD-109 ${randomUUID().slice(0, 8)}`}) returning id`;
      const membershipId = randomUUID();
      await tx`insert into public.membership (id, tenant_id, user_id, status, scope, invited_at)
        values (${membershipId}::uuid, ${t.id}::uuid, ${u.id}::uuid, 'invited', 'all', now())`;
      const link = async () => {
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({
          sub: authUserId,
          role: 'authenticated',
          session_id: sessionId,
        })}, true)`;
        const r = await tx<{ accepted_membership_id: string | null }[]>`
          select * from public.link_app_user()`;
        await tx.unsafe('reset role');
        return r;
      };
      const first = await link();
      expect(first[0].accepted_membership_id).toBe(membershipId);
      const rows = await rowsFor(membershipId, tx);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'user.joined',
        tenant_id: t.id,
        actor_app_user_id: u.id,
        actor_name: email,
        object_type: 'membership',
        object_id: membershipId,
        details: { membershipId, appUserId: u.id, via: 'sign_in' },
        ip: null,
      });
      await link();
      expect(await rowsFor(membershipId, tx)).toHaveLength(1);
    });
  });

  it('D9 Save writes user_permission.updated with the IP in its transaction, and nothing when unchanged', async () => {
    const t = await createTenant();
    const o = await addUser(t, { preset: 'owner', name: 'Olive Owner' });
    const m = await addUser(t, { preset: 'crew', name: 'Max Member' });
    const s = await signIn(o.email);
    const crew = await roleId(t, 'crew');
    const save = (granted: readonly string[], ip: string | null) =>
      s.serverDb.rpc('save_member', {
        p_membership_id: m.membershipId,
        p_role_id: crew,
        p_language: 'en',
        p_granted: granted,
        p_ip: ip as string,
      }) as unknown as Promise<RpcResult>;

    const same = await save(PRESET_KEYS.crew, '203.0.113.9');
    expect(same.error).toBeNull();
    expect(await rowsFor(m.membershipId)).toHaveLength(0);

    const more = [...PRESET_KEYS.crew, 'see_company_costs'];
    const changed = await save(more, '203.0.113.9');
    expect(changed.error).toBeNull();
    const rows = await rowsFor(m.membershipId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenant_id: t,
      actor_app_user_id: o.appUserId,
      actor_name: 'Olive Owner',
      action: 'user_permission.updated',
      object_type: 'membership',
      object_id: m.membershipId,
      details: {
        membershipId: m.membershipId,
        appUserId: m.appUserId,
        changedKeys: ['see_company_costs'],
        roleId: crew,
        roleChanged: false,
      },
      ip: '203.0.113.9',
    });
  });

  it('D10 Deactivate, Reactivate and Remove write their rows; a self-deactivate keeps its row', async () => {
    const t = await createTenant();
    const o = await addUser(t, { preset: 'owner', name: 'Opal Owner' });
    const o2 = await addUser(t, { preset: 'owner', name: 'Otto Owner' });
    const m = await addUser(t, { preset: 'crew', name: 'Mia Member' });
    const s = await signIn(o.email);
    const call = (fn: string, id: string) =>
      s.serverDb.rpc(fn as never, {
        p_membership_id: id,
        p_ip: '198.51.100.7',
      } as never) as unknown as Promise<RpcResult>;
    for (const fn of ['deactivate_member', 'reactivate_member', 'remove_member']) {
      expect((await call(fn, m.membershipId)).error, fn).toBeNull();
    }
    const rows = await rowsFor(m.membershipId);
    expect(rows.map((r) => r.action)).toEqual(['user.deactivated', 'user.reactivated', 'user.removed']);
    for (const r of rows) {
      expect(r).toMatchObject({
        tenant_id: t,
        actor_app_user_id: o.appUserId,
        actor_name: 'Opal Owner',
        object_type: 'membership',
        details: { membershipId: m.membershipId, appUserId: m.appUserId },
        ip: '198.51.100.7',
      });
    }
    // Deactivating yourself ends your session in the same transaction; the row is still written.
    const self = await call('deactivate_member', o.membershipId);
    expect(self.error).toBeNull();
    const selfRows = await rowsFor(o.membershipId);
    expect(selfRows).toHaveLength(1);
    expect(selfRows[0]).toMatchObject({ action: 'user.deactivated', actor_app_user_id: o.appUserId });
    expect(o2.membershipId).toBeTruthy();
  });

  it('D11 role create, edit and delete write their rows; an edit that changes nothing writes none', async () => {
    const t = await createTenant();
    const o = await addUser(t, { preset: 'owner', name: 'Rhea Owner' });
    const s = await signIn(o.email);
    const rpc = (fn: string, args: Record<string, unknown>) =>
      s.serverDb.rpc(fn as never, { ...args, p_ip: '192.0.2.44' } as never) as unknown as Promise<RpcResult>;
    const made = await rpc('create_role', { p_name: 'Estimator', p_granted: ['view_projects'] });
    expect(made.error).toBeNull();
    const id = (made.data as { roleId: string }).roleId;
    expect(
      (await rpc('update_role', { p_role_id: id, p_name: 'Estimator', p_granted: ['view_projects'] }))
        .error,
    ).toBeNull();
    expect(
      (await rpc('update_role', { p_role_id: id, p_name: 'Estimators', p_granted: ['view_projects'] }))
        .error,
    ).toBeNull();
    expect((await rpc('delete_role', { p_role_id: id })).error).toBeNull();
    const rows = await rowsFor(id);
    expect(rows.map((r) => [r.action, r.details])).toEqual([
      ['role.created', { roleId: id, name: 'Estimator' }],
      ['role.updated', { roleId: id, fields: ['name'] }],
      ['role.deleted', { roleId: id, name: 'Estimators' }],
    ]);
    for (const r of rows) {
      expect(r).toMatchObject({
        tenant_id: t,
        actor_app_user_id: o.appUserId,
        actor_name: 'Rhea Owner',
        object_type: 'role',
        ip: '192.0.2.44',
      });
    }
  });
});
