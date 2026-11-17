// EZD-130 (Q-0697 decisions 03 "Defaults data", 10 "Phase 8 permissions"; Q-0202; Q-0400; Q-0399; Q-0203;
// AC-EZD-130-1..6): Project settings. Order as the defaults and plan-scale routes: 401, 403, 404 (a malformed id
// or a project out of scope), 400 (bad JSON or body), then the session client.
// GET (View projects): 200 ProjectSettings, the client's email and phone only to holders of Company settings,
// Create projects or Send to client.
// PATCH (Edit model, Company settings or Create projects): body ProjectSettingsPatch; 400 invalid_input (with
// `fields` for a value the dialog shows on its row) or customer_unavailable; 403; 404; 409 stale_lock_epoch when
// type or defaults change without this caller holding the lock at that epoch; 200 ProjectSettings after the
// save. A save that changed something emits project.updated { projectId, keys }; a failed emit does not fail it.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { emit } from '../../../../../server/events';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import {
  crossCheckProject,
  defaultsToWrite,
  loadProjectSettings,
  parseProjectSettingsPatch,
  saveProjectSettings,
} from '../../../../../server/projects/project-settings';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/settings';

const fail = (status: number, code: string, messageKey = `error.${code}`, extra?: object) =>
  Response.json({ error: { code, message_key: messageKey, ...extra } }, { status, headers });

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const loaded = await loadProjectSettings(createSessionClient(), p.ctx, id);
    if (loaded === null) return fail(404, 'project_not_found');
    return Response.json(loaded.settings, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission(['edit_model', 'settings_company', 'create_projects'], {
      projectId: id,
    });
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = parseProjectSettingsPatch(raw);
    if (!parsed.ok) {
      return fail(400, 'invalid_input', 'error.invalid_input', parsed.fields ? { fields: parsed.fields } : undefined);
    }
    const patch = parsed.patch;

    const client = createSessionClient();
    const loaded = await loadProjectSettings(client, p.ctx, id);
    if (loaded === null) return fail(404, 'project_not_found');
    const defaults = defaultsToWrite(patch, loaded.stored, loaded.copy);
    const cross = crossCheckProject(loaded.stored, loaded.copy, defaults);
    if (Object.keys(cross).length > 0) {
      return fail(400, 'invalid_input', 'error.invalid_input', { fields: cross });
    }

    const result = await saveProjectSettings(client, id, patch, defaults);
    if (!result.ok) {
      if (result.code === 'permission_denied')
        return fail(403, 'permission_denied', 'error.not_authorized');
      if (result.code === 'project_not_found') return fail(404, 'project_not_found');
      if (result.code === 'customer_unavailable')
        return fail(400, 'customer_unavailable', 'error.project_customer_unavailable');
      if (result.code === 'stale_lock_epoch') return fail(409, 'stale_lock_epoch');
      return fail(400, 'invalid_input');
    }
    if (result.changed.length > 0) {
      try {
        await emit(
          'project.updated',
          { projectId: id, keys: result.changed },
          { tenantId: result.tenantId, projectId: id, actorId: p.session.appUserId },
        );
      } catch {
        // The save is committed; a failed emit does not fail it.
      }
    }
    const after = await loadProjectSettings(client, p.ctx, id);
    if (after === null) return fail(404, 'project_not_found');
    return Response.json(after.settings, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
