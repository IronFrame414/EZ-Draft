// EZD-612 (S03 Check; S06 Check; AC-EZD-612-1..3; CLAUDE.md rules 4, 5): next/headers is mocked and members sign in
// as in ../field-measure/route.test.ts.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  chain,
  roomObj,
} from '../../../../../../../packages/geometry/src/rooms/test-utils/fixtures';
import { CURRENT_SCHEMA_VERSION, type ModelObject, type Point } from '@ezdraft/geometry';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
} from '../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';

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

// Expected values: the route header (401, 403, 404 for a malformed id or another company's project), EZD-228 (a toilet
// 14 1/2" from a side wall against the 15" code minimum) and EZD-515 (a 52" fan 40" from a wall leaves 14" against an
// 18" Defaults clearance).
async function call(method: 'GET' | 'POST' | 'PATCH', id: string, body?: unknown) {
  const route = await import('./route');
  const req = new Request(`http://localhost/api/projects/${id}/code-check`, {
    method,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const res = await route[method](req, { params: Promise.resolve({ id }) });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { res, body: parsed as Answer };
}

type Answer = {
  changedSinceRun: boolean;
  canRun: boolean;
  canAccept: boolean;
  run: {
    runId: string;
    results: Array<{ ruleId: string; objectId: string; status: string; severity: string }>;
    accepted: Array<{ ruleId: string; objectId: string; note: string }>;
  } | null;
};

const BATH: Point[] = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 96 },
  { x: 0, y: 96 },
];
const BED: Point[] = [
  { x: 200, y: 0 },
  { x: 344, y: 0 },
  { x: 344, y: 120 },
  { x: 200, y: 120 },
];
const TOILET = '00000000-0000-4000-8000-000000000901';
const FAN = '00000000-0000-4000-8000-000000000951';

function model(level: string): ModelObject[] {
  return [
    ...chain(1, BATH, 'right', level),
    roomObj('00000000-0000-4000-8000-000000000900', BATH, 'Bath 2', level),
    {
      id: TOILET,
      type: 'fixture',
      data: {
        geometry: { center: { x: 14.5, y: 82 }, axis: { x: 1, y: 0 } },
        status: 'new',
        level,
        attributes: { kind: 'toilet', width: 20, depth: 28 },
      },
    } as ModelObject,
    ...chain(10, BED, 'right', level),
    roomObj('00000000-0000-4000-8000-000000000950', BED, 'Bedroom', level),
    {
      id: FAN,
      type: 'device',
      data: {
        geometry: { point: { x: 260, y: 40 } },
        status: 'new',
        level,
        attributes: { kind: 'ceiling_fan' },
      },
    } as ModelObject,
  ];
}

