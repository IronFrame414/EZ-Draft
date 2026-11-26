-- EZD-916 (S12 Order report import "Reads codes, sizes, finishes and order line numbers; lines become the reference
-- for tags"; Data shown "Order report lines: line no, code, width, face, finish"; Decisions 2 "Lines are read by text
-- extraction plus AI and shown in Import review for the user to confirm"; phase-09 EZD-916 "Confirmed lines are
-- stored in an order_line table (source_file, line no, code, width, face, finish)"; vault/build/assumptions.md
-- EZD-916).
--
-- order_line: the confirmed lines of a supplier's order report, one row per line number of a source file. Width in
-- inches; face, finish and width are null when the report gives none. No price column (S12 Data shown names none).
-- Members read the rows of projects in their scope (EZD-006 template); order reports are cost files, so the app
-- reads them only after a live See company costs check (Q-0323 (1): table policies check tenant and project scope
-- only). Rows are written only by finish_import below (no insert, update or delete policy, so RLS refuses member
-- writes).
--
-- finish_import is replaced with the same arguments (EZD-313 unchanged otherwise): when the import read an order
-- report it also needs See company costs, writes the accepted order_line items of each report in place of that
-- report's earlier lines, and an import of order reports alone (no objects) makes no model version (model_version_id
-- null). It answers the number of lines written as order_lines.
create table public.order_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  source_file_id uuid not null references public.source_file (id) on delete cascade,
  line_no integer not null check (line_no between 1 and 100000),
  code text not null check (char_length(code) between 1 and 64),
  width numeric check (width > 0 and width < 1000),
  face text check (char_length(face) <= 200),
  finish text check (char_length(finish) <= 200),
  created_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade,
  unique (source_file_id, line_no)
);

create index order_line_tenant_id_idx on public.order_line (tenant_id);
create index order_line_project_id_idx on public.order_line (project_id);

alter table public.order_line enable row level security;

-- EZD-006 policy template: tenant from the claim, then project scope.
create policy order_line_select on public.order_line
  for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy order_line_api_gate on public.order_line as restrictive for all
  to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

grant select, insert, update, delete on public.order_line to authenticated;
grant select, insert, update, delete on public.order_line to service_role;

comment on table public.order_line is
  'Confirmed lines of a supplier order report (S12 Order report import; EZD-916)';

