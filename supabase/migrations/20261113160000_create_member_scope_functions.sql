-- EZD-129 (S15 Decision 13; 10 Company settings "Users + permissions ... project scope"; Q-0695 decisions 10
-- rows 59, 63, 64; decisions 03 row 33; 09n Project scope rows 1-4; AC-EZD-129-2, -4): a member's Project
-- access. Each function runs behind the API request gate under the caller's session and needs settings_users
-- (private.users_writer_tenant, 42501 otherwise; Q-0695 row 59). The member may be invited, active or
-- deactivated, since the Invite dialog saves the list of a new invite.
--
-- save_member_scope takes the full new list (not a change list). Removed projects are deleted rows and a
-- scope change is an update, so the existing triggers end an active member's sessions (20261113120000); added
-- projects are inserts and end none, so they apply on the next request (09n Project scope row 4). Listed
-- with zero projects is allowed (Q-0695 row 63). All clears the list: membership_project holds the listed
-- projects of a scoped membership only (03c membership). A new project on the list must be the company's,
-- not archived and not the benchmark (22023 project_unavailable); a project already on the list may stay.
-- One user.scope_changed event_log row is written in the same transaction when anything changed.

create function public.member_scope(p_membership_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_scope text;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  select m.scope into v_scope
  from public.membership m
  where m.id = p_membership_id and m.tenant_id = v_tenant;
  if v_scope is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'membershipId', p_membership_id,
    'scope', v_scope,
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by lower(p.name), p.id)
      from public.membership_project mp
      join public.project p on p.id = mp.project_id and p.tenant_id = mp.tenant_id
      where mp.membership_id = p_membership_id and mp.tenant_id = v_tenant), '[]'::jsonb));
end
$$;

revoke all on function public.member_scope(uuid) from public, anon, service_role;
grant execute on function public.member_scope(uuid) to authenticated;

-- The bound on the list (1,000 projects) is a technical limit: no source gives one, and a company lists far
-- fewer live projects (vault/build/assumptions.md EZD-129).
create function public.save_member_scope(
  p_membership_id uuid,
  p_scope text,
  p_project_ids uuid[],
  p_ip inet default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_actor uuid;
  v_user uuid;
  v_old_scope text;
  v_old uuid[];
  v_added uuid[];
  v_removed uuid[];
  v_changed boolean;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  v_actor := private.event_log_actor();
  if p_membership_id is null
    or p_scope is null or p_scope not in ('all', 'listed')
    or p_project_ids is null or cardinality(p_project_ids) > 1000
    or array_position(p_project_ids, null) is not null
    or cardinality(array(select distinct x from unnest(p_project_ids) as x)) <> cardinality(p_project_ids)
    or (p_scope = 'all' and cardinality(p_project_ids) > 0)
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  -- Two saves of one member run one after the other.
  select m.user_id, m.scope into v_user, v_old_scope
  from public.membership m
  where m.id = p_membership_id and m.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(mp.project_id order by mp.project_id), '{}'::uuid[]) into v_old
  from public.membership_project mp
  where mp.membership_id = p_membership_id and mp.tenant_id = v_tenant;

  select coalesce(array_agg(x order by x), '{}'::uuid[]) into v_added
  from unnest(p_project_ids) as x where not (x = any (v_old));
  select coalesce(array_agg(x order by x), '{}'::uuid[]) into v_removed
  from unnest(v_old) as x where not (x = any (p_project_ids));

  if exists (
    select 1 from unnest(v_added) as x
    where not exists (
      select 1 from public.project p
      where p.id = x and p.tenant_id = v_tenant and p.archived_at is null and not p.is_benchmark)
  ) then
    raise exception 'project_unavailable' using errcode = '22023';
  end if;

  if v_old_scope is distinct from p_scope then
    update public.membership m set scope = p_scope where m.id = p_membership_id;
  end if;
  if cardinality(v_removed) > 0 then
    delete from public.membership_project mp
    where mp.membership_id = p_membership_id and mp.project_id = any (v_removed);
  end if;
  if cardinality(v_added) > 0 then
    insert into public.membership_project (tenant_id, membership_id, project_id)
    select v_tenant, p_membership_id, x from unnest(v_added) as x;
  end if;

  v_changed := v_old_scope is distinct from p_scope
    or cardinality(v_added) > 0 or cardinality(v_removed) > 0;
  if v_changed then
    perform private.write_event_log_as('user.scope_changed', v_tenant, v_actor, 'membership',
      p_membership_id, jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user,
        'oldScope', v_old_scope, 'scope', p_scope, 'added', to_jsonb(v_added),
        'removed', to_jsonb(v_removed)), p_ip);
  end if;

  return jsonb_build_object(
    'membershipId', p_membership_id,
    'appUserId', v_user,
    'tenantId', v_tenant,
    'changed', v_changed,
    'oldScope', v_old_scope,
    'scope', p_scope,
    'added', to_jsonb(v_added),
    'removed', to_jsonb(v_removed),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by lower(p.name), p.id)
      from public.membership_project mp
      join public.project p on p.id = mp.project_id and p.tenant_id = mp.tenant_id
      where mp.membership_id = p_membership_id and mp.tenant_id = v_tenant), '[]'::jsonb));
end
$$;

revoke all on function public.save_member_scope(uuid, text, uuid[], inet) from public, anon, service_role;
grant execute on function public.save_member_scope(uuid, text, uuid[], inet) to authenticated;

-- The project choices for the picker: the company's projects that are not archived and not the benchmark
-- (the list_projects filter, 20261106140001), matched on name or address, by name, the first 50 and a
-- `more` flag. Every project of the company is listed, not only the caller's own: a settings_users holder may
-- set any member's scope, their own included (Q-0695 row 59), so hiding projects protects nothing.
create function public.list_scope_projects(p_search text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_term text;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  if p_search is not null and char_length(p_search) > 200 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_term := replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_');
  return (
    with matched as (
      select p.id, p.name, p.address
      from public.project p
      where p.tenant_id = v_tenant and p.archived_at is null and not p.is_benchmark
        and (v_term = '' or p.name ilike '%' || v_term || '%' or p.address ilike '%' || v_term || '%')
      order by lower(p.name), p.id
      limit 51
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'address', f.address)
          order by lower(f.name), f.id)
        from (select * from matched order by lower(name), id limit 50) f), '[]'::jsonb),
      'more', exists (select 1 from (select 1 from matched offset 50) z)));
end
$$;

revoke all on function public.list_scope_projects(text) from public, anon, service_role;
grant execute on function public.list_scope_projects(text) to authenticated;
