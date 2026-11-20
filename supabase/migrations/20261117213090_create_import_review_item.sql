-- EZD-309 (S02 Controls Fix selected, Delete, Accept, Mode; Q-0215 "Detected items are saved until Finish or
-- Cancel, even if the browser closes"; phase-03 EZD-309 "each review action is saved as a per-item change,
-- batched every 2 seconds"; AC-EZD-309-2 "reloading mid-review restores accepted and fixed items"): what the
-- reviewer did with each detected item of an import. One row per item the reviewer touched: its decision
-- (accepted, or rejected = Delete / Reject) and its fix (the item's corrected geometry, merged over the detected
-- item when the review is read and when Finish import writes it, EZD-313). An item with no row is unresolved.
-- Nothing here is model data until Finish import (03c "Nothing becomes model data until accepted").
--
-- Members read the rows of projects in their scope (EZD-006 template). Rows are written only by
-- save_import_review below (no insert, update or delete policy, so RLS refuses member writes). No money
-- fields (03b rule 2).
create table public.import_review_item (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  job_id uuid not null references public.job (id) on delete cascade,
  item_id text not null check (item_id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  decision text check (decision in ('accepted', 'rejected')),
  fix jsonb check (fix is null or (jsonb_typeof(fix) = 'object' and octet_length(fix::text) <= 8192)),
  updated_by uuid references public.app_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade,
  check (decision is not null or fix is not null),
  unique (job_id, item_id)
);

create index import_review_item_tenant_id_idx on public.import_review_item (tenant_id);
create index import_review_item_project_id_idx on public.import_review_item (project_id);

alter table public.import_review_item enable row level security;

create trigger import_review_item_set_updated_at
  before update on public.import_review_item
  for each row execute function public.set_updated_at();

-- EZD-006 policy template: tenant from the claim, then project scope.
create policy import_review_item_select on public.import_review_item
  for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy import_review_item_api_gate on public.import_review_item as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write.
grant select, insert, update, delete on public.import_review_item to authenticated;
grant select, insert, update, delete on public.import_review_item to service_role;

comment on table public.import_review_item is 'Data model entity: import_review_item (S02 review actions; EZD-309)';

-- save_import_review: one batch of review changes (the page sends one every 2 seconds while there are changes).
-- The first failing step decides. Gate; no tenant, user or membership claim 42501; no granted Edit model 42501
-- (S02 Permissions "Edit model: required for every accept, fix, delete"); project missing or out of scope P0002;
-- a mode or change list outside the rules 22023; the job not an import of this project P0002; an item id not
-- among the import's detected items 22023. Then: a review already finished or cancelled answers closed, and a
-- project whose edit lock another user holds answers locked (S02 "Also requires holding the edit lock"); neither
-- writes. Otherwise each change sets the item's row (decision and fix as sent; both null removes the row, so an
-- undo back to unresolved is saved too) and a mode sets import_session.mode for the import's sessions.
create function public.save_import_review(p_project uuid, p_job uuid, p_mode text, p_changes jsonb)
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
  v_seen text[] := '{}';
  v_id text;
  v_holder uuid;
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

  if (p_mode is not null and p_mode not in ('one_by_one', 'accept_fix', 'by_room'))
    or p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 1000
    or (p_mode is null and jsonb_array_length(p_changes) = 0)
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  for v_item in select e from jsonb_array_elements(p_changes) as e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_item) as k;
    if v_keys is distinct from array['decision', 'fix', 'item_id']
      or coalesce(jsonb_typeof(v_item -> 'item_id'), '') <> 'string'
      or (v_item ->> 'item_id') !~ '^[A-Za-z0-9_.:-]{1,64}$'
      or jsonb_typeof(v_item -> 'decision') not in ('null', 'string')
      or (jsonb_typeof(v_item -> 'decision') = 'string' and (v_item ->> 'decision') not in ('accepted', 'rejected'))
      or jsonb_typeof(v_item -> 'fix') not in ('null', 'object')
      or (jsonb_typeof(v_item -> 'fix') = 'object' and octet_length((v_item -> 'fix')::text) > 8192)
    then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_id := v_item ->> 'item_id';
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

  if exists (
    select 1 from unnest(v_seen) as s(id)
    where not exists (
      select 1 from public.import_session st, jsonb_array_elements(st.items) as it
      where st.job_id = p_job and st.project_id = p_project and jsonb_typeof(it) = 'object' and it ->> 'id' = s.id
    )
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.import_session st
    where st.job_id = p_job and st.project_id = p_project and st.status in ('finished', 'cancelled')
  ) then
    return jsonb_build_object('status', 'closed');
  end if;

  select l.holder_app_user_id into v_holder from public.edit_lock l where l.project_id = p_project;
  if v_holder is not null and v_holder <> v_user then
    return jsonb_build_object('status', 'locked');
  end if;

  for v_item in select e from jsonb_array_elements(p_changes) as e loop
    if jsonb_typeof(v_item -> 'decision') = 'null' and jsonb_typeof(v_item -> 'fix') = 'null' then
      delete from public.import_review_item r where r.job_id = p_job and r.item_id = v_item ->> 'item_id';
    else
      insert into public.import_review_item as r
        (tenant_id, project_id, job_id, item_id, decision, fix, updated_by)
      values (
        v_tenant, p_project, p_job, v_item ->> 'item_id',
        v_item ->> 'decision',
        case when jsonb_typeof(v_item -> 'fix') = 'object' then v_item -> 'fix' end,
        v_user)
      on conflict (job_id, item_id) do update
        set decision = excluded.decision, fix = excluded.fix, updated_by = excluded.updated_by;
    end if;
  end loop;

  if p_mode is not null then
    update public.import_session st set mode = p_mode
    where st.job_id = p_job and st.project_id = p_project and st.mode <> p_mode;
  end if;

  return jsonb_build_object('status', 'saved');
end
$$;

revoke all on function public.save_import_review(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_import_review(uuid, uuid, text, jsonb) to authenticated;
