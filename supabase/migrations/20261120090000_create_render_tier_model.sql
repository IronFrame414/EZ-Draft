-- EZD-1102 (S15f; R24 #18; 13b R2): render_tier_model, one row per company and tier (fast, standard, photoreal)
-- naming the image model that serves the tier (provider, provider model id, output size) and the owner's typed
-- cost per render in dollars (null = not entered). The model list lives in app/src/lib/render-settings/models.ts;
-- the database checks only the provider list and the provider model id shape of app/src/server/ai/types.ts, so
-- EZD-1103 can change ids without a migration (vault/build/assumptions.md EZD-1102). Members read their own
-- company's rows and write only through save_render_settings (20261120090002).

create table public.render_tier_model (
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  tier text not null check (tier in ('fast', 'standard', 'photoreal')),
  provider text not null check (provider in ('gemini', 'openai', 'bfl', 'stub')),
  model_id text not null check (model_id ~ '^[a-z0-9][a-z0-9.\-]{0,99}$'),
  output_size text not null check (output_size in ('1k', '2k', '4k')),
  cost_usd_per_render numeric(8, 2) check (cost_usd_per_render is null or cost_usd_per_render >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, tier)
);
alter table public.render_tier_model enable row level security;
create trigger render_tier_model_set_updated_at before update on public.render_tier_model
  for each row execute function public.set_updated_at();

create policy render_tier_model_select on public.render_tier_model for select to authenticated
  using (tenant_id = (select private.tenant_id()));
create policy render_tier_model_api_gate on public.render_tier_model as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write,
-- so members write only through save_render_settings.
grant select, insert, update, delete on public.render_tier_model to authenticated;
grant select, insert, update, delete on public.render_tier_model to service_role;
comment on table public.render_tier_model is 'Data model entity: render tier to model and cost (EZD-1102)';
