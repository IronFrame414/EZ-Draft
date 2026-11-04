-- EZD-132 Step 2 (vault/plans/EZD-132.md): the five private Storage buckets of docs/architecture.md Storage
-- buckets and paths, and the storage.objects policies for sources and media only. renders, exports and jobs
-- are written by job handlers with the secret key; their owner tickets add any member policy. No update
-- policy anywhere (no overwrite, upsert or move) and nothing to anon. Every path starts <tenant_id>/, read
-- from the token claim like table RLS (EZD-006); project files continue <project_id>/, tenant-level files
-- <tenant_id>/tenant/. Storage is outside the PostgREST gate and the browser holds the access token
-- (EZD-018), so a policy here is the only check on a direct Storage call; that is why the sources policies
-- (K: see_company_costs) and the media logo policies (K2: settings_company) read the member's own
-- user_permission row live, while table policies never read permission rows (EZD-006).
insert into storage.buckets (id, name, public) values
  ('sources', 'sources', false),
  ('renders', 'renders', false),
  ('exports', 'exports', false),
  ('media', 'media', false),
  ('jobs', 'jobs', false)
on conflict (id) do update set public = false;

-- sources: an object is read by members of the project; a supplier_pdf or order_report (files that may show
-- supplier prices) only by a member whose own See company costs switch is on, read live per statement from
-- user_permission (K; Q-0269 (b); EZD-101).
create policy storage_sources_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'sources'
    and (storage.foldername(name))[1] = (select private.tenant_id())::text
    and (storage.foldername(name))[2] <> 'tenant'
    and ((select private.all_projects())
      or (storage.foldername(name))[2] = any ((select private.listed_project_ids())::text[]))
    and (
      (select exists (
        select 1 from public.user_permission up
        where up.membership_id = (auth.jwt() ->> 'membership_id')::uuid
          and up.permission_key = 'see_company_costs'
          and up.granted))
      or not exists (
        select 1 from public.source_file f
        where f.storage_path = objects.name
          and f.kind in ('supplier_pdf', 'order_report'))
    )
  );

-- sources write gate (AC-EZD-132-5): an object enters only where a visible source_file row with that
-- storage_path has uploaded_at null and uploaded_by = the signer's own app_user (the same match as
-- source_file_insert), so the row comes first, only the member who started the upload can put bytes under
-- it (pending rows stay forever), and an uploaded original is never replaced. A row with uploaded_by null
-- takes no object.
create policy storage_sources_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sources'
    and (storage.foldername(name))[1] = (select private.tenant_id())::text
    and (storage.foldername(name))[2] <> 'tenant'
    and ((select private.all_projects())
      or (storage.foldername(name))[2] = any ((select private.listed_project_ids())::text[]))
    and exists (
      select 1 from public.source_file f
      where f.storage_path = objects.name
        and f.uploaded_at is null
        and f.uploaded_by = (select private.app_user_id())
        and (
          f.kind not in ('supplier_pdf', 'order_report')
          or (select exists (
            select 1 from public.user_permission up
            where up.membership_id = (auth.jwt() ->> 'membership_id')::uuid
              and up.permission_key = 'see_company_costs'
              and up.granted))
        ))
  );

-- media select is scope-only: tenant-level files (<tenant_id>/tenant/...) are read by every member of the
-- company, project files by members of the project.
create policy storage_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select private.tenant_id())::text
    and ((storage.foldername(name))[2] = 'tenant'
      or ((select private.all_projects())
        or (storage.foldername(name))[2] = any ((select private.listed_project_ids())::text[])))
  );

-- media insert and delete cover only the company logo, <tenant_id>/tenant/logo/<file> (exactly three folder
-- segments; EZD-112), and only for a member whose own settings_company switch is on (K2, read live like K;
-- the Company settings page owns the logo). Every other media prefix gets its insert (and delete) policy from
-- the ticket whose screen writes it, carrying the switch that screen checks; a prefix written only by job
-- handlers needs none. Removed only by the member who uploaded the object.
create policy storage_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select private.tenant_id())::text
    and (storage.foldername(name))[2] = 'tenant'
    and (storage.foldername(name))[3] = 'logo'
    and array_length(storage.foldername(name), 1) = 3
    and (select exists (
      select 1 from public.user_permission up
      where up.membership_id = (auth.jwt() ->> 'membership_id')::uuid
        and up.permission_key = 'settings_company'
        and up.granted))
  );

create policy storage_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select private.tenant_id())::text
    and (storage.foldername(name))[2] = 'tenant'
    and (storage.foldername(name))[3] = 'logo'
    and array_length(storage.foldername(name), 1) = 3
    and (select exists (
      select 1 from public.user_permission up
      where up.membership_id = (auth.jwt() ->> 'membership_id')::uuid
        and up.permission_key = 'settings_company'
        and up.granted))
    and owner_id = (select auth.uid())::text
  );
