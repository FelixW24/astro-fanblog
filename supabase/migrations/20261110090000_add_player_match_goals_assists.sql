-- Tore und Vorlagen pro Spiel und Spieler: Die Redaktion trägt sie im
-- Verlaufseintrag (player_match_ratings) jedes Spiels ein, Standardwert 0.
alter table public.player_match_ratings
  add column goals smallint not null default 0,
  add column assists smallint not null default 0,
  add constraint player_match_ratings_goals_valid check (goals between 0 and 30),
  add constraint player_match_ratings_assists_valid check (assists between 0 and 30);

-- „Nicht nominiert“ und „Bank“ heißen weiterhin: keine Leistungsdaten —
-- dazu gehören jetzt auch Tore und Vorlagen (immer 0).
alter table public.player_match_ratings
  drop constraint player_match_ratings_not_nominated_clean_check,
  add constraint player_match_ratings_not_nominated_clean_check
    check (
      status <> 'not_nominated'
      or (
        rating is null
        and minutes_played is null
        and sub_minute is null
        and substituted_by_player_id is null
        and goals = 0
        and assists = 0
      )
    );

alter table public.player_match_ratings
  drop constraint player_match_ratings_benched_clean_check,
  add constraint player_match_ratings_benched_clean_check
    check (
      status <> 'benched'
      or (sub_minute is null and substituted_by_player_id is null and goals = 0 and assists = 0)
    );

-- Spieler-Gesamtstats: Tore und Vorlagen aller Verlaufseinträge werden auf
-- dem Spieler mitgeführt und per Trigger aus dem Verlauf nachberechnet.
alter table public.players
  add column total_goals smallint not null default 0,
  add column total_assists smallint not null default 0,
  add constraint players_match_totals_valid
    check (total_goals >= 0 and total_assists >= 0);

create function private.recalculate_player_match_totals(p_player_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.players
  set
    total_goals = coalesce(
      (select sum(r.goals) from public.player_match_ratings r where r.player_id = p_player_id),
      0
    ),
    total_assists = coalesce(
      (select sum(r.assists) from public.player_match_ratings r where r.player_id = p_player_id),
      0
    )
  where id = p_player_id;
end;
$$;

create function private.player_match_ratings_recalculate_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'DELETE' then
    perform private.recalculate_player_match_totals(new.player_id);
  end if;
  if tg_op <> 'INSERT' and (tg_op = 'DELETE' or old.player_id is distinct from new.player_id) then
    perform private.recalculate_player_match_totals(old.player_id);
  end if;
  return null;
end;
$$;

revoke all on function private.recalculate_player_match_totals(bigint) from public;
revoke all on function private.player_match_ratings_recalculate_totals() from public;

create trigger player_match_ratings_recalculate_totals
after insert or update or delete on public.player_match_ratings
for each row execute function private.player_match_ratings_recalculate_totals();

-- Bestehende Spieler auf die berechneten Summen heben (aktuell überall 0).
update public.players p
set
  total_goals = coalesce(
    (select sum(r.goals) from public.player_match_ratings r where r.player_id = p.id),
    0
  ),
  total_assists = coalesce(
    (select sum(r.assists) from public.player_match_ratings r where r.player_id = p.id),
    0
  );
