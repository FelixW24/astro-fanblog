-- Neuer Nominierungsstatus „benched“: Der Spieler war auf der Bank, hat aber
-- keine Minute gespielt — 0 Spielminuten, keine Wechselminute, kein
-- Einwechselspieler. „subbed_in“ (Eingewechselt) bleibt der Status für den
-- Einsatz von der Bank mit Einwechselminute.
alter table public.player_match_ratings
  drop constraint player_match_ratings_status_check;

alter table public.player_match_ratings
  add constraint player_match_ratings_status_check
  check (status in ('played', 'subbed_in', 'subbed_off', 'not_nominated', 'benched'));

-- 0 Minuten sind für „Bank“ erlaubt.
alter table public.player_match_ratings
  drop constraint player_match_ratings_minutes_played_check;

alter table public.player_match_ratings
  add constraint player_match_ratings_minutes_played_check
  check (minutes_played is null or minutes_played between 0 and 120);

-- Automatische Spielminuten: „Bank“ ergibt 0 Minuten. Null ist nur bei
-- „Nicht nominiert“ erlaubt — jeder andere Status hat eine berechnete Spielzeit.
alter table public.player_match_ratings
  drop constraint player_match_ratings_minutes_auto_check;

alter table public.player_match_ratings
  add constraint player_match_ratings_minutes_auto_check
  check (
    (status = 'not_nominated' and minutes_played is null)
    or (
      minutes_played is not null
      and (
        (status = 'played' and minutes_played = 90)
        or (status = 'subbed_in' and minutes_played = greatest(1, 90 - sub_minute))
        or (status = 'subbed_off' and minutes_played = sub_minute)
        or (status = 'benched' and minutes_played = 0)
      )
    )
  );

-- Bank heißt: keine Wechselminute und kein Einwechselspieler.
alter table public.player_match_ratings
  add constraint player_match_ratings_benched_clean_check
  check (status <> 'benched' or (sub_minute is null and substituted_by_player_id is null));
