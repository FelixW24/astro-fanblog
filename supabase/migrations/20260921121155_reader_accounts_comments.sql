create table public.reader_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  avatar text not null check (avatar in ('male', 'female'))
);
create table public.reader_details (
  id uuid primary key references public.reader_profiles(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  birth_date date not null check (birth_date between date '1900-01-01' and current_date),
  privacy_acknowledged_at timestamptz not null default now()
);
alter table public.reader_profiles enable row level security;
alter table public.reader_details enable row level security;
revoke all on public.reader_profiles, public.reader_details from anon, authenticated;
grant select on public.reader_profiles to anon, authenticated;
grant select on public.reader_details to authenticated;
create policy "Public reader identities" on public.reader_profiles for select to anon, authenticated using (true);
create policy "Own private details" on public.reader_details for select to authenticated using (id = (select auth.uid()));

-- Auth inserts run without an authenticated JWT. This trigger is not callable
-- through the Data API and may only create the profile for the inserted user.
create function private.create_reader_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_user_meta_data->>'username' is null then return new; end if;
  if new.raw_user_meta_data->>'privacy_acknowledged' is distinct from 'true' then
    raise exception 'Privacy acknowledgement required';
  end if;
  insert into public.reader_profiles(id, username, avatar)
  values (new.id, lower(trim(new.raw_user_meta_data->>'username')), new.raw_user_meta_data->>'avatar');
  insert into public.reader_details(id, full_name, birth_date)
  values (new.id, trim(new.raw_user_meta_data->>'full_name'), (new.raw_user_meta_data->>'birth_date')::date);
  return new;
end;
$$;
revoke all on function private.create_reader_profile() from public, anon, authenticated;
create trigger create_reader_profile after insert on auth.users
for each row execute function private.create_reader_profile();

create table public.comments (
  id bigint generated always as identity primary key,
  article_id bigint not null references public.articles(id) on delete cascade,
  user_id uuid not null references public.reader_profiles(id) on delete cascade,
  parent_id bigint,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (id, article_id),
  foreign key (parent_id, article_id) references public.comments(id, article_id) on delete cascade,
  check (parent_id is null or parent_id < id)
);
create index comments_article_created_idx on public.comments(article_id, created_at, id);
create index comments_user_idx on public.comments(user_id);
create index comments_parent_idx on public.comments(parent_id, article_id);
create table public.comment_votes (
  comment_id bigint not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.reader_profiles(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (comment_id, user_id)
);
create index comment_votes_user_idx on public.comment_votes(user_id);
alter table public.comments enable row level security;
alter table public.comment_votes enable row level security;
revoke all on public.comments, public.comment_votes from anon, authenticated;
grant select on public.comments to anon, authenticated;
grant insert (article_id, user_id, parent_id, body) on public.comments to authenticated;
grant usage on sequence public.comments_id_seq to authenticated;
grant select, insert, delete on public.comment_votes to authenticated;
grant update on public.comment_votes to authenticated;
create policy "Published comments" on public.comments for select to anon, authenticated
using (exists (select 1 from public.articles a where a.id = article_id and a.status = 'published' and a.published_at <= now()));
create policy "Readers comment on published articles" on public.comments for insert to authenticated
with check (user_id = (select auth.uid()) and exists (
  select 1 from public.articles a where a.id = article_id and a.status = 'published' and a.published_at <= now()
));
create policy "Own votes" on public.comment_votes for select to authenticated using (user_id = (select auth.uid()));
create policy "Readers vote" on public.comment_votes for insert to authenticated
with check (user_id = (select auth.uid()) and exists(select 1 from public.comments c where c.id = comment_id));
create policy "Readers change own vote" on public.comment_votes for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and exists(select 1 from public.comments c where c.id = comment_id));
create policy "Readers remove own vote" on public.comment_votes for delete to authenticated using (user_id = (select auth.uid()));

-- Deliberately anonymous aggregate: never reveals individual voting identities.
-- The explicit publication predicate is necessary because this bypasses RLS.
create function private.comment_scores(target_article bigint)
returns table(comment_id bigint, likes bigint, dislikes bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, count(*) filter (where v.value = 1), count(*) filter (where v.value = -1)
  from public.comments c
  join public.articles a on a.id = c.article_id
  left join public.comment_votes v on v.comment_id = c.id
  where a.id = target_article and a.status = 'published' and a.published_at <= now()
  group by c.id;
$$;
revoke all on function private.comment_scores(bigint) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.comment_scores(bigint) to anon, authenticated;
create function public.comment_scores(target_article bigint)
returns table(comment_id bigint, likes bigint, dislikes bigint)
language sql stable security invoker set search_path = '' as $$
  select * from private.comment_scores(target_article);
$$;
revoke all on function public.comment_scores(bigint) from public;
grant execute on function public.comment_scores(bigint) to anon, authenticated;
