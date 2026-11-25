-- Basis-Statistiken eines Spiels für die öffentliche Spieldetailseite.
-- Alle Werte sind optional (null, solange die Redaktion nichts gepflegt hat).
-- "for" bezieht sich immer auf den FC Example, "against" auf den Gegner —
-- unabhängig vom Spielort; die Anzeige rechnet über matches.is_home um.
alter table public.matches
  add column possession_pct smallint
    check (possession_pct is null or possession_pct between 0 and 100),
  add column xg_for numeric(4, 2)
    check (xg_for is null or xg_for between 0 and 99.99),
  add column xg_against numeric(4, 2)
    check (xg_against is null or xg_against between 0 and 99.99),
  add column shots_for smallint
    check (shots_for is null or shots_for between 0 and 99),
  add column shots_against smallint
    check (shots_against is null or shots_against between 0 and 99),
  add column shots_on_target_for smallint
    check (shots_on_target_for is null or shots_on_target_for between 0 and 99),
  add column shots_on_target_against smallint
    check (shots_on_target_against is null or shots_on_target_against between 0 and 99),
  add column corners_for smallint
    check (corners_for is null or corners_for between 0 and 99),
  add column corners_against smallint
    check (corners_against is null or corners_against between 0 and 99),
  add column fouls_for smallint
    check (fouls_for is null or fouls_for between 0 and 99),
  add column fouls_against smallint
    check (fouls_against is null or fouls_against between 0 and 99),
  add column yellow_cards_for smallint
    check (yellow_cards_for is null or yellow_cards_for between 0 and 99),
  add column yellow_cards_against smallint
    check (yellow_cards_against is null or yellow_cards_against between 0 and 99),
  add column red_cards_for smallint
    check (red_cards_for is null or red_cards_for between 0 and 99),
  add column red_cards_against smallint
    check (red_cards_against is null or red_cards_against between 0 and 99);
