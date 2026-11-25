-- Tracking: Beitrags-Views (mind. 30 Sekunden Lesezeit) und Website-Besuche.
-- Beide Tabellen sind rein append-only; anonyme Besucher duerfen nur
-- einfuegen, die Redaktion (admin) darf lesen.
create table public.article_views (
  id bigint generated always as identity primary key,
  article_id bigint not null references public.articles(id) on delete cascade,
  visitor_key text not null check (char_length(visitor_key) between 8 and 80),
  viewed_at timestamptz not null default now(),
  unique (article_id, visitor_key)
);
create index article_views_viewed_at_idx on public.article_views (viewed_at);

create table public.page_views (
  id bigint generated always as identity primary key,
  path text not null check (char_length(path) between 1 and 500),
  visitor_key text not null check (char_length(visitor_key) between 8 and 80),
  viewed_at timestamptz not null default now()
);
create index page_views_viewed_at_idx on public.page_views (viewed_at);
create index page_views_path_idx on public.page_views (path);

alter table public.article_views enable row level security;
alter table public.page_views enable row level security;

revoke all on public.article_views, public.page_views from anon, authenticated;
grant insert on public.article_views to anon, authenticated;
grant insert on public.page_views to anon, authenticated;
grant usage on sequence public.article_views_id_seq to anon, authenticated;
grant usage on sequence public.page_views_id_seq to anon, authenticated;
grant select on public.article_views to authenticated;
grant select on public.page_views to authenticated;

create policy "Anyone can record article views"
  on public.article_views for insert to anon, authenticated
  with check (exists (
    select 1 from public.articles a
    where a.id = article_id and a.status = 'published' and a.published_at <= now()
  ));

create policy "Anyone can record page views"
  on public.page_views for insert to anon, authenticated
  with check (true);

create policy "Admins can read article views"
  on public.article_views for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can read page views"
  on public.page_views for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
