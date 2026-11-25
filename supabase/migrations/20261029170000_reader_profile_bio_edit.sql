-- Profil-Bearbeitung im Profil-Modal: Leser mit eingerichtetem Profil können
-- ihre Angaben anpassen. Neu ist eine kurze Bio (höchstens 100 Zeichen) in
-- reader_details; update_reader_profile validiert und speichert die Angaben
-- nur für das eigene, bereits angelegte Profil.

alter table public.reader_details
  add column if not exists bio text not null default ''
  check (char_length(bio) <= 100);

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
  if char_length(p_bio) > 100 then
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
