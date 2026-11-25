alter table public.players
  add column is_injured boolean not null default false,
  add column injury_since date,
  add column injury_until date,
  add constraint players_injury_dates_valid check (
    (not is_injured and injury_since is null and injury_until is null)
    or (is_injured and injury_since is not null
      and (injury_until is null or injury_until >= injury_since))
  );

-- Keep the existing create RPC compatible, including subsequent chart features.
-- Both operations run in the same transaction, so failure rolls back the profile.
create function public.create_player_profile_with_availability(p_player jsonb, p_chart jsonb)
returns bigint language plpgsql security invoker set search_path = ''
as $$
declare player_id bigint;
begin
  player_id := public.create_player_profile(p_player, p_chart);
  update public.players set
    is_injured = coalesce((p_player ->> 'is_injured')::boolean, false),
    injury_since = nullif(p_player ->> 'injury_since', '')::date,
    injury_until = nullif(p_player ->> 'injury_until', '')::date
  where id = player_id;
  return player_id;
end;
$$;
revoke all on function public.create_player_profile_with_availability(jsonb, jsonb) from public;
grant execute on function public.create_player_profile_with_availability(jsonb, jsonb) to authenticated;

-- Prevent accidental duplicate identities even when a different slug is used.
-- Same-name people remain possible when both distinct birth dates are supplied.
-- Existing rows are never silently merged or removed.
create function private.guard_player_identity()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare normalized_name text := lower(regexp_replace(btrim(new.name), '\s+', ' ', 'g'));
begin
  if tg_op = 'UPDATE' and new.name is not distinct from old.name
    and new.date_of_birth is not distinct from old.date_of_birth then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(normalized_name, 0));
  if exists (
    select 1 from public.players p
    where p.id <> new.id
      and lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = normalized_name
      and (p.date_of_birth is null or new.date_of_birth is null or p.date_of_birth = new.date_of_birth)
  ) then
    raise exception 'Für diesen Spieler existiert bereits ein Profil. Bitte bearbeite den vorhandenen Eintrag. Bei Namensgleichheit müssen beide Geburtsdaten hinterlegt sein.'
      using errcode = '23505';
  end if;
  return new;
end;
$$;
create trigger players_guard_identity
before insert or update of name, date_of_birth on public.players
for each row execute function private.guard_player_identity();

revoke all on function private.guard_player_identity() from public, anon, authenticated;
