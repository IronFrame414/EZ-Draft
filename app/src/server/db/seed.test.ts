// EZD-005b T1, T12 (vault/plans/EZD-005b.md section 4): the local seed creates Worth Properties as
// tenant 1 with Josh as owner. Admin client (SUPABASE_SECRET_KEY) from EZD-004b's global setup, as
// local-services.test.ts. Expected values: plan Step 1 table (Done when; 02 Scope "WP as tenant 1";
// 02 Users "Owner | Josh"; Q-0029 (a), Q-0121 (a); S15d Decision 5; EZD-005a Step 1).
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { JOSH_USER_ID, TENANT_1_ID } from '../../../test-utils/seed-ids';

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
