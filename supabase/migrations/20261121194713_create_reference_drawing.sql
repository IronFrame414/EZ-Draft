-- EZD-901a (03c Tables reference_drawing "project_id, source_file_id, version_no, rev_label (the architect's letter),
-- layer_state (json), convert_status per layer"; phase-09 EZD-901a "Entity types the parser cannot read are counted
-- per type and stored with the reference"; S11 Data shown; R26 R16): one architect DXF reference per uploaded DXF
-- drawing, written by the reference_convert job when its conversion finishes (ready) or cannot read the file
-- (failed, with a stable code). The geometry buffers and their manifest are in Storage under the job's output path
-- (jobs bucket, <tenant>/<project>/<job>/out/; docs/architecture.md Background jobs "Output paths are fixed by job
-- id"); manifest_path names the manifest and must sit inside this row's tenant and project.
-- version_no and rev_label are kept for EZD-908 and EZD-921 (first upload: version 1, no letter yet). layer_state
-- holds each layer's name, file colour, visibility, entity count and converted flag; convert_status is EZD-906's.
-- Members read through the EZD-006 policy template; there is no insert, update or delete policy, so RLS refuses
-- every member write (the standard grant, as import_session); the job writes with the secret key. source_file_id is unique, so a job run twice updates the same row. No money fields (03b rule 2).

-- The conversion job kind (the newest job_kind_check is 20261121150000_create_field_task.sql).
alter table public.job
  drop constraint job_kind_check,
  add constraint job_kind_check check (
    kind in ('import', 'export', 'render', 'ai_read', 'thumbnail', 'diff', 'cleanup', 'test', 'notification_email',
      'project_purge', 'field_task_draft', 'reference_convert')
  );

create table public.reference_drawing (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  source_file_id uuid not null unique references public.source_file (id) on delete cascade,
  job_id uuid references public.job (id) on delete set null,
  version_no integer not null default 1 check (version_no >= 1),
  rev_label text check (rev_label is null or char_length(rev_label) between 1 and 8),
  status text not null check (status in ('ready', 'failed')),
  error text check (error ~ '^[a-z][a-z0-9_]{0,63}$'),
  units text check (units is null or units in ('unitless', 'inches', 'feet', 'millimeters', 'centimeters', 'meters')),
  layer_state jsonb not null default '[]'::jsonb check (jsonb_typeof(layer_state) = 'array'),
  convert_status jsonb not null default '{}'::jsonb check (jsonb_typeof(convert_status) = 'object'),
  not_read jsonb not null default '{}'::jsonb check (jsonb_typeof(not_read) = 'object'),
  manifest_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade,
  -- A ready reference has its manifest and no error; a failed one has an error code and no manifest.
  constraint reference_drawing_status_shape check (
    (status = 'ready' and manifest_path is not null and error is null)
    or (status = 'failed' and manifest_path is null and error is not null)
  ),
  -- The manifest is inside this reference's own tenant and project folder.
  constraint reference_drawing_manifest_path check (
    manifest_path is null
    or (starts_with(manifest_path, tenant_id::text || '/' || project_id::text || '/') and manifest_path !~ '\.\.')
  )
);

create index reference_drawing_tenant_id_idx on public.reference_drawing (tenant_id);
create index reference_drawing_project_id_idx on public.reference_drawing (project_id);
create index reference_drawing_job_id_idx on public.reference_drawing (job_id);

alter table public.reference_drawing enable row level security;

create trigger reference_drawing_set_updated_at
  before update on public.reference_drawing
  for each row execute function public.set_updated_at();

-- EZD-006 policy template: tenant from the claim, then project scope.
create policy reference_drawing_select on public.reference_drawing
  for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy reference_drawing_api_gate on public.reference_drawing as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6). No write policy, so RLS refuses every member write; EZD-904/906/908/921 add
-- the reviewed write paths.
grant select, insert, update, delete on public.reference_drawing to authenticated;
grant select, insert, update, delete on public.reference_drawing to service_role;

comment on table public.reference_drawing is 'Data model entity: reference_drawing (03c Tables reference_drawing; EZD-901a)';
