-- EZD-005a Step 1 (vault/plans/EZD-005a.md): trigger function that keeps updated_at current on
-- tenant, app_user, project and membership (before update). security invoker, empty search_path.
create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
