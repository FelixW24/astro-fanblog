-- The form derives the public icon from M/W/D; existing profile values remain valid.
alter table public.reader_profiles drop constraint reader_profiles_avatar_check;
alter table public.reader_profiles add constraint reader_profiles_avatar_check
  check (avatar in ('male', 'female', 'diverse'));

create or replace function public.complete_reader_profile(
  p_username text,
  p_avatar text,
  p_full_name text,
  p_birth_date date
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

  insert into public.reader_profiles(id, username, avatar)
  values (current_user_id, lower(btrim(p_username)), p_avatar);
  insert into public.reader_details(id, full_name, birth_date)
  values (current_user_id, btrim(p_full_name), p_birth_date);
end;
$$;

revoke all on function public.complete_reader_profile(text, text, text, date) from public, anon;
grant execute on function public.complete_reader_profile(text, text, text, date) to authenticated;
