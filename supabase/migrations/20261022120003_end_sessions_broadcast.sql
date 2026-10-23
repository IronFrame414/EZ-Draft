-- EZD-018 Step 3b (vault/plans/EZD-018.md; Q-0052 (c)): when a person's sessions are ended, also push
-- session.ended on their own user channel, so the app drops every channel and goes to sign-in. Same
-- signature and delete as 20261019170005_create_end_sessions_triggers.sql; now plpgsql (perform). A null
-- id (the membership row already gone in a cascade) has no sessions to end and no channel to push to.
-- The triggers membership_end_sessions and membership_project_end_sessions are unchanged.

create or replace function private.end_user_sessions(p_app_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from auth.sessions
  where user_id = (select auth_user_id from public.app_user where id = p_app_user_id);
  if p_app_user_id is not null then
    perform private.broadcast_user(p_app_user_id, 'session.ended', '{}'::jsonb);
  end if;
end
$$;

revoke all on function private.end_user_sessions(uuid) from public;
