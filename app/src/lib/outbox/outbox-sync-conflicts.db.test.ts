// EZD-299b T10-T12 and the ticket's "Done when" (vault/plans/EZD-299b.md section 1 ticket row, section 4;
// AC-EZD-299-16, -2, -3, -4). Two people (A and B) each run the real sync over fake-indexeddb, their fetch calls
// the route handlers (EZD-120a, EZD-299a) under that person's own sign-in on the local database, and B's
// conflict list reads and writes through the same routes. Expected values: 03b rule 9 and P120a (a new object
// saves at seq 1, every later save of it +1), Q-0511 (c) (Keep mine on a delete either way), Q-0511 (d) and
// Q-0531 (a refused Keep mine returns to the list and notifies again). Done when: the second person's change
// moves to the list and its later edits save; Keep theirs leaves the server value, Keep mine writes the queued
// value.
// EZD-390 (vault/plans/EZD-390.md D-Harness, D-Route, D-Settle, D-Control; AC-EZD-390-1): each route call reads its own copy of the person's cookies, and every hook first waits for every route call to end.
import 'fake-indexeddb/auto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { alertWriteGuardState } from '../../../test-harness/errors/alert-write-guard';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { createOnline } from '../../../test-harness/outbox/sync-support';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../server/auth/supabase-server';
import { createConflictList } from '../conflicts/conflict-list';
import { fetchModel } from './model-api';
import { createIdbOutboxStorage } from './outbox-idb';
import { createOutboxSync } from './outbox-sync';

const state = vi.hoisted(() => ({
  scope: null as null | { getStore(): Map<string, string> | undefined },
}));
const kick = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock('../../server/jobs/kick', () => ({ kickJobRunner: kick.fn }));

vi.mock('next/headers', () => ({
  cookies: async () => {
    const store = state.scope?.getStore() ?? new Map<string, string>();
    return {
      getAll: () => [...store].map(([name, value]) => ({ name, value })),
      set: (name: string, value: string, options: unknown) => {
        const maxAge = (options as { maxAge?: number } | undefined)?.maxAge;
        if (value === '' || maxAge === 0) store.delete(name);
        else store.set(name, value);
      },
    };
  },
  headers: async () => new Headers(),
}));

const cookieScope = new AsyncLocalStorage<Map<string, string>>();
state.scope = cookieScope;
const pending = new Set<Promise<Response>>();

async function settleRouteCalls(): Promise<void> {
  let quiet = false;
  while (!quiet) {
    if (pending.size > 0) {
      await Promise.allSettled([...pending]);
    } else {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      quiet = pending.size === 0;
    }
  }
}

function jarOver(store: Map<string, string>): SessionCookieJar {
  return {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name, value, options) => {
      if (value === '' || options?.maxAge === 0) store.delete(name);
      else store.set(name, value);
    },
    isHttps: () => false,
  };
}

async function cookiesFor(email: string): Promise<Map<string, string>> {
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link.properties) throw new Error(`generateLink failed: ${linkError?.message}`);
  const store = new Map<string, string>();
  const { error } = await createSessionClient(jarOver(store)).auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(`verifyOtp failed: ${error.message}`);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return store;
}

const wall = (level: string, height: number) => ({
  type: 'wall',
  schemaVersion: 1,
  data: {
    geometry: { start: { x: 0, y: 0 }, end: { x: 120, y: 0 } },
    status: 'new',
    level,
    attributes: {
      thickness: 4.5,
      thicknessSide: 'right',
      height,
      topCutToCeiling: false,
      bearing: false,
    },
  },
});

