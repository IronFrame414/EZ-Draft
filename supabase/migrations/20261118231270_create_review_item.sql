-- EZD-127 (04 Header card "N to review" pill; phase-01 EZD-127 "list fed by typed sources that later features
-- register; hidden at 0; same count on the project card, kept in project.open_items_count and updated when a source
-- changes, never counted across tables on page load"; AC-EZD-127-1): one open thing in a project that needs someone
-- to look at it. Each row names its source (the seven kinds of the 04 Header card row) and source_ref, the id of the
-- thing in the source's own table. A row is open until resolved_at is set; one open row per source thing.
--
-- project.open_items_count is the number of open rows of the project. The trigger below keeps it when a row is
-- added, resolved, reopened or deleted, so the pill and the project card read one column and nothing counts rows on
-- page load. A count change alone leaves project.updated_at as it was (the card's "Edited" time is for edits).
--
-- Members read the rows of projects in their scope (EZD-006 template). Rows are written only by the source
-- features through private.add_review_item and private.resolve_review_item (server-side definer code; no insert,
-- update or delete policy, so RLS refuses member writes). No money fields (03b rule 2).
create table public.review_item (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  source text not null check (source in (
    'render_approval',
    'translation',
    'field_conflict',
    'field_measure',
    'client_comment',
    'code_warning',
    'orphan_flag'
  )),
  source_ref text not null check (source_ref ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);

create index review_item_tenant_id_idx on public.review_item (tenant_id);
create index review_item_project_id_idx on public.review_item (project_id);
create unique index review_item_open_once on public.review_item (project_id, source, source_ref)
  where resolved_at is null;

alter table public.review_item enable row level security;

-- EZD-006 policy template: tenant from the claim, then project scope.
create policy review_item_select on public.review_item
  for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy review_item_api_gate on public.review_item as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write.
grant select, insert, update, delete on public.review_item to authenticated;
grant select, insert, update, delete on public.review_item to service_role;

comment on table public.review_item is 'Data model entity: review_item (04 Header card review pill; EZD-127)';

-- The count: after any change of a row, the open rows of each project the row was or is in are counted again and
-- written to project.open_items_count (one project's rows, by the project index), under the project row's lock.
create function private.review_item_recount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid;
begin
  foreach v_project in array array_remove(array[
    case when tg_op in ('UPDATE', 'DELETE') then old.project_id end,
    case when tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.project_id is distinct from old.project_id)
      then new.project_id end
  ], null) loop
    -- The project row's lock first (EZD-321), so two changes of one project count one after the other.
    perform 1 from public.project p where p.id = v_project for update;
    update public.project p
      set open_items_count = (
        select count(*) from public.review_item r where r.project_id = v_project and r.resolved_at is null)
      where p.id = v_project;
  end loop;
  return null;
end $$;
revoke all on function private.review_item_recount() from public;

create trigger review_item_recount
  after insert or update or delete on public.review_item
  for each row execute function private.review_item_recount();

-- A member may not write the count through project_update; the recount (definer) and server-side roles may.
-- When only the count changed, updated_at keeps its old value. The name sorts after project_set_updated_at, so
-- this runs after it (Postgres fires same-event triggers in name order).
create function private.project_open_items_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.open_items_count is distinct from old.open_items_count then
    if current_user in ('authenticated', 'anon') then
      raise exception 'open_items_count_refused' using errcode = '42501';
    end if;
    if (to_jsonb(new) - 'open_items_count' - 'updated_at') = (to_jsonb(old) - 'open_items_count' - 'updated_at') then
      new.updated_at := old.updated_at;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.project_open_items_guard() from public;

create trigger project_zz_open_items_guard
  before update on public.project
  for each row execute function private.project_open_items_guard();

-- A member may not create a project with a count either.
create function private.project_open_items_insert_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.open_items_count <> 0 and current_user in ('authenticated', 'anon') then
    raise exception 'open_items_count_refused' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.project_open_items_insert_guard() from public;

create trigger project_open_items_insert_guard
  before insert on public.project
  for each row execute function private.project_open_items_insert_guard();

-- The source features' write path (server-side definer code calls these; no API role may execute them).
-- add: opens an item for one source thing; an item already open for it is kept. Returns the open item's id.
create function private.add_review_item(p_project uuid, p_source text, p_source_ref text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_id uuid;
begin
  select p.tenant_id into v_tenant from public.project p where p.id = p_project;
  if v_tenant is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  insert into public.review_item (tenant_id, project_id, source, source_ref)
    values (v_tenant, p_project, p_source, p_source_ref)
    on conflict (project_id, source, source_ref) where resolved_at is null do nothing
    returning id into v_id;
  if v_id is null then
    select r.id into v_id from public.review_item r
      where r.project_id = p_project and r.source = p_source and r.source_ref = p_source_ref
        and r.resolved_at is null;
  end if;
  return v_id;
end $$;
revoke all on function private.add_review_item(uuid, text, text) from public;

-- resolve: closes the open item of one source thing, if there is one. Returns whether one was closed.
create function private.resolve_review_item(p_project uuid, p_source text, p_source_ref text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.review_item r set resolved_at = now()
    where r.project_id = p_project and r.source = p_source and r.source_ref = p_source_ref
      and r.resolved_at is null;
  return found;
end $$;
revoke all on function private.resolve_review_item(uuid, text, text) from public;
