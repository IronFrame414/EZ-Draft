// EZD-241 (vault/plans/EZD-241.md sections 1 and 3; Q-0358 (c)): the release guard. During release step E two
// temporary event triggers stop any migration, in the release session only, that drops or renames an object the
// base tag still reads, and a row trigger on the CLI's history table counts the migrations recorded with and
// without the release setting (`seen`, `applied`). Pure builders plus a guard object over an injected `sql` (bootstrap.mjs `createSql`
// shape); Node 22 built-ins only.
import { MIGRATION_TIMEOUTS, withTimeouts } from './push.mjs';
import { SNAPSHOT_SQL, parseSnapshot } from './scratch-check.mjs';
import { isRetired } from './check-migrations.mjs';
import { RELEASE_TAG_RE } from './tags.mjs';

export const RELEASE_GUARD_SCHEMA = 'ezd_release_guard';
export const RELEASE_GUARD_TRIGGERS = Object.freeze(['ezd_release_guard_sql_drop', 'ezd_release_guard_ddl_end']);
export const RELEASE_GUARD_MIGRATION_TRIGGER = 'ezd_release_guard_migration_row';
export const RELEASE_GUARD_SETTING = Object.freeze({ name: 'ezd.release_guard', value: 'on' });

export const GUARD_SETTING_PROBE_SQL =
  "select 'ezd_release_guard_setting ' || coalesce(pg_catalog.current_setting('ezd.release_guard', true), '');\n";

export const GUARD_REMOVE_SQL = `select 'ezd_release_guard_before ' || ((select pg_catalog.count(*) from pg_catalog.pg_event_trigger where evtname in ('ezd_release_guard_sql_drop', 'ezd_release_guard_ddl_end') and evtenabled = 'A') + (select pg_catalog.count(*) from pg_catalog.pg_trigger where tgname = 'ezd_release_guard_migration_row' and tgenabled = 'A')) || ' ' || coalesce((select s.last_value from pg_catalog.pg_sequences as s where s.schemaname = 'ezd_release_guard' and s.sequencename = 'seen'), 0) || ' ' || coalesce((select s.last_value from pg_catalog.pg_sequences as s where s.schemaname = 'ezd_release_guard' and s.sequencename = 'applied'), 0);
drop event trigger if exists ezd_release_guard_sql_drop;
drop event trigger if exists ezd_release_guard_ddl_end;
drop schema if exists ezd_release_guard cascade;
select 'ezd_release_guard_removed ' || (select pg_catalog.count(*) from pg_catalog.pg_event_trigger where evtname in ('ezd_release_guard_sql_drop', 'ezd_release_guard_ddl_end')) || ' ' || (select pg_catalog.count(*) from pg_catalog.pg_namespace where nspname = 'ezd_release_guard') || ' ' || (select pg_catalog.count(*) from pg_catalog.pg_trigger where tgname = 'ezd_release_guard_migration_row');
`;

const DOLLAR_TAG = '$ezd_guard$';
const REMOVE_RE = /^ezd_release_guard_before (\d+) (\d+) (\d+)\nezd_release_guard_removed 0 0 0$/;

const ID_EXPR =
  "case r.classid when 'pg_catalog.pg_class'::pg_catalog.regclass then 'c' || r.objid || case when r.objsubid <> 0 then ':' || r.objsubid else '' end when 'pg_catalog.pg_proc'::pg_catalog.regclass then 'p' || r.objid when 'pg_catalog.pg_type'::pg_catalog.regclass then 't' || r.objid when 'pg_catalog.pg_namespace'::pg_catalog.regclass then 'n' || r.objid when 'pg_catalog.pg_extension'::pg_catalog.regclass then 'x' || r.objid end";

/** A SQL string literal: every `'` doubled. */
const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;

const guardSqlInvalid = () => Object.assign(new Error('guard_sql_invalid'), { code: 'guard_sql_invalid' });

export class ReleaseGuardError extends Error {
  constructor(code, cause) {
    super(code);
    this.name = 'ReleaseGuardError';
    this.code = code;
    this.stderr = typeof cause?.stderr === 'string' ? cause.stderr : '';
  }
}

/** The snapshot entries the base tag still reads: those not covered by its retired entries, order kept. */
export function guardedObjects(snapshot, retired) {
  return snapshot.filter(({ kind, name }) => !isRetired(retired, { kind, name }));
}

