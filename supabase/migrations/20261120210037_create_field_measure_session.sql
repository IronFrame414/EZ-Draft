-- EZD-1415 (03-data-model.md "tables added in Rounds 24 and 25: field_measure_session"; S17b Field measure; S17b
-- Permissions "Send field measurement to create and send; View projects to view"): the rooms measured on the phone
-- for one project, one row per project. `rooms` holds the Building and each room: name, shape, free corners,
-- closed, one length per wall and the ceiling height (app/src/field-measure/rooms.ts checks the shape of each
-- room before it is saved). The data model names the table but no columns (vault/build/assumptions.md EZD-1415).
-- Nothing here is model data: sent rooms reach the plan only through Import review (EZD-1418).
--
-- Members read the row of projects in their scope (EZD-006 template). Rows are written only by
-- save_field_measure_session below (no insert, update or delete policy, so RLS refuses member writes). No money
-- fields (03b rule 2).
create table public.field_measure_session (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  rooms jsonb not null default '[]'::jsonb
    check (jsonb_typeof(rooms) = 'array' and octet_length(rooms::text) <= 262144),
  created_by uuid references public.app_user (id) on delete set null,
  updated_by uuid references public.app_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade,
  unique (project_id)
);

create index field_measure_session_tenant_id_idx on public.field_measure_session (tenant_id);

alter table public.field_measure_session enable row level security;

create trigger field_measure_session_set_updated_at
  before update on public.field_measure_session
  for each row execute function public.set_updated_at();

-- EZD-006 policy template: tenant from the claim, then project scope.
create policy field_measure_session_select on public.field_measure_session
  for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy field_measure_session_api_gate on public.field_measure_session as restrictive for all
  to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write.
grant select, insert, update, delete on public.field_measure_session to authenticated;
grant select, insert, update, delete on public.field_measure_session to service_role;

comment on table public.field_measure_session is
  'Data model entity: field_measure_session (S17b Field measure; EZD-1415)';

-- save_field_measure_session: the phone's rooms for one project, written whole. The first failing step decides.
-- Gate; no tenant, user or membership claim 42501; no granted Send field measurement 42501 (S17b Permissions);
-- project missing or out of scope P0002; rooms not an array of 1 to 40 objects, or over 256 KB, 22023 (the room
-- fields are checked by the caller's schema). Then the project's row is inserted or replaced.
create function public.save_field_measure_session(p_project uuid, p_rooms jsonb)
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
      and up.permission_key = 'send_field_measurement'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if p_rooms is null or jsonb_typeof(p_rooms) <> 'array'
    or jsonb_array_length(p_rooms) < 1 or jsonb_array_length(p_rooms) > 40
    or octet_length(p_rooms::text) > 262144
    or exists (select 1 from jsonb_array_elements(p_rooms) as e where jsonb_typeof(e) <> 'object')
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  insert into public.field_measure_session as s (tenant_id, project_id, rooms, created_by, updated_by)
  values (v_tenant, p_project, p_rooms, v_user, v_user)
  on conflict (project_id) do update set rooms = excluded.rooms, updated_by = excluded.updated_by;

  return jsonb_build_object('status', 'saved');
end
$$;

revoke all on function public.save_field_measure_session(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_field_measure_session(uuid, jsonb) to authenticated;
