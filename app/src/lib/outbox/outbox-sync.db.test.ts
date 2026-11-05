// EZD-120b D1 and the ticket's "Done when" (vault/plans/EZD-120b.md section 1 ticket row, section 4;
// AC-EZD-120b-1). The model store's onCommit feeds the outbox sync; its fetch calls the objects route handler
// (EZD-120a) under a real sign-in on the local database; the device database is fake-indexeddb. Walls are
// P202's sample on the project's first floor. Expected values: AC-1 (autosave coalesces and never overlaps),
// 03a (checkpoints are never made by a save) and P120a M5 (a save raises updated_seq by one per changed object).
import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../test-harness/rls/fixtures';
import { createModelStore } from '../../editor/model/model-store';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../server/auth/supabase-server';
import { createIdbOutboxStorage } from './outbox-idb';
import { createOutboxSync } from './outbox-sync';

const state = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...state.store].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: unknown) => {
      const maxAge = (options as { maxAge?: number } | undefined)?.maxAge;
      if (value === '' || maxAge === 0) state.store.delete(name);
      else state.store.set(name, value);
    },
  }),
  headers: async () => new Headers(),
}));

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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('EZD-120b autosave against the database', () => {
  let tenant = '';
  let project = '';
  let floorId = '';
  let editor: Awaited<ReturnType<typeof createMember>>;
  let cookies: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    cookies = await cookiesFor(editor.email);
    const [first] = await harnessSql()<{ object_id: string }[]>`
      select object_id from public.model_object where project_id = ${project}::uuid and type = 'floor'`;
    floorId = first.object_id;
  }, 180000);

  afterEach(() => {
    state.store = new Map();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-120b done when: D1 fifty edits autosave with one save at a time and an empty outbox', async () => {
    globalThis.indexedDB = new IDBFactory();
    state.store = new Map(cookies);
    const { POST } = await import('../../app/api/projects/[id]/objects/route');

    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = async (input: unknown, init?: RequestInit): Promise<Response> => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        const url = new URL(String(input), 'http://localhost');
        const id = url.pathname.split('/')[3];
        return await POST(new Request(url, init), { params: Promise.resolve({ id }) });
      } finally {
        inFlight--;
      }
    };

    const storage = createIdbOutboxStorage({
      appUserId: editor.appUserId,
      tenantId: tenant,
      membershipId: editor.membershipId,
    });
    const sync = createOutboxSync({
      actor: {
        appUserId: editor.appUserId,
        tenantId: tenant,
        membershipId: editor.membershipId,
      },
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      debounceMs: 50,
    });
    const store = createModelStore({
      objects: new Map(),
      onCommit: (changes) => {
        void sync.enqueue(project, 0, changes);
      },
    });

    const walls = Array.from({ length: 10 }, () => randomUUID());
    store.applyEdit(walls.map((id) => ({ id, value: wall(floorId, 96) })));
    await sync.flush();

    for (let i = 1; i <= 50; i++) {
      const id = walls[((i - 1) % 5)];
      store.applyEdit([{ id, value: wall(floorId, 96 + i) }]);
      await sleep((i * 37) % 81);
    }
    await sync.flush();

    expect(maxInFlight).toBeLessThanOrEqual(1);
    expect(await storage.list()).toEqual([]);

    const rows = await harnessSql()<
      { object_id: string; type: string; updated_seq: number; data: { attributes?: { height: number } } }[]
    >`select object_id, type, updated_seq, data from public.model_object
      where project_id = ${project}::uuid`;
    for (let k = 1; k <= 10; k++) {
      const row = rows.find((r) => r.object_id === walls[k - 1]);
      expect(row).toBeDefined();
      if (k <= 5) expect(row?.data.attributes?.height).toBe(141 + k);
      else expect(row?.updated_seq).toBe(1);
    }
    expect(rows.find((r) => r.object_id === floorId)?.updated_seq).toBe(1);

    const versions = await harnessSql()<{ n: string }[]>`
      select count(*)::text as n from public.model_version where project_id = ${project}::uuid`;
    expect(versions[0].n).toBe('0');
    sync.dispose();
    storage.close();
  }, 120000);
});
