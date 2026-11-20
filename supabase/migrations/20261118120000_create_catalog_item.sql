-- EZD-401 (03c Data model "catalog_item"; S09; R23): the tenant product catalog. Minimal for phase 15: the table
-- per the data model, read by the session client (GET /api/catalog), and the generic cabinet seed line R23 gives
-- every company until a real vendor line is entered. Adding and editing items (S09 Add product, Edit catalog)
-- is phase 16, so members have no write policy yet (RLS refuses every member write).
--
-- `line` is the cabinet line an item belongs to (S04 "Line: [Supplier] Shaker", line picker "Lines come from the
-- tenant catalog"); 03c has no column for it (vault/build/assumptions.md EZD-401). `project_id` is set only when
-- the item is saved to one project (S09 Decision 5); such an item follows the project's scope.
create table public.catalog_item (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid,
  -- S09 Decision 1: Cabinets, Countertops, Tile, Plumbing fixtures, Lighting, Appliances, Hardware, Paint,
  -- Windows and doors.
  category text not null check (category in ('cabinets', 'countertops', 'tile', 'plumbing_fixtures', 'lighting',
    'appliances', 'hardware', 'paint', 'windows_doors')),
  subcategory text check (subcategory is null or length(btrim(subcategory)) between 1 and 80),
  line text check (line is null or length(btrim(line)) between 1 and 120),
  name text not null check (length(btrim(name)) > 0 and length(name) <= 200),
  brand text check (brand is null or length(brand) <= 120),
  model text check (model is null or length(model) <= 120),
  sku text check (sku is null or length(sku) <= 120),
  -- Dims in decimal inches (03g), never rounded.
  width numeric check (width is null or width > 0),
  depth numeric check (depth is null or depth > 0),
  height numeric check (height is null or height > 0),
  finish text check (finish is null or length(finish) <= 120),
  -- 03c "cost" and "sell", named unit_cost and sell_price: the EZD-133 page scan matches money column names as
  -- words, and the bare words appear in shipped library code (vault/build/assumptions.md EZD-401).
  unit_cost numeric(12, 2) check (unit_cost is null or unit_cost >= 0),
  sell_price numeric(12, 2) check (sell_price is null or sell_price >= 0),
  -- Empty = the category default (03c).
  markup_pct numeric(7, 2) check (markup_pct is null or markup_pct >= 0),
  supplier text check (supplier is null or length(supplier) <= 120),
  lead_time_text text check (lead_time_text is null or length(lead_time_text) <= 120),
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  install_specs jsonb not null default '{}'::jsonb check (jsonb_typeof(install_specs) = 'object'),
  spec_sheet_path text,
  texture_path text,
  thumb_path text,
  source_url text check (source_url is null or length(source_url) <= 2048),
  ai_confidence jsonb not null default '{}'::jsonb check (jsonb_typeof(ai_confidence) = 'object'),
  allowance_category text check (allowance_category is null or length(allowance_category) <= 120),
  is_standard_spec boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);
create index catalog_item_tenant_category_idx on public.catalog_item (tenant_id, category, line, model, id);
create index catalog_item_project_idx on public.catalog_item (project_id) where project_id is not null;
alter table public.catalog_item enable row level security;
create trigger catalog_item_set_updated_at before update on public.catalog_item
  for each row execute function public.set_updated_at();

-- EZD-006 policy template: tenant from the claim; a project-only item also needs the project in scope.
create policy catalog_item_select on public.catalog_item for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and (
      project_id is null
      or (select private.all_projects())
      or project_id = any ((select private.listed_project_ids())::uuid[])
    )
  );
create policy catalog_item_api_gate on public.catalog_item as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write.
grant select, insert, update, delete on public.catalog_item to authenticated;
grant select, insert, update, delete on public.catalog_item to service_role;
comment on table public.catalog_item is 'Data model entity: catalog_item (EZD-401)';

-- R23: the generic cabinet line. B (base), DB (drawer base), SB (sink base) and W (wall) in 3" steps from 9" to
-- 36", and fillers 3" and 6". Base-row items are 24" deep and 34 1/2" high (S04 Height "34 1/2" for base"); wall
-- boxes are 12" deep and 30" high (vault/build/assumptions.md EZD-401). Idempotent: a company that already has
-- the line gets nothing. Not executable by any API role.
create function private.seed_catalog_generic_line(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.catalog_item
    where tenant_id = p_tenant_id and line = 'Generic' and project_id is null
  ) then
    return;
  end if;
  insert into public.catalog_item
    (tenant_id, category, subcategory, line, name, model, width, depth, height)
  select p_tenant_id, 'cabinets', t.subcategory, 'Generic', t.name, t.prefix || w, w, t.depth, t.height
  from (values
      (1, 'base', 'Base cabinet', 'B', 24::numeric, 34.5::numeric),
      (2, 'drawer_base', 'Drawer base', 'DB', 24::numeric, 34.5::numeric),
      (3, 'sink_base', 'Sink base', 'SB', 24::numeric, 34.5::numeric),
      (4, 'wall', 'Wall cabinet', 'W', 12::numeric, 30::numeric)
    ) as t (ord, subcategory, name, prefix, depth, height)
  cross join generate_series(9, 36, 3) as w
  order by t.ord, w;
  insert into public.catalog_item
    (tenant_id, category, subcategory, line, name, model, width, depth, height)
  select p_tenant_id, 'cabinets', 'filler', 'Generic', 'Filler', 'F' || w, w, 24, 34.5
  from unnest(array[3, 6]) as w;
end;
$$;

revoke all on function private.seed_catalog_generic_line(uuid) from public;

-- Every company that exists now (cloud: Worth Properties, tenant 1). There is no tenant trigger: companies are
-- created only by supabase/bootstrap/tenant-1.sql (before this migration in the cloud) and supabase/seed.sql
-- (local, after the migrations; it calls this function), and the locked EZD-006 gate test fixes the tables a
-- tenant trigger may seed (vault/build/assumptions.md EZD-401).
select private.seed_catalog_generic_line(id) from public.tenant;
