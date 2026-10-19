// EZD-005a T2-T11 (vault/plans/EZD-005a.md section 4): the tenancy tables in the local database.
// Two clients as local-services.test.ts: admin (SUPABASE_SECRET_KEY) and anon (publishable key).
// Every row carries a per-run random suffix and is deleted in afterAll; nothing counts whole tables
// (plan section 9: tests share one local database, maxWorkers 4). Expected values come from the plan's
// Data tables and the sources they cite; error codes are SQLSTATE (plan section 3 "error codes").
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const publishable = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;
const secret = () => process.env.SUPABASE_SECRET_KEY as string;

// SQLSTATE codes (plan section 3): not null, foreign key, unique, check, privilege / RLS.
const NOT_NULL = '23502';
const FK = '23503';
const UNIQUE = '23505';
const CHECK = '23514';
const PRIVILEGE = '42501';

// Plan Data: every column of each table (tenant 10, app_user 9, project 20, membership 9, membership_project 4).
const COLUMNS = {
  tenant: [
    'id',
    'name',
    'logo_path',
    'license_no',
    'contact',
    'title_block',
    'code_edition',
    'defaults',
    'created_at',
    'updated_at',
  ],
  app_user: [
    'id',
    'auth_user_id',
    'name',
    'email',
    'language',
    'ipad_input_mode',
    'role_preset',
    'created_at',
    'updated_at',
  ],
  project: [
    'id',
    'tenant_id',
    'name',
    'client_name',
    'address',
    'type',
    'status',
    'ezbinder_job_id',
    'ezbinder_job_no',
    'property_record_id',
    'submittal_profile_id',
    'code_edition',
    'phase_default',
    'scope_of_work',
    'settings',
    'thumbnail_path',
    'open_items_count',
    'archived_at',
    'created_at',
    'updated_at',
  ],
  membership: [
    'id',
    'tenant_id',
    'user_id',
    'status',
    'scope',
    'invited_at',
    'last_active_at',
    'created_at',
    'updated_at',
  ],
  membership_project: ['tenant_id', 'membership_id', 'project_id', 'created_at'],
} as const;

type Row = Record<string, unknown>;

