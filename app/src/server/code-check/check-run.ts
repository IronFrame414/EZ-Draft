// EZD-611a (09c Code check engine; 03c code_check_run "Run on demand and at issue"; R26 R19): one code check of a
// project, under the member's session so RLS applies. It reads the project's effective edition (EZD-613), the rules a
// licensed person has verified (code_rule.verified_at), runs the engine and stores the run through
// record_code_check_run (Run code check and sight of the project; 20261123100050_create_code_check_run.sql). It never
// changes the model. EZD-612 calls it from the Check button. EZD-643 (AC-EZD-643-1; Q-0765): the edition is the
// project's stored one (FBC 9th ed. with NEC 2023 or FBC 8th ed. with NEC 2020), so the engine runs only that
// edition's rule sets and reports each rule's section in that edition.
import type { SupabaseClient } from '@supabase/supabase-js';
import { runCodeCheck, type CheckResult, type ModelDocument, type RuleRegistry } from '@ezdraft/geometry';
import { projectEdition, type CodeEdition } from '../../lib/code-edition/editions';
import { appRuleRegistry, verifiedRuleIdsOf } from '../../lib/code-check/registry';
import { codeCheckDefaults } from '../../lib/defaults/check-values';
import { loadTenantDefaults, projectCopyOf } from '../defaults/defaults';
import type { Database, Json } from '../db/database.types';

type Client = SupabaseClient<Database>;

// Read in pages: the API returns at most 1,000 rows a call and the catalog alone holds 1,248 rules.
const PAGE = 1000;

export async function loadVerifiedRuleIds(client: Client): Promise<Set<string>> {
  const rows: { rule_id: string; verified_at: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('code_rule')
      .select('rule_id, verified_at')
      .not('verified_at', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return verifiedRuleIdsOf(rows);
}

export async function recordCodeCheckRun(
  client: Client,
  run: { projectId: string; modelVersionId: string | null; edition: string; results: readonly CheckResult[] },
): Promise<string> {
  const { data, error } = await client.rpc('record_code_check_run', {
    p_project: run.projectId,
    p_model_version: run.modelVersionId as string,
    p_edition: run.edition,
    p_warnings: run.results as unknown as Json,
  });
  if (error) throw error;
  return data as string;
}

export type ProjectCodeCheck = { runId: string; edition: CodeEdition; results: CheckResult[] };

// A project the member cannot see reads as null.
export async function checkProject(
  client: Client,
  input: {
    projectId: string;
    model: ModelDocument;
    modelVersionId?: string | null;
    registry?: RuleRegistry;
    project?: Readonly<Record<string, unknown>>;
  },
): Promise<ProjectCodeCheck | null> {
  const project = await client.from('project').select('code_edition, permit_application_date, created_at, settings').eq('id', input.projectId).maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) return null;
  const tenant = await client.from('tenant').select('code_edition').maybeSingle();
  if (tenant.error) throw tenant.error;

  const edition = projectEdition(project.data.code_edition, tenant.data?.code_edition ?? null, {
    permitDate: project.data.permit_application_date,
    createdAt: project.data.created_at,
  });
  const results = runCodeCheck({
    model: input.model,
    edition,
    registry: input.registry ?? appRuleRegistry(),
    verifiedRuleIds: await loadVerifiedRuleIds(client),
    // EZD-228: the Defaults values the rules read (bath clearances); values the caller gives win.
    project: {
      ...codeCheckDefaults(await loadTenantDefaults(client), projectCopyOf(project.data.settings)),
      ...input.project,
    },
  });
  const runId = await recordCodeCheckRun(client, {
    projectId: input.projectId,
    modelVersionId: input.modelVersionId ?? null,
    edition,
    results,
  });
  return { runId, edition, results };
}

// EZD-612 (AC-EZD-612-3; 20261125200000_code_check_accept.sql): a warning accepted with a note.
export type AcceptedWarning = {
  ruleId: string;
  objectId: string;
  edition: string;
  note: string;
  by: string | null;
  byName: string | null;
  at: string;
  objectSeq: number | null;
};

export type StoredCodeCheckRun = {
  runId: string;
  edition: string;
  createdAt: string;
  results: CheckResult[];
  accepted: AcceptedWarning[];
};

// A Warnings-group result (09c; assumptions EZD-611a Severity): a failing rule on new or altered work.
export function isOpenableWarning(r: Pick<CheckResult, 'status' | 'severity'>): boolean {
  return r.status === 'fail' && r.severity === 'warning';
}

// The open warnings: Warnings-group results not accepted with a note.
export function openWarningCount(results: readonly CheckResult[], accepted: readonly AcceptedWarning[]): number {
  const keys = new Set(accepted.map((a) => `${a.ruleId}|${a.objectId}`));
  return results.filter((r) => isOpenableWarning(r) && !keys.has(`${r.ruleId}|${r.objectId}`)).length;
}

// The project's latest run, or null when none was run (or the project is hidden).
export async function latestCodeCheckRun(client: Client, projectId: string): Promise<StoredCodeCheckRun | null> {
  const { data, error } = await client
    .from('code_check_run')
    .select('id, edition, created_at, warnings, accepted_notes')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return null;
  return {
    runId: data.id,
    edition: data.edition,
    createdAt: data.created_at,
    results: data.warnings as unknown as CheckResult[],
    accepted: data.accepted_notes as unknown as AcceptedWarning[],
  };
}

// Copies the previous run's acceptances that still apply onto a run just recorded; returns how many.
export async function carryAcceptances(client: Client, runId: string): Promise<number> {
  const { data, error } = await client.rpc('carry_code_check_acceptances', { p_run: runId });
  if (error) throw error;
  return data;
}

export type AcceptOutcome =
  | { ok: true; entry: AcceptedWarning }
  | { ok: false; code: 'permission_denied' | 'run_not_latest' | 'invalid_input' };

export async function acceptCodeWarning(
  client: Client,
  input: { runId: string; ruleId: string; objectId: string; note: string },
): Promise<AcceptOutcome> {
  const { data, error } = await client.rpc('accept_code_warning', {
    p_run: input.runId,
    p_rule: input.ruleId,
    p_object: input.objectId,
    p_note: input.note,
  });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === '40001') return { ok: false, code: 'run_not_latest' };
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  return { ok: true, entry: data as unknown as AcceptedWarning };
}

// S06 "Check not run since last change": true when any object of the project (a removed one too) was saved after
// the run, so a reopened editor's pill reads "Check not run".
export async function modelChangedSince(client: Client, projectId: string, iso: string): Promise<boolean> {
  const { data, error } = await client
    .from('model_object')
    .select('object_id')
    .eq('project_id', projectId)
    .gt('updated_at', iso)
    .limit(1);
  if (error) throw error;
  return data.length > 0;
}