// The route a person's fetch reaches: the handler for the method and path, under a copy of that person's cookies held for that call only (EZD-390 D-Route).
async function handle(
  input: unknown,
  init: RequestInit | undefined,
  calls: { method: string; path: string }[],
): Promise<Response> {
  const url = new URL(String(input), 'http://localhost');
  const method = init?.method ?? 'GET';
  const parts = url.pathname.split('/');
  calls.push({ method, path: url.pathname });
  const request = new Request(url, init);
  if (parts[2] === 'projects' && parts[4] === 'objects' && method === 'POST') {
    const { POST } = await import('../../app/api/projects/[id]/objects/route');
    return POST(request, { params: Promise.resolve({ id: parts[3] }) });
  }
  if (parts[2] === 'projects' && parts[4] === 'sync-conflicts' && method === 'POST') {
    const { POST } = await import('../../app/api/projects/[id]/sync-conflicts/route');
    return POST(request, { params: Promise.resolve({ id: parts[3] }) });
  }
  if (parts[2] === 'projects' && parts[4] === 'model' && method === 'GET') {
    const { GET } = await import('../../app/api/projects/[id]/model/route');
    return GET(request, { params: Promise.resolve({ id: parts[3] }) });
  }
  if (parts[2] === 'sync-conflicts' && parts.length === 3 && method === 'GET') {
    const { GET } = await import('../../app/api/sync-conflicts/route');
    return GET(request);
  }
  if (parts[2] === 'sync-conflicts' && parts.length === 4 && method === 'DELETE') {
    const { DELETE } = await import('../../app/api/sync-conflicts/[conflictId]/route');
    return DELETE(request, { params: Promise.resolve({ conflictId: parts[3] }) });
  }
  throw new Error(`unrouted ${method} ${url.pathname}`);
}

function routeFor(cookies: Map<string, string>, calls: { method: string; path: string }[]) {
  return ((input: unknown, init?: RequestInit): Promise<Response> => {
    const call = cookieScope.run(new Map(cookies), () => handle(input, init, calls));
    pending.add(call);
    const settle = () => {
      pending.delete(call);
    };
    call.then(settle, settle);
    return call;
  }) as unknown as typeof fetch;
}

