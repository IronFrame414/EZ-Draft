// EZD-611a (09c Code check engine; 03c code_check_run "Run on demand and at issue"; R26 R19): one code check of a
// project, under the member's session so RLS applies. It reads the project's effective edition (EZD-613), the rules a
// licensed person has verified (code_rule.verified_at), runs the engine and stores the run through
// record_code_check_run (Run code check and sight of the project; 20261123100050_create_code_check_run.sql). It never
// changes the model. EZD-612 calls it from the Check button.
import type { SupabaseClient } from '@supabase/supabase-js';
import { runCodeCheck, type CheckResult, type ModelDocument, type RuleRegistry } from '@ezdraft/geometry';
import { projectEdition, type CodeEdition } from '../../lib/code-edition/editions';
import { appRuleRegistry, verifiedRuleIdsOf } from '../../lib/code-check/registry';
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
  const project = await client.from('project').select('code_edition').eq('id', input.projectId).maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) return null;
  const tenant = await client.from('tenant').select('code_edition').maybeSingle();
  if (tenant.error) throw tenant.error;

  const edition = projectEdition(project.data.code_edition, tenant.data?.code_edition ?? null);
  const results = runCodeCheck({
    model: input.model,
    edition,
    registry: input.registry ?? appRuleRegistry(),
    verifiedRuleIds: await loadVerifiedRuleIds(client),
    project: input.project,
  });
  const runId = await recordCodeCheckRun(client, {
    projectId: input.projectId,
    modelVersionId: input.modelVersionId ?? null,
    edition,
    results,
  });
  return { runId, edition, results };
}
