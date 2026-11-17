// EZD-129 database tests (AC-EZD-129-1, -2, -3, -4). Expected values: 09n Project scope rows 1-4 (a Listed
// user reads zero rows of any other project; Listed with zero projects saves; All -> Listed ends the user's
// sessions; an added project applies on the next request without a sign-out); Q-0695 decisions 10 rows 59
// (every Users write needs settings_users), 63 (zero listed projects is allowed), 64 (narrowing ends an active
// member's sessions); decisions 03 row 33 (event_log row in the same transaction); Q-0202 (picking a Foreman
// lists them on the project); S01 Permissions (scoped users see only their projects); 03c membership (the
// listed projects belong to a Listed membership only).
// Calls go through the gated serverDb of `signIn` (the real API path).
import { afterAll, describe, expect, it } from 'vitest';
import {
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  harnessSql,
  sessionCount,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { addUser } from '../../../test-harness/users/fixtures';

type RpcResult = { data: unknown; error: { code: string; message: string } | null };

const saveScope = (
  s: Session,
  membershipId: string,
  scope: string,
  projectIds: readonly string[],
): Promise<RpcResult> =>
  s.serverDb.rpc('save_member_scope', {
    p_membership_id: membershipId,
    p_scope: scope,
    p_project_ids: projectIds,
  }) as unknown as Promise<RpcResult>;

async function listedOf(membershipId: string): Promise<string[]> {
  const rows = await harnessSql()<{ id: string }[]>`
    select project_id::text as id from public.membership_project
    where membership_id = ${membershipId}::uuid order by project_id`;
  return rows.map((r) => r.id);
}

async function scopeOf(membershipId: string): Promise<string> {
  const rows = await harnessSql()<{ scope: string }[]>`
    select scope from public.membership where id = ${membershipId}::uuid`;
  return rows[0].scope;
}

async function scopeEvents(membershipId: string) {
  return harnessSql()<{ details: Record<string, unknown>; actor_app_user_id: string }[]>`
    select details, actor_app_user_id::text as actor_app_user_id from public.event_log
    where action = 'user.scope_changed' and object_id = ${membershipId}::uuid order by at, id`;
}

async function setScope(m: Member, scope: 'all' | 'listed', listed: readonly string[] = []) {
  await harnessSql()`update public.membership set scope = ${scope} where id = ${m.membershipId}::uuid`;
  for (const p of listed) {
    await harnessSql()`insert into public.membership_project (tenant_id, membership_id, project_id)
      select tenant_id, id, ${p}::uuid from public.membership where id = ${m.membershipId}::uuid`;
  }
}

const sorted = (ids: readonly string[]) => [...ids].sort();

async function visibleProjectIds(s: Session): Promise<string[]> {
  const { data, error } = await s.serverDb.from('project').select('id');
  if (error) throw new Error(error.message);
  return sorted((data as { id: string }[]).map((r) => r.id));
}

async function listedPage(s: Session): Promise<string[]> {
  const { data, error } = await s.serverDb.rpc('list_projects', { p_sort: 'name' });
  if (error) throw new Error(error.message);
  return sorted((data as { items: { id: string }[] }).items.map((i) => i.id));
}

afterAll(async () => {
  await cleanup();
  await closeHarness();
});

describe('EZD-129 a Listed user sees only their projects (AC-1; 09n Project scope row 1)', () => {
  it('reads zero rows for any other project id, and the Projects list holds only the listed one', async () => {
    const t = await createTenant();
    const [p1, p2] = await createProjects(t, 2);
    const foreman = await addUser(t, { preset: 'foreman', name: 'Listed Foreman' });
    await setScope(foreman, 'listed', [p1]);
    const s = await signIn(foreman.email);

    const other = await s.serverDb.from('project').select('id').eq('id', p2);
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
    expect(await visibleProjectIds(s)).toEqual([p1]);
    expect(await listedPage(s)).toEqual([p1]);
  }, 120000);
});

describe('EZD-129 save_member_scope (AC-2, AC-4)', () => {
  it('Save writes membership.scope and the membership_project rows; All clears the list', async () => {
    const t = await createTenant();
    const [p1, p2, p3] = await createProjects(t, 3);
    const owner = await addUser(t, { preset: 'owner', name: 'Scope Owner' });
    const crew = await addUser(t, { preset: 'crew', name: 'Scope Crew' });
    const so = await signIn(owner.email);

    const r = await saveScope(so, crew.membershipId, 'listed', [p1, p2]);
    expect(r.error).toBeNull();
    expect(await scopeOf(crew.membershipId)).toBe('listed');
    expect(await listedOf(crew.membershipId)).toEqual(sorted([p1, p2]));
    expect(r.data).toMatchObject({ scope: 'listed', changed: true, oldScope: 'all' });

    // Replace the list: p2 stays, p1 goes, p3 comes.
    const r2 = await saveScope(so, crew.membershipId, 'listed', [p2, p3]);
    expect(r2.error).toBeNull();
    expect(await listedOf(crew.membershipId)).toEqual(sorted([p2, p3]));
    expect(r2.data).toMatchObject({ added: [p3], removed: [p1] });

    const r3 = await saveScope(so, crew.membershipId, 'all', []);
    expect(r3.error).toBeNull();
    expect(await scopeOf(crew.membershipId)).toBe('all');
    expect(await listedOf(crew.membershipId)).toEqual([]);
  }, 120000);

  it('member_scope answers the scope and the listed projects by name', async () => {
    const t = await createTenant();
    const [p1, p2] = await createProjects(t, 2);
    await harnessSql()`update public.project set name = 'Zeta kitchen' where id = ${p1}::uuid`;
    await harnessSql()`update public.project set name = 'alpha bath' where id = ${p2}::uuid`;
    const owner = await addUser(t, { preset: 'owner' });
    const crew = await addUser(t, { preset: 'crew' });
    await setScope(crew, 'listed', [p1, p2]);
    const so = await signIn(owner.email);
    const { data, error } = await so.serverDb.rpc('member_scope', {
      p_membership_id: crew.membershipId,
    });
    expect(error).toBeNull();
    expect(data).toEqual({
      membershipId: crew.membershipId,
      scope: 'listed',
      projects: [
        { id: p2, name: 'alpha bath' },
        { id: p1, name: 'Zeta kitchen' },
      ],
    });
  }, 120000);

  it('Listed with zero projects saves, and that user then sees no project (AC-4; 09n row 2)', async () => {
    const t = await createTenant();
    await createProjects(t, 2);
    const owner = await addUser(t, { preset: 'owner' });
    const crew = await addUser(t, { preset: 'crew' });
    const so = await signIn(owner.email);
    const r = await saveScope(so, crew.membershipId, 'listed', []);
    expect(r.error).toBeNull();
    expect(await scopeOf(crew.membershipId)).toBe('listed');
    expect(await listedOf(crew.membershipId)).toEqual([]);
    const sc = await signIn(crew.email);
    expect(await visibleProjectIds(sc)).toEqual([]);
    expect(await listedPage(sc)).toEqual([]);
  }, 120000);

  it('All -> Listed ends the active member\'s sessions (09n row 3)', async () => {
    const t = await createTenant();
    const [p1] = await createProjects(t, 1);
    const owner = await addUser(t, { preset: 'owner' });
    const crew = await addUser(t, { preset: 'crew' });
    await signIn(crew.email);
    expect(await sessionCount(crew.authUserId)).toBe(1);
    const so = await signIn(owner.email);
    expect((await saveScope(so, crew.membershipId, 'listed', [p1])).error).toBeNull();
    expect(await sessionCount(crew.authUserId)).toBe(0);
  }, 120000);

  it('an added project applies on the next request without a sign-out (AC-4; 09n row 4)', async () => {
    const t = await createTenant();
    const [p1, p2] = await createProjects(t, 2);
    const owner = await addUser(t, { preset: 'owner' });
    const crew = await addUser(t, { preset: 'crew' });
    await setScope(crew, 'listed', [p1]);
    const sc = await signIn(crew.email);
    expect(await visibleProjectIds(sc)).toEqual([p1]);
    const so = await signIn(owner.email);
    expect((await saveScope(so, crew.membershipId, 'listed', [p1, p2])).error).toBeNull();
    expect(await sessionCount(crew.authUserId)).toBe(1);
    expect(await visibleProjectIds(sc)).toEqual(sorted([p1, p2]));
    expect(await listedPage(sc)).toEqual(sorted([p1, p2]));
  }, 120000);

  it('removing a listed project ends the active member\'s sessions (Q-0695 row 64)', async () => {
    const t = await createTenant();
    const [p1, p2] = await createProjects(t, 2);
    const owner = await addUser(t, { preset: 'owner' });
    const crew = await addUser(t, { preset: 'crew' });
    await setScope(crew, 'listed', [p1, p2]);
    await signIn(crew.email);
    const so = await signIn(owner.email);
    expect((await saveScope(so, crew.membershipId, 'listed', [p1])).error).toBeNull();
    expect(await sessionCount(crew.authUserId)).toBe(0);
  }, 120000);

  it('an invited member\'s scope saves (the Invite dialog list) and ends no session of theirs elsewhere', async () => {
    const t = await createTenant();
    const [p1] = await createProjects(t, 1);
    const owner = await addUser(t, { preset: 'owner' });
    // The same person, active in company B, invited to company A.
    const tb = await createTenant();
    const inB = await addUser(tb, { preset: 'crew' });
    await harnessSql()`insert into public.membership (tenant_id, user_id, status, scope)
      values (${t}::uuid, ${inB.appUserId}::uuid, 'invited', 'all')`;
    const inv = await harnessSql()<{ id: string }[]>`select id::text as id from public.membership
      where tenant_id = ${t}::uuid and user_id = ${inB.appUserId}::uuid`;
    await signIn(inB.email);
    expect(await sessionCount(inB.authUserId)).toBe(1);
    const so = await signIn(owner.email);
    expect((await saveScope(so, inv[0].id, 'listed', [p1])).error).toBeNull();
    expect(await listedOf(inv[0].id)).toEqual([p1]);
    expect(await sessionCount(inB.authUserId)).toBe(1);
  }, 120000);

  it('writes one user.scope_changed event_log row per change and none for a save that changes nothing', async () => {
    const t = await createTenant();
    const [p1] = await createProjects(t, 1);
    const owner = await addUser(t, { preset: 'owner' });
    const crew = await addUser(t, { preset: 'crew' });
    const so = await signIn(owner.email);
    expect((await saveScope(so, crew.membershipId, 'listed', [p1])).error).toBeNull();
    const again = await saveScope(so, crew.membershipId, 'listed', [p1]);
    expect(again.error).toBeNull();
    expect(again.data).toMatchObject({ changed: false });
    const rows = await scopeEvents(crew.membershipId);
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_app_user_id).toBe(owner.appUserId);
    expect(rows[0].details).toEqual({
      membershipId: crew.membershipId,
      appUserId: crew.appUserId,
      oldScope: 'all',
      scope: 'listed',
      added: [p1],
      removed: [],
    });
  }, 120000);

  it('refuses, writing nothing: no settings_users, another company\'s member or project, an archived or benchmark project, bad input', async () => {
    const t = await createTenant();
    const [p1, archived, bench] = await createProjects(t, 3);
    await harnessSql()`update public.project set archived_at = now() where id = ${archived}::uuid`;
    await harnessSql()`update public.project set is_benchmark = true where id = ${bench}::uuid`;
    const tb = await createTenant();
    const [otherProject] = await createProjects(tb, 1);
    const otherMember = await addUser(tb, { preset: 'crew' });
    const owner = await addUser(t, { preset: 'owner' });
    const designer = await addUser(t, { preset: 'designer' });
    const crew = await addUser(t, { preset: 'crew' });
    const so = await signIn(owner.email);

    const noSwitch = await saveScope(await signIn(designer.email), crew.membershipId, 'listed', [p1]);
    expect(noSwitch.error?.code).toBe('42501');
    const otherCo = await saveScope(so, otherMember.membershipId, 'listed', []);
    expect(otherCo.error).toMatchObject({ code: 'P0002', message: 'member_not_found' });
    for (const bad of [otherProject, archived, bench]) {
      const r = await saveScope(so, crew.membershipId, 'listed', [p1, bad]);
      expect(r.error).toMatchObject({ code: '22023', message: 'project_unavailable' });
    }
    const tooMany = Array.from({ length: 1001 }, () => crypto.randomUUID());
    for (const [scope, ids] of [
      ['some', []],
      ['all', [p1]],
      ['listed', [p1, p1]],
      ['listed', tooMany],
    ] as const) {
      const r = await saveScope(so, crew.membershipId, scope, ids);
      expect(r.error, `${scope} ${ids.length}`).toMatchObject({
        code: '22023',
        message: 'invalid_input',
      });
    }
    expect(await scopeOf(crew.membershipId)).toBe('all');
    expect(await listedOf(crew.membershipId)).toEqual([]);
    expect(await scopeEvents(crew.membershipId)).toEqual([]);
  }, 120000);

  it('two saves of one member at once both finish and leave one of the two lists', async () => {
    const t = await createTenant();
    const [p1, p2] = await createProjects(t, 2);
    const owner = await addUser(t, { preset: 'owner' });
    const crew = await addUser(t, { preset: 'crew' });
    const so = await signIn(owner.email);
    const [a, b] = await Promise.all([
      saveScope(so, crew.membershipId, 'listed', [p1]),
      saveScope(so, crew.membershipId, 'listed', [p2]),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    const after = await listedOf(crew.membershipId);
    expect([[p1], [p2]]).toContainEqual(after);
  }, 120000);
});

describe('EZD-129 list_scope_projects (the picker)', () => {
  it('lists the company\'s live projects by name (not archived, not the benchmark), matched on name or address, 50 and a more flag', async () => {
    const t = await createTenant();
    const ids = await createProjects(t, 52);
    await harnessSql()`update public.project set archived_at = now() where id = ${ids[0]}::uuid`;
    await harnessSql()`update public.project set is_benchmark = true where id = ${ids[1]}::uuid`;
    await harnessSql()`update public.project set name = 'Hendricks kitchen' where id = ${ids[2]}::uuid`;
    await harnessSql()`update public.project set address = '9 Oak Lane' where id = ${ids[3]}::uuid`;
    const tb = await createTenant();
    await createProjects(tb, 1);
    const owner = await addUser(t, { preset: 'owner' });
    // A Listed holder of settings_users still sees every project to choose from.
    await setScope(owner, 'listed', []);
    const so = await signIn(owner.email);

    const all = await so.serverDb.rpc('list_scope_projects', { p_search: '' });
    expect(all.error).toBeNull();
    const page = all.data as { items: { id: string; name: string }[]; more: boolean };
    // 52 - archived - benchmark = 50 live projects: exactly one page, no more.
    expect(page.items).toHaveLength(50);
    expect(page.more).toBe(false);
    expect(page.items.map((i) => i.id)).not.toContain(ids[0]);
    expect(page.items.map((i) => i.id)).not.toContain(ids[1]);
    const names = page.items.map((i) => i.name.toLowerCase());
    expect(names).toEqual([...names].sort());

    await createProjects(t, 1);
    const more = await so.serverDb.rpc('list_scope_projects', { p_search: '' });
    expect((more.data as { more: boolean }).more).toBe(true);

    const byName = await so.serverDb.rpc('list_scope_projects', { p_search: 'hendricks' });
    expect((byName.data as { items: { id: string }[] }).items.map((i) => i.id)).toEqual([ids[2]]);
    const byAddress = await so.serverDb.rpc('list_scope_projects', { p_search: 'oak lane' });
    expect((byAddress.data as { items: { id: string }[] }).items.map((i) => i.id)).toEqual([
      ids[3],
    ]);
  }, 120000);

  it('needs settings_users', async () => {
    const t = await createTenant();
    const designer = await addUser(t, { preset: 'designer' });
    const s = await signIn(designer.email);
    const r = await s.serverDb.rpc('list_scope_projects', { p_search: '' });
    expect(r.error?.code).toBe('42501');
    const m = await s.serverDb.rpc('member_scope', { p_membership_id: designer.membershipId });
    expect(m.error?.code).toBe('42501');
  }, 120000);
});

type CreateArgs = Record<string, unknown>;
const createArgs = (foreman?: string): CreateArgs => ({
  p_name: 'Foreman kitchen',
  p_address: '1 Foreman St',
  p_type: 'kitchen',
  p_customer_id: null,
  p_scope_of_work: null,
  ...(foreman !== undefined ? { p_foreman_membership_id: foreman } : {}),
});

async function create(s: Session, args: CreateArgs): Promise<{ id: string | null; error: RpcResult['error'] }> {
  const { data, error } = (await s.serverDb.rpc('create_project', args)) as unknown as {
    data: { project_id: string }[] | null;
    error: RpcResult['error'];
  };
  return { id: data?.[0]?.project_id ?? null, error };
}

async function projectCount(tenant: string): Promise<number> {
  const rows = await harnessSql()<{ n: number }[]>`
    select count(*)::int as n from public.project where tenant_id = ${tenant}::uuid`;
  return rows[0].n;
}

describe('EZD-129 the wizard\'s Foreman (AC-3; Q-0202)', () => {
  it('a Listed Foreman is listed on the new project, with its event_log row; an All Foreman gets no row', async () => {
    const t = await createTenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Wizard Owner' });
    const listed = await addUser(t, { preset: 'foreman', name: 'Luis Listed' });
    const all = await addUser(t, { preset: 'foreman', name: 'Ana All' });
    await setScope(listed, 'listed', []);
    const so = await signIn(owner.email);

    const a = await create(so, createArgs(listed.membershipId));
    expect(a.error).toBeNull();
    expect(await listedOf(listed.membershipId)).toEqual([a.id]);
    const events = await scopeEvents(listed.membershipId);
    expect(events).toHaveLength(1);
    expect(events[0].details).toMatchObject({ added: [a.id], removed: [], scope: 'listed' });

    const b = await create(so, createArgs(all.membershipId));
    expect(b.error).toBeNull();
    expect(await listedOf(all.membershipId)).toEqual([]);

    // The listed Foreman now sees the new project.
    const sl = await signIn(listed.email);
    expect(await visibleProjectIds(sl)).toEqual([a.id]);
  }, 120000);

  it('the creator as their own Foreman is listed once', async () => {
    const t = await createTenant();
    const creator = await addUser(t, { preset: 'foreman' });
    await setScope(creator, 'listed', []);
    const s = await signIn(creator.email);
    const r = await create(s, createArgs(creator.membershipId));
    expect(r.error).toBeNull();
    expect(await listedOf(creator.membershipId)).toEqual([r.id]);
  }, 120000);

  it('an invited, deactivated or other-company Foreman is refused and nothing is created', async () => {
    const t = await createTenant();
    const owner = await addUser(t, { preset: 'owner' });
    const invited = await addUser(t, { preset: 'foreman', status: 'invited' });
    const off = await addUser(t, { preset: 'foreman', status: 'deactivated' });
    const tb = await createTenant();
    const elsewhere = await addUser(tb, { preset: 'foreman' });
    const so = await signIn(owner.email);
    const before = await projectCount(t);
    for (const m of [invited, off, elsewhere]) {
      const r = await create(so, createArgs(m.membershipId));
      expect(r.error).toMatchObject({ code: '22023', message: 'foreman_unavailable' });
    }
    expect(await projectCount(t)).toBe(before);
  }, 120000);

  it('create_project_with_objects passes the Foreman through', async () => {
    const t = await createTenant();
    const owner = await addUser(t, { preset: 'owner' });
    const listed = await addUser(t, { preset: 'foreman' });
    await setScope(listed, 'listed', []);
    const so = await signIn(owner.email);
    const { data, error } = (await so.serverDb.rpc('create_project_with_objects', {
      ...createArgs(listed.membershipId),
      p_objects: [
        {
          id: crypto.randomUUID(),
          type: 'room',
          schema_version: 1,
          data: {},
        },
      ],
    })) as unknown as { data: { project_id: string }[] | null; error: RpcResult['error'] };
    expect(error).toBeNull();
    expect(await listedOf(listed.membershipId)).toEqual([data?.[0]?.project_id]);
  }, 120000);

  it('list_foreman_candidates lists the active members by name and needs Create projects', async () => {
    const t = await createTenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Mario Ruiz' });
    const b = await addUser(t, { preset: 'foreman', name: 'dana Shaw' });
    await setScope(b, 'listed', []);
    await addUser(t, { preset: 'foreman', name: 'Invited Ivy', status: 'invited' });
    await addUser(t, { preset: 'crew', name: 'Off Otto', status: 'deactivated' });
    const crew = await addUser(t, { preset: 'crew', name: 'Crew Carl' });
    const so = await signIn(owner.email);
    const { data, error } = await so.serverDb.rpc('list_foreman_candidates');
    expect(error).toBeNull();
    expect((data as { members: unknown[] }).members).toEqual([
      { membershipId: crew.membershipId, name: 'Crew Carl', email: crew.email, scope: 'all' },
      { membershipId: b.membershipId, name: 'dana Shaw', email: b.email, scope: 'listed' },
      { membershipId: owner.membershipId, name: 'Mario Ruiz', email: owner.email, scope: 'all' },
    ]);
    const sc = await signIn(crew.email);
    const refused = await sc.serverDb.rpc('list_foreman_candidates');
    expect(refused.error?.code).toBe('42501');
  }, 120000);
});
