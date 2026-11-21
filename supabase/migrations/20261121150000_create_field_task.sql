-- EZD-1408 (03c field_task "project_id, room, phase, text_en, text_es, status, photos, done_by; Published by office";
-- S22 Field tasks "Draft tasks with AI ... Shown as drafts for review"; S15h Field task templates; 02 Stack AI "task
-- drafts"): one crew task of a project, in one room and one trade phase.
--
-- room_id is the room's model object id (null for a task not tied to a room); room is the room's name when the task
-- was made. phase is the phase name from the room type's template (S15h); phase_position and position give the
-- phase order and the task order within its phase. status: draft (made by the AI draft job or the office, not yet
-- seen by crew), published (S22 Publish), done (checked off on a phone, EZD-1409). job_id is the field_task_draft
-- job that wrote a draft row, so a rerun of the job replaces its own rows. text_es is filled by EZD-1502.
--
-- Members read the rows of projects in their scope (EZD-006 template). Rows are written by the draft job with the secret key; the
-- office edit and publish paths are EZD-1420's (no insert, update or delete policy here, so RLS refuses member
-- writes). No money fields (03b rule 2).
create table public.field_task (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  room_id uuid,
  room text not null default '' check (length(room) <= 120),
  phase text not null check (length(btrim(phase)) > 0 and length(phase) <= 60),
  phase_position integer not null check (phase_position >= 0),
  position integer not null check (position >= 0),
  text_en text not null check (length(btrim(text_en)) > 0 and length(text_en) <= 1000),
  text_es text check (text_es is null or length(text_es) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'published', 'done')),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  linked_objects jsonb not null default '[]'::jsonb check (jsonb_typeof(linked_objects) = 'array'),
  done_by uuid references public.app_user (id) on delete set null,
  done_at timestamptz,
  job_id uuid references public.job (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);

create index field_task_tenant_id_idx on public.field_task (tenant_id);
create index field_task_project_idx on public.field_task (project_id, phase_position, position);
create index field_task_job_idx on public.field_task (job_id) where job_id is not null;

alter table public.field_task enable row level security;

create trigger field_task_set_updated_at before update on public.field_task
  for each row execute function public.set_updated_at();

-- EZD-006 policy template: tenant from the claim, then project scope. Policies never read permission rows (EZD-102),
-- so hiding drafts from crew (S22 Decisions 2) is the job of the read paths that show tasks (EZD-1409, EZD-1420).
create policy field_task_select on public.field_task for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy field_task_api_gate on public.field_task as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write.
grant select, insert, update, delete on public.field_task to authenticated;
grant select, insert, update, delete on public.field_task to service_role;

comment on table public.field_task is 'Data model entity: field_task (03c; EZD-1408)';

-- S15h "One template per room type": at most one task_template library item per company and room type.
create unique index library_item_task_template_key on public.library_item (tenant_id, (data ->> 'roomType'))
  where kind = 'task_template';

-- The draft job kind.
alter table public.job
  drop constraint job_kind_check,
  add constraint job_kind_check check (
    kind in ('import', 'export', 'render', 'ai_read', 'thumbnail', 'diff', 'cleanup', 'test', 'notification_email',
      'project_purge', 'field_task_draft')
  );
