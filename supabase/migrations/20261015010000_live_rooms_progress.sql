-- =====================================================================
-- Buck the Duck — live room progress
--
-- The live room shows each player's question number while racing and ranks the podium by
-- who finished first on a tie, so room_players needs:
--   * progress     → how many questions this player has answered
--   * finished_at  → when they answered the last one
-- and rooms needs:
--   * started_at   → when the host pressed Start
--   * status       → 'open' (lobby) | 'playing' | 'finished'
--
-- Until this runs the app still works: rooms start and finish, but opponents show a score
-- without their question number. Safe to re-run; skips tables that don't exist.
-- =====================================================================

do $$
begin
  if to_regclass('public.room_players') is not null then
    alter table public.room_players add column if not exists progress int not null default 0;
    alter table public.room_players add column if not exists finished_at timestamptz;
    -- Every poll filters on room_code.
    create index if not exists room_players_room_code_idx on public.room_players (room_code);
  else
    raise notice 'skipped room_players: table does not exist';
  end if;

  if to_regclass('public.rooms') is not null then
    alter table public.rooms add column if not exists started_at timestamptz;
    -- A status check that only allows 'open' would stop the host from starting the game.
    alter table public.rooms drop constraint if exists rooms_status_check;
    alter table public.rooms add constraint rooms_status_check
      check (status is null or status in ('open', 'playing', 'finished')) not valid; -- old rows aren't re-checked
  else
    raise notice 'skipped rooms: table does not exist';
  end if;
end $$;
