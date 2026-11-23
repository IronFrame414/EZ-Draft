// EZD-611a: writes the migration that loads the Code rules catalog into public.code_rule.
// Usage: node scripts/code-rules/write-migration.mjs <migration file name>
// e.g.   node scripts/code-rules/write-migration.mjs 20261123100100_code_rule_catalog.sql
// When vault/spec/code-rules.json changes, run it with a new timestamped name: catalog rows are upserted by rule id
// and catalog rows no longer in the file are removed; company rules and verified_by / verified_at are never touched.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG_COLUMNS, CATALOG_PATH, catalogRow } from './catalog-row.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const name = process.argv[2];
if (!name || !/^\d{14}_[a-z0-9_]+\.sql$/.test(name)) {
  console.error('usage: node scripts/code-rules/write-migration.mjs <yyyymmddhhmmss_name.sql>');
  process.exit(1);
}

const lit = (v) => (v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const entries = JSON.parse(readFileSync(path.join(root, CATALOG_PATH), 'utf8'));
const rows = entries.map(catalogRow);
const values = rows.map((r) => `  (${CATALOG_COLUMNS.map((c) => lit(r[c])).join(', ')})`).join(',\n');
const updates = CATALOG_COLUMNS.filter((c) => c !== 'rule_id')
  .map((c) => `  ${c} = excluded.${c}`)
  .join(',\n');

const sql = `-- EZD-611a (09c Code check engine; 03e code_rule; R26 R34): the Code rules catalog, ${rows.length} rules, loaded from
-- ${CATALOG_PATH} by scripts/code-rules/write-migration.mjs. Generated: do not edit by hand; the catalog sync test
-- (app/src/server/code-check/code-rule-catalog.db.test.ts) fails when this table and the file differ.
insert into public.code_rule (${CATALOG_COLUMNS.join(', ')}) values
${values}
on conflict (rule_id) where tenant_id is null do update set
${updates};

delete from public.code_rule
where tenant_id is null
  and rule_id <> all (array[${rows.map((r) => lit(r.rule_id)).join(', ')}]::text[]);
`;
writeFileSync(path.join(root, 'supabase', 'migrations', name), sql);
console.log(`wrote supabase/migrations/${name} (${rows.length} rules)`);
