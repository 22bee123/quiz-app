-- =====================================================================
-- Buck the Duck — Row Level Security for every table the app uses
--
-- The browser talks to Supabase with the public anon key, so RLS is the only thing stopping
-- one user from reading or changing another user's rows. Without it, for example, the
-- history list (which selects quiz_history with no user filter) would show every user's
-- results to everyone.
--
-- Policies are derived from what public/app.js actually reads and writes:
--   profiles      read by any signed-in user (friend search, chat names); write own row
--   quiz_history  own rows only (insert, list, pin, delete)
--   events        own rows only (study calendar)
--   friendships   rows you are on either side of; you send as yourself; the addressee accepts
--   messages      rows you sent or received; send as yourself; the receiver marks them read
--   rooms         any signed-in user can look a room up by code; the host owns it
--   room_players  any signed-in user can see a room's players; you manage your own row
--
-- Safe to re-run. A table that does not exist in this project is skipped with a notice.
-- Every policy is named "buck_*" so this script only ever replaces its own policies.
--
-- AFTER RUNNING: policies are permissive and OR together, so an older broad policy (for
-- example "Enable read access for all users" with USING (true)) still lets everyone in.
-- Run the audit query at the bottom and drop any non-buck_* policy that is wider than these.
-- =====================================================================

create or replace function pg_temp.buck_rls(tbl text, policies text[])
returns void language plpgsql as $$
declare
  p text;
  pname text;
begin
  if to_regclass('public.' || tbl) is null then
    raise notice 'skipped %: table does not exist', tbl;
    return;
  end if;
  execute format('alter table public.%I enable row level security', tbl);
  foreach p in array policies loop
    pname := split_part(p, '|', 1);
    execute format('drop policy if exists %I on public.%I', pname, tbl);
    execute format(split_part(p, '|', 2), pname, tbl);
  end loop;
  raise notice 'secured %', tbl;
end $$;

-- (select auth.uid()) is evaluated once per query instead of once per row.

select pg_temp.buck_rls('profiles', array[
  'buck_profiles_read|create policy %I on public.%I for select to authenticated using (true)',
  'buck_profiles_insert_own|create policy %I on public.%I for insert to authenticated with check (id = (select auth.uid()))',
  'buck_profiles_update_own|create policy %I on public.%I for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()))'
]);

select pg_temp.buck_rls('quiz_history', array[
  'buck_history_select_own|create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
  'buck_history_insert_own|create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
  'buck_history_update_own|create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
  'buck_history_delete_own|create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))'
]);

select pg_temp.buck_rls('events', array[
  'buck_events_select_own|create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
  'buck_events_insert_own|create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
  'buck_events_update_own|create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
  'buck_events_delete_own|create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))'
]);

select pg_temp.buck_rls('friendships', array[
  'buck_friendships_select_mine|create policy %I on public.%I for select to authenticated using ((select auth.uid()) in (requester_id, addressee_id))',
  -- A request is always sent as yourself and starts pending (no self-accepted friendships).
  'buck_friendships_insert_as_requester|create policy %I on public.%I for insert to authenticated with check (requester_id = (select auth.uid()) and status = ''pending'')',
  -- Only the person who received a request can accept it.
  'buck_friendships_update_addressee|create policy %I on public.%I for update to authenticated using (addressee_id = (select auth.uid())) with check (addressee_id = (select auth.uid()))',
  -- Either side can cancel, decline or unfriend.
  'buck_friendships_delete_mine|create policy %I on public.%I for delete to authenticated using ((select auth.uid()) in (requester_id, addressee_id))'
]);

select pg_temp.buck_rls('messages', array[
  'buck_messages_select_mine|create policy %I on public.%I for select to authenticated using ((select auth.uid()) in (sender_id, receiver_id))',
  'buck_messages_insert_as_sender|create policy %I on public.%I for insert to authenticated with check (sender_id = (select auth.uid()))',
  -- Only the receiver updates a message (to mark it read).
  'buck_messages_update_receiver|create policy %I on public.%I for update to authenticated using (receiver_id = (select auth.uid())) with check (receiver_id = (select auth.uid()))'
]);

select pg_temp.buck_rls('rooms', array[
  'buck_rooms_read|create policy %I on public.%I for select to authenticated using (true)',
  'buck_rooms_insert_as_host|create policy %I on public.%I for insert to authenticated with check (host_user_id = (select auth.uid()))',
  'buck_rooms_update_host|create policy %I on public.%I for update to authenticated using (host_user_id = (select auth.uid())) with check (host_user_id = (select auth.uid()))',
  'buck_rooms_delete_host|create policy %I on public.%I for delete to authenticated using (host_user_id = (select auth.uid()))'
]);

select pg_temp.buck_rls('room_players', array[
  'buck_room_players_read|create policy %I on public.%I for select to authenticated using (true)',
  'buck_room_players_insert_self|create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
  'buck_room_players_update_self|create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
  'buck_room_players_delete_self|create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))'
]);

-- =====================================================================
-- Audit: every app table should show rls_enabled = true, and the policy list should hold
-- nothing wider than the buck_* policies above (look for qual = 'true' on insert/update/
-- delete, or any policy for the "anon" or "public" role).
--
--   select c.relname as table_name, c.relrowsecurity as rls_enabled, count(p.polname) as policies
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   left join pg_policy p on p.polrelid = c.oid
--   where n.nspname = 'public' and c.relkind = 'r'
--   group by c.relname, c.relrowsecurity
--   order by c.relrowsecurity, c.relname;
--
--   select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies where schemaname = 'public' and policyname not like 'buck_%'
--   order by tablename, cmd;
-- =====================================================================
