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
  -- An explicit JSON id updates an existing profile. The two-argument API
  -- and return type remain compatible with the profile creation form.
  if p_player ? 'id' then
    update public.players
    set
      slug = p_player ->> 'slug',
      name = p_player ->> 'name',
      shirt_number = nullif(p_player ->> 'shirt_number', '')::smallint,
      position = p_player ->> 'position',
      nationality = nullif(p_player ->> 'nationality', ''),
      date_of_birth = nullif(p_player ->> 'date_of_birth', '')::date,
      joined_on = nullif(p_player ->> 'joined_on', '')::date,
      contract_until = nullif(p_player ->> 'contract_until', '')::date,
      squad_status = p_player ->> 'squad_status',
      height_cm = nullif(p_player ->> 'height_cm', '')::smallint,
      preferred_foot = nullif(p_player ->> 'preferred_foot', ''),
      market_value_eur = nullif(p_player ->> 'market_value_eur', '')::integer,
      profile_image_url = nullif(p_player ->> 'profile_image_url', ''),
      profile_image_alt = nullif(p_player ->> 'profile_image_alt', ''),
      bio = nullif(p_player ->> 'bio', ''),
      profile_slogan = coalesce(nullif(p_player ->> 'profile_slogan', ''), E'Immer\nfür Kölle.'),
      updated_at = coalesce((p_player ->> 'updated_at')::timestamptz, now())
    where id = (p_player ->> 'id')::bigint
    returning id into new_player_id;
    if not found then
      raise exception 'Spielerprofil nicht gefunden oder keine Berechtigung.';
    end if;
  else
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

  end if;

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


-- Keep RLS in force; only authenticated callers may execute the operation.
revoke all on function public.create_player_profile(jsonb, jsonb) from public, anon;
grant execute on function public.create_player_profile(jsonb, jsonb) to authenticated;
