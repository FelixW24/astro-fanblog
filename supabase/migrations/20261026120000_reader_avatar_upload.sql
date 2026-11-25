-- Profilbild-Upload: Der Storage-Bucket nimmt pro Nutzer genau eine Datei
-- unter eigenem Pfad auf. Der öffentliche Pfad landet in reader_profiles;
-- schreibbar ist ausschließlich die eigene Zeile und Spalte über die RPC.

alter table public.reader_profiles
  add column if not exists avatar_url text;

alter table public.reader_profiles
  drop constraint if exists reader_profiles_avatar_url_check;

alter table public.reader_profiles
  add constraint reader_profiles_avatar_url_check
  check (
    avatar_url is null
    or avatar_url ~ '^[0-9a-f-]{36}/avatar\.(webp|jpeg|png)$'
  );

insert into storage.buckets (id, name, public)
values ('reader-avatars', 'reader-avatars', true)
on conflict (id) do update set public = true;

create policy "Public reader avatars"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'reader-avatars');

create policy "Own reader avatar insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'reader-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Own reader avatar update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'reader-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'reader-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Own reader avatar delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'reader-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

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

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_reader_avatar_url(text) from public, anon;
grant execute on function public.set_reader_avatar_url(text) to authenticated;
