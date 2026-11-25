// EZD-1932 (audit 2026-11-23 S3; AC-EZD-1932-1, AC-EZD-1932-2): functions in public fail closed.
// F1: a function postgres creates in public after 20261123200000 is not executable by anon or authenticated
// until granted by name. F2: the security definer functions in public that anon can execute are exactly the
// signed-out set the ticket names. Expected values: the acceptance criteria. Local database (EZD-006 harness).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminSql, withRollback, type Sql } from '../../../test-harness/rls/db';

// AC-EZD-1932-2: the intended signed-out set, sorted.
const SIGNED_OUT_DEFINERS = [
  'error_tunnel_take',
  'health',
  'record_error_alert',
  'release_error_alert_email',
  'resolve_sent_package',
  'resolve_share_link',
  'sign_in_throttle_settle',
  'sign_in_throttle_take',
];

describe('EZD-1932 public functions fail closed', () => {
  let sql: Sql;

  beforeAll(() => {
    sql = adminSql();
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it('EZD-1932 F1 a new public function is not executable by anon or authenticated until granted', async () => {
    const name = `ezd1932_probe_${Date.now().toString(36)}`;
    const fn = `public.${name}()`;
    const result = await withRollback(sql, async (tx) => {
      await tx.unsafe('set local role postgres');
      await tx.unsafe(`create function ${fn} returns int language sql as 'select 1'`);
      const can = async (role: string) => {
        const rows = await tx`select has_function_privilege(${role}, ${fn}, 'execute') as ok`;
        return rows[0].ok as boolean;
      };
      const before = { anon: await can('anon'), authenticated: await can('authenticated') };

      // Calling it as each role is refused (42501 insufficient_privilege).
      const refused: Record<string, string | undefined> = {};
      for (const role of ['anon', 'authenticated']) {
        await tx.unsafe('savepoint call_probe');
        try {
          await tx.unsafe(`set local role ${role}`);
          await tx.unsafe(`select ${fn}`);
          refused[role] = 'ran';
        } catch (e) {
          refused[role] = (e as { code?: string }).code;
        }
        await tx.unsafe('rollback to savepoint call_probe');
        await tx.unsafe('set local role postgres');
      }

      await tx.unsafe(`grant execute on function ${fn} to anon, authenticated`);
      const after = { anon: await can('anon'), authenticated: await can('authenticated') };
      await tx.unsafe('set local role authenticated');
      const ran = await tx.unsafe(`select ${fn} as v`);
      return { before, refused, after, value: ran[0].v as number };
    });

    expect(result.before).toEqual({ anon: false, authenticated: false });
    expect(result.refused).toEqual({ anon: '42501', authenticated: '42501' });
    expect(result.after).toEqual({ anon: true, authenticated: true });
    expect(result.value).toBe(1);
  });

  it('EZD-1932 F1 the default privileges of postgres grant execute on functions to neither anon, authenticated nor PUBLIC', async () => {
    const rows = await sql<{ schema: string | null; grantee: string }[]>`
      select n.nspname::text as schema, coalesce(r.rolname::text, 'PUBLIC') as grantee
      from pg_default_acl d
      join pg_roles o on o.oid = d.defaclrole
      left join pg_namespace n on n.oid = d.defaclnamespace
      cross join lateral aclexplode(d.defaclacl) x
      left join pg_roles r on r.oid = x.grantee
      where o.rolname = 'postgres' and d.defaclobjtype = 'f' and x.privilege_type = 'EXECUTE'
        and (n.nspname = 'public' or d.defaclnamespace = 0)`;
    const grantees = rows.map((r) => r.grantee);
    expect(grantees).not.toContain('anon');
    expect(grantees).not.toContain('authenticated');
    expect(grantees).not.toContain('PUBLIC');
    // The global entry exists, so PUBLIC's built-in execute is revoked rather than never stated.
    const global = await sql<{ n: number }[]>`
      select count(*)::int as n from pg_default_acl d join pg_roles o on o.oid = d.defaclrole
      where o.rolname = 'postgres' and d.defaclobjtype = 'f' and d.defaclnamespace = 0`;
    expect(global[0].n).toBe(1);
  });

  it('EZD-1932 F2 the security definer functions in public that anon can execute are exactly the signed-out set', async () => {
    const rows = await sql<{ name: string }[]>`
      select distinct p.proname::text as name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')`;
    expect(rows.map((r) => r.name).sort()).toEqual(SIGNED_OUT_DEFINERS);
  });
});