/** The install text (plan section 1 Guard SQL); `guard_sql_invalid` for a bad tag or a dollar tag in the data. */
export function buildGuardInstallSql({ objects, baseTag }) {
  if (typeof baseTag !== 'string' || !RELEASE_TAG_RE.test(baseTag)) throw guardSqlInvalid();
  const list = lit(JSON.stringify(objects.map(({ id, kind, name }) => ({ id, kind, name }))));
  const snap = lit(SNAPSHOT_SQL.replace(/;\s*$/, ''));
  if (list.includes(DOLLAR_TAG) || snap.includes(DOLLAR_TAG)) throw guardSqlInvalid();
  const tag = lit(baseTag);
  return `begin;
create schema ezd_release_guard;
revoke all on schema ezd_release_guard from public;
create sequence ezd_release_guard.seen;
create sequence ezd_release_guard.applied;
create function ezd_release_guard.protected() returns table (id text, kind text, name text) language sql immutable set search_path = '' as $ezd_guard$
  select x.id, x.kind, x.name from pg_catalog.json_to_recordset(${list}::json) as x(id text, kind text, name text)
$ezd_guard$;
create function ezd_release_guard.on_sql_drop() returns event_trigger language plpgsql set search_path = '' as $ezd_guard$
declare
  r record;
  p record;
begin
  if coalesce(pg_catalog.current_setting('ezd.release_guard', true), '') <> 'on' then
    return;
  end if;
  for r in select d.classid, d.objid, d.objsubid from pg_catalog.pg_event_trigger_dropped_objects() as d loop
    select o.kind, o.name into p from ezd_release_guard.protected() as o where o.id = ${ID_EXPR};
    if found then
      raise exception 'ezd_release_guard: % % is dropped or renamed while % still reads it', p.kind, p.name, ${tag};
    end if;
  end loop;
end
$ezd_guard$;
create function ezd_release_guard.on_ddl_end() returns event_trigger language plpgsql set search_path = '' as $ezd_guard$
declare
  snap json;
  p record;
begin
  if coalesce(pg_catalog.current_setting('ezd.release_guard', true), '') <> 'on' then
    return;
  end if;
  execute ${snap} into snap;
  select o.kind, o.name into p
    from ezd_release_guard.protected() as o
    left join (select e->>'id' as id, e->>'name' as name from pg_catalog.json_array_elements(snap) as e) as c on c.id = o.id
    where c.id is null or c.name <> o.name
    order by o.id
    limit 1;
  if found then
    raise exception 'ezd_release_guard: % % is dropped or renamed while % still reads it', p.kind, p.name, ${tag};
  end if;
end
$ezd_guard$;
create function ezd_release_guard.on_migration_row() returns trigger language plpgsql set search_path = '' as $ezd_guard$
begin
  perform pg_catalog.nextval('ezd_release_guard.seen'::pg_catalog.regclass);
  if coalesce(pg_catalog.current_setting('ezd.release_guard', true), '') = 'on' then
    perform pg_catalog.nextval('ezd_release_guard.applied'::pg_catalog.regclass);
  end if;
  return null;
end
$ezd_guard$;
revoke all on function ezd_release_guard.protected() from public, anon, authenticated, service_role;
revoke all on function ezd_release_guard.on_sql_drop() from public, anon, authenticated, service_role;
revoke all on function ezd_release_guard.on_ddl_end() from public, anon, authenticated, service_role;
revoke all on function ezd_release_guard.on_migration_row() from public, anon, authenticated, service_role;
revoke all on sequence ezd_release_guard.seen, ezd_release_guard.applied from public, anon, authenticated, service_role;
create event trigger ezd_release_guard_sql_drop on sql_drop execute function ezd_release_guard.on_sql_drop();
alter event trigger ezd_release_guard_sql_drop enable always;
create event trigger ezd_release_guard_ddl_end on ddl_command_end execute function ezd_release_guard.on_ddl_end();
alter event trigger ezd_release_guard_ddl_end enable always;
create trigger ezd_release_guard_migration_row after insert on supabase_migrations.schema_migrations for each row execute function ezd_release_guard.on_migration_row();
alter table supabase_migrations.schema_migrations enable always trigger ezd_release_guard_migration_row;
commit;
select 'ezd_release_guard_installed ' || (select pg_catalog.count(*) from ezd_release_guard.protected()) || ' ' || ((select pg_catalog.count(*) from pg_catalog.pg_event_trigger where evtname in ('ezd_release_guard_sql_drop', 'ezd_release_guard_ddl_end') and evtenabled = 'A') + (select pg_catalog.count(*) from pg_catalog.pg_trigger where tgname = 'ezd_release_guard_migration_row' and tgenabled = 'A'));
`;
}

/** `install` and `remove` over `sql(text, { dbUrl }) → Promise<{ stdout, stderr }>`. */
export function createReleaseGuard({ sql }) {
  const step = async (code, run) => {
    try {
      return await run();
    } catch (err) {
      throw new ReleaseGuardError(code, err);
    }
  };

  const remove = async ({ dbUrl }) => {
    const { stdout } = await step('remove_failed', () => sql(GUARD_REMOVE_SQL, { dbUrl }));
    const m = REMOVE_RE.exec(String(stdout).trim());
    if (!m) throw new ReleaseGuardError('remove_failed');
    return { wasIntact: Number(m[1]) === 3, seen: Number(m[2]), applied: Number(m[3]) };
  };

  const install = async ({ dbUrl, baseTag, retired }) => {
    await remove({ dbUrl });

    const probe = await step('setting_not_applied', () =>
      sql(GUARD_SETTING_PROBE_SQL, { dbUrl: withTimeouts(dbUrl, MIGRATION_TIMEOUTS, [RELEASE_GUARD_SETTING]) }),
    );
    if (String(probe.stdout).trim() !== `ezd_release_guard_setting ${RELEASE_GUARD_SETTING.value}`) {
      throw new ReleaseGuardError('setting_not_applied');
    }

    const snapshot = await step('snapshot_unreadable', () => sql(SNAPSHOT_SQL, { dbUrl }));
    let entries;
    try {
      entries = parseSnapshot(String(snapshot.stdout).trim());
    } catch {
      throw new ReleaseGuardError('snapshot_unreadable');
    }
    if (entries.length === 0) throw new ReleaseGuardError('snapshot_unreadable');

    const objects = guardedObjects(entries, retired);
    const installed = await step('install_failed', async () =>
      sql(buildGuardInstallSql({ objects, baseTag }), { dbUrl }),
    );
    if (String(installed.stdout).trim() !== `ezd_release_guard_installed ${objects.length} 3`) {
      throw new ReleaseGuardError('install_failed');
    }
    return { protectedCount: objects.length };
  };

  return { install, remove };
}
