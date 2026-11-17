-- EZD-129 (Q-0202 "picking someone as a project's Foreman lists them on it automatically"; Q-0397; S01 New
-- project wizard; board S01bForeman; AC-EZD-129-3): the wizard's Foreman.
--
-- create_project and create_project_with_objects are copied from 20261105105039 and 20261107100756 with one
-- trailing argument, p_foreman_membership_id uuid default null, so every existing call still resolves. When it
-- is set the member must be active in the caller's company (22023 foreman_unavailable, nothing created).
-- When that member's access is Listed, one membership_project row is added in the same transaction (none when
-- the Foreman is the creator, who is already listed) and its user.scope_changed event_log row is written
-- (Q-0695 decisions 03 row 33). An All projects Foreman gets no row: they already see every project. The
-- Foreman is not stored on the project (03c has no such column). The old signatures are dropped first, so
-- PostgREST sees one function per name. Grants unchanged: authenticated only, in GATED_RPC_CALLS.
--
-- list_foreman_candidates: the company's active members for the picker (membership id, name, email, scope),
-- by name then email. Create projects is checked inside, since the wizard is gated by it (S01 Permissions).
-- Other members' names and emails are already readable by any member (app_user_select), so nothing is widened.

drop function public.create_project_with_objects(text, text, text, uuid, text, jsonb);
drop function public.create_project(text, text, text, uuid, text);

create function public.create_project(p_name text, p_address text, p_type text, p_customer_id uuid,
  p_scope_of_work text, p_foreman_membership_id uuid default null)
returns table (project_id uuid, tenant_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid; v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid; v_scope text; v_id uuid;
  v_foreman_scope text; v_foreman_user uuid; v_added integer;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  if v_tenant is null or v_membership is null then raise exception 'permission_denied' using errcode = '42501'; end if;
  select m.scope into v_scope from public.membership m
    where m.id = v_membership and m.tenant_id = v_tenant and m.status = 'active';
  if v_scope is null then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.user_permission up where up.membership_id = v_membership
      and up.tenant_id = v_tenant and up.permission_key = 'create_projects' and up.granted) then
    raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) = 0 or p_address is null or length(btrim(p_address)) = 0
     or p_type is null or p_type not in ('kitchen', 'bath', 'whole_home_interior') then
    raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_customer_id is not null and not exists (select 1 from public.customer c
      where c.id = p_customer_id and c.tenant_id = v_tenant and c.archived_at is null) then
    raise exception 'customer_unavailable' using errcode = '22023'; end if;
  if p_foreman_membership_id is not null then
    select m.scope, m.user_id into v_foreman_scope, v_foreman_user from public.membership m
      where m.id = p_foreman_membership_id and m.tenant_id = v_tenant and m.status = 'active'
      for share;
    if v_foreman_scope is null then raise exception 'foreman_unavailable' using errcode = '22023'; end if;
  end if;
  insert into public.project (tenant_id, name, address, type, customer_id, scope_of_work)
    values (v_tenant, p_name, p_address, p_type, p_customer_id, p_scope_of_work) returning id into v_id;
  if v_scope = 'listed' then
    insert into public.membership_project (tenant_id, membership_id, project_id) values (v_tenant, v_membership, v_id);
  end if;
  if v_foreman_scope = 'listed' then
    insert into public.membership_project (tenant_id, membership_id, project_id)
      values (v_tenant, p_foreman_membership_id, v_id)
      on conflict (membership_id, project_id) do nothing;
    get diagnostics v_added = row_count;
    if v_added > 0 then
      perform private.write_event_log_as('user.scope_changed', v_tenant, private.event_log_actor(),
        'membership', p_foreman_membership_id, jsonb_build_object('membershipId', p_foreman_membership_id,
          'appUserId', v_foreman_user, 'oldScope', 'listed', 'scope', 'listed',
          'added', jsonb_build_array(v_id), 'removed', '[]'::jsonb), null);
    end if;
  end if;
  return query select v_id, v_tenant;
end $$;
revoke all on function public.create_project(text, text, text, uuid, text, uuid) from public, anon, service_role;
grant execute on function public.create_project(text, text, text, uuid, text, uuid) to authenticated;

create function public.create_project_with_objects(p_name text, p_address text, p_type text,
  p_customer_id uuid, p_scope_of_work text, p_objects jsonb, p_foreman_membership_id uuid default null)
returns table (project_id uuid, tenant_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_project uuid; v_tenant uuid; v_floor uuid; v_item jsonb; v_keys text array; v_id uuid; v_seen uuid array := '{}';
begin
  perform private.require_api_gate();
  select c.project_id, c.tenant_id into v_project, v_tenant
    from public.create_project(p_name, p_address, p_type, p_customer_id, p_scope_of_work,
      p_foreman_membership_id) c;
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
revoke all on function public.create_project_with_objects(text, text, text, uuid, text, jsonb, uuid) from public, anon, service_role;
grant execute on function public.create_project_with_objects(text, text, text, uuid, text, jsonb, uuid) to authenticated;

-- At most 500 members are listed: a technical limit (no source gives one; a remodel company has far fewer
-- active members; vault/build/assumptions.md EZD-129).
create function public.list_foreman_candidates()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
begin
  perform private.require_api_gate();
  if v_tenant is null or v_membership is null or not exists (
    select 1 from public.membership m
    join public.user_permission up on up.membership_id = m.id and up.tenant_id = m.tenant_id
    where m.id = v_membership and m.tenant_id = v_tenant and m.status = 'active'
      and up.permission_key = 'create_projects' and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return jsonb_build_object('members', coalesce((
    select jsonb_agg(jsonb_build_object('membershipId', c.id, 'name', c.name, 'email', c.email,
        'scope', c.scope) order by c.k, c.email, c.id)
    from (
      select m.id, nullif(btrim(u.name), '') as name, u.email, m.scope,
        lower(coalesce(nullif(btrim(u.name), ''), u.email)) as k
      from public.membership m
      join public.app_user u on u.id = m.user_id
      where m.tenant_id = v_tenant and m.status = 'active'
      order by lower(coalesce(nullif(btrim(u.name), ''), u.email)), u.email, m.id
      limit 500
    ) c), '[]'::jsonb));
end
$$;

revoke all on function public.list_foreman_candidates() from public, anon, service_role;
grant execute on function public.list_foreman_candidates() to authenticated;
