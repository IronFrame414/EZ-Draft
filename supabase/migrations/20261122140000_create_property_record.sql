-- EZD-710 (03c Tables property_record "parcel_no, owner, legal_description, year_built, living_area, source_url,
-- confirmed_by"; S13 Data shown "owner, PCN (From property appraiser link)"; S15b Decision 2; AC-EZD-710-1): the
-- property record a project's title block prints its owner and parcel number from, found through
-- project.property_record_id. EZD-711 adds the property appraiser import that writes it (its reviewed write path);
-- until then there is no member write policy, so RLS refuses every member write and rows are written with the secret
-- key (vault/build/assumptions.md EZD-710). No foreign key from project.property_record_id yet: EZD-711 links the
-- two when it writes the record. A member reads a record of their own company only through a project they can see
-- (project RLS applies inside the policy's subquery). No money fields (03b rule 2).
create table public.property_record (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  parcel_no text check (parcel_no is null or char_length(parcel_no) <= 64),
  owner text check (owner is null or char_length(owner) <= 300),
  legal_description text check (legal_description is null or char_length(legal_description) <= 4000),
  year_built integer check (year_built is null or year_built between 1600 and 2200),
  living_area integer check (living_area is null or living_area >= 0),
  source_url text check (source_url is null or char_length(source_url) <= 2048),
  confirmed_by uuid references public.app_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create index property_record_tenant_id_idx on public.property_record (tenant_id);
create index property_record_confirmed_by_idx on public.property_record (confirmed_by);
create index project_property_record_id_idx on public.project (property_record_id);

alter table public.property_record enable row level security;

create trigger property_record_set_updated_at
  before update on public.property_record
  for each row execute function public.set_updated_at();

create policy property_record_select on public.property_record
  for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and exists (select 1 from public.project p where p.property_record_id = property_record.id)
  );

create policy property_record_api_gate on public.property_record as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6). No write policy: EZD-711 adds the reviewed write path.
grant select, insert, update, delete on public.property_record to authenticated;
grant select, insert, update, delete on public.property_record to service_role;

comment on table public.property_record is 'Data model entity: property_record (03c Tables property_record; EZD-710)';
