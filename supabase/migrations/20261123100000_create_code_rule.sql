-- EZD-611a (09c Code check engine; 03e code_rule; 03c code_check_run; R26 R19, R34): the code rule list and the
-- stored check runs (code_check_run: 20261123100050_create_code_check_run.sql).
--
-- 1. code_rule: the rule list shown in Settings 15g. The check logic is code keyed by rule_id
--    (packages/geometry/src/code-check); this table holds the app's own wording (never the code books' text), the
--    section per edition and who verified it. Catalog rules (tenant_id null) come from vault/spec/code-rules.json
--    through the generated migration that follows this one; every member reads them. A company rule (code
--    'company', 03e) belongs to one company and only its members read it. No member write policy: EZD-1710 adds
--    Mark verified and EZD-611a writes nothing else, so RLS refuses every member write. Every rule starts
--    unverified (R19): verified_by and verified_at stay null until a licensed person checks it.
-- 2. code_check_run: one run of the check (on demand, and at issue), with its results. Members read the runs of
--    projects in their scope; a run is written only by record_code_check_run, which needs Run code check
--    (run_code_check) and sight of the project. No money fields (03b rule 2).
create table public.code_rule (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenant (id) on delete cascade,
  rule_id text not null check (char_length(rule_id) between 1 and 32),
  rule_group text not null check (char_length(rule_group) between 1 and 200),
  code text not null check (code in ('NEC', 'FBC-R', 'FBC-B', 'FBC-EB', 'FBC-EC', 'FBC-M', 'FBC-P', 'company')),
  section_fbc8_nec2020 text check (section_fbc8_nec2020 is null or char_length(section_fbc8_nec2020) <= 200),
  section_fbc9_nec2023 text check (section_fbc9_nec2023 is null or char_length(section_fbc9_nec2023) <= 200),
  title text not null check (char_length(title) between 1 and 200),
  applies_to text not null check (char_length(applies_to) <= 1000),
  check_text text not null check (char_length(check_text) <= 4000),
  edition_difference text check (edition_difference is null or char_length(edition_difference) <= 4000),
  rule_type text not null check (rule_type in ('automatic', 'needs_data', 'reminder')),
  needs text check (needs is null or char_length(needs) <= 1000),
  rule_trigger text not null
    check (rule_trigger in ('new_work', 'whole_dwelling', 'change_of_use', 'new_dwellings_only')),
  source text not null check (source in ('code_text', 'published_summary', 'unverified', 'company')),
  url text check (url is null or char_length(url) <= 2048),
  note text check (note is null or char_length(note) <= 4000),
  severity text not null default 'warning' check (severity in ('warning', 'note')),
  verified_by uuid references public.app_user (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A company rule has a company; a catalog rule has none.
  check ((code = 'company') = (tenant_id is not null))
);

create unique index code_rule_tenant_rule_idx on public.code_rule (tenant_id, rule_id);
create unique index code_rule_catalog_rule_idx on public.code_rule (rule_id) where tenant_id is null;
create index code_rule_verified_by_idx on public.code_rule (verified_by);

alter table public.code_rule enable row level security;

create trigger code_rule_set_updated_at
  before update on public.code_rule
  for each row execute function public.set_updated_at();

create policy code_rule_select on public.code_rule
  for select to authenticated
  using (tenant_id is null or tenant_id = (select private.tenant_id()));

create policy code_rule_api_gate on public.code_rule as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6). No write policy: EZD-1710 adds the reviewed Mark verified path.
grant select, insert, update, delete on public.code_rule to authenticated;
grant select, insert, update, delete on public.code_rule to service_role;

comment on table public.code_rule is 'Data model entity: code_rule (03e code_rule; EZD-611a)';
