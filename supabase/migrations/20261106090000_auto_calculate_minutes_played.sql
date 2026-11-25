-- Spielminuten werden nicht mehr manuell erfasst, sondern aus dem
-- Nominierungsstatus und der Wechselminute berechnet: Stammspieler 90 Min
-- (reguläre Spieldauer), von der Bank 90 minus Einwechselminute,
-- ausgewechselt die Auswechselminute, „Nicht nominiert“ null. Die bisherige
-- Kopplung von Note und Spielminuten entfällt; bestehende Einträge werden auf
-- die berechnete Spielzeit umgestellt.
alter table public.player_match_ratings
  drop constraint player_match_ratings_rating_minutes_check;

update public.player_match_ratings
set minutes_played = case
      when status = 'played' then 90
      when status = 'subbed_in' then greatest(1, 90 - sub_minute)
      when status = 'subbed_off' then sub_minute
      else null
    end,
    updated_at = now()
where status <> 'not_nominated';

-- Invariante: Sind Spielminuten gepflegt, müssen sie zur Berechnung passen.
alter table public.player_match_ratings
  add constraint player_match_ratings_minutes_auto_check
  check (
    minutes_played is null
    or (status = 'played' and minutes_played = 90)
    or (status = 'subbed_in' and minutes_played = greatest(1, 90 - sub_minute))
    or (status = 'subbed_off' and minutes_played = sub_minute)
  );
