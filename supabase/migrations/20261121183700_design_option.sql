-- EZD-1009 (03c design_option; 03b rules 2, 3 and 4; 13b R2, R3; S07 Validation; AC-EZD-1009-1;
-- vault/build/assumptions.md EZD-1009): a design option is a model object (type design_option), saved, versioned,
-- frozen and reverted with the model (packages/geometry/src/schema/design-option.ts). Its internal cost lines are
-- not: they are never printed or signed, and they are company costs, so they live in their own tenant table.
--
-- 1. The level check lets a design_option row through without a level: an option belongs to the project, as a
--    sheet set does. Copied from 20261121090000 with that one change.
-- 2. At most three options per group: the labels are A, B and C, one of each per group. Deferred to commit, so a
--    save that swaps two labels or replaces an option passes; the check reads the rows as they stand at commit.
--    No count is taken (EZD-321: a counting function must lock first); one live option per label bounds the group. Raised as 22023, which
--    the save answers as invalid_input. It holds for every path that writes model_object rows (save, revert,
--    import), not only the save route.
-- 3. design_option_cost_line: the option's typed cost lines (13b R22). Members read their own company's lines on
--    projects in scope; the routes return them only with See company costs. No member write policy yet (EZD-1010
--    adds the cost-lines route).

-- 1. The level check.
create or replace function private.model_object_level_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.model_object;
  v_level text;
  v_blocker uuid;
begin
  -- The row as it stands at commit, not as this event left it.
  select o.* into v_row from public.model_object o
  where o.project_id = new.project_id and o.object_id = new.object_id;
  if not found then
    return null;
  end if;

  -- (a) a live row that is not a floor, a sheet set or a design option names a live floor of the project; a
  -- missing or non-uuid level names none.
  if not v_row.deleted and v_row.type not in ('floor', 'sheet_set', 'design_option') then
    v_level := v_row.data ->> 'level';
    if coalesce(v_level !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true) then
      raise exception using errcode = '23503', message = 'level_not_found', detail = v_row.object_id::text;
    end if;
    if not exists (
      select 1 from public.model_object f
      where f.project_id = v_row.project_id
        and f.object_id = v_level::uuid
        and f.type = 'floor'
        and not f.deleted
    ) then
      raise exception using errcode = '23503', message = 'level_not_found', detail = v_row.object_id::text;
    end if;
  end if;

  -- (b) a floor deleted or retyped while a live non-floor row still names it: the lowest such id.
  if tg_op = 'UPDATE' and old.type = 'floor' and (v_row.deleted or v_row.type <> 'floor') then
    select o.object_id into v_blocker from public.model_object o
    where o.project_id = v_row.project_id
      and not o.deleted
      and o.type <> 'floor'
      and lower(o.data ->> 'level') = v_row.object_id::text
    order by o.object_id
    limit 1;
    if found then
      raise exception using errcode = '23503', message = 'level_not_found', detail = v_blocker::text;
    end if;
  end if;

  return null;
end
$$;


-- 2. Three per group: labels A, B or C, one per label.
create function private.design_option_limit_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.model_object;
  v_group text;
begin
  select o.* into v_row from public.model_object o
  where o.project_id = new.project_id and o.object_id = new.object_id;
  if not found or v_row.deleted or v_row.type <> 'design_option' then
    return null;
  end if;
  v_group := lower(v_row.data ->> 'groupId');
  -- Two saves of one project's options check one after the other, each seeing the other's committed rows.
  perform pg_advisory_xact_lock(hashtextextended('design_option:' || v_row.project_id::text, 0));

  -- A, B and C only, so one of each label is at most three (no count is taken).
  if coalesce(v_row.data ->> 'label', '') not in ('A', 'B', 'C') then
    raise exception using errcode = '22023', message = 'design_option_limit', detail = v_row.object_id::text;
  end if;

  if exists (
    select 1 from public.model_object o
    where o.project_id = v_row.project_id
      and o.type = 'design_option'
      and not o.deleted
      and o.object_id <> v_row.object_id
      and lower(o.data ->> 'groupId') = v_group
      and o.data ->> 'label' = v_row.data ->> 'label'
  ) then
    raise exception using errcode = '22023', message = 'design_option_label_taken', detail = v_row.object_id::text;
  end if;

  return null;
end
$$;

revoke all on function private.design_option_limit_check() from public;

create constraint trigger model_object_design_option_limit
  after insert or update on public.model_object
  deferrable initially deferred
  for each row
  when (new.type = 'design_option')
  execute function private.design_option_limit_check();

-- 3. The cost lines. option_id is the design_option model object's id; the line goes with its project.
create table public.design_option_cost_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  option_id uuid not null,
  item text not null check (length(btrim(item)) > 0 and length(item) <= 200),
  qty numeric(12, 3) not null check (qty > 0),
  -- 03c internal_cost_lines "unit cost", named unit_cost as catalog_item (EZD-133 money registry).
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  sort integer not null default 0 check (sort >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);
create index design_option_cost_line_option_idx on public.design_option_cost_line (project_id, option_id, sort);
create index design_option_cost_line_tenant_idx on public.design_option_cost_line (tenant_id);
alter table public.design_option_cost_line enable row level security;
create trigger design_option_cost_line_set_updated_at before update on public.design_option_cost_line
  for each row execute function public.set_updated_at();

-- EZD-006 policy template: tenant from the claim, then project scope. Policies never read permission rows
-- (EZD-102), so See company costs is checked by the server routes that return lines, as for catalog_item.unit_cost.
create policy design_option_cost_line_select on public.design_option_cost_line for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );
create policy design_option_cost_line_api_gate on public.design_option_cost_line as restrictive for all
  to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write.
grant select, insert, update, delete on public.design_option_cost_line to authenticated;
grant select, insert, update, delete on public.design_option_cost_line to service_role;
comment on table public.design_option_cost_line is
  'Data model entity: design_option internal_cost_lines (03c; EZD-1009). Company costs; never sent to clients.';
