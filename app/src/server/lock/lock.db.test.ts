// EZD-125 (S06 Edit lock; Q-0697 decisions 03 "Edit lock data", "Auto release", decisions 10 "Phase 8
// permissions"; 03b rules 6, 7; 09o Auto-release deadline, lock_epoch, Requests; AC-EZD-125-1 to -3, -5 to
// -7, -9, -10): the edit lock functions on the real database, called through the gated serverDb of `signIn`
// as a route does. Deadlines are aged by backdating deadline_at through the service-role fixture (Q-0697 03:
// fake-clock.ts cannot age SQL now()). Expected values come from the 09o tables and the decisions.
import { randomUUID } from 'node:crypto';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
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

type Json = Record<string, unknown>;
type Person = { member: Member; session: Session; name: string };

const EDITOR = ['view_projects', 'edit_model'] as const;
const VIEWER = ['view_projects'] as const;
const IP = '203.0.113.7';

async function person(
  tenant: string,
  name: string,
  perms: readonly ('view_projects' | 'edit_model')[],
): Promise<Person> {
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, [...perms]);
  await harnessSql()`update public.app_user set name = ${name} where id = ${member.appUserId}::uuid`;
  return { member, session: await signIn(member.email), name };
}

type World = { tenant: string; project: string; a: Person; b: Person; c: Person; viewer: Person };

async function world(): Promise<World> {
  const tenant = await createTenant();
  const [project] = await createProjects(tenant, 1);
  return {
    tenant,
    project,
    a: await person(tenant, 'Ana Holder', EDITOR),
    b: await person(tenant, 'Ben Requester', EDITOR),
    c: await person(tenant, 'Cal Third', EDITOR),
    viewer: await person(tenant, 'Vic Viewer', VIEWER),
  };
}

const rpc = async (p: Person, fn: string, args: Json) => {
  const r = await p.session.serverDb.rpc(fn, args);
  return { data: r.data as Json | null, code: r.error?.code ?? null };
};
const acquire = (w: World, p: Person, device = 'device-1') =>
  rpc(p, 'acquire_edit_lock', { p_project: w.project, p_device_id: device, p_ip: IP });
const release = (w: World, p: Person, reason = 'stop_editing', epoch: number | null = null) =>
  rpc(p, 'release_edit_lock', {
    p_project: w.project,
    p_reason: reason,
    p_lock_epoch: epoch,
    p_ip: IP,
  });
const request = (w: World, p: Person, minutes = 5) =>
  rpc(p, 'request_edit_lock', { p_project: w.project, p_minutes: minutes, p_ip: IP });
const cancel = (w: World, p: Person) =>
  rpc(p, 'cancel_edit_request', { p_project: w.project, p_ip: IP });
const respond = (w: World, p: Person, requestId: unknown, response: string) =>
  rpc(p, 'respond_edit_request', {
    p_project: w.project,
    p_request: requestId,
    p_response: response,
    p_ip: IP,
  });
const read = (w: World, p: Person) => rpc(p, 'read_edit_lock', { p_project: w.project });

const floorOf = async (project: string) =>
  (
    await harnessSql()<{ object_id: string }[]>`
      select object_id from public.model_object where project_id = ${project}::uuid and type = 'floor'`
  )[0].object_id;
const wall = (id: string, baseSeq: number, level: string) => ({
  id,
  base_seq: baseSeq,
  deleted: false,
  type: 'wall',
  schema_version: 1,
  data: { n: 1, level },
});
const save = async (w: World, p: Person, epoch: number, changes: unknown[]) =>
  rpc(p, 'save_objects', { p_project: w.project, p_lock_epoch: epoch, p_changes: changes });

const lockRow = async (project: string) =>
  (
    await harnessSql()<
      {
        lock_epoch: string;
        holder_app_user_id: string | null;
        since: Date | null;
        device_id: string | null;
      }[]
    >`select lock_epoch, holder_app_user_id, since, device_id from public.edit_lock
      where project_id = ${project}::uuid`
  )[0];
const epochOf = async (project: string) => Number((await lockRow(project))?.lock_epoch ?? 0);
const requestRows = (project: string) =>
  harnessSql()<
    {
      id: string;
      requester_app_user_id: string;
      requested_at: Date;
      deadline_at: Date;
      response: string | null;
      responded_at: Date | null;
    }[]
  >`select id, requester_app_user_id, requested_at, deadline_at, response, responded_at
    from public.edit_request where project_id = ${project}::uuid order by requested_at, id`;
