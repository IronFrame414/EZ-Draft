-- EZD-417 (03c edge_profile "tenant_id, name, section_svg, no stored per-LF price (the price is entered per top in
-- 04b) | Library: eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom"; 03c selection_offer
-- "project_id, kind (edge_profile, option group, finish), choices[], price_deltas | What the client may pick from";
-- S04b Edit offered edges "Choose which profiles the client sees and enter the price difference per lf ... Requires
-- Send to client"; S04b Events emitted "edge_profile.offered (new)"; 13b R2 "edge-profile price differences" are
-- See sell prices; vault/build/assumptions.md EZD-417).
--
-- 1. edge_profile: the company's edge profile library: the seven profiles with a simple section drawing each.
--    Existing companies are seeded here; a company made later is seeded on its first library read
--    (edge_profile_library), so creating a company writes no other row (EZD-006 API gate test). Names and drawings
--    are edited in Settings › Catalog (EZD-1617); until then no member writes them.
-- 2. selection_offer: what the client may pick from. For an edge profile offer the subject is one countertop piece
--    (a model object id, "for this top"), choices are edge_profile ids in the order offered and price_deltas the
--    price difference per LF of each choice (a sell price). One offer per project, kind and subject. Members read
--    their own company's offers on projects in scope; the routes return the rates only with See sell prices.
-- 3. save_edge_offer: Edit offered edges. Send to client and project scope; replaces the top's offer (an empty
--    list withdraws it) and writes edge_profile.offered with ids only. A null rate list keeps the rates already
--    saved for choices still offered and enters 0 for new ones (a member without See sell prices).

create table public.edge_profile (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  key text not null check (
    key in ('eased', 'bevel', 'half_bullnose', 'full_bullnose', 'ogee', 'mitered_apron', 'custom')
  ),
  name text not null check (length(btrim(name)) > 0 and length(name) <= 60),
  section_svg text not null check (length(section_svg) <= 20000),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create index edge_profile_tenant_idx on public.edge_profile (tenant_id, position);

alter table public.edge_profile enable row level security;

create trigger edge_profile_set_updated_at before update on public.edge_profile
  for each row execute function public.set_updated_at();

-- EZD-006 policy template: every member of the company reads its library (S04b "View projects: view ... profiles").
create policy edge_profile_select on public.edge_profile for select to authenticated
  using (tenant_id = (select private.tenant_id()));

create policy edge_profile_api_gate on public.edge_profile as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write.
grant select, insert, update, delete on public.edge_profile to authenticated;
grant select, insert, update, delete on public.edge_profile to service_role;

comment on table public.edge_profile is 'Data model entity: edge_profile (03c; EZD-417). No price is stored here.';

-- The seven profiles. Each drawing is the slab's cut end, 60 wide by 40 high, the edge on the right.
create function private.seed_edge_profiles(p_tenant uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.edge_profile (tenant_id, key, name, section_svg, position)
  select p_tenant, v.key, v.name,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><path d="' || v.d
      || '" fill="#e8e4dc" stroke="#33363d" stroke-width="1.5"/></svg>',
    v.position
  from (values
    ('eased', 'Eased', 'M0 10 H57 Q60 10 60 13 V27 Q60 30 57 30 H0 Z', 0),
    ('bevel', 'Bevel', 'M0 10 H54 L60 16 V30 H0 Z', 1),
    ('half_bullnose', 'Half bullnose', 'M0 10 H50 A10 10 0 0 1 60 20 V30 H0 Z', 2),
    ('full_bullnose', 'Full bullnose', 'M0 10 H50 A10 10 0 0 1 50 30 H0 Z', 3),
    ('ogee', 'Ogee', 'M0 10 H50 C55 10 55 16 58 17 C60 18 60 20 60 22 V30 H0 Z', 4),
    ('mitered_apron', 'Mitered apron', 'M0 10 H60 V38 H54 V16 H0 Z', 5),
    ('custom', 'Custom', 'M0 10 H60 V30 H0 Z', 6)
  ) as v(key, name, d, position)
  on conflict (tenant_id, key) do nothing;
$$;

revoke all on function private.seed_edge_profiles(uuid) from public, anon, authenticated, service_role;

select private.seed_edge_profiles(id) from public.tenant;

-- The member's company library in order, seeded first when the company has none yet (on conflict do nothing, so two
-- first reads at once add one set). Any member of the company may read it (S04b "View projects: view ...
-- profiles"); the route checks View projects.
create function public.edge_profile_library()
returns setof public.edge_profile
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  if v_tenant is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.edge_profile e where e.tenant_id = v_tenant) then
    perform private.seed_edge_profiles(v_tenant);
  end if;
  return query select * from public.edge_profile e where e.tenant_id = v_tenant order by e.position, e.id;
end
$$;

revoke all on function public.edge_profile_library() from public, anon, authenticated, service_role;
grant execute on function public.edge_profile_library() to authenticated;
