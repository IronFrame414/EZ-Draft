-- One-time setup of Worth Properties (company 1) and its owner account in a cloud project. Steps: docs/runbook.md, "Tenant 1 setup".
-- Replace only the placeholder text on the owner_email line below with the email you sign in with. Keep the quote marks.
do $$
declare
  owner_email text := 'PASTE-YOUR-EMAIL-HERE';
  v text;
begin
  v := lower(btrim(owner_email));
  if v = 'paste-your-email-here' or v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'ezd_bootstrap_email_missing';
  end if;

  if exists (select 1 from public.tenant where id = '00000000-0000-4000-8000-000000000001') then
    raise exception 'ezd_bootstrap_already_done';
  end if;

  insert into public.tenant (id, name)
  values ('00000000-0000-4000-8000-000000000001', 'Worth Properties');

  insert into public.app_user (id, name, email, language, role_preset)
  values ('00000000-0000-4000-8000-000000001001', 'Josh Bishop', v, 'en', 'owner');

  insert into public.membership (tenant_id, user_id, status, scope)
  values (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001001',
    'active',
    'all'
  );

  raise notice 'ezd_bootstrap_done';
end $$;