const backdate = (project: string) =>
  harnessSql()`update public.edit_request
    set requested_at = requested_at - interval '1 day', deadline_at = now() - interval '1 second'
    where project_id = ${project}::uuid and response is null`;
const versions = (project: string) =>
  harnessSql()<
    { id: string; created_by: string | null; model_json: { objects: { id: string }[] } }[]
  >`
    select id, created_by, model_json from public.model_version where project_id = ${project}::uuid
    order by created_at, id`;
const events = (project: string) =>
  harnessSql()<
    { action: string; actor_app_user_id: string | null; ip: string | null; details: Json }[]
  >`select action, actor_app_user_id, host(ip) as ip, details from public.event_log
    where object_id = ${project}::uuid and action like 'lock.%' order by at, id`;
const broadcasts = (project: string) =>
  harnessSql()<{ event: string; payload: Json }[]>`
    select event, payload from realtime.messages
    where topic = ${'project:' + project} and event like 'lock.%' order by inserted_at, id`;

describe('EZD-125 edit lock functions', () => {
  // A request inserts a notification_email job (create_notification), so the job queue is held shared.
  let releaseQueue: () => Promise<void> = async () => {};
  beforeAll(async () => {
    releaseQueue = await holdJobQueueShared();
  });
  afterAll(async () => {
    try {
      await cleanup();
      await closeHarness();
    } finally {
      await releaseQueue();
    }
  });

  it('AC-EZD-125-2 two simultaneous Start editing calls give the lock to exactly one user; the other is told who holds it', async () => {
    const w = await world();
    const [ra, rb] = await Promise.all([acquire(w, w.a), acquire(w, w.b)]);
    expect(ra.code).toBeNull();
    expect(rb.code).toBeNull();
    const results = [ra.data, rb.data];
    const won = results.filter((r) => r?.status === 'acquired');
    const lost = results.filter((r) => r?.status === 'held');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    const winner = ra.data?.status === 'acquired' ? w.a : w.b;
    expect(lost[0]?.holder_app_user_id).toBe(winner.member.appUserId);
    expect((await lockRow(w.project)).holder_app_user_id).toBe(winner.member.appUserId);
    expect(await epochOf(w.project)).toBe(1);
  }, 60000);

  it('AC-EZD-125-3 lock_epoch: 09o rows 1-5 (acquire 1, second tab stays 1, release 2 refuses the old save, B 3)', async () => {
    const w = await world();
    const level = await floorOf(w.project);
    // Row 1: a free project (0); A starts editing: 1.
    expect(await epochOf(w.project)).toBe(0);
    expect((await acquire(w, w.a, 'tab-1')).data).toMatchObject({
      status: 'acquired',
      lock_epoch: 1,
    });
    // Row 2: A's second tab: stays 1, both tabs save.
    expect((await acquire(w, w.a, 'tab-2')).data).toMatchObject({
      status: 'acquired',
      lock_epoch: 1,
    });
    expect((await lockRow(w.project)).device_id).toBe('tab-2');
    const id = randomUUID();
    expect((await save(w, w.a, 1, [wall(id, 0, level)])).data?.status).toBe('saved');
    expect((await save(w, w.a, 1, [wall(id, 1, level)])).data?.status).toBe('saved');
    // A release: epoch higher; a save with the old epoch is refused.
    expect((await release(w, w.a)).data).toMatchObject({ status: 'released', lock_epoch: 2 });
    expect(await epochOf(w.project)).toBe(2);
    expect((await save(w, w.a, 1, [wall(id, 2, level)])).data?.status).toBe('stale_lock_epoch');
    // Row 4: B starts editing: 3; B saves with 3; A (no longer holder) cannot save even with 3.
    expect((await acquire(w, w.b)).data).toMatchObject({ status: 'acquired', lock_epoch: 3 });
    expect((await save(w, w.b, 3, [wall(id, 2, level)])).data?.status).toBe('saved');
    expect((await save(w, w.a, 3, [wall(id, 3, level)])).data?.status).toBe('stale_lock_epoch');
  }, 60000);

  it('AC-EZD-125-4 (server) Start editing needs Edit model; a viewer cannot save at the current epoch', async () => {
    const w = await world();
    expect((await acquire(w, w.viewer)).code).toBe('42501');
    expect((await acquire(w, w.a)).data?.status).toBe('acquired');
    // B has Edit model but does not hold the lock: B's save at the holder's epoch is refused.
    const level = await floorOf(w.project);
    expect((await save(w, w.b, 1, [wall(randomUUID(), 0, level)])).data?.status).toBe(
      'stale_lock_epoch',
    );
  }, 60000);

  it('AC-EZD-125-5 Request edit: Edit model, not the holder, one pending per user, a free lock answers free, Cancel ends it (09o Requests 1-3)', async () => {
    const w = await world();
    // Row 3: a request on a free lock is told it is free.
    expect((await request(w, w.b)).data).toMatchObject({ status: 'lock_free' });
    expect(await requestRows(w.project)).toHaveLength(0);

    expect((await acquire(w, w.a)).data?.status).toBe('acquired');
    // Row 2: the holder's own request is refused.
    expect((await request(w, w.a)).data).toMatchObject({ status: 'own_lock' });
    // Without Edit model: refused.
    expect((await request(w, w.viewer)).code).toBe('42501');
    // Row 1: B requests; B requests again: refused; after Cancel a new one is accepted.
    const first = await request(w, w.b);
    expect(first.data).toMatchObject({ status: 'requested' });
    expect((await request(w, w.b)).data).toMatchObject({ status: 'already_requested' });
    expect((await cancel(w, w.b)).data).toMatchObject({
      status: 'cancelled',
      request_id: first.data?.request_id,
    });
    expect((await cancel(w, w.b)).data).toMatchObject({ status: 'no_request' });
    expect((await request(w, w.b)).data).toMatchObject({ status: 'requested' });
    const rows = await requestRows(w.project);
    expect(rows.map((r) => r.response)).toEqual(['cancelled', null]);
    // Only the requester's own request is cancelled by their Cancel.
    expect((await request(w, w.c)).data).toMatchObject({ status: 'requested' });
    expect((await cancel(w, w.c)).data?.status).toBe('cancelled');
    expect((await requestRows(w.project)).filter((r) => r.response === null)).toHaveLength(1);
  }, 60000);

  it('AC-EZD-125-5 the request sends the holder an edit_request notification naming the requester', async () => {
    const w = await world();
    await acquire(w, w.a);
    await request(w, w.b);
    const rows = await harnessSql()<
      { kind: string; payload: Json; link: string; project_id: string }[]
    >`
      select kind, payload, link, project_id from public.notification
      where user_id = ${w.a.member.appUserId}::uuid and tenant_id = ${w.tenant}::uuid`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'edit_request',
      payload: { name: 'Ben Requester' },
      link: `/projects/${w.project}`,
      project_id: w.project,
    });
  }, 60000);

  it('AC-EZD-125-6 Release, Keep editing and Stop editing work only for the holder; after Keep the requester asks again at once', async () => {
    const w = await world();
    await acquire(w, w.a);
    const req = await request(w, w.b);
    const requestId = req.data?.request_id;
    // Not the holder: refused, nothing changes.
    expect((await release(w, w.b)).data).toMatchObject({ status: 'not_holder' });
    expect((await release(w, w.c, 'closed')).data).toMatchObject({ status: 'not_holder' });
    expect((await respond(w, w.b, requestId, 'release')).data).toMatchObject({
      status: 'not_holder',
    });
    expect((await respond(w, w.c, requestId, 'keep')).data).toMatchObject({ status: 'not_holder' });
    expect((await lockRow(w.project)).holder_app_user_id).toBe(w.a.member.appUserId);
    expect(await epochOf(w.project)).toBe(1);
    // A presses Keep editing: the lock stays; B may ask again at once (no cooldown).
    expect((await respond(w, w.a, requestId, 'keep')).data).toMatchObject({
      status: 'kept',
      lock_epoch: 1,
    });
    expect((await respond(w, w.a, requestId, 'keep')).data).toMatchObject({
      status: 'not_pending',
    });
    const again = await request(w, w.b);
    expect(again.data).toMatchObject({ status: 'requested' });
    // A presses Release: a server checkpoint, then the release (reason request_accepted).
    const before = (await versions(w.project)).length;
    expect((await respond(w, w.a, again.data?.request_id, 'release')).data).toMatchObject({
      status: 'released',
      lock_epoch: 2,
    });
    expect((await versions(w.project)).length).toBe(before + 1);
    expect((await lockRow(w.project)).holder_app_user_id).toBeNull();
    expect((await requestRows(w.project)).map((r) => r.response)).toEqual(['keep', 'release']);
    // Stop editing by the new holder only.
    await acquire(w, w.c);
    expect((await release(w, w.a)).data).toMatchObject({ status: 'not_holder' });
    expect((await release(w, w.c)).data).toMatchObject({ status: 'released', lock_epoch: 4 });
  }, 60000);

  it('AC-EZD-125-6 a Keep that arrives after the deadline loses to the auto release (09o deadline row 4)', async () => {
    const w = await world();
    await acquire(w, w.a);
    const req = await request(w, w.b);
    await backdate(w.project);
    const kept = await respond(w, w.a, req.data?.request_id, 'keep');
    expect(kept.data?.status).not.toBe('kept');
    expect(kept.data).toMatchObject({ status: 'not_holder' });
    expect((await lockRow(w.project)).holder_app_user_id).toBeNull();
    expect(await epochOf(w.project)).toBe(2);
    expect((await requestRows(w.project))[0].response).toBe('auto');
  }, 60000);

  it('AC-EZD-125-7 the deadline is requested_at plus the minutes read at request time; a later Defaults change does not move it (09o rows 1-3, 5)', async () => {
    const w = await world();
    await acquire(w, w.a);
    expect((await request(w, w.b, 5)).data?.status).toBe('requested');
    expect((await request(w, w.c, 1)).data?.status).toBe('requested');
    const rows = await requestRows(w.project);
    const minutesOf = (r: { requested_at: Date; deadline_at: Date }) =>
      (r.deadline_at.getTime() - r.requested_at.getTime()) / 60000;
    expect(minutesOf(rows.find((r) => r.requester_app_user_id === w.b.member.appUserId)!)).toBe(5);
    expect(minutesOf(rows.find((r) => r.requester_app_user_id === w.c.member.appUserId)!)).toBe(1);
    // A later Defaults change (to 2 minutes) leaves the open request's deadline as it was.
    await harnessSql()`update public.tenant set defaults = '{"edit_lock_auto_release": 2}'::jsonb
      where id = ${w.tenant}::uuid`;
    expect(await requestRows(w.project)).toEqual(rows);
    // Row 5: minutes 0 and 1,441 refused; 1 and 1,440 accepted.
    const d = await person(w.tenant, 'Dee Fourth', EDITOR);
    const e = await person(w.tenant, 'Eve Fifth', EDITOR);
    expect((await request(w, d, 0)).code).toBe('22023');
    expect((await request(w, d, 1441)).code).toBe('22023');
    expect((await request(w, d, 1440)).data?.status).toBe('requested');
    expect((await request(w, e, 1)).data?.status).toBe('requested');
  }, 90000);

  it('AC-EZD-125-1 an unanswered request releases the lock at its deadline: checkpoint of the saved work first, lock.auto_released with actor system (lock read)', async () => {
    const w = await world();
    const level = await floorOf(w.project);
    await acquire(w, w.a);
    const id = randomUUID();
    expect((await save(w, w.a, 1, [wall(id, 0, level)])).data?.status).toBe('saved');
    const req = await request(w, w.b);
    // Not yet due: a read changes nothing.
    expect((await read(w, w.b)).data).toMatchObject({
      holder_app_user_id: w.a.member.appUserId,
      lock_epoch: 1,
    });
    await backdate(w.project);
    const before = (await versions(w.project)).length;
    const state = await read(w, w.b);
    expect(state.data).toMatchObject({ holder_app_user_id: null, lock_epoch: 2, my_request: null });
    const vs = await versions(w.project);
    expect(vs.length).toBe(before + 1);
    expect(vs[vs.length - 1].created_by).toBe(w.a.member.appUserId);
    expect(vs[vs.length - 1].model_json.objects.map((o) => o.id)).toContain(id);
    expect((await requestRows(w.project))[0].response).toBe('auto');
    const auto = (await events(w.project)).filter((e) => e.action === 'lock.auto_released');
    expect(auto).toHaveLength(1);
    expect(auto[0]).toMatchObject({
      actor_app_user_id: null,
      ip: null,
      details: { request_id: req.data?.request_id, lock_epoch: 2 },
    });
  }, 60000);

  it('AC-EZD-125-7 a save that finds the deadline expired releases, then returns stale_lock_epoch', async () => {
    const w = await world();
    const level = await floorOf(w.project);
    await acquire(w, w.a);
    await request(w, w.b);
    await backdate(w.project);
    const before = (await versions(w.project)).length;
    const r = await save(w, w.a, 1, [wall(randomUUID(), 0, level)]);
    expect(r.code).toBeNull();
    expect(r.data).toEqual({ status: 'stale_lock_epoch' });
    // The release committed with the refused save.
    expect((await lockRow(w.project)).holder_app_user_id).toBeNull();
    expect(await epochOf(w.project)).toBe(2);
    expect((await versions(w.project)).length).toBe(before + 1);
    expect((await events(w.project)).map((e) => e.action)).toContain('lock.auto_released');
  }, 60000);

  it('AC-EZD-125-7 the sweep applies every expired deadline; service_role only', async () => {
    const w = await world();
    const x = await world();
    await acquire(w, w.a);
    await request(w, w.b);
    await acquire(x, x.a);
    await request(x, x.b);
    await backdate(w.project);
    expect((await w.a.session.serverDb.rpc('sweep_edit_locks')).error?.code).toBe('42501');
    const swept = await adminDb().rpc('sweep_edit_locks');
    expect(swept.error).toBeNull();
    expect(swept.data).toBeGreaterThanOrEqual(1);
    expect((await lockRow(w.project)).holder_app_user_id).toBeNull();
    // A request not yet due is left as it is.
    expect((await lockRow(x.project)).holder_app_user_id).toBe(x.a.member.appUserId);
    expect((await requestRows(x.project))[0].response).toBeNull();
  }, 90000);

  it('AC-EZD-125-8 (server) a tab-close release carries its epoch, is refused once the epoch moved, and checkpoints first', async () => {
    const w = await world();
    await acquire(w, w.a);
    expect((await release(w, w.a, 'closed', 7)).data).toMatchObject({ status: 'stale_lock_epoch' });
    expect((await lockRow(w.project)).holder_app_user_id).toBe(w.a.member.appUserId);
    const before = (await versions(w.project)).length;
    expect((await release(w, w.a, 'closed', 1)).data).toMatchObject({
      status: 'released',
      lock_epoch: 2,
    });
    expect((await versions(w.project)).length).toBe(before + 1);
    // Stop editing makes no server checkpoint (the browser made one with its thumbnail just before).
    await acquire(w, w.a);
    const mid = (await versions(w.project)).length;
    expect((await release(w, w.a, 'stop_editing')).data?.status).toBe('released');
    expect((await versions(w.project)).length).toBe(mid);
    expect((await release(w, w.a, 'request_accepted')).code).toBe('22023');
  }, 60000);

  it('AC-EZD-125-9 every lock change writes its event_log row (actor, IP) and broadcasts ids and timestamps only', async () => {
    const w = await world();
    await acquire(w, w.a);
    await acquire(w, w.a, 'tab-2'); // re-acquire: no lock change
    const r1 = await request(w, w.b);
    await cancel(w, w.b);
    const r2 = await request(w, w.b);
    await respond(w, w.a, r2.data?.request_id, 'keep');
    await release(w, w.a);
    await acquire(w, w.b);
    await request(w, w.c);
    await backdate(w.project);
    await read(w, w.c);

    const ev = await events(w.project);
    expect(ev.map((e) => e.action)).toEqual([
      'lock.acquired',
      'lock.requested',
      'lock.request_cancelled',
      'lock.requested',
      'lock.request_declined',
      'lock.released',
      'lock.acquired',
      'lock.requested',
      'lock.auto_released',
    ]);
    const a = w.a.member.appUserId;
    const b = w.b.member.appUserId;
    const c = w.c.member.appUserId;
    expect(ev.map((e) => e.actor_app_user_id)).toEqual([a, b, b, b, a, a, b, c, null]);
    expect(ev.map((e) => e.ip)).toEqual([IP, IP, IP, IP, IP, IP, IP, IP, null]);
    expect(ev[1].details).toMatchObject({ request_id: r1.data?.request_id });
    expect(ev[5].details).toMatchObject({ reason: 'stop_editing', lock_epoch: 2 });

    const bc = await broadcasts(w.project);
    expect(bc.map((m) => m.event)).toEqual([
      'lock.acquired',
      'lock.requested',
      'lock.request_cancelled',
      'lock.requested',
      'lock.request_declined',
      'lock.released',
      'lock.acquired',
      'lock.requested',
      'lock.auto_released',
    ]);
    const isIdOrTime = (k: string, v: unknown) =>
      k === 'reason' ||
      k === 'lockEpoch' ||
      (typeof v === 'string' &&
        (/^[0-9a-f-]{36}$/.test(v) || !Number.isNaN(Date.parse(v as string))));
    for (const m of bc) {
      const payload = { ...m.payload };
      delete payload.id; // realtime.send adds the message id
      for (const [k, v] of Object.entries(payload))
        expect(isIdOrTime(k, v), `${m.event}.${k}`).toBe(true);
      expect(JSON.stringify(payload)).not.toMatch(/Ana|Ben|Cal|example\.com/);
    }
    expect(bc[0].payload).toMatchObject({ holderAppUserId: a, lockEpoch: 1 });
    expect(bc[5].payload).toMatchObject({
      formerHolderAppUserId: a,
      lockEpoch: 2,
      reason: 'stop_editing',
    });
    expect(bc[8].payload).toMatchObject({ formerHolderAppUserId: b, lockEpoch: 4 });
  }, 90000);

  it('AC-EZD-125-9 a refused acquire writes no lock row and no event', async () => {
    const w = await world();
    expect((await acquire(w, w.a, 'x'.repeat(101))).code).toBe('22023');
    expect(await lockRow(w.project)).toBeUndefined();
    expect(await events(w.project)).toHaveLength(0);
  }, 60000);

  it('AC-EZD-125-10 edit_lock and edit_request rows cascade with the project; members cannot write them directly', async () => {
    const w = await world();
    await acquire(w, w.a);
    await request(w, w.b);
    const db = w.b.session.serverDb;
    const writes = [
      await db
        .from('edit_lock')
        .update({ holder_app_user_id: w.b.member.appUserId })
        .eq('project_id', w.project),
      await db.from('edit_request').update({ response: 'release' }).eq('project_id', w.project),
      await db.from('edit_request').delete().eq('project_id', w.project),
      await db.from('edit_request').insert({
        project_id: w.project,
        tenant_id: w.tenant,
        requester_app_user_id: w.b.member.appUserId,
        deadline_at: new Date(Date.now() + 60000).toISOString(),
      }),
    ];
    for (const r of writes) {
      // RLS: a refused write is 42501, or an update/delete that matches no row.
      if (r.error) expect(r.error.code).toBe('42501');
    }
    expect((await lockRow(w.project)).holder_app_user_id).toBe(w.a.member.appUserId);
    expect((await requestRows(w.project)).map((r) => r.response)).toEqual([null]);
    // Members read their project's rows.
    const seen = await db.from('edit_request').select('id').eq('project_id', w.project);
    expect(seen.data).toHaveLength(1);

    await harnessSql()`delete from public.project where id = ${w.project}::uuid`;
    expect(await lockRow(w.project)).toBeUndefined();
    expect(await requestRows(w.project)).toHaveLength(0);
  }, 60000);

  it('a holder whose app_user is removed leaves the lock free with the epoch up and a system release broadcast', async () => {
    const w = await world();
    await acquire(w, w.a);
    await request(w, w.b);
    const sql = harnessSql();
    const user = w.a.member.appUserId;
    await sql`delete from public.notification where user_id = ${user}::uuid`;
    await sql`delete from public.membership where user_id = ${user}::uuid`;
    await sql`delete from public.app_user where id = ${user}::uuid`;
    const row = await lockRow(w.project);
    expect(row).toMatchObject({ holder_app_user_id: null, since: null, device_id: null });
    expect(Number(row.lock_epoch)).toBe(2);
    expect((await broadcasts(w.project)).map((m) => m.event).slice(-1)).toEqual([
      'lock.auto_released',
    ]);
    // B's request is moot now: B is told the lock is free and may start editing.
    expect((await request(w, w.b)).data).toMatchObject({ status: 'lock_free' });
    expect((await acquire(w, w.b)).data).toMatchObject({ status: 'acquired', lock_epoch: 3 });
  }, 60000);

  describeTenantIsolation('edit_request', {
    makeRow: (t, ctx) => ({
      project_id: ctx.projectIds[0],
      tenant_id: t,
      requester_app_user_id: ctx.member.appUserId,
      deadline_at: new Date(Date.now() + 5 * 60000).toISOString(),
    }),
  });
});