create or replace function public.finish_import(p_project uuid, p_job uuid, p_objects jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_membership uuid;
  v_item jsonb;
  v_keys text[];
  v_id uuid;
  v_seen uuid[] := '{}';
  v_holder uuid;
  v_version uuid;
  v_objects jsonb;
  v_report boolean;
  v_report_only boolean;
  v_lines integer := 0;
begin
  perform private.require_api_gate();

  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'edit_model'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if p_objects is null or jsonb_typeof(p_objects) <> 'array' or jsonb_array_length(p_objects) > 5000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  for v_item in select e from jsonb_array_elements(p_objects) as e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_item) as k;
    if v_keys is distinct from array['data', 'id', 'schema_version', 'type']
      or coalesce(jsonb_typeof(v_item -> 'id'), '') <> 'string'
      or coalesce((v_item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
      or coalesce(v_item ->> 'type', '') not in ('wall', 'opening', 'room')
      or coalesce(jsonb_typeof(v_item -> 'schema_version'), '') <> 'number'
      or coalesce(jsonb_typeof(v_item -> 'data'), '') <> 'object'
      or octet_length((v_item -> 'data')::text) > 16384
    then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    if (v_item ->> 'schema_version')::numeric <> trunc((v_item ->> 'schema_version')::numeric)
      or (v_item ->> 'schema_version')::numeric < 1
      or (v_item ->> 'schema_version')::numeric > 2147483647
    then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_id := (v_item ->> 'id')::uuid;
    if v_id = any (v_seen) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_seen := v_seen || v_id;
  end loop;

  if not exists (
    select 1 from public.job j
    where j.id = p_job and j.project_id = p_project and j.tenant_id = v_tenant and j.kind = 'import'
  ) then
    raise exception 'import_not_found' using errcode = 'P0002';
  end if;

  -- EZD-916: the import's order report sessions (a session read from a source file of kind order_report). Order
  -- reports are cost files (Q-0269 (b), Q-0323), so finishing one also needs a granted See company costs.
  select
    coalesce(bool_or(sf.kind = 'order_report'), false),
    coalesce(bool_and(sf.kind = 'order_report'), false)
  into v_report, v_report_only
  from public.import_session st
  left join public.source_file sf on sf.id = st.source_file_id and sf.tenant_id = st.tenant_id
  where st.job_id = p_job and st.project_id = p_project and st.tenant_id = v_tenant;
  if v_report and not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'see_company_costs'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  -- One save at a time per project (save_objects step 6).
  perform 1 from public.edit_lock l where l.project_id = p_project for update;
  if not found then
    insert into public.edit_lock (project_id, tenant_id) values (p_project, v_tenant)
      on conflict (project_id) do nothing;
    perform 1 from public.edit_lock l where l.project_id = p_project for update;
  end if;

  if exists (
    select 1 from public.import_session st
    where st.job_id = p_job and st.project_id = p_project and st.status in ('finished', 'cancelled')
  ) then
    return jsonb_build_object('status', 'closed');
  end if;

  if not exists (
    select 1 from public.import_session st
    where st.job_id = p_job and st.project_id = p_project and st.status = 'ready'
  ) or exists (
    select 1 from public.import_session st
    where st.job_id = p_job and st.project_id = p_project and st.status <> 'ready'
  ) then
    return jsonb_build_object('status', 'not_ready');
  end if;

  select l.holder_app_user_id into v_holder from public.edit_lock l where l.project_id = p_project;
  if v_holder is not null and v_holder <> v_user then
    return jsonb_build_object('status', 'locked');
  end if;

  if exists (
    select 1 from public.import_session st, jsonb_array_elements(st.items) as it
    where st.job_id = p_job and st.project_id = p_project and jsonb_typeof(it) = 'object'
      and not exists (
        select 1 from public.import_review_item r
        where r.job_id = p_job and r.item_id = it ->> 'id' and r.decision is not null
      )
  ) then
    return jsonb_build_object('status', 'unresolved');
  end if;

  if exists (
    select 1 from public.model_object o where o.project_id = p_project and o.object_id = any (v_seen)
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  insert into public.model_object
    (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, updated_by, deleted)
  select p_project, (e ->> 'id')::uuid, v_tenant, e ->> 'type', e -> 'data',
    (e ->> 'schema_version')::numeric::integer, 1, v_user, false
  from jsonb_array_elements(p_objects) as e;

  -- EZD-916: the accepted lines of each order report replace that report's earlier lines (a second read of the same
  -- file replaces them). Lines are taken from the saved import, never from the caller. The first item of a line
  -- number wins.
  if v_report then
    delete from public.order_line ol
    using public.import_session st, public.source_file sf
    where st.job_id = p_job and st.project_id = p_project and st.tenant_id = v_tenant
      and sf.id = st.source_file_id and sf.tenant_id = v_tenant and sf.kind = 'order_report'
      and ol.source_file_id = sf.id and ol.tenant_id = v_tenant;

    insert into public.order_line (tenant_id, project_id, source_file_id, line_no, code, width, face, finish)
    select v_tenant, p_project, sf.id, (it ->> 'lineNo')::integer, it ->> 'code',
      case when jsonb_typeof(it -> 'width') = 'number' then (it ->> 'width')::numeric end,
      nullif(it ->> 'face', ''), nullif(it ->> 'finish', '')
    from public.import_session st
    join public.source_file sf
      on sf.id = st.source_file_id and sf.tenant_id = v_tenant and sf.kind = 'order_report'
    cross join lateral jsonb_array_elements(st.items) with ordinality as e(it, n)
    where st.job_id = p_job and st.project_id = p_project and st.tenant_id = v_tenant
      and jsonb_typeof(it) = 'object' and it ->> 'type' = 'order_line'
      and jsonb_typeof(it -> 'lineNo') = 'number' and jsonb_typeof(it -> 'code') = 'string'
      and exists (
        select 1 from public.import_review_item r
        where r.job_id = p_job and r.item_id = it ->> 'id' and r.decision = 'accepted'
      )
    order by sf.id, e.n
    on conflict (source_file_id, line_no) do nothing;
    get diagnostics v_lines = row_count;
  end if;

  update public.import_session st set status = 'finished'
  where st.job_id = p_job and st.project_id = p_project;

  -- EZD-916: an import of order reports alone writes no model data, so it makes no model version.
  if not (v_report_only and jsonb_array_length(p_objects) = 0) then
    v_version := private.make_checkpoint(p_project, v_user);
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('object_id', o.object_id, 'number', private.object_number(o.type, o.data))
      order by o.object_id),
    '[]'::jsonb)
  into v_objects
  from public.model_object o
  where o.project_id = p_project and o.object_id = any (v_seen);

  return jsonb_build_object(
    'status', 'finished', 'tenant_id', v_tenant, 'model_version_id', v_version, 'objects', v_objects,
    'order_lines', v_lines);
end
$$;

revoke all on function public.finish_import(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.finish_import(uuid, uuid, jsonb) to authenticated;
