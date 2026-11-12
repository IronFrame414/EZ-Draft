-- EZD-5602 M1, file 3 of 3 (vault/plans/EZD-5602.md section 1 Data; Q-0637 usage row and call path row;
-- AC-EZD-5602-6, -8): the three definer functions that are the only ways into public.ai_usage and
-- public.ai_assistant_slot, executable by authenticated only behind the API request gate (L-016) and listed in
-- GATED_RPC_CALLS (app/test-harness/rls/gate.ts).

-- One assistant call slot for the caller: refused 'in_flight' while an unfinished slot started within 125 s,
-- 'rate_limited' at 30 slots in the rolling minute. The caller's app_user row is locked before any count, so two
-- prompts at once cannot both take the slot (EZD-321). Rows older than 5 minutes are deleted first.
create function public.take_ai_assistant_slot()
returns table (slot_id uuid, refused text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_tenant uuid;
  v_count integer;
  v_id uuid;
begin
  perform private.require_api_gate();
  v_user := private.app_user_id();
  v_tenant := private.tenant_id();
  if v_user is null or v_tenant is null
    or not exists (
      select 1 from public.membership m
      where m.tenant_id = v_tenant and m.user_id = v_user and m.status = 'active'
    )
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  perform 1 from public.app_user u where u.id = v_user for update;

  delete from public.ai_assistant_slot s where s.started_at < now() - interval '5 minutes';

  if exists (
    select 1 from public.ai_assistant_slot s
    where s.tenant_id = v_tenant and s.app_user_id = v_user
      and s.finished_at is null
      and s.started_at > now() - interval '125 seconds'
  ) then
    return query select null::uuid, 'in_flight'::text;
    return;
  end if;

  select count(*) into v_count
  from public.ai_assistant_slot s
  where s.tenant_id = v_tenant and s.app_user_id = v_user
    and s.started_at > now() - interval '1 minute';

  if v_count >= 30 then
    return query select null::uuid, 'rate_limited'::text;
    return;
  end if;

  insert into public.ai_assistant_slot (tenant_id, app_user_id)
  values (v_tenant, v_user)
  returning id into v_id;

  return query select v_id, null::text;
end
$$;

revoke all on function public.take_ai_assistant_slot() from public, anon, service_role;
grant execute on function public.take_ai_assistant_slot() to authenticated;

-- Marks the caller's own slot finished; another user's slot id changes nothing.
create function public.release_ai_assistant_slot(p_slot_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_tenant uuid;
begin
  perform private.require_api_gate();
  v_user := private.app_user_id();
  v_tenant := private.tenant_id();
  if v_user is null or v_tenant is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  update public.ai_assistant_slot s
  set finished_at = now()
  where s.id = p_slot_id
    and s.tenant_id = v_tenant
    and s.app_user_id = v_user
    and s.finished_at is null;
end
$$;

revoke all on function public.release_ai_assistant_slot(uuid) from public, anon, service_role;
grant execute on function public.release_ai_assistant_slot(uuid) to authenticated;

-- One usage row for the caller's billed prompt: the provider model id and the cost in dollars.
create function public.record_ai_usage(p_model text, p_cost_usd numeric)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_tenant uuid;
begin
  perform private.require_api_gate();
  v_user := private.app_user_id();
  v_tenant := private.tenant_id();
  if v_user is null or v_tenant is null
    or not exists (
      select 1 from public.membership m
      where m.tenant_id = v_tenant and m.user_id = v_user and m.status = 'active'
    )
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_model is null
    or p_model not in ('claude-sonnet-5-5', 'claude-opus-5-5')
    or p_cost_usd is null
    or p_cost_usd < 0
    or p_cost_usd >= 10000
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  insert into public.ai_usage (tenant_id, app_user_id, model, cost_usd)
  values (v_tenant, v_user, p_model, p_cost_usd);
end
$$;

revoke all on function public.record_ai_usage(text, numeric) from public, anon, service_role;
grant execute on function public.record_ai_usage(text, numeric) to authenticated;
