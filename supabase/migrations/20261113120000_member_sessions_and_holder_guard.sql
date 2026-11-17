-- EZD-106 (vault/plans/EZD-106.md Part a; S15 Validation; Q-0695 decisions 10 rows 60, 62; 09n "Last
-- settings_users holder"): two database rules for the Users page writes.
--
-- 1. Session ending only when the old membership was active (AC-EZD-106-7; Q-0695 row 62). Deleting, or
--    changing the status or scope of, an invited or deactivated row in company A must not sign the person
--    out of company B. A user_id or tenant_id change still ends sessions whatever the status (EZD-165; the
--    locked rls.sessions-identity T3 moves an invited row to another company and expects the sign-out).
--    The membership_project trigger ends sessions only when its membership is active; inside a membership
--    delete's cascade the parent row is gone, so it finds no one (the membership trigger already acted).
create or replace function private.membership_end_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'DELETE' and old.status = 'active')
    or (tg_op = 'UPDATE' and (
      (old.status = 'active'
        and (new.status is distinct from old.status or new.scope is distinct from old.scope))
      or new.user_id is distinct from old.user_id
      or new.tenant_id is distinct from old.tenant_id))
  then
    perform private.end_user_sessions(old.user_id);
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    perform private.end_user_sessions(new.user_id);
  end if;
  return null;
end
$$;

revoke all on function private.membership_end_sessions() from public;

create or replace function private.membership_project_end_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or new.membership_id is distinct from old.membership_id
    or new.project_id is distinct from old.project_id
  then
    perform private.end_user_sessions(
      (select m.user_id from public.membership m
       where m.id = old.membership_id and m.status = 'active')
    );
  end if;
  return null;
end
$$;

revoke all on function private.membership_project_end_sessions() from public;

-- 2. The last settings_users holder (AC-EZD-106-2; Q-0695 row 60). Counted: active memberships with
--    settings_users granted. Only a change that takes a company from 1 holder to 0 is refused, with
--    last_settings_users_holder (P0001).
--    - An immediate BEFORE row trigger on each table marks the company (a transaction-local setting) when
--      an active holder may lose the switch: an active holder's membership is deleted or leaves active, or
--      a granted settings_users row of an active membership is unticked, moved or deleted. So a company
--      that had no holder is never checked.
--    - A deferred constraint trigger on each table recounts a marked company at the end of the
--      transaction (or at SET CONSTRAINTS ALL IMMEDIATE, which every Users page function runs), so a
--      re-tick of all 37 rows, a delete-and-insert of a member's switches, and a company delete that
--      removes its memberships first all see the final state.
--    - The recount takes a per-company advisory lock first: two holders unticking each other at once
--      leave one (09n row 4). A company that is gone passes (09n row 5; role_preset_guard, 20261024100002:22).
--    Raw SQL could clear the setting; no API role runs raw SQL, and the Users page writes are definer
--    functions that never touch it.
create function private.check_settings_users_holder(p_tenant uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_holders integer;
begin
  if p_tenant is null
    or position(p_tenant::text in coalesce(current_setting('ezd.holder_check', true), '')) = 0
  then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ezd.settings_users_holder:' || p_tenant::text, 0));
  if not exists (select 1 from public.tenant t where t.id = p_tenant) then
    return;
  end if;
  select count(*) into v_holders
  from public.membership m
  join public.user_permission up on up.membership_id = m.id and up.tenant_id = m.tenant_id
  where m.tenant_id = p_tenant
    and m.status = 'active'
    and up.permission_key = 'settings_users'
    and up.granted;
  if v_holders = 0 then
    raise exception 'last_settings_users_holder' using errcode = 'P0001';
  end if;
end
$$;

revoke all on function private.check_settings_users_holder(uuid) from public;

create function private.mark_settings_users_holder(p_tenant uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select set_config(
    'ezd.holder_check',
    coalesce(current_setting('ezd.holder_check', true), '') || p_tenant::text || ',',
    true)
  where position(p_tenant::text in coalesce(current_setting('ezd.holder_check', true), '')) = 0;
$$;

revoke all on function private.mark_settings_users_holder(uuid) from public;

create function private.user_permission_holder_mark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.permission_key = 'settings_users' and old.granted
    and (tg_op = 'DELETE'
      or not new.granted
      or new.permission_key is distinct from old.permission_key
      or new.membership_id is distinct from old.membership_id
      or new.tenant_id is distinct from old.tenant_id)
    and exists (
      select 1 from public.membership m where m.id = old.membership_id and m.status = 'active')
  then
    perform private.mark_settings_users_holder(old.tenant_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function private.user_permission_holder_mark() from public;

create trigger user_permission_holder_mark
  before update or delete on public.user_permission
  for each row when (old.permission_key = 'settings_users' and old.granted)
  execute function private.user_permission_holder_mark();

create function private.membership_holder_mark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active'
    and (tg_op = 'DELETE'
      or new.status <> 'active'
      or new.tenant_id is distinct from old.tenant_id)
    and exists (
      select 1 from public.user_permission up
      where up.membership_id = old.id and up.permission_key = 'settings_users' and up.granted)
  then
    perform private.mark_settings_users_holder(old.tenant_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function private.membership_holder_mark() from public;

create trigger membership_holder_mark
  before update or delete on public.membership
  for each row when (old.status = 'active')
  execute function private.membership_holder_mark();

create function private.settings_users_holder_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_settings_users_holder(old.tenant_id);
  return null;
end
$$;

revoke all on function private.settings_users_holder_guard() from public;

create constraint trigger user_permission_holder_guard
  after update or delete on public.user_permission
  deferrable initially deferred
  for each row when (old.permission_key = 'settings_users' and old.granted)
  execute function private.settings_users_holder_guard();

create constraint trigger membership_holder_guard_update
  after update on public.membership
  deferrable initially deferred
  for each row when (
    old.status = 'active'
    and (new.status <> 'active' or new.tenant_id is distinct from old.tenant_id))
  execute function private.settings_users_holder_guard();

create constraint trigger membership_holder_guard_delete
  after delete on public.membership
  deferrable initially deferred
  for each row when (old.status = 'active')
  execute function private.settings_users_holder_guard();
