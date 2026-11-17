// EZD-223 (S15d iPad input mode; Q-0392; glossary 00c: null = Pencil or finger; AC-EZD-223-4). Local database, real
// sign-in (harness as plan-scale.db.test.ts). loadModel carries the signed-in viewer's own iPad drawing setting, and
// never another user's.
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
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import type { PermissionContext } from '../permissions/context';
import { loadModel } from './model';

const ctxOf = (m: { appUserId: string; membershipId: string }): PermissionContext => ({
  appUserId: m.appUserId,
  membershipId: m.membershipId,
  scope: 'all',
  permissions: new Set(['view_projects', 'edit_model']),
  listedProjectIds: new Set<string>(),
});

describe('EZD-223 loadModel iPad drawing', () => {
  let project = '';
  let pencil: Member;
  let other: Member;
  let pencilSession: Session;
  let otherSession: Session;

  beforeAll(async () => {
    const tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    pencil = await createMember({ tenantId: tenant, scope: 'all' });
    other = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, pencil.membershipId, ['view_projects', 'edit_model']);
    await setPermissions(tenant, other.membershipId, ['view_projects', 'edit_model']);
    await harnessSql()`update public.app_user set ipad_input_mode = 'pencil'
      where id = ${pencil.appUserId}::uuid`;
    await harnessSql()`update public.app_user set ipad_input_mode = null
      where id = ${other.appUserId}::uuid`;
    pencilSession = await signIn(pencil.email);
    otherSession = await signIn(other.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('a Pencil-only user loads pencil; a user with no setting loads finger', async () => {
    const a = await loadModel(
      pencilSession.serverDb as unknown as SupabaseClient<Database>,
      project!,
      ctxOf(pencil),
    );
    expect(a?.viewer.ipadDrawing).toBe('pencil');
    const b = await loadModel(
      otherSession.serverDb as unknown as SupabaseClient<Database>,
      project!,
      ctxOf(other),
    );
    expect(b?.viewer.ipadDrawing).toBe('finger');
  });
});
