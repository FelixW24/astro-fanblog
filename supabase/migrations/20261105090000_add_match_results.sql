-- Endergebnis eines Spiels (Tore der Heimmannschaft und der Auswärtsmannschaft).
-- Nur für absolvierte Spiele relevant; beide Werte sind entweder gesetzt oder null.
alter table public.matches
  add column home_goals smallint,
  add column away_goals smallint;

alter table public.matches
  add constraint matches_result_pair_check
  check ((home_goals is null) = (away_goals is null)),
  add constraint matches_result_range_check
  check (
    (home_goals is null or home_goals between 0 and 30)
    and (away_goals is null or away_goals between 0 and 30)
  );
