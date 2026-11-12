-- EZD-221a Build step 1 (vault/plans/EZD-221a.md section 1 M1; Q-0565; Q-0566; Q-0568; AC-EZD-221-3, -5, -6; L-016)
-- Project and template objects in one call, Create projects only, any error rolls back the whole call.
create function public.create_project_with_objects(p_name text, p_address text, p_type text,
  p_customer_id uuid, p_scope_of_work text, p_objects jsonb)
returns table (project_id uuid, tenant_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_project uuid; v_tenant uuid; v_floor uuid; v_item jsonb; v_keys text array; v_id uuid; v_seen uuid array := '{}';
begin
  perform private.require_api_gate();
  select c.project_id, c.tenant_id into v_project, v_tenant
    from public.create_project(p_name, p_address, p_type, p_customer_id, p_scope_of_work) c;
  if p_objects is null or jsonb_typeof(p_objects) <> 'array'
     or jsonb_array_length(p_objects) < 1 or jsonb_array_length(p_objects) > 5 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(p_objects) as e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_item) as k;
    if v_keys is distinct from string_to_array('data,id,schema_version,type', ',')
      or coalesce(jsonb_typeof(v_item -> 'id'), '') <> 'string'
      or coalesce((v_item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
      or coalesce(jsonb_typeof(v_item -> 'type'), '') <> 'string'
      or coalesce((v_item ->> 'type') not in ('wall', 'room'), true)
      or coalesce(jsonb_typeof(v_item -> 'schema_version'), '') <> 'number'
      or coalesce((v_item ->> 'schema_version') !~ '^[1-9][0-9]{0,8}$', true)
      or coalesce(jsonb_typeof(v_item -> 'data'), '') <> 'object'
    then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_id := (v_item ->> 'id')::uuid;
    if v_id = any (v_seen) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_seen := v_seen || v_id;
  end loop;
  select m.object_id into v_floor from public.model_object m
    where m.project_id = v_project and m.type = 'floor' and not m.deleted;
  insert into public.model_object
    (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, updated_by)
  select v_project, (e ->> 'id')::uuid, v_tenant, e ->> 'type',
    jsonb_set(e -> 'data', '{level}', to_jsonb(v_floor::text)), (e ->> 'schema_version')::integer, 1,
    private.app_user_id()
  from jsonb_array_elements(p_objects) as e;
  return query select v_project, v_tenant;
end
$$;
revoke all on function public.create_project_with_objects(text, text, text, uuid, text, jsonb) from public, anon, service_role;
grant execute on function public.create_project_with_objects(text, text, text, uuid, text, jsonb) to authenticated;
