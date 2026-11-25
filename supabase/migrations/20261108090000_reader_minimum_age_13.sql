-- Mindestalter 13 (siehe AGB, Abschnitt „Leserkonto“): Leitplanke auf
-- Datenbankebene zusätzlich zur App-Prüfung – ein handcrafted RPC darf
-- kein Profil unter 13 Jahren anlegen oder speichern. Stichtag ist
-- „heute minus 13 Jahre"; am 13. Geburtstag selbst ist die Registrierung
-- erlaubt (p_birth_date <= Stichtag).

alter table public.reader_details
  drop constraint if exists reader_details_birth_date_check;

alter table public.reader_details
  add constraint reader_details_birth_date_check
    check (
      birth_date between date '1900-01-01'
      and (current_date - interval '13 years')::date
    );

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
  if p_birth_date > (current_date - interval '13 years')::date then
    raise exception 'Minimum age 13 required' using errcode = '22023';
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

create or replace function public.update_reader_profile(
  p_username text,
  p_full_name text,
  p_birth_date date,
  p_bio text default ''
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
    select 1 from public.reader_profiles where id = current_user_id
  ) then
    raise exception 'Profile not set up' using errcode = '42501';
  end if;
  if lower(btrim(p_username)) !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'Invalid username' using errcode = '22023';
  end if;
  if char_length(btrim(p_full_name)) not between 2 and 120 then
    raise exception 'Invalid full name' using errcode = '22023';
  end if;
  if p_birth_date not between date '1900-01-01' and current_date then
    raise exception 'Invalid birth date' using errcode = '22023';
  end if;
  if p_birth_date > (current_date - interval '13 years')::date then
    raise exception 'Minimum age 13 required' using errcode = '22023';
  end if;
  if char_length(p_bio) > 50 then
    raise exception 'Invalid bio' using errcode = '22023';
  end if;

  update public.reader_profiles
  set username = lower(btrim(p_username))
  where id = current_user_id;
  update public.reader_details
  set full_name = btrim(p_full_name),
      birth_date = p_birth_date,
      bio = btrim(p_bio)
  where id = current_user_id;
end;
$$;

revoke all on function public.update_reader_profile(text, text, date, text) from public, anon;
grant execute on function public.update_reader_profile(text, text, date, text) to authenticated;
