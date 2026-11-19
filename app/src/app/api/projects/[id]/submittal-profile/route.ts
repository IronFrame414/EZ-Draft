// EZD-712 (S15c Decision 2 and Entry points; Q-0399 lifted): the project's submittal profile in Project settings.
// Order as the project settings route: 401, 403, 404 (a malformed id or a project out of scope), 400, then the
// session client.
// GET (View projects): 200 { profileId, profiles, canManage }: the project's profile and the company's active
// profiles (the project's own kept even when archived), default first; canManage when the caller holds
// settings_sheet_presets (the link to Settings > Sheet presets).
// PATCH (Edit model): body { profileId }; 400 invalid_input or profile_unavailable (not an active profile of the
// caller's company); 200 { profileId } and project.updated { projectId, keys: ['submittal_profile_id'] } when it
// changed; a failed emit does not fail the save.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { errorType } from '../../../../../server/errors/fingerprint';
import { reportError } from '../../../../../server/errors/report';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { emit } from '../../../../../server/events';
import { can, requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { listSubmittalProfiles } from '../../../../../server/submittal-profiles/submittal-profiles';
import type { ProjectProfileAnswer } from '../../../../../lib/submittal-profiles/profiles';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/submittal-profile';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const client = createSessionClient();
    const project = await client
      .from('project')
      .select('submittal_profile_id')
      .eq('id', id)
      .maybeSingle();
    if (project.error) throw project.error;
    if (!project.data) return fail(404, 'project_not_found');
    const profileId = project.data.submittal_profile_id;
    const profiles = (await listSubmittalProfiles(client))
      .filter((x) => !x.archived || x.id === profileId)
      .map((x) => ({
        id: x.id,
        department: x.department,
        isDefault: x.isDefault,
        archived: x.archived,
      }));
    const answer: ProjectProfileAnswer = {
      profileId,
      profiles,
      canManage: can(p.ctx, 'settings_sheet_presets'),
    };
    return Response.json(answer, { status: 200, headers });
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
    const p = await requireApiPermission('edit_model', { projectId: id });
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const body = z.strictObject({ profileId: z.uuid() }).safeParse(raw);
    if (!body.success) return fail(400, 'invalid_input');

    const client = createSessionClient();
    const { data, error } = await client.rpc('set_project_submittal_profile', {
      p_project: id,
      p_profile: body.data.profileId,
    });
    if (error) {
      if (error.code === '42501') return fail(403, 'permission_denied', 'error.not_authorized');
      if (error.code === 'P0002') return fail(404, 'project_not_found');
      if (error.code === '22023')
        return fail(400, 'profile_unavailable', 'office.project_settings.profile_unavailable');
      throw error;
    }
    if (data === true) {
      try {
        const row = await client.from('project').select('tenant_id').eq('id', id).single();
        if (row.error) throw row.error;
        await emit(
          'project.updated',
          { projectId: id, keys: ['submittal_profile_id'] },
          { tenantId: row.data.tenant_id, projectId: id, actorId: p.session.appUserId },
        );
      } catch (e) {
        try {
          await reportError(new Error('project_profile_event_failed'), {
            source: 'function',
            location: ROUTE,
            tags: { 'ezd.cause': errorType(e) },
          });
        } catch {
          /* reportError never throws */
        }
      }
    }
    return Response.json({ profileId: body.data.profileId }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
