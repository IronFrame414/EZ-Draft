-- EZD-140 Step 2 (vault/plans/EZD-140.md section 1 Data M2; Decided D2; Q-0393): the one way a member writes
-- their notification settings. Runs private.require_api_gate() first (EZD-190) and takes the tenant and user
-- from the claim (42501 not_authorized when either is missing). The input is all nine kinds, each
-- { kind, in_app, email } with a listed kind and boolean switches, no kind twice; anything else is 22023
-- invalid_input. A row changes (and its updated_at moves) only when its switches differ.
create function public.save_my_notification_settings(p_settings jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_item jsonb;
  v_seen text[] := '{}';
  v_kinds text[] := array[
    'client_response', 'field_conflict', 'field_measurements_received', 'render_finished', 'edit_request',
    'sync_conflict', 'cleanup_due', 'render_allowance_refilled', 'field_pack_issued'
  ];
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  if v_tenant is null or v_user is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'array' or jsonb_array_length(p_settings) <> 9 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  for v_item in select e from jsonb_array_elements(p_settings) as e loop
    if jsonb_typeof(v_item) <> 'object'
      or coalesce(jsonb_typeof(v_item -> 'kind'), '') <> 'string'
      or not ((v_item ->> 'kind') = any (v_kinds))
      or coalesce(jsonb_typeof(v_item -> 'in_app'), '') <> 'boolean'
      or coalesce(jsonb_typeof(v_item -> 'email'), '') <> 'boolean'
      or (v_item ->> 'kind') = any (v_seen)
    then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_seen := v_seen || (v_item ->> 'kind');
  end loop;

  insert into public.notification_setting as s (tenant_id, user_id, kind, in_app, email, updated_at)
  select v_tenant, v_user, e ->> 'kind', (e ->> 'in_app')::boolean, (e ->> 'email')::boolean, now()
  from jsonb_array_elements(p_settings) as e
  on conflict (tenant_id, user_id, kind) do update
    set in_app = excluded.in_app, email = excluded.email, updated_at = now()
    where (s.in_app, s.email) is distinct from (excluded.in_app, excluded.email);
end
$$;

revoke all on function public.save_my_notification_settings(jsonb) from public, anon, service_role;
grant execute on function public.save_my_notification_settings(jsonb) to authenticated;
