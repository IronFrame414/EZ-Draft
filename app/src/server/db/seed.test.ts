// EZD-005b T1, T12 (vault/plans/EZD-005b.md section 4): the local seed creates Worth Properties as
// tenant 1 with Josh as owner. Admin client (SUPABASE_SECRET_KEY) from EZD-004b's global setup, as
// local-services.test.ts. Expected values: plan Step 1 table (Done when; 02 Scope "WP as tenant 1";
// 02 Users "Owner | Josh"; Q-0029 (a), Q-0121 (a); S15d Decision 5; EZD-005a Step 1).
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  JOSH_EMAIL,
  JOSH_USER_ID,
  SEED_PROJECT_COUNT,
  TENANT_1_ID,
  TENANT_2_ID,
  TENANT_2_OWNER_EMAIL,
  TENANT_2_OWNER_USER_ID,
  seedProjectId,
} from '../../../test-utils/seed-ids';

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const secret = () => process.env.SUPABASE_SECRET_KEY as string;

// EZD-005.md Step 1.2: fixed ids that strict uuid v4 validators accept.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('EZD-005b seed', () => {
  it('EZD-005b done when: seed creates Worth Properties as tenant 1 with Josh as owner', async () => {
    const admin = createClient(url(), secret(), { auth: { persistSession: false } });

    const tenant = await admin.from('tenant').select('*').eq('id', TENANT_1_ID).maybeSingle();
    expect(tenant.error).toBeNull();
    expect(tenant.data).not.toBeNull();
    expect(tenant.data?.name).toBe('Worth Properties');

    const user = await admin.from('app_user').select('*').eq('id', JOSH_USER_ID).maybeSingle();
    expect(user.error).toBeNull();
    expect(user.data).not.toBeNull();
    expect(user.data?.name).toBe('Josh Bishop');
    expect(user.data?.email).toBe('josh@example.com');
    expect(user.data?.language).toBe('en');
    expect(user.data?.role_preset).toBe('owner');
    expect(user.data?.ipad_input_mode).toBeNull();
    expect(user.data?.auth_user_id).toBeNull();

    const memberships = await admin
      .from('membership')
      .select('*')
      .eq('tenant_id', TENANT_1_ID)
      .eq('user_id', JOSH_USER_ID);
    expect(memberships.error).toBeNull();
    expect(memberships.data).toHaveLength(1);
    const m = memberships.data?.[0];
    expect(m?.status).toBe('active');
    expect(m?.scope).toBe('all');
    expect(m?.invited_at).toBeNull();
  });

  it('EZD-005b T12 seed ids are the fixed values and uuid v4 shaped', () => {
    expect(TENANT_1_ID).toBe('00000000-0000-4000-8000-000000000001');
    expect(JOSH_USER_ID).toBe('00000000-0000-4000-8000-000000001001');
    expect(TENANT_1_ID).toMatch(UUID_V4);
    expect(JOSH_USER_ID).toMatch(UUID_V4);
  });
});

// EZD-016c (vault/plans/EZD-016c.md sections 3, 4). Seeded rows are only read; queries filter by
// the seeded ids because other test files create tenants at the same time.
const REPO = resolve(__dirname, '../../../..');
const T2 = '00000000-0000-4000-8000-000000000002';
const ids = Array.from({ length: SEED_PROJECT_COUNT }, (_, k) => seedProjectId(k + 1));

