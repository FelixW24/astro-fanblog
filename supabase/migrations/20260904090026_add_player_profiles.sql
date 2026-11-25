alter table public.players
  add column height_cm smallint,
  add column preferred_foot text,
  add column market_value_eur bigint,
  add column profile_image_url text,
  add column profile_image_alt text,
  add column bio text,
  add constraint players_height_valid
    check (height_cm is null or height_cm between 140 and 220),
  add constraint players_preferred_foot_valid
    check (preferred_foot is null or preferred_foot in ('links', 'rechts', 'beidfüßig')),
  add constraint players_market_value_valid
    check (market_value_eur is null or market_value_eur >= 0),
  add constraint players_profile_image_valid
    check (
      profile_image_url is null
      or (
        profile_image_url ~ '^https?://'
        and nullif(btrim(profile_image_alt), '') is not null
      )
    ),
  add constraint players_bio_length
    check (bio is null or char_length(bio) between 10 and 2000);

grant update on table public.players to authenticated;

create policy "Admin editors can update players"
  on public.players for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