describe('EZD-612 /api/projects/[id]/code-check', () => {
  let project = '';
  let runner: Map<string, string>; // view, run_code_check, edit_model
  let viewer: Map<string, string>; // view only
  let checker: Map<string, string>; // view, run_code_check
  let noView: Map<string, string>;
  let runnerB: Map<string, string>;

  beforeAll(async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    [project] = await createProjects(tenantA, 1);
    const up = await adminDb()
      .from('tenant')
      .update({ defaults: { fan_blade_clearance: 18 } })
      .eq('id', tenantA);
    if (up.error) throw new Error(JSON.stringify(up.error));
    const floor = await adminDb()
      .from('model_object')
      .select('object_id')
      .eq('project_id', project)
      .eq('type', 'floor')
      .single();
    if (floor.error) throw new Error(JSON.stringify(floor.error));
    const level = (floor.data as { object_id: string }).object_id;
    const ins = await adminDb()
      .from('model_object')
      .insert(
        model(level).map((o) => ({
          project_id: project,
          tenant_id: tenantA,
          object_id: o.id,
          type: o.type,
          data: o.data as never,
          schema_version: CURRENT_SCHEMA_VERSION,
          updated_seq: 1,
        })),
      );
    if (ins.error) throw new Error(JSON.stringify(ins.error));

    const member = async (tenantId: string, perms: string[]) => {
      const m = await createMember({ tenantId, scope: 'all' });
      await setPermissions(tenantId, m.membershipId, perms as never);
      return cookiesFor(m.email);
    };
    runner = await member(tenantA, ['view_projects', 'run_code_check', 'edit_model']);
    viewer = await member(tenantA, ['view_projects']);
    checker = await member(tenantA, ['view_projects', 'run_code_check']);
    noView = await member(tenantA, ['settings_company']);
    runnerB = await member(tenantB, ['view_projects', 'run_code_check', 'edit_model']);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('GET: 401, 403, 404, then no run yet with what the member may do', async () => {
    state.store = new Map();
    expect((await call('GET', project)).res.status).toBe(401);
    state.store = new Map(noView);
    expect((await call('GET', project)).res.status).toBe(403);
    state.store = new Map(viewer);
    expect((await call('GET', 'nope')).res.status).toBe(404);
    state.store = new Map(runnerB);
    expect((await call('GET', project)).res.status).toBe(404);
    state.store = new Map(viewer);
    const ok = await call('GET', project);
    expect(ok.res.status).toBe(200);
    expect(ok.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(ok.body).toEqual({ run: null, changedSinceRun: false, canRun: false, canAccept: false });
  });

  it('POST: Run code check only; another company gets 404', async () => {
    state.store = new Map();
    expect((await call('POST', project)).res.status).toBe(401);
    state.store = new Map(viewer);
    expect((await call('POST', project)).res.status).toBe(403);
    state.store = new Map(runnerB);
    expect((await call('POST', project)).res.status).toBe(404);
  });

  it('AC-EZD-612-2 one run lists the bath clearance and the fan clearance warnings', async () => {
    state.store = new Map(checker);
    const ran = await call('POST', project);
    expect(ran.res.status).toBe(200);
    expect(ran.body.canRun).toBe(true);
    expect(ran.body.canAccept).toBe(false);
    expect(ran.body.changedSinceRun).toBe(false);
    expect(ran.body.run?.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'BC-001',
          objectId: TOILET,
          status: 'fail',
          severity: 'warning',
        }),
        expect.objectContaining({
          ruleId: 'FC-001',
          objectId: FAN,
          status: 'fail',
          severity: 'warning',
        }),
      ]),
    );
    state.store = new Map(viewer);
    expect((await call('GET', project)).body.run?.runId).toBe(ran.body.run?.runId);
  });

  it('AC-EZD-612-3 PATCH accepts a warning with a note (Edit model); bad bodies and other members are refused', async () => {
    state.store = new Map(viewer);
    const runId = (await call('GET', project)).body.run!.runId;
    const body = {
      runId,
      ruleId: 'FC-001',
      objectId: FAN,
      note: 'Owner accepts; low-profile fan.',
    };
    state.store = new Map(checker);
    expect((await call('PATCH', project, body)).res.status).toBe(403);
    state.store = new Map(runnerB);
    expect((await call('PATCH', project, body)).res.status).toBe(404);
    state.store = new Map(runner);
    expect((await call('PATCH', project, 'not json')).res.status).toBe(400);
    expect((await call('PATCH', project, { ...body, note: '  ' })).res.status).toBe(400);
    expect((await call('PATCH', project, { ...body, runId: crypto.randomUUID() })).res.status).toBe(
      409,
    );
    const ok = await call('PATCH', project, body);
    expect(ok.res.status).toBe(200);
    expect(ok.body.run?.accepted).toEqual([
      expect.objectContaining({
        ruleId: 'FC-001',
        objectId: FAN,
        note: 'Owner accepts; low-profile fan.',
      }),
    ]);
    // The next run keeps it while the fan is unchanged.
    const again = await call('POST', project);
    expect(again.body.run?.runId).not.toBe(runId);
    expect(again.body.run?.accepted).toEqual([
      expect.objectContaining({ ruleId: 'FC-001', objectId: FAN }),
    ]);
  });

  it('S06 "Check not run since last change": a save after the run reads as changed', async () => {
    state.store = new Map(viewer);
    expect((await call('GET', project)).body.changedSinceRun).toBe(false);
    const later = new Date(Date.now() + 60_000).toISOString();
    const up = await adminDb()
      .from('model_object')
      .update({ updated_at: later })
      .eq('object_id', FAN);
    if (up.error) throw new Error(JSON.stringify(up.error));
    expect((await call('GET', project)).body.changedSinceRun).toBe(true);
  });
});
