-- EZD-241 (vault/plans/EZD-241.md; docs/runbook.md ## Cloud checks (EZD-171) J5): can postgres add an event
-- trigger that fires for its own changes? Paste all of it into the SQL Editor of ezdraft-dev and press Run.
-- It always ends in an error on purpose, so nothing it creates is kept. The error text must end with:
-- ezd_release_guard_probe user=postgres super=false fired=on
do $probe$
declare
  v_fired text;
  v_super text;
begin
  create schema ezd_release_guard_probe;
  create function ezd_release_guard_probe.mark() returns event_trigger language plpgsql set search_path = '' as $mark$
  begin
    perform pg_catalog.set_config('ezd.release_guard_probe', 'on', true);
  end
  $mark$;
  create event trigger ezd_release_guard_probe on ddl_command_end execute function ezd_release_guard_probe.mark();
  alter event trigger ezd_release_guard_probe enable always;
  create table ezd_release_guard_probe.t (id int);
  v_fired := coalesce(pg_catalog.current_setting('ezd.release_guard_probe', true), 'off');
  select case when r.rolsuper then 'true' else 'false' end into v_super from pg_catalog.pg_roles as r where r.rolname = current_user;
  raise exception 'ezd_release_guard_probe user=% super=% fired=%', current_user, v_super, v_fired;
end
$probe$;