describe('EZD-299b EZD-390 two people save one wall', () => {
  let release: () => Promise<void>;
  let tenant = '';
  let projects: string[] = [];
  let memberA: Member;
  let memberB: Member;
  let cookiesA: Map<string, string>;
  let cookiesB: Map<string, string>;

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tenant = await createTenant();
    projects = await createProjects(tenant, 3);
    memberA = await createMember({ tenantId: tenant, scope: 'all' });
    memberB = await createMember({ tenantId: tenant, scope: 'all' });
    for (const m of [memberA, memberB]) {
      await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model']);
    }
    cookiesA = await cookiesFor(memberA.email);
    cookiesB = await cookiesFor(memberB.email);
  }, 180000);

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });
  afterEach(settleRouteCalls, 30000);
  afterAll(async () => {
    await settleRouteCalls();
    await cleanup();
    await closeHarness();
    await release();
  }, 60000);

  async function floorOf(project: string): Promise<string> {
    const [first] = await harnessSql()<{ object_id: string }[]>`
      select object_id from public.model_object where project_id = ${project}::uuid and type = 'floor'`;
    return first.object_id;
  }

  function person(m: Member, cookies: Map<string, string>, online = createOnline(true)) {
    const calls: { method: string; path: string }[] = [];
    const fetchImpl = routeFor(cookies, calls);
    const actor = { appUserId: m.appUserId, tenantId: tenant, membershipId: m.membershipId };
    const storage = createIdbOutboxStorage(actor);
    const sync = createOutboxSync({
      actor,
      storage,
      fetchImpl,
      debounceMs: 50,
      online: online.source,
    });
    return { m, calls, fetchImpl, storage, sync, online };
  }
  type Person = ReturnType<typeof person>;

  // The person's device reads the saved model, as on a reload (the mirror holds the saved seq numbers).
  async function reload(p: Person, project: string) {
    const loaded = await fetchModel(project, { fetchImpl: p.fetchImpl });
    if (!loaded.ok) throw new Error(`model load failed: ${loaded.status}`);
    await p.storage.replaceMirror(project, loaded.model.objects);
  }

  async function save(p: Person, project: string, changes: { id: string; value: unknown }[]) {
    await p.sync.enqueue(project, 0, changes as never);
    await p.sync.flush();
  }

  async function objectRow(project: string, id: string) {
    const [row] = await harnessSql()<
      { updated_seq: number; deleted: boolean; height: string | null }[]
    >`select updated_seq, deleted, data->'attributes'->>'height' as height from public.model_object
      where project_id = ${project}::uuid and object_id = ${id}::uuid`;
    return row;
  }

  const conflictRows = async (project: string, m: Member) =>
    (
      await harnessSql()<{ n: string }[]>`
        select count(*)::text as n from public.sync_conflict
        where project_id = ${project}::uuid and user_id = ${m.appUserId}::uuid`
    )[0].n;

  const notificationCount = async (m: Member) =>
    (
      await harnessSql()<{ n: string }[]>`
        select count(*)::text as n from public.notification
        where tenant_id = ${tenant}::uuid and user_id = ${m.appUserId}::uuid and kind = 'sync_conflict'`
    )[0].n;

  function listFor(p: Person, project: string) {
    const applyRemote = vi.fn();
    const list = createConflictList({
      storage: p.storage,
      sync: p.sync,
      fetchImpl: p.fetchImpl,
      editor: { projectId: project, lockEpoch: 0, applyRemote },
    });
    return { list, applyRemote };
  }

  it('EZD-299b done when: T10 the second change waits in the list, the rest saves, Keep mine and Keep theirs settle it', async () => {
    const project = projects[0];
    const floor = await floorOf(project);
    const [W1, W2] = [randomUUID(), randomUUID()];
    const A = person(memberA, cookiesA);
    const B = person(memberB, cookiesB);

    await save(A, project, [
      { id: W1, value: wall(floor, 96) },
      { id: W2, value: wall(floor, 96) },
    ]);
    await reload(B, project);
    await save(A, project, [{ id: W1, value: wall(floor, 100) }]);
    expect((await objectRow(project, W1)).updated_seq).toBe(2);

    await save(B, project, [
      { id: W1, value: wall(floor, 110) },
      { id: W2, value: wall(floor, 120) },
    ]);
    await save(B, project, [{ id: W2, value: wall(floor, 130) }]);

    const rows = await B.storage.listConflicts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      objectId: W1,
      reason: 'conflict',
      serverSeq: 2,
      server: 'recorded',
    });
    expect(
      B.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/sync-conflicts')),
    ).toHaveLength(1);
    expect(await objectRow(project, W2)).toMatchObject({ updated_seq: 3, height: '130' });
    expect((await objectRow(project, W1)).height).toBe('100');

    const { list, applyRemote } = listFor(B, project);
    await list.refresh();
    expect(await list.keepMine(`${project}/${W1}`)).toEqual({ ok: true });
    await B.sync.flush();
    expect(await objectRow(project, W1)).toMatchObject({ updated_seq: 3, height: '110' });
    expect(await conflictRows(project, memberB)).toBe('0');

    await reload(A, project);
    await save(A, project, [{ id: W2, value: wall(floor, 140) }]);
    expect((await objectRow(project, W2)).updated_seq).toBe(4);
    await save(B, project, [{ id: W2, value: wall(floor, 150) }]);
    expect(await objectRow(project, W2)).toMatchObject({ updated_seq: 4, height: '140' });

    await list.refresh();
    applyRemote.mockClear();
    expect(await list.keepTheirs(`${project}/${W2}`)).toEqual({ ok: true });
    expect(applyRemote).toHaveBeenCalledTimes(1);
    const change = applyRemote.mock.calls[0][0][0] as {
      id: string;
      value: { data: { attributes: { height: number } } };
    };
    expect(change.id).toBe(W2);
    expect(change.value.data.attributes.height).toBe(140);
    expect(await conflictRows(project, memberB)).toBe('0');
    expect(await B.storage.listConflicts()).toEqual([]);

    await save(B, project, [{ id: W2, value: wall(floor, 160) }]);
    expect(await objectRow(project, W2)).toMatchObject({ updated_seq: 5, height: '160' });
    list.dispose();
    for (const p of [A, B]) {
      p.sync.dispose();
      p.storage.close();
    }
  }, 120000);

  it('EZD-299b T11 Keep mine settles a change against their delete and a delete against their change', async () => {
    const project = projects[1];
    const floor = await floorOf(project);
    const [W3, W4] = [randomUUID(), randomUUID()];
    const A = person(memberA, cookiesA);
    const B = person(memberB, cookiesB);

    await save(A, project, [
      { id: W3, value: wall(floor, 96) },
      { id: W4, value: wall(floor, 96) },
    ]);
    await reload(B, project);
    await save(A, project, [
      { id: W3, value: null },
      { id: W4, value: wall(floor, 100) },
    ]);
    expect(await objectRow(project, W3)).toMatchObject({ updated_seq: 2, deleted: true });

    await save(B, project, [{ id: W3, value: wall(floor, 110) }]);
    await save(B, project, [{ id: W4, value: null }]);
    expect((await B.storage.listConflicts()).map((r) => r.objectId).sort()).toEqual(
      [W3, W4].sort(),
    );

    const { list } = listFor(B, project);
    await list.refresh();
    expect(await list.keepMine(`${project}/${W3}`)).toEqual({ ok: true });
    expect(await list.keepMine(`${project}/${W4}`)).toEqual({ ok: true });
    await B.sync.flush();

    expect(await objectRow(project, W3)).toMatchObject({
      deleted: false,
      height: '110',
      updated_seq: 3,
    });
    expect(await objectRow(project, W4)).toMatchObject({ deleted: true, updated_seq: 3 });
    list.dispose();
    for (const p of [A, B]) {
      p.sync.dispose();
      p.storage.close();
    }
  }, 120000);

  it('EZD-299b T12 a Keep mine refused again returns to the list and notifies again', async () => {
    const project = projects[2];
    const floor = await floorOf(project);
    const W5 = randomUUID();
    const notifiedAtStart = Number(await notificationCount(memberB));
    const A = person(memberA, cookiesA);
    const B = person(memberB, cookiesB);

    await save(A, project, [{ id: W5, value: wall(floor, 96) }]);
    await reload(B, project);
    await save(A, project, [{ id: W5, value: wall(floor, 100) }]);
    await save(B, project, [{ id: W5, value: wall(floor, 110) }]);
    expect(await B.storage.listConflicts()).toHaveLength(1);
    const notifiedBefore = Number(await notificationCount(memberB)) - notifiedAtStart;
    expect(notifiedBefore).toBe(1);

    const { list } = listFor(B, project);
    await list.refresh();
    B.online.set(false);
    const objectPosts = () =>
      B.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/objects')).length;
    const postsBefore = objectPosts();
    expect(await list.keepMine(`${project}/${W5}`)).toEqual({ ok: true });
    expect(objectPosts()).toBe(postsBefore);
    expect((await B.storage.list()).map((e) => e.id)).toEqual([W5]);

    await save(A, project, [{ id: W5, value: wall(floor, 120) }]);
    B.online.set(true);
    await B.sync.flush();

    const rows = await B.storage.listConflicts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ objectId: W5, state: 'listed' });
    expect(
      B.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/sync-conflicts')),
    ).toHaveLength(2);
    expect(Number(await notificationCount(memberB)) - notifiedAtStart).toBe(2);
    list.dispose();
    for (const p of [A, B]) {
      p.sync.dispose();
      p.storage.close();
    }
  }, 120000);

  it('EZD-390 C1 a route call keeps its own sign-in while a signed-out call starts during it', async () => {
    const before = alertWriteGuardState().violations.length;
    const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL as string).origin;
    const realFetch = globalThis.fetch;
    let markReached: () => void = () => {};
    const reached = new Promise<void>((resolve) => {
      markReached = resolve;
    });
    let open: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    let held = false;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!held && url.startsWith(origin)) {
        held = true;
        markReached();
        await gate;
      }
      return realFetch(input as RequestInfo | URL, init);
    });
    try {
      const bCall = routeFor(cookiesB, [])('/api/sync-conflicts');
      await reached;
      const out = await routeFor(new Map(), [])('/api/sync-conflicts');
      open();
      const b = await bCall;
      expect(out.status).toBe(401);
      expect(b.status).toBe(200);
      expect(Array.isArray(((await b.json()) as { items: unknown }).items)).toBe(true);
      expect(alertWriteGuardState().violations.length).toBe(before);
    } finally {
      open();
      spy.mockRestore();
    }
  }, 120000);

  it('EZD-390 C2 the hook wait ends only after a route call started by another one has answered', async () => {
    let secondStatus = 0;
    const first = routeFor(cookiesB, [])('/api/sync-conflicts');
    const chained = first.then(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      const res = await routeFor(cookiesB, [])('/api/sync-conflicts');
      secondStatus = res.status;
    });
    await settleRouteCalls();
    expect(pending.size).toBe(0);
    expect(secondStatus).toBe(200);
    await chained;
  }, 120000);
});
