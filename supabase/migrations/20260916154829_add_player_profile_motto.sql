alter table public.players
  add column profile_slogan text not null default E'Immer\nfür Kölle.',
  add constraint players_profile_slogan_length
    check (char_length(btrim(profile_slogan)) between 3 and 120);

create or replace function public.create_player_profile(
  p_player jsonb,
  p_chart jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_player_id bigint;
begin
  insert into public.players (
    slug,
    name,
    shirt_number,
    position,
    nationality,
    date_of_birth,
    joined_on,
    contract_until,
    squad_status,
    height_cm,
    preferred_foot,
    market_value_eur,
    profile_image_url,
    profile_image_alt,
    bio,
    profile_slogan,
    updated_at
  )
  values (
    p_player ->> 'slug',
    p_player ->> 'name',
    nullif(p_player ->> 'shirt_number', '')::smallint,
    p_player ->> 'position',
    nullif(p_player ->> 'nationality', ''),
    nullif(p_player ->> 'date_of_birth', '')::date,
    nullif(p_player ->> 'joined_on', '')::date,
    nullif(p_player ->> 'contract_until', '')::date,
    p_player ->> 'squad_status',
    nullif(p_player ->> 'height_cm', '')::smallint,
    nullif(p_player ->> 'preferred_foot', ''),
    nullif(p_player ->> 'market_value_eur', '')::integer,
    nullif(p_player ->> 'profile_image_url', ''),
    nullif(p_player ->> 'profile_image_alt', ''),
    nullif(p_player ->> 'bio', ''),
    coalesce(nullif(p_player ->> 'profile_slogan', ''), E'Immer\nfür Kölle.'),
    coalesce((p_player ->> 'updated_at')::timestamptz, now())
  )
  returning id into new_player_id;

  insert into public.player_charts (
    player_id,
    chart_type,
    title,
    description,
    metrics,
    sort_order
  )
  values (
    new_player_id,
    coalesce(nullif(p_chart ->> 'chart_type', ''), 'radar'),
    p_chart ->> 'title',
    nullif(p_chart ->> 'description', ''),
    p_chart -> 'metrics',
    coalesce(nullif(p_chart ->> 'sort_order', '')::smallint, 1)
  );

  return new_player_id;
end;
$$;
