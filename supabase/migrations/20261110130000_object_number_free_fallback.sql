-- EZD-366 Build step 4 (vault/plans/EZD-366.md SQL F1; D-099; Q-0625 (a), Q-0650): when the key's highest number + 1 is
-- above 2147483647 the trigger gives the lowest number from 1 that no row of the key holds (deleted rows counted); it
-- refuses with 22023 only when none is free. Stored numbers are not touched.
create or replace function private.model_object_number()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  v_key text := private.object_number_key(new.type, new.data);
  v_kept numeric;
  v_sent numeric;
  v_top numeric;
begin
  if v_key is null then return new; end if;
  if tg_op = 'UPDATE' and private.object_number_key(old.type, old.data) = v_key then
    v_kept := private.object_number(old.type, old.data);
    if v_kept is not null and v_kept <= 2147483647 then
      new.data := jsonb_set(new.data, '{attributes,number}', to_jsonb(v_kept));
      return new;
    end if;
  end if;
  v_sent := private.object_number(new.type, new.data);
  if v_sent is not null and v_sent <= 2147483647 and not exists (
    select 1 from public.model_object o
    where o.project_id = new.project_id
      and private.object_number_key(o.type, o.data) = v_key
      and private.object_number(o.type, o.data) = v_sent
  ) then
    return new;
  end if;
  select coalesce(max(private.object_number(o.type, o.data)), 0) + 1 into v_top
  from public.model_object o
  where o.project_id = new.project_id and private.object_number_key(o.type, o.data) = v_key
    and private.object_number(o.type, o.data) <= 2147483647;
  if v_top > 2147483647 then
    select c.n into v_top
    from (
      select 1::numeric as n
      union all
      select private.object_number(o.type, o.data) + 1
      from public.model_object o
      where o.project_id = new.project_id and private.object_number_key(o.type, o.data) = v_key
        and private.object_number(o.type, o.data) < 2147483647
    ) c
    where not exists (
      select 1 from public.model_object u
      where u.project_id = new.project_id and private.object_number_key(u.type, u.data) = v_key
        and private.object_number(u.type, u.data) = c.n
    )
    order by c.n
    limit 1;
    if v_top is null then
      raise exception 'object_number_out_of_range' using errcode = '22023';
    end if;
  end if;
  new.data := jsonb_set(new.data, '{attributes,number}', to_jsonb(v_top));
  return new;
end $$;
revoke all on function private.model_object_number() from public;
