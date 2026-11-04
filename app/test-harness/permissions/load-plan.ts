// EZD-285 (vault/plans/EZD-285.md sections 1 and 3): explains a permissions load on fresh, never-analyzed temp
// clones of the tables it reads, so the plan does not depend on the shared tables' statistics (Q-0355). A load
// passes when it is one indexed query: every read names an index condition. Test-only; never imported by app
// code. Runs only inside withRollback (rls/db.ts): temp tables, temp functions and set local end with it.
import type { TransactionSql } from '../rls/db';

export type PlanNode = Record<string, unknown>;

export type LoadPlan = {
  fn: string;
  language: string;
  tables: string[];
  unsupported: string[];
  statements: number;
  plan: PlanNode | null;
};

// A public name in a body (EZD-285 section 1, explainLoad step 4).
const REF = /\bpublic\.([a-z_][a-z0-9_]*)/g;

// Every object with a 'Node Type' key at any depth (the EZD-102 rls.audit.test.ts flattenPlan, copied).
export function planNodes(plan: unknown): PlanNode[] {
  const out: PlanNode[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const n = node as PlanNode;
    if ('Node Type' in n) out.push(n);
    for (const value of Object.values(n)) {
      if (value && typeof value === 'object') walk(value);
    }
  };
  walk(plan);
  return out;
}

export async function explainLoad(tx: TransactionSql, fn: string): Promise<LoadPlan> {
  // (1) the function's own search_path (migration 20261024211336), so an uncloned table errors.
  await tx.unsafe(`set local search_path = ''`);
  // (2) the body and language; an unknown fn throws.
  const [meta] = await tx<{ body: string; language: string }[]>`
    select p.prosrc as body, l.lanname::text as language
    from pg_catalog.pg_proc p
    join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = ${fn}::pg_catalog.regprocedure`;
  const body = meta.body;
  const language = meta.language;
  // (3) only sql bodies are explained.
  if (language !== 'sql') {
    return { fn, language, tables: [], unsupported: [], statements: 0, plan: null };
  }
  // (4) names: each public.<name> once, sorted; a relation of kind r in public is a table, anything else unsupported.
  const names = [...new Set([...body.matchAll(REF)].map((m) => m[1]))].sort();
  const tables: string[] = [];
  const unsupported: string[] = [];
  for (const name of names) {
    const [rel] = await tx<{ kind: string }[]>`
      select c.relkind::text as kind
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = ${name}`;
    if (rel?.kind === 'r') tables.push(name);
    else unsupported.push(`public.${name}`);
  }
  if (body.includes('"')) unsupported.push('"');
  unsupported.sort();
  // (5) nothing to explain when a name is unsupported or the body is empty.
  if (unsupported.length > 0 || body.trim() === '') {
    return { fn, language, tables, unsupported, statements: 0, plan: null };
  }
  // (6) fresh, never-analyzed clones with their indexes.
  for (const t of tables) {
    await tx.unsafe(`create temp table ${t} (like public.${t} including indexes)`);
  }
  // (7) explain the body against the clones; verbose adds each scan's Schema.
  const res = (await tx.unsafe(
    `explain (format json, verbose) ${body.replace(REF, 'pg_temp.$1')}`,
  )) as unknown as unknown[];
  // (8) statement count from the result shape: several statements give one result set each.
  const many = Array.isArray(res[0]);
  const statements = many ? res.length : 1;
  const first = (many ? res[0] : res) as Array<Record<string, unknown>>;
  const explained = first[0]['QUERY PLAN'] as Array<{ Plan: PlanNode }>;
  return { fn, language, tables, unsupported, statements, plan: explained[0].Plan };
}

function hasIndexCond(node: PlanNode): boolean {
  const cond = node['Index Cond'];
  return typeof cond === 'string' && cond.length > 0;
}

// Problem codes, sorted and distinct. [] means one indexed query.
export function loadPlanProblems(load: LoadPlan): string[] {
  const out = new Set<string>();
  if (load.language !== 'sql') out.add(`language:${load.language}`);
  for (const u of load.unsupported) out.add(`unsupported:${u}`);
  if (load.language === 'sql' && load.unsupported.length === 0 && load.statements !== 1) {
    out.add(`statements:${load.statements}`);
  }
  for (const node of planNodes(load.plan)) {
    const rel = node['Relation Name'];
    if (typeof rel === 'string') {
      if (node.Schema !== 'pg_temp') {
        out.add(`not_cloned:${String(node.Schema)}.${rel}`);
        continue;
      }
      const type = node['Node Type'];
      const passes =
        type === 'Bitmap Heap Scan' ||
        ((type === 'Index Scan' || type === 'Index Only Scan') && hasIndexCond(node));
      if (!passes) out.add(`unindexed:${rel}`);
    } else if (node['Node Type'] === 'Bitmap Index Scan' && !hasIndexCond(node)) {
      out.add(`unindexed:${String(node['Index Name'])}`);
    }
  }
  if (load.plan !== null) {
    const named = new Set(planNodes(load.plan).map((n) => n['Relation Name']));
    for (const t of load.tables) {
      if (!named.has(t)) out.add(`not_scanned:${t}`);
    }
  }
  return [...out].sort();
}
