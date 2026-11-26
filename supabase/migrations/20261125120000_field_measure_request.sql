-- EZD-1422 (S01 Input source "Field measure creates the project and sends the Foreman a link to 17b; the project
-- opens on 02 Import review when the rooms arrive"; Q-0204 "The project shows 'Waiting for field measurements', who
-- it was sent to and a Resend button; it never expires. The sender or anyone who can edit the project can cancel
-- it."; AC-EZD-1422-1).
--
-- field_measure_request: the New project wizard's request that the picked Foreman measure the project's rooms on
-- the phone (S17b), one row per project. The Foreman's name is kept as it was when sent (the card shows it to
-- members who may not read other members). It never expires; it is waiting until it is cancelled or the first
-- sent rooms of the project arrive as an import (EZD-1418).
--
-- Members read the row of projects in their scope (EZD-006 template). Rows are written only by the definer
-- functions below (no insert, update or delete policy, so RLS refuses member writes). No money fields.
create table public.field_measure_request (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  membership_id uuid references public.membership (id) on delete set null,
  sent_to_name text not null check (char_length(sent_to_name) between 1 and 1000),
  requested_by uuid references public.app_user (id) on delete set null,
  sent_count integer not null default 1 check (sent_count between 1 and 1000000),
  last_sent_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade,
  unique (project_id)
);

create index field_measure_request_tenant_id_idx on public.field_measure_request (tenant_id);
create index field_measure_request_membership_id_idx on public.field_measure_request (membership_id);

alter table public.field_measure_request enable row level security;

create trigger field_measure_request_set_updated_at
  before update on public.field_measure_request
  for each row execute function public.set_updated_at();

-- EZD-006 policy template: tenant from the claim, then project scope.
create policy field_measure_request_select on public.field_measure_request
  for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy field_measure_request_api_gate on public.field_measure_request as restrictive for all
  to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

grant select, insert, update, delete on public.field_measure_request to authenticated;
grant select, insert, update, delete on public.field_measure_request to service_role;

comment on table public.field_measure_request is
  'Field measure request from the New project wizard (S01 Input source; Q-0204; EZD-1422)';

-- Whether the project's request is waiting: not cancelled, and no sent rooms of the project have arrived as an
-- import yet (EZD-1418 makes one import_session of source_kind field_measure per send).
create function private.field_measure_request_waiting(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.field_measure_request r
    where r.project_id = p_project and r.cancelled_at is null
      and not exists (select 1 from public.field_measure_session s
        where s.project_id = p_project and s.sent_at is not null)
      and not exists (select 1 from public.import_session st
        where st.project_id = p_project and st.source_kind = 'field_measure'));
$$;
revoke all on function private.field_measure_request_waiting(uuid) from public;

