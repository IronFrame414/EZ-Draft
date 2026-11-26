// EZD-716 (S13 Issue checklist, Validation; AC-EZD-716-1): a project's issue checklist, read under the member's
// session so RLS applies. The model is the saved working copy (loadModel), as the code check reads it; the permit
// set's sheets, the title block (EZD-710), the latest code check run with its acceptances (EZD-612) and the renders
// awaiting approval (review_item render_approval) fill the rest. The load calc (editor/electrical, which the server
// may not import) is worked out by the Sheets screen from the live model; the server's block leaves it out. The rows and the block come from the pure
// issueChecklist, so the Issue step (EZD-717) refuses with the same answer. A project the member cannot see is null.
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseStoredObject, type ModelObject } from '@ezdraft/geometry';
import { projectEdition } from '../../lib/code-edition/editions';
import {
  engineerLettersMissing,
  issueChecklist,
  orphanFlags,
  type CodeCheckFacts,
  type IssueChecklist,
  type ProjectIssueFacts,
} from '../../lib/sheets/issue-checklist';
import { projectTitleBlockMissing } from '../../lib/title-block/sheet-title-block';
import type { Session } from '../auth/session';
import {
  latestCodeCheckRun,
  modelChangedSince,
  openWarningCount,
} from '../code-check/check-run';
import type { Database } from '../db/database.types';
import { loadModel } from '../model/model';
import type { PermissionContext } from '../permissions';
import { loadProjectTitleBlock } from '../title-block/sheet-title-block';
import { loadProjectSheetSets } from './sheets';

type Client = SupabaseClient<Database>;

export async function loadIssueChecklist(
  client: Client,
  projectId: string,
  ctx: PermissionContext,
  session: Pick<Session, 'appUserId' | 'email'>,
): Promise<{ facts: ProjectIssueFacts; checklist: IssueChecklist } | null> {
  const project = await client
    .from('project')
    .select('code_edition, permit_application_date, created_at')
    .eq('id', projectId)
    .maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) return null;

  const [loaded, sets, titleBlock, run, tenant, renders] = await Promise.all([
    loadModel(client, projectId, ctx),
    loadProjectSheetSets(client, projectId),
    loadProjectTitleBlock(client, projectId, session),
    latestCodeCheckRun(client, projectId),
    client.from('tenant').select('code_edition').maybeSingle(),
    client
      .from('review_item')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('source', 'render_approval')
      .is('resolved_at', null),
  ]);
  if (loaded === null || sets === null || titleBlock === null) return null;
  if (tenant.error) throw tenant.error;
  if (renders.error) throw renders.error;

  const objects: ModelObject[] = [];
  for (const o of loaded.objects) {
    const parsed = parseStoredObject({ id: o.id, type: o.type, schema_version: o.schemaVersion, data: o.data });
    if (parsed.ok) objects.push(parsed.object);
  }

  let codeCheck: CodeCheckFacts = { state: 'not_run' };
  if (run !== null) {
    codeCheck = (await modelChangedSince(client, projectId, run.createdAt))
      ? { state: 'stale', at: run.createdAt }
      : {
          state: 'run',
          at: run.createdAt,
          open: openWarningCount(run.results, run.accepted),
          accepted: run.accepted.length,
        };
  }

  const edition = projectEdition(project.data.code_edition, tenant.data?.code_edition ?? null, {
    permitDate: project.data.permit_application_date,
    createdAt: project.data.created_at,
  });
  const permit = sets.find((s) => s.kind === 'permit');
  const sheets = permit === undefined ? [] : permit.sheets.map((s) => s.number);

  const facts: ProjectIssueFacts = {
    sheets,
    titleBlockMissing: projectTitleBlockMissing(titleBlock),
    codeCheck,
    orphans: orphanFlags(objects),
    engineerLettersMissing: engineerLettersMissing(objects),
    rendersAwaiting: renders.count ?? 0,
    edition,
  };
  // The load calc is not read here (see ProjectIssueFacts); the Sheets screen adds it from the live model.
  return { facts, checklist: issueChecklist({ ...facts, loadCalc: null }) };
}
