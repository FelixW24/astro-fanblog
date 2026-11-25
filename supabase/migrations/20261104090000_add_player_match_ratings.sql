-- Verlaufseintrag eines Spielers pro Spiel: Nominierungsstatus, individuelle
-- Leistungsnote (Freitext), Spielminuten, Wechselminute und Einwechselspieler.
-- Wird in der Redaktion im Player-Profile-Editor gepflegt; die Spiele selbst
-- kommen automatisch aus dem Vereins-Spielplan (matches).
create table public.player_match_ratings (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete cascade,
  rating text check (rating is null or char_length(rating) between 1 and 20),
  status text not null default 'played' check (status in ('played', 'subbed_in', 'subbed_off', 'not_nominated')),
  minutes_played smallint check (minutes_played is null or minutes_played between 1 and 120),
  sub_minute smallint check (sub_minute is null or sub_minute between 1 and 120),
  substituted_by_player_id bigint references public.players(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_match_ratings_unique_per_match unique (match_id, player_id),
  -- Note und Spielminuten werden zusammen gepflegt.
  constraint player_match_ratings_rating_minutes_check
    check ((rating is null) = (minutes_played is null)),
  -- Wechselminute genau bei Ein-/Auswechslung.
  constraint player_match_ratings_sub_minute_status_check
    check ((sub_minute is not null) = (status in ('subbed_in', 'subbed_off'))),
  -- Einwechselspieler nur beim Auswechseln (Pflicht nur in der App, damit das
  -- Löschen des Einwechselspielers den Eintrag nicht blockiert), nie der Spieler selbst.
  constraint player_match_ratings_replacement_status_check
    check (substituted_by_player_id is null or status = 'subbed_off'),
  constraint player_match_ratings_replacement_not_self_check
    check (substituted_by_player_id is null or substituted_by_player_id <> player_id),
  -- Nicht nominiert heißt: keine Leistungsdaten.
  constraint player_match_ratings_not_nominated_clean_check
    check (status <> 'not_nominated' or (rating is null and minutes_played is null and sub_minute is null and substituted_by_player_id is null))
);

create index player_match_ratings_player_idx
  on public.player_match_ratings (player_id, match_id);

alter table public.player_match_ratings enable row level security;

revoke all on table public.player_match_ratings from anon, authenticated;
grant select on table public.player_match_ratings to anon, authenticated;
grant insert, update, delete on table public.player_match_ratings to authenticated;
grant usage, select on sequence public.player_match_ratings_id_seq to authenticated;

create policy "Player match ratings are publicly readable"
  on public.player_match_ratings for select to anon, authenticated
  using (true);

create policy "Admin editors can insert player match ratings"
  on public.player_match_ratings for insert to authenticated
  with check ((select private.is_editor()));

create policy "Admin editors can update player match ratings"
  on public.player_match_ratings for update to authenticated
  using ((select private.is_editor()))
  with check ((select private.is_editor()));

create policy "Admin editors can delete player match ratings"
  on public.player_match_ratings for delete to authenticated
  using ((select private.is_editor()));