describe('EZD-005a tenancy tables', () => {
  const suffix = randomUUID().slice(0, 8);
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let emailN = 0;
  const email = () => `ezd005a-${suffix}-${++emailN}@example.com`;
  const tenantName = (label = '') => `EZD-005a test ${suffix}${label ? ' ' + label : ''}`;
  const tenantIds: string[] = [];
  const authIds: string[] = [];

  beforeAll(() => {
    admin = createClient(url(), secret(), { auth: { persistSession: false } });
    anon = createClient(url(), publishable(), { auth: { persistSession: false } });
  });

  afterAll(async () => {
    if (tenantIds.length) {
      await admin.from('membership_project').delete().in('tenant_id', tenantIds);
      await admin.from('membership').delete().in('tenant_id', tenantIds);
      await admin.from('project').delete().in('tenant_id', tenantIds);
    }
    await admin.from('app_user').delete().like('email', `ezd005a-${suffix}-%`);
    await admin.from('tenant').delete().like('name', `EZD-005a test ${suffix}%`);
    for (const id of authIds) await admin.auth.admin.deleteUser(id);
  });

  // Insert one row and return it; fails the test on any error so later steps read a real row.
  async function insertOne(table: string, row: Row): Promise<Row> {
    const { data, error } = await admin.from(table).insert(row).select('*').single();
    expect(error, `${table} insert ${JSON.stringify(row)}`).toBeNull();
    const out = data as Row;
    if (table === 'tenant') tenantIds.push(out.id as string);
    return out;
  }

  const newTenant = (label?: string) => insertOne('tenant', { name: tenantName(label) });
  const newUser = (extra: Row = {}) => insertOne('app_user', { email: email(), ...extra });
  const newProject = (tenantId: string, extra: Row = {}) =>
    insertOne('project', {
      tenant_id: tenantId,
      name: `Project ${suffix}`,
      address: `1 Test St ${suffix}`,
      type: 'kitchen',
      ...extra,
    });
  const newMembership = (tenantId: string, userId: string, extra: Row = {}) =>
    insertOne('membership', {
      tenant_id: tenantId,
      user_id: userId,
      status: 'active',
      scope: 'listed',
      ...extra,
    });

  // Error code of a failing insert (null when it succeeded).
  async function insertCode(table: string, row: Row): Promise<string | null> {
    const { error } = await admin.from(table).insert(row);
    return error ? error.code : null;
  }

  async function createAuthUser(): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({
      email: email(),
      email_confirm: true,
    });
    expect(error).toBeNull();
    const id = data.user!.id;
    authIds.push(id);
    return id;
  }

  // ---------- T2 ----------

  it('EZD-005a done when: the five tenancy tables exist with the planned columns', async () => {
    const authId = await createAuthUser();
    const now = new Date().toISOString();
    const tenant = await insertOne('tenant', {
      id: randomUUID(),
      name: tenantName('T2'),
      logo_path: `${suffix}/tenant/logo.png`,
      license_no: 'CGC000000',
      contact: { phone: '000', email: 'office@example.com', website: 'x', address: 'y' },
      title_block: { line1: 'x' },
      code_edition: 'fbc8',
      defaults: { a: 1 },
      created_at: now,
      updated_at: now,
    });
    const user = await insertOne('app_user', {
      id: randomUUID(),
      auth_user_id: authId,
      name: 'T2 user',
      email: email(),
      language: 'es',
      ipad_input_mode: 'pencil',
      role_preset: 'owner',
      created_at: now,
      updated_at: now,
    });
    const project = await insertOne('project', {
      id: randomUUID(),
      tenant_id: tenant.id,
      name: 'T2 project',
      client_name: 'Client',
      address: '1 Test St',
      type: 'bath',
      status: 'approved',
      ezbinder_job_id: 'job-1',
      ezbinder_job_no: '1001',
      property_record_id: randomUUID(),
      submittal_profile_id: randomUUID(),
      code_edition: 'fbc8',
      phase_default: 'x',
      scope_of_work: 'Remodel',
      settings: { b: 2 },
      thumbnail_path: `${suffix}/thumb.png`,
      open_items_count: 3,
      archived_at: now,
      created_at: now,
      updated_at: now,
    });
    const membership = await insertOne('membership', {
      id: randomUUID(),
      tenant_id: tenant.id,
      user_id: user.id,
      status: 'invited',
      scope: 'listed',
      invited_at: now,
      last_active_at: now,
      created_at: now,
      updated_at: now,
    });
    const mp = await insertOne('membership_project', {
      tenant_id: tenant.id,
      membership_id: membership.id,
      project_id: project.id,
      created_at: now,
    });

    const rows: Record<keyof typeof COLUMNS, Row> = {
      tenant,
      app_user: user,
      project,
      membership,
      membership_project: mp,
    };
    for (const [table, cols] of Object.entries(COLUMNS)) {
      const keys = Object.keys(rows[table as keyof typeof COLUMNS]);
      for (const col of cols) expect(keys, `${table}.${col}`).toContain(col);
    }
  });

  // ---------- T3 ----------

  it('EZD-005a T3 defaults', async () => {
    const tenant = await newTenant('T3');
    expect(tenant.contact).toEqual({});
    expect(tenant.title_block).toEqual({});
    expect(tenant.defaults).toEqual({});
    expect(tenant.logo_path).toBeNull();
    expect(tenant.license_no).toBeNull();
    expect(tenant.code_edition).toBeNull();

    const user = await newUser();
    expect(user.language).toBe('en');
    expect(user.ipad_input_mode).toBeNull();
    expect(user.role_preset).toBeNull();
    expect(user.name).toBeNull();
    expect(user.auth_user_id).toBeNull();

    const project = await newProject(tenant.id as string);
    expect(project.status).toBe('draft');
    expect(project.settings).toEqual({});
    expect(project.open_items_count).toBe(0);
    expect(project.archived_at).toBeNull();

    const membership = await newMembership(tenant.id as string, user.id as string);
    expect(membership.invited_at).toBeNull();
    expect(membership.last_active_at).toBeNull();

    for (const row of [tenant, user, project, membership]) {
      expect(row.created_at).not.toBeNull();
      expect(row.updated_at).not.toBeNull();
    }
  });

  // ---------- T4 ----------

  it('EZD-005a T4 required columns', async () => {
    const tenant = await newTenant('T4');
    const user = await newUser();
    const tid = tenant.id as string;
    const uid = user.id as string;

    expect(await insertCode('tenant', {})).toBe(NOT_NULL);
    expect(await insertCode('app_user', { name: 'no email' })).toBe(NOT_NULL);

    const fullProject: Row = { tenant_id: tid, name: 'P', address: 'A', type: 'kitchen' };
    for (const col of ['tenant_id', 'name', 'address', 'type']) {
      const row = { ...fullProject };
      delete row[col];
      expect(await insertCode('project', row), `project without ${col}`).toBe(NOT_NULL);
    }

    const fullMembership: Row = { tenant_id: tid, user_id: uid, status: 'active', scope: 'all' };
    for (const col of ['tenant_id', 'user_id', 'status', 'scope']) {
      const row = { ...fullMembership };
      delete row[col];
      expect(await insertCode('membership', row), `membership without ${col}`).toBe(NOT_NULL);
    }
  });

  // ---------- T5 ----------

  it('EZD-005a T5 refused values', async () => {
    const tenant = await newTenant('T5');
    const user = await newUser();
    const tid = tenant.id as string;
    const uid = user.id as string;
    const project = (extra: Row): Row => ({
      tenant_id: tid,
      name: 'P',
      address: 'A',
      type: 'kitchen',
      ...extra,
    });
    const membership = (extra: Row): Row => ({
      tenant_id: tid,
      user_id: uid,
      status: 'active',
      scope: 'all',
      ...extra,
    });

    const cases: Array<[string, Row]> = [
      ['app_user', { email: email(), language: 'fr' }],
      ['app_user', { email: email(), ipad_input_mode: 'mouse' }],
      ['app_user', { email: email(), role_preset: 'client' }],
      ['app_user', { email: 'Upper@Example.com' }],
      ['app_user', { email: ' ' }],
      ['tenant', { name: '  ' }],
      ['membership', membership({ status: 'pending' })],
      ['membership', membership({ scope: 'some' })],
      ['project', project({ status: 'archived' })],
      ['project', project({ type: 'office' })],
      ['project', project({ open_items_count: -1 })],
      ['project', project({ name: '' })],
      ['project', project({ address: '' })],
    ];
    for (const [table, row] of cases) {
      expect(await insertCode(table, row), `${table} ${JSON.stringify(row)}`).toBe(CHECK);
    }
  });

  // ---------- T6 ----------

  it('EZD-005a T6 allowed values accepted', async () => {
    const tenant = await newTenant('T6');
    const tid = tenant.id as string;

    for (const language of ['en', 'es']) {
      expect(await insertCode('app_user', { email: email(), language }), language).toBeNull();
    }
    for (const ipad_input_mode of ['pencil', 'finger']) {
      expect(
        await insertCode('app_user', { email: email(), ipad_input_mode }),
        ipad_input_mode,
      ).toBeNull();
    }
    for (const role_preset of ['owner', 'designer', 'foreman', 'crew']) {
      expect(await insertCode('app_user', { email: email(), role_preset }), role_preset).toBeNull();
    }
    for (const status of ['invited', 'active', 'deactivated']) {
      const user = await newUser();
      expect(
        await insertCode('membership', { tenant_id: tid, user_id: user.id, status, scope: 'all' }),
        status,
      ).toBeNull();
    }
    for (const scope of ['all', 'listed']) {
      const user = await newUser();
      expect(
        await insertCode('membership', {
          tenant_id: tid,
          user_id: user.id,
          status: 'active',
          scope,
        }),
        scope,
      ).toBeNull();
    }
    const base = { tenant_id: tid, name: 'P', address: 'A' };
    for (const status of ['draft', 'client_review', 'permit_submitted', 'approved', 'in_build']) {
      expect(await insertCode('project', { ...base, type: 'kitchen', status }), status).toBeNull();
    }
    for (const type of ['kitchen', 'bath', 'whole_home_interior']) {
      expect(await insertCode('project', { ...base, type }), type).toBeNull();
    }
  });

  // ---------- T7, T8 ----------

  let t7FirstUserId = '';
  let t7AuthId = '';

  it('EZD-005a T7 uniqueness', async () => {
    // (a) same email twice
    const dupEmail = email();
    expect(await insertCode('app_user', { email: dupEmail })).toBeNull();
    expect(await insertCode('app_user', { email: dupEmail })).toBe(UNIQUE);

    // (b) same tenant + user twice
    const tenantA = await newTenant('T7 A');
    const user = await newUser();
    const m = { tenant_id: tenantA.id, user_id: user.id, status: 'active', scope: 'all' };
    expect(await insertCode('membership', m)).toBeNull();
    expect(await insertCode('membership', m)).toBe(UNIQUE);

    // (c) same auth_user_id twice
    t7AuthId = await createAuthUser();
    const first = await insertOne('app_user', { email: email(), auth_user_id: t7AuthId });
    t7FirstUserId = first.id as string;
    expect(await insertCode('app_user', { email: email(), auth_user_id: t7AuthId })).toBe(UNIQUE);

    // (d) one person, two tenants
    const tenantB = await newTenant('T7 B');
    expect(
      await insertCode('membership', { ...m, tenant_id: tenantB.id, status: 'invited' }),
    ).toBeNull();
  });

  it('EZD-005a T8 auth link follows the auth user', async () => {
    expect(t7AuthId).not.toBe('');
    const { error } = await admin.auth.admin.deleteUser(t7AuthId);
    expect(error).toBeNull();
    authIds.splice(authIds.indexOf(t7AuthId), 1);

    const { data, error: readError } = await admin
      .from('app_user')
      .select('*')
      .eq('id', t7FirstUserId)
      .maybeSingle();
    expect(readError).toBeNull();
    expect(data).not.toBeNull();
    expect((data as Row).auth_user_id).toBeNull();
  });

  // ---------- T9 ----------

  it('EZD-005a done when: a listed project can never belong to another company', async () => {
    const tenantA = await newTenant('T9 A');
    const tenantB = await newTenant('T9 B');
    const user = await newUser();
    const m = await newMembership(tenantA.id as string, user.id as string);
    const p = await newProject(tenantB.id as string);

    expect(
      await insertCode('membership_project', {
        tenant_id: tenantA.id,
        membership_id: m.id,
        project_id: p.id,
      }),
    ).toBe(FK);
    expect(
      await insertCode('membership_project', {
        tenant_id: tenantB.id,
        membership_id: m.id,
        project_id: p.id,
      }),
    ).toBe(FK);
    expect(
      await insertCode('project', {
        tenant_id: randomUUID(),
        name: 'P',
        address: 'A',
        type: 'kitchen',
      }),
    ).toBe(FK);
  });

  // ---------- T10 ----------

  it('EZD-005a T10 cascade; RLS on', async () => {
    // (a) cascades
    const tenantA = await newTenant('T10');
    const tid = tenantA.id as string;
    const user = await newUser();
    const m = await newMembership(tid, user.id as string);
    const p2 = await newProject(tid, { name: 'P2' });
    await insertOne('membership_project', {
      tenant_id: tid,
      membership_id: m.id,
      project_id: p2.id,
    });
    expect((await admin.from('project').delete().eq('id', p2.id)).error).toBeNull();
    const forM = await admin.from('membership_project').select('*').eq('membership_id', m.id);
    expect(forM.error).toBeNull();
    expect(forM.data).toHaveLength(0);

    const p3 = await newProject(tid, { name: 'P3' });
    await insertOne('membership_project', {
      tenant_id: tid,
      membership_id: m.id,
      project_id: p3.id,
    });
    expect((await admin.from('membership').delete().eq('id', m.id)).error).toBeNull();
    const forP3 = await admin.from('membership_project').select('*').eq('project_id', p3.id);
    expect(forP3.error).toBeNull();
    expect(forP3.data).toHaveLength(0);

    // (b) RLS on: one admin row per table exists, anon sees nothing and cannot insert
    const m2 = await newMembership(tid, user.id as string);
    await insertOne('membership_project', {
      tenant_id: tid,
      membership_id: m2.id,
      project_id: p3.id,
    });
    for (const table of Object.keys(COLUMNS)) {
      const { data, error } = await anon.from(table).select('*');
      if (error) {
        expect(error.code, `anon select ${table}`).toBe(PRIVILEGE);
      } else {
        expect(data, `anon select ${table}`).toEqual([]);
      }
    }
    const { error: insertError } = await anon.from('tenant').insert({ name: tenantName('anon') });
    expect(insertError?.code).toBe(PRIVILEGE);
  });

  // ---------- T11 ----------

  it('EZD-005a T11 updated_at moves', async () => {
    const tenant = await newTenant('T11');
    const u0 = tenant.updated_at as string;
    const c0 = tenant.created_at as string;
    await new Promise((r) => setTimeout(r, 20));
    const { error } = await admin.from('tenant').update({ license_no: 'X1' }).eq('id', tenant.id);
    expect(error).toBeNull();
    const { data, error: readError } = await admin
      .from('tenant')
      .select('*')
      .eq('id', tenant.id)
      .single();
    expect(readError).toBeNull();
    const row = data as Row;
    expect(Date.parse(row.updated_at as string)).toBeGreaterThan(Date.parse(u0));
    expect(row.created_at).toBe(c0);
  });
});