describe('EZD-016c seed', () => {
  it('EZD-016c done when: after db:up the local database holds tenant 2 with its owner and 200 tenant 1 projects, and tenant 1 and Josh are unchanged', async () => {
    const admin = createClient(url(), secret(), { auth: { persistSession: false } });

    const t2 = await admin.from('tenant').select('*').eq('id', TENANT_2_ID).maybeSingle();
    expect(t2.error).toBeNull();
    expect(t2.data?.name).toBe('Test Tenant 2');
    const t1 = await admin.from('tenant').select('*').eq('id', TENANT_1_ID).maybeSingle();
    expect(t1.data?.name).toBe('Worth Properties');

    const owner = await admin
      .from('app_user')
      .select('*')
      .eq('id', TENANT_2_OWNER_USER_ID)
      .maybeSingle();
    expect(owner.error).toBeNull();
    expect(owner.data?.name).toBe('Tenant 2 Owner');
    expect(owner.data?.email).toBe('tenant2-owner@example.com');
    expect(owner.data?.language).toBe('en');
    expect(owner.data?.role_preset).toBe('owner');
    expect(owner.data?.ipad_input_mode).toBeNull();
    expect(owner.data?.auth_user_id).toBeNull();

    const josh = await admin.from('app_user').select('*').eq('id', JOSH_USER_ID).maybeSingle();
    expect(josh.data?.name).toBe('Josh Bishop');
    expect(josh.data?.email).toBe('josh@example.com');
    expect(josh.data?.language).toBe('en');
    expect(josh.data?.role_preset).toBe('owner');
    expect(josh.data?.ipad_input_mode).toBeNull();
    expect(josh.data?.auth_user_id).toBeNull();

    for (const [userId, tenantId] of [
      [TENANT_2_OWNER_USER_ID, TENANT_2_ID],
      [JOSH_USER_ID, TENANT_1_ID],
    ]) {
      const ms = await admin.from('membership').select('*').eq('user_id', userId);
      expect(ms.error).toBeNull();
      expect(ms.data).toHaveLength(1);
      expect(ms.data?.[0]?.tenant_id).toBe(tenantId);
      expect(ms.data?.[0]?.status).toBe('active');
      expect(ms.data?.[0]?.scope).toBe('all');
      expect(ms.data?.[0]?.invited_at).toBeNull();
    }

    const p1 = await admin
      .from('project')
      .select('*')
      .eq('tenant_id', TENANT_1_ID)
      .order('id', { ascending: true })
      .limit(1000);
    expect(p1.error).toBeNull();
    const rows = p1.data ?? [];
    expect(rows).toHaveLength(200);
    expect(rows.map((r) => r.id)).toEqual(ids);
    const p2 = await admin.from('project').select('id').eq('tenant_id', TENANT_2_ID);
    expect(p2.data).toHaveLength(0);

    const count = (key: 'status' | 'type', v: string) => rows.filter((r) => r[key] === v).length;
    for (const s of ['draft', 'client_review', 'permit_submitted', 'approved', 'in_build']) {
      expect(count('status', s)).toBe(40);
    }
    expect(count('type', 'kitchen')).toBe(67);
    expect(count('type', 'bath')).toBe(67);
    expect(count('type', 'whole_home_interior')).toBe(66);
    expect(rows.every((r) => r.archived_at === null)).toBe(true);
    expect(rows.every((r) => r.open_items_count === 0)).toBe(true);

    const first = rows[0];
    expect(first?.name).toBe('Seed project 001');
    expect(first?.client_name).toBe('Seed client 001');
    expect(first?.address).toBe('Seed address 001');
    expect(first?.type).toBe('kitchen');
    expect(first?.status).toBe('draft');
    expect(Date.parse(first?.created_at as string)).toBe(Date.parse('2026-10-01T12:00:00Z'));
    const last = rows[199];
    expect(last?.name).toBe('Seed project 200');
    expect(last?.client_name).toBe('Seed client 200');
    expect(last?.address).toBe('Seed address 200');
    expect(last?.type).toBe('bath');
    expect(last?.status).toBe('in_build');
    expect(Date.parse(last?.created_at as string)).toBe(Date.parse('2026-09-23T05:00:00Z'));

    const created = rows.map((r) => Date.parse(r.created_at as string));
    expect(new Set(created).size).toBe(200);
    rows.forEach((r) => {
      expect(Date.parse(r.updated_at as string)).toBe(Date.parse(r.created_at as string));
    });

    const mp = await admin.from('membership_project').select('*').in('project_id', ids);
    expect(mp.error).toBeNull();
    expect(mp.data).toHaveLength(0);
  });

  it('EZD-016c T4 (b) seed file has the new rows, the bootstrap file and the docs say so', () => {
    const seed = readFileSync(resolve(REPO, 'supabase/seed.sql'), 'utf8');
    expect(seed).toContain('generate_series(1, 200)');
    expect(seed).toContain(T2);
    const boot = readFileSync(resolve(REPO, 'supabase/bootstrap/tenant-1.sql'), 'utf8');
    expect(boot).not.toContain(T2);
    expect(boot).not.toContain('tenant2-owner');
    expect(boot).not.toContain('generate_series');
    const arch = readFileSync(resolve(REPO, 'docs/architecture.md'), 'utf8');
    const start = arch.indexOf('### Tenancy tables (EZD-005)');
    expect(start).toBeGreaterThanOrEqual(0);
    const rest = arch.slice(start + 3);
    const end = rest.indexOf('\n##');
    const section = end === -1 ? rest : rest.slice(0, end);
    expect(section).toContain(T2);
    expect(section).toContain('tenant2-owner@example.com');
    expect(section).toContain('TENANT_2_ID');
    expect(section).toContain('seedProjectId');
  });

  it('EZD-016c T4 (c) seed ids are the fixed values and uuid v4 shaped', () => {
    expect(TENANT_1_ID).toBe('00000000-0000-4000-8000-000000000001');
    expect(JOSH_USER_ID).toBe('00000000-0000-4000-8000-000000001001');
    expect(TENANT_2_ID).toBe('00000000-0000-4000-8000-000000000002');
    expect(TENANT_2_OWNER_USER_ID).toBe('00000000-0000-4000-8000-000000002001');
    expect(JOSH_EMAIL).toBe('josh@example.com');
    expect(TENANT_2_OWNER_EMAIL).toBe('tenant2-owner@example.com');
    expect(SEED_PROJECT_COUNT).toBe(200);
    expect(seedProjectId(1)).toBe('00000000-0000-4000-8000-000000100001');
    expect(seedProjectId(200)).toBe('00000000-0000-4000-8000-000000100200');
    expect(TENANT_2_ID).toMatch(UUID_V4);
    expect(TENANT_2_OWNER_USER_ID).toMatch(UUID_V4);
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(200);
    expect(() => seedProjectId(0)).toThrow(RangeError);
    expect(() => seedProjectId(201)).toThrow(RangeError);
    expect(() => seedProjectId(1.5)).toThrow(RangeError);
  });
});
