-- EZD-109 (vault/plans/EZD-109.md Build step 2; Q-0695 decisions 03 row 33; Q-0697 decisions 10 row 66): the
-- event_log writers. Two private writers for definer functions that log inside their own transaction (a
-- failed write raises, so the change it logs rolls back), and one gated public function for the app's default
-- event sink (app/src/server/events/event-log.ts), which logs after the action has committed. No API role
-- executes the private writers.

-- Explicit ids. A null actor is a system action: its name and IP are null too (Q-0697).
create function private.write_event_log_as(
  p_action text,
  p_tenant_id uuid,
  p_actor_app_user_id uuid,
  p_object_type text,
  p_object_id uuid,
  p_details jsonb,
  p_ip inet
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_actor_app_user_id is null and p_ip is not null then
    raise exception 'event_log_system_ip' using errcode = '22023';
  end if;
  insert into public.event_log (
    tenant_id, actor_app_user_id, actor_name, action, object_type, object_id, details, ip
  ) values (
    p_tenant_id,
    p_actor_app_user_id,
    (select coalesce(nullif(btrim(a.name), ''), a.email)
      from public.app_user a where a.id = p_actor_app_user_id),
    p_action,
    p_object_type,
    p_object_id,
    coalesce(p_details, '{}'::jsonb),
    p_ip
  );
end
$$;

revoke all on function private.write_event_log_as(text, uuid, uuid, text, uuid, jsonb, inet) from public;

-- Company and actor from the request's claims; refused (42501) without them.
create function private.write_event_log(
  p_action text,
  p_object_type text,
  p_object_id uuid,
  p_details jsonb,
  p_ip inet
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_actor uuid := private.app_user_id();
begin
  if v_tenant is null or v_actor is null then
    raise exception 'event_log_no_actor' using errcode = '42501';
  end if;
  perform private.write_event_log_as(p_action, v_tenant, v_actor, p_object_type, p_object_id,
    p_details, p_ip);
end
$$;

revoke all on function private.write_event_log(text, text, uuid, jsonb, inet) from public;

-- The default sink's writer. The actor is the signed-in person (auth.uid()), never a parameter, and must be
-- active in the given company; the tenant claim is not used (it can be stale until the token refreshes).
create function public.log_event(
  p_tenant_id uuid,
  p_action text,
  p_object_type text,
  p_object_id uuid,
  p_details jsonb,
  p_ip inet
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  perform private.require_api_gate();
  if not private.session_is_live() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select a.id into v_actor from public.app_user a where a.auth_user_id = auth.uid();
  if v_actor is null or p_tenant_id is null or not exists (
    select 1 from public.membership m
    where m.tenant_id = p_tenant_id and m.user_id = v_actor and m.status = 'active'
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  perform private.write_event_log_as(p_action, p_tenant_id, v_actor, p_object_type, p_object_id,
    p_details, p_ip);
end
$$;

revoke all on function public.log_event(uuid, text, text, uuid, jsonb, inet) from public, anon, service_role;
grant execute on function public.log_event(uuid, text, text, uuid, jsonb, inet) to authenticated;
