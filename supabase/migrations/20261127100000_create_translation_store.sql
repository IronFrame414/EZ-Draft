-- EZD-1501 Translation store (03c translation "phrase_en, text_es ... | Cached across jobs"; AC-EZD-1501-1; Q-0234:
-- no review queue, so no status, approver or type, and no glossary or usage table; vault/build/assumptions/EZD-1501.md
-- settled rows).
--
-- translation: one row per company per English phrase. The phrase is stored with every run of white space turned
-- into one space and the ends trimmed, so the same phrase on two jobs of a company is one row; another company's
-- same phrase is its own row. text_es is null until the drafting job (EZD-1502) fills it, and never blank once set.
--
-- Rows hold phrases from every project of a company, so a Listed-scope member must not read them directly: RLS is
-- on with no member select, insert, update or delete policy (only the API gate policy), so every member read and
-- write is refused. Rows are written by server-side definer code through private.store_translation_phrase (the
-- review_item pattern); Spanish reads go through server lookups limited to what the caller can open (EZD-1503).

create table public.translation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  phrase_en text not null check (
    length(phrase_en) > 0
    and length(phrase_en) <= 4000
    and phrase_en = btrim(regexp_replace(phrase_en, '[ \t\n\r\f\v]+', ' ', 'g'), ' ')
  ),
  text_es text check (text_es is null or (length(btrim(text_es)) > 0 and length(text_es) <= 8000)),
  drafted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, phrase_en)
);

alter table public.translation enable row level security;

create policy translation_api_gate on public.translation as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no member policy RLS refuses every member read and write.
grant select, insert, update, delete on public.translation to authenticated;
grant select, insert, update, delete on public.translation to service_role;

comment on table public.translation is
  'Data model entity: translation (03c; EZD-1501). One row per company per normalized English phrase.';

-- The company's row for a phrase, made on its first use; a later use on any job of the company gets the same id.
-- Two first uses at once still make one row (on conflict). Called only by other definer functions (EZD-1502).
create function private.store_translation_phrase(p_tenant uuid, p_phrase_en text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_phrase text;
  v_id uuid;
begin
  if p_tenant is null then
    raise exception 'invalid_tenant' using errcode = '22023';
  end if;
  v_phrase := btrim(regexp_replace(coalesce(p_phrase_en, ''), '[ \t\n\r\f\v]+', ' ', 'g'), ' ');
  if v_phrase = '' or length(v_phrase) > 4000 then
    raise exception 'invalid_phrase' using errcode = '22023';
  end if;

  insert into public.translation (tenant_id, phrase_en)
  values (p_tenant, v_phrase)
  on conflict (tenant_id, phrase_en) do nothing
  returning id into v_id;
  if v_id is null then
    select t.id into v_id from public.translation t where t.tenant_id = p_tenant and t.phrase_en = v_phrase;
  end if;
  return v_id;
end
$$;

revoke all on function private.store_translation_phrase(uuid, text) from public, anon, authenticated, service_role;
