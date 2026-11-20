// EZD-215 (AC-EZD-215-5, -4; 07 Q-0708 "wall.engineer_required and wall.engineer_note_attached, with payload wallId,
// noteId and fileId (null when there is no letter)"; "each writes an event_log row" (11:80); 09-calculations Q-0708
// "a tick with empty approval text is refused"). Real sign-in, the real event log sink (the emit is only watched),
// the local database; same sign-in and mocks as closure-event.test.ts beside it.
import { randomUUID } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../../../../test-harness/errors/alert-lock';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';
import { APP_BUILD_HEADER, appBuild } from '../../../../../lib/app-version';
import { emit } from '../../../../../server/events';

vi.mock('../../../../../server/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../server/events')>();
  return { ...actual, emit: vi.fn(actual.emit) };
});
const emitMock = vi.mocked(emit);

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

type Attrs = {
  engineerName: string;
  approvedText: string;
  fileId: string | null;
  letterOnFile: boolean;
};

describe('EZD-215 engineer note events on save', () => {
  let tenant = '';
  let project = '';
  let floorId = '';
  let editor: Member;
  let cookies: Map<string, string>;
  let releaseLock: () => Promise<void>;

  const noteChange = (id: string, wallId: string, baseSeq: number, a: Partial<Attrs> = {}) => ({
    id,
    baseSeq,
    deleted: false,
    type: 'engineer_note',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { start: { x: 0, y: 0 }, end: { x: 120, y: 0 } },
      status: 'existing',
      level: floorId,
      attributes: {
        wallId,
        action: 'delete',
        engineerName: '',
        approvedText: '',
        fileId: null,
        letterOnFile: false,
        ...a,
      },
    },
  });
  const post = async (changes: unknown[]) => {
    state.store = new Map(cookies);
    emitMock.mockClear();
    const { POST } = await import('./route');
    const res = await POST(
      new Request(`http://localhost/api/projects/${project}/objects`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [APP_BUILD_HEADER]: String(appBuild()),
          'x-ezdraft-membership': editor.membershipId,
        },
        body: JSON.stringify({ lockEpoch: 0, changes }),
      }),
      { params: Promise.resolve({ id: project }) },
    );
    return { res, json: JSON.parse(await res.text()) as unknown };
  };
  const emitNames = () => emitMock.mock.calls.map((c) => c[0]);
  const logRows = async (wallId: string) =>
    harnessSql()<
      {
        action: string;
        object_type: string;
        object_id: string;
        actor_app_user_id: string | null;
        details: unknown;
      }[]
    >`select action, object_type, object_id, actor_app_user_id, details from public.event_log
      where tenant_id = ${tenant}::uuid and object_id = ${wallId}::uuid order by at, action`;
  const letterFile = async () => {
    const id = randomUUID();
    await harnessSql()`insert into public.source_file
      (id, tenant_id, project_id, kind, storage_path, original_name, content_type, size_bytes, uploaded_at)
      values (${id}::uuid, ${tenant}::uuid, ${project}::uuid, 'engineer_letter',
        ${`${tenant}/${project}/${id}`}, 'letter.pdf', 'application/pdf', 10, now())`;
    return id;
  };

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    floorId = (
      await harnessSql()<{ object_id: string }[]>`
        select object_id from public.model_object
        where project_id = ${project}::uuid and type = 'floor'`
    )[0].object_id;
    cookies = await cookiesFor(editor.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
    emitMock.mockClear();
  });

  afterAll(async () => {
    try {
      await cleanup();
      await closeHarness();
    } finally {
      await releaseLock();
    }
  }, 180000);

  it('AC-5 a new note emits wall.engineer_required once and writes its event_log row', async () => {
    const note = randomUUID();
    const wall = randomUUID();
    const ctx = { tenantId: tenant, projectId: project, actorId: editor.appUserId };
    const first = await post([noteChange(note, wall, 0)]);
    expect(first.res.status).toBe(200);
    expect(emitNames()).toEqual(['model.saved', 'wall.engineer_required']);
    expect(emitMock.mock.calls[1]![1]).toEqual({ wallId: wall, noteId: note, fileId: null });
    expect(emitMock.mock.calls[1]![2]).toEqual(ctx);
    expect(await logRows(wall)).toEqual([
      {
        action: 'wall.engineer_required',
        object_type: 'model_object',
        object_id: wall,
        actor_app_user_id: editor.appUserId,
        details: { wallId: wall, noteId: note, fileId: null },
      },
    ]);

    // Name and approval filled, no tick: the warning stays on and nothing more is emitted (Q-0708).
    const filled = await post([
      noteChange(note, wall, 1, { engineerName: 'A. Engineer', approvedText: 'Header 2-2x12' }),
    ]);
    expect(filled.res.status).toBe(200);
    expect(emitNames()).toEqual(['model.saved']);
  }, 120000);

  it('AC-5 the tick emits wall.engineer_note_attached with the letter id, once', async () => {
    const note = randomUUID();
    const wall = randomUUID();
    expect((await post([noteChange(note, wall, 0)])).res.status).toBe(200);
    const fileId = await letterFile();
    const ticked = {
      engineerName: 'A. Engineer',
      approvedText: 'Header 2-2x12',
      fileId,
      letterOnFile: true,
    };
    const r = await post([noteChange(note, wall, 1, ticked)]);
    expect(r.res.status).toBe(200);
    expect(emitNames()).toEqual(['model.saved', 'wall.engineer_note_attached']);
    expect(emitMock.mock.calls[1]![1]).toEqual({ wallId: wall, noteId: note, fileId });
    const rows = await logRows(wall);
    expect(rows.map((x) => x.action)).toEqual([
      'wall.engineer_required',
      'wall.engineer_note_attached',
    ]);
    expect(rows[1]).toEqual({
      action: 'wall.engineer_note_attached',
      object_type: 'model_object',
      object_id: wall,
      actor_app_user_id: editor.appUserId,
      details: { wallId: wall, noteId: note, fileId },
    });

    const again = await post([
      noteChange(note, wall, 2, { ...ticked, approvedText: 'Header 3-2x12' }),
    ]);
    expect(again.res.status).toBe(200);
    expect(emitNames()).toEqual(['model.saved']);
  }, 120000);

  it('AC-4 a tick with an empty engineer name or approval text is refused and emits nothing', async () => {
    const wall = randomUUID();
    for (const a of [
      { engineerName: '', approvedText: 'Header 2-2x12', letterOnFile: true },
      { engineerName: 'A. Engineer', approvedText: ' ', letterOnFile: true },
    ]) {
      const id = randomUUID();
      const r = await post([noteChange(id, wall, 0, a)]);
      expect(r.res.status).toBe(400);
      expect(r.json).toEqual({
        error: { code: 'invalid_object', message_key: 'error.invalid_input' },
        invalid: [{ id, issue: 'invalid_data' }],
      });
      expect(emitMock).not.toHaveBeenCalled();
    }
    expect(await logRows(wall)).toEqual([]);
  }, 120000);
});
