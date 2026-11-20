// EZD-116: the key lists in the migration (update_tenant_defaults' allowed keys and JSON types, the per-project
// copy check of create_project) match the one TypeScript registry, so the two cannot drift (Q-0697 03: the
// route works out the copy from the registry; the function refuses keys outside it).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULTS_REGISTRY, PER_PROJECT_KEYS, STORABLE_KEYS } from './registry';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrations = path.join(here, '../../../../supabase/migrations');
const sql = readFileSync(path.join(migrations, '20261115120000_create_tenant_defaults.sql'), 'utf8');
// EZD-134: later migrations replace private.defaults_key_type; the newest definition is the one in force.
const keyTypeSql = readdirSync(migrations)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(path.join(migrations, f), 'utf8'))
  .filter((text) => /function private\.defaults_key_type\(/.test(text))
  .at(-1) as string;

const listAfter = (marker: RegExp): string[] => {
  const m = marker.exec(sql);
  if (!m) throw new Error(`marker ${marker} not found`);
  const rest = sql.slice(m.index + m[0].length);
  const body = rest.slice(0, rest.indexOf(')'));
  return [...body.matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
};

const jsonType = (type: string) =>
  ({
    length: 'number',
    length_choice: 'number',
    percent: 'number',
    minutes: 'number',
    days: 'number',
    count: 'number',
    choice: 'string',
    switch: 'boolean',
    scales: 'array',
    length_range: 'object',
  })[type];

describe('EZD-116 registry and migration key lists', () => {
  it('every storable key has the JSON type of its row, and no other key is allowed', () => {
    const byType = new Map<string, string[]>();
    for (const t of ['number', 'string', 'boolean', 'array', 'object']) {
      const re = new RegExp(`when p_key in \\(([^)]*)\\)\\s*then '${t}'`);
      const m = re.exec(keyTypeSql);
      byType.set(t, m ? [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]) : []);
    }
    const all = [...byType.values()].flat();
    expect([...all].sort()).toEqual([...STORABLE_KEYS].sort());
    for (const r of DEFAULTS_REGISTRY) {
      if (!STORABLE_KEYS.includes(r.key)) continue;
      expect(byType.get(jsonType(r.type) as string), r.key).toContain(r.key);
    }
  });

  it('the per-project copy check lists exactly the per-project keys', () => {
    expect(listAfter(/if v_key not in \(/).sort()).toEqual([...PER_PROJECT_KEYS].sort());
  });
});
