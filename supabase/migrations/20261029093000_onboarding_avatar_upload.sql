-- Profilbild-Upload im Onboarding: Das Bild wird hochgeladen, bevor die
-- Zeile in reader_profiles existiert. set_reader_avatar_url überspringt
-- das UPDATE deshalb, wenn das Profil noch nicht eingerichtet ist;
-- complete_reader_profile übernimmt den Storage-Pfad optional beim Anlegen.

-- create or replace ersetzt die 4-Argument-Variante nicht, sondern legt
-- zusätzlich eine überladene Funktion an, die PostgREST nicht auflösen
-- kann. Deshalb zuerst die alte Signatur entfernen.
drop function if exists public.complete_reader_profile(text, text, text, date);

create or replace function public.set_reader_avatar_url(p_avatar_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_avatar_url is not null and p_avatar_url !~ (
    '^' || current_user_id::text || '/avatar\.(webp|jpeg|png)$'
  ) then
    raise exception 'Invalid avatar path' using errcode = '22023';
  end if;

  update public.reader_profiles
  set avatar_url = p_avatar_url
  where id = current_user_id;

  -- Ohne Profilzeile (Onboarding) gibt es nichts zu aktualisieren; der Pfad
  -- wird erst mit complete_reader_profile gespeichert.
end;
$$;

revoke all on function public.set_reader_avatar_url(text) from public, anon;
grant execute on function public.set_reader_avatar_url(text) to authenticated;

create or replace function public.complete_reader_profile(
  p_username text,
  p_avatar text,
  p_full_name text,
  p_birth_date date,
  p_avatar_url text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users
    where id = current_user_id and email_confirmed_at is not null
  ) then
    raise exception 'Email confirmation required' using errcode = '42501';
  end if;
  if lower(btrim(p_username)) !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'Invalid username' using errcode = '22023';
  end if;
  if p_avatar is null or p_avatar not in ('male', 'female', 'diverse') then
    raise exception 'Invalid avatar' using errcode = '22023';
  end if;
  if char_length(btrim(p_full_name)) not between 2 and 120 then
    raise exception 'Invalid full name' using errcode = '22023';
  end if;
  if p_birth_date not between date '1900-01-01' and current_date then
    raise exception 'Invalid birth date' using errcode = '22023';
  end if;
  if p_avatar_url is not null and p_avatar_url !~ (
    '^' || current_user_id::text || '/avatar\.(webp|jpeg|png)$'
  ) then
    raise exception 'Invalid avatar path' using errcode = '22023';
  end if;

  insert into public.reader_profiles(id, username, avatar, avatar_url)
  values (
    current_user_id,
    lower(btrim(p_username)),
    p_avatar,
    p_avatar_url
  );
  insert into public.reader_details(id, full_name, birth_date)
  values (current_user_id, btrim(p_full_name), p_birth_date);
end;
$$;

revoke all on function public.complete_reader_profile(text, text, text, date, text) from public, anon;
grant execute on function public.complete_reader_profile(text, text, text, date, text) to authenticated;
