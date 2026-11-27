-- EZD-2005 (security audit 2026-11-27 S1; AC-EZD-2005-1): the sources Storage policies apply the same cost-file
-- test the app uses (app/src/server/storage/source-files.ts, startSourceFileUpload isCostRecord): a source file is
-- a cost file when its kind is supplier_pdf or order_report, or it has supplier_name or supplier_contact_email
-- set. Before this, the policies of 20261026120002_create_storage_buckets.sql tested only the two kinds, so a
-- member without See company costs could list and download a supplier-named image or DXF straight from Storage.
-- Everything else in both policies is unchanged (scope, tenant path, pending-row write gate, live K read).

drop policy storage_sources_select on storage.objects;
drop policy storage_sources_insert on storage.objects;

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
          and (f.kind in ('supplier_pdf', 'order_report')
            or f.supplier_name is not null
            or f.supplier_contact_email is not null))
    )
  );

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
          (f.kind not in ('supplier_pdf', 'order_report')
            and f.supplier_name is null
            and f.supplier_contact_email is null)
          or (select exists (
            select 1 from public.user_permission up
            where up.membership_id = (auth.jwt() ->> 'membership_id')::uuid
              and up.permission_key = 'see_company_costs'
              and up.granted))
        ))
  );
