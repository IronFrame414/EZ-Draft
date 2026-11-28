-- EZD-2021 (audit 2026-11-27 X4; AC-EZD-2021-1): acceptInviteCode now answers invite_code_invalid for a locked
-- code too, so a stranger cannot tell that an email has a pending invite. The invitee still sees the lock on
-- the page the emailed link opens: invite_status adds codeLocked (five wrong codes used, until Resend) to its
-- live answer. Only the holder of the link's token reaches this. Nothing else changes: still read-only, still
-- service_role only; a link that does not work answers {live: false} with nothing more.
create or replace function public.invite_status(p_token_sha256 text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('live', true, 'companyName', t.name, 'codeLocked', i.code_tries >= 5)
    from public.invite i
    join public.membership m on m.id = i.membership_id and m.tenant_id = i.tenant_id
    join public.tenant t on t.id = i.tenant_id
    where i.token_sha256 = p_token_sha256
      and i.accepted_at is null
      and i.cancelled_at is null
      and i.expires_at > now()
      and private.invite_is_valid(m.status, m.invited_at)
  ), jsonb_build_object('live', false));
$$;

revoke all on function public.invite_status(text) from public, anon, authenticated;
grant execute on function public.invite_status(text) to service_role;