-- What the server needs to email the link: the Foreman's address and name, the project, the company and the
-- caller's own address (the sender's copy, Q-0701).
create function private.field_measure_request_payload(p_request uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_row public.field_measure_request;
  v_email text;
  v_project text;
  v_tenant_row public.tenant;
  v_sender text;
begin
  select * into v_row from public.field_measure_request r where r.id = p_request;
  select u.email into v_email from public.membership m join public.app_user u on u.id = m.user_id
    where m.id = v_row.membership_id and m.tenant_id = v_row.tenant_id and m.status = 'active';
  if v_email is null then raise exception 'foreman_unavailable' using errcode = 'P0001'; end if;
  select p.name into v_project from public.project p where p.id = v_row.project_id;
  select * into v_tenant_row from public.tenant t where t.id = v_row.tenant_id;
  select u.email into v_sender from public.app_user u where u.id = private.app_user_id();
  return jsonb_build_object(
    'request_id', v_row.id,
    'sent_count', v_row.sent_count,
    'project_name', v_project,
    'to', jsonb_build_object('name', v_row.sent_to_name, 'email', v_email),
    'company', jsonb_build_object(
      'name', v_tenant_row.name,
      'reply_to', nullif(btrim(v_tenant_row.contact ->> 'email'), '')),
    'sender_email', v_sender);
end $$;
revoke all on function private.field_measure_request_payload(uuid) from public;

-- request_field_measure: the wizard's request, right after the project is created. The first failing step decides.
-- Gate; no claim or no Create projects 42501; project missing or out of scope P0002; a Foreman who is not an active
-- member of the company 22023 foreman_unavailable; the project already has a request P0001 already_requested.
create function public.request_field_measure(p_project uuid, p_membership uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid; v_user uuid; v_membership uuid; v_name text; v_id uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_permission up
      where up.membership_id = v_membership and up.tenant_id = v_tenant
        and up.permission_key = 'create_projects' and up.granted) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  select coalesce(nullif(btrim(u.name), ''), u.email) into v_name
    from public.membership m join public.app_user u on u.id = m.user_id
    where m.id = p_membership and m.tenant_id = v_tenant and m.status = 'active';
  if v_name is null then raise exception 'foreman_unavailable' using errcode = '22023'; end if;
  if exists (select 1 from public.field_measure_request r where r.project_id = p_project) then
    raise exception 'already_requested' using errcode = 'P0001';
  end if;
  insert into public.field_measure_request (tenant_id, project_id, membership_id, sent_to_name, requested_by)
  values (v_tenant, p_project, p_membership, left(v_name, 1000), v_user)
  returning id into v_id;
  return private.field_measure_request_payload(v_id);
end $$;
revoke all on function public.request_field_measure(uuid, uuid) from public, anon, service_role;
grant execute on function public.request_field_measure(uuid, uuid) to authenticated;

-- The waiting request of a project the caller may resend or cancel (Q-0204: the sender, or anyone who can edit the
-- project, Edit model). Gate; no claim 42501; project missing or out of scope P0002; no waiting request P0001
-- not_waiting; neither the sender nor Edit model 42501.
create function private.field_measure_request_for_change(p_project uuid)
returns public.field_measure_request language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid; v_user uuid; v_membership uuid; v_row public.field_measure_request;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  select * into v_row from public.field_measure_request r
    where r.project_id = p_project and r.tenant_id = v_tenant for update;
  if not found or not private.field_measure_request_waiting(p_project) then
    raise exception 'not_waiting' using errcode = 'P0001';
  end if;
  if v_row.requested_by is distinct from v_user and not exists (select 1 from public.user_permission up
      where up.membership_id = v_membership and up.tenant_id = v_tenant
        and up.permission_key = 'edit_model' and up.granted) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return v_row;
end $$;
revoke all on function private.field_measure_request_for_change(uuid) from public;

-- resend_field_measure_request: the card's Resend. Refusals as above; a Foreman no longer active P0001
-- foreman_unavailable (nothing changes).
create function public.resend_field_measure_request(p_project uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row public.field_measure_request;
  v_payload jsonb;
begin
  perform private.require_api_gate();
  v_row := private.field_measure_request_for_change(p_project);
  update public.field_measure_request r
    set sent_count = r.sent_count + 1, last_sent_at = now()
    where r.id = v_row.id;
  v_payload := private.field_measure_request_payload(v_row.id);
  return v_payload;
end $$;
revoke all on function public.resend_field_measure_request(uuid) from public, anon, service_role;
grant execute on function public.resend_field_measure_request(uuid) to authenticated;

-- cancel_field_measure_request: the card's Cancel. Refusals as above. The Foreman's link still opens Field measure
-- (it is the project's screen, S17b); the project no longer shows as waiting.
create function public.cancel_field_measure_request(p_project uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row public.field_measure_request;
begin
  perform private.require_api_gate();
  v_row := private.field_measure_request_for_change(p_project);
  update public.field_measure_request r
    set cancelled_at = now(), cancelled_by = private.app_user_id()
    where r.id = v_row.id;
  return jsonb_build_object('status', 'cancelled');
end $$;
revoke all on function public.cancel_field_measure_request(uuid) from public, anon, service_role;
grant execute on function public.cancel_field_measure_request(uuid) to authenticated;

-- list_projects is 20261118213141's, with one more item field, fieldMeasureWait: while the project's request is
-- waiting (as private.field_measure_request_waiting, read here as the caller through RLS), { sentTo, mine } where
-- mine is the caller sent it; otherwise the field is absent (the card fields are unchanged). Same grants.
create or replace function public.list_projects(p_sort text, p_status text default null, p_after jsonb default null, p_search text default '')
returns jsonb language sql stable security invoker set search_path = '' as $$
  with term as (select replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') as t),
  base as (
    select p.id, p.name, p.address, p.status, p.open_items_count, p.updated_at, p.thumbnail_path,
      (p.archived_at is not null) as archived,
      (select max(v.version_no) from public.model_version v where v.project_id = p.id and v.is_sent) as version_no,
      (exists (select 1 from public.job j
          where j.project_id = p.id and j.kind = 'import' and j.status in ('queued', 'running'))
        or exists (select 1 from public.import_session st
          join public.job j on j.id = st.job_id and j.project_id = p.id and j.kind = 'import'
          where st.project_id = p.id and st.status in ('detecting', 'ready'))) as importing,
      (select jsonb_build_object('sentTo', r.sent_to_name, 'mine', r.requested_by = (select private.app_user_id()))
        from public.field_measure_request r
        where r.project_id = p.id and r.cancelled_at is null
          and not exists (select 1 from public.field_measure_session s
            where s.project_id = p.id and s.sent_at is not null)
          and not exists (select 1 from public.import_session st
            where st.project_id = p.id and st.source_kind = 'field_measure')) as field_measure_wait,
      c.name as client_name,
      (c.name is null) as client_missing,
      left(lower(coalesce(c.name, '')), 500) as client_key,
      left(lower(p.name), 500) as name_key,
      array_position(array['draft', 'client_review', 'permit_submitted', 'approved', 'in_build', 'complete'], p.status) as status_rank
    from public.project p
    left join public.customer c on c.id = p.customer_id
    cross join term
    where not p.is_benchmark
      and p_sort in ('edited', 'name', 'client', 'status', 'open_items')
      and (case when p_status = 'archived' then p.archived_at is not null
        when p_status is null then p.archived_at is null and p.status <> 'complete'
        else p.archived_at is null and p.status = p_status end)
      and (term.t = '' or p.name ilike '%' || term.t || '%' or p.address ilike '%' || term.t || '%' or c.name ilike '%' || term.t || '%')
  ),
  after_cursor as (
    select b.* from base b
    where p_after is null or case p_sort
      when 'edited' then (b.updated_at, b.id) < ((p_after ->> 'u')::timestamptz, (p_after ->> 'id')::uuid)
      when 'name' then (b.name_key, b.id) > (p_after ->> 'n', (p_after ->> 'id')::uuid)
      when 'client' then (b.client_missing, b.client_key, b.id) > ((p_after ->> 'm')::boolean, p_after ->> 'c', (p_after ->> 'id')::uuid)
      when 'status' then b.status_rank > (p_after ->> 'r')::integer
        or (b.status_rank = (p_after ->> 'r')::integer and (b.updated_at, b.id) < ((p_after ->> 'u')::timestamptz, (p_after ->> 'id')::uuid))
      when 'open_items' then (b.open_items_count, b.updated_at, b.id) < ((p_after ->> 'o')::integer, (p_after ->> 'u')::timestamptz, (p_after ->> 'id')::uuid)
    end
  ),
  ranked as (
    select a.*, row_number() over (order by
      case when p_sort = 'name' then a.name_key end asc,
      case when p_sort = 'client' then a.client_missing end asc,
      case when p_sort = 'client' then a.client_key end asc,
      case when p_sort = 'status' then a.status_rank end asc,
      case when p_sort = 'open_items' then a.open_items_count end desc,
      case when p_sort in ('edited', 'status', 'open_items') then a.updated_at end desc,
      case when p_sort in ('name', 'client') then a.id end asc,
      case when p_sort in ('edited', 'status', 'open_items') then a.id end desc) as rn
    from after_cursor a
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'clientName', r.client_name, 'address', r.address,
        'status', r.status, 'openItems', r.open_items_count, 'hasThumbnail', r.thumbnail_path is not null,
        'versionNo', r.version_no, 'archived', r.archived, 'importing', r.importing)
        || case when r.field_measure_wait is null then '{}'::jsonb
          else jsonb_build_object('fieldMeasureWait', r.field_measure_wait) end
      order by r.rn) from ranked r where r.rn <= 48), '[]'::jsonb),
    'next', (select jsonb_build_object('id', r.id, 'u', r.updated_at, 'n', r.name_key,
        'm', r.client_missing, 'c', r.client_key, 'r', r.status_rank, 'o', r.open_items_count)
      from ranked r where r.rn = 48 and exists (select 1 from ranked x where x.rn = 49)));
$$;
revoke all on function public.list_projects(text, text, jsonb, text) from public, anon, service_role;
grant execute on function public.list_projects(text, text, jsonb, text) to authenticated;
