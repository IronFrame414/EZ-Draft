-- EZD-131 (S15h; 03e Data model "library_item"): one company library entry. Backs every Settings > Libraries
-- tab except Details. `data` holds the kind's own fields (an abbreviation's meaning). Abbreviations are unique
-- per company ignoring case; other kinds may share a name. Writes go through the session-client routes under
-- /api/settings/libraries, which check the Libraries switch (settings_libraries).
create table public.library_item (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  kind text not null
    check (kind in ('note', 'abbreviation', 'hatch', 'part', 'saved_group', 'task_template')),
  name text not null check (length(btrim(name)) > 0 and length(name) <= 120),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index library_item_tenant_kind_idx on public.library_item (tenant_id, kind, lower(name), id);
create unique index library_item_abbreviation_key on public.library_item (tenant_id, lower(name))
  where kind = 'abbreviation';
alter table public.library_item enable row level security;
create trigger library_item_set_updated_at before update on public.library_item
  for each row execute function public.set_updated_at();
create policy library_item_select on public.library_item for select to authenticated
  using (tenant_id = (select private.tenant_id()));
create policy library_item_insert on public.library_item for insert to authenticated
  with check (tenant_id = (select private.tenant_id()));
create policy library_item_update on public.library_item for update to authenticated
  using (tenant_id = (select private.tenant_id()))
  with check (tenant_id = (select private.tenant_id()));
create policy library_item_delete on public.library_item for delete to authenticated
  using (tenant_id = (select private.tenant_id()));
create policy library_item_api_gate on public.library_item as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));
grant select, insert, update, delete on public.library_item to authenticated;
grant select, insert, update, delete on public.library_item to service_role;
comment on table public.library_item is 'Data model entity: library_item (EZD-131)';
