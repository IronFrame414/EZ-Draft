-- EZD-018 Step 2 (vault/plans/EZD-018.md): Realtime private-channel authorization on realtime.messages.
-- Select = may join and receive broadcast and presence. Insert = may track presence. There is no insert
-- policy for broadcast, so a client's own broadcast is refused: every broadcast comes from the database
-- (Step 3). No policy for anon. Helpers are wrapped in scalar subqueries (run once per check, EZD-006 Step 3).

create policy realtime_messages_select on realtime.messages
  for select to authenticated
  using ( realtime.messages.extension in ('broadcast', 'presence')
          and (select private.realtime_can_receive((select realtime.topic()))) );

create policy realtime_messages_insert on realtime.messages
  for insert to authenticated
  with check ( realtime.messages.extension = 'presence'
               and (select private.realtime_can_track((select realtime.topic()))) );
