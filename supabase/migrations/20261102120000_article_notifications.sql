-- Benachrichtigungen für neue Beiträge: Leserkonten wählen pro Kategorie,
-- ob sie per E-Mail und/oder in der Plattform (Glocken-Symbol) informiert
-- werden wollen. Es existiert höchstens eine Zeile pro Konto und Kategorie;
-- abgewählte Kategorien haben beide Schalter auf false.
create table public.article_notification_preferences (
  user_id uuid not null references public.reader_profiles(id) on delete cascade,
  category text not null,
  email_enabled boolean not null default false,
  in_app_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, category),
  constraint article_notification_preferences_category_valid check (
    category in ('spielbericht-analyse', 'news', 'pk-zusammenfassung', 'transfer', 'weiteres')
  )
);

-- In-App-Benachrichtigungen. Zeilen werden ausschließlich serverseitig beim
-- Veröffentlichen eines Beitrags über den Service-Role-Client angelegt;
-- Leser können eigene Zeilen nur lesen und als gelesen markieren.
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.reader_profiles(id) on delete cascade,
  article_id bigint not null references public.articles(id) on delete cascade,
  category text not null,
  title text not null check (char_length(title) between 5 and 180),
  slug text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.article_notification_preferences enable row level security;
alter table public.notifications enable row level security;

revoke all on table public.article_notification_preferences, public.notifications from anon, authenticated;
grant select, insert, update, delete on table public.article_notification_preferences to authenticated;
grant select on table public.notifications to authenticated;
-- Leser dürfen ausschließlich read_at selbst setzen (als gelesen markieren).
grant update (read_at) on table public.notifications to authenticated;

create policy "Own notification preferences select"
  on public.article_notification_preferences
  for select
  to authenticated
  using (user_id = (select auth.uid()));
create policy "Own notification preferences insert"
  on public.article_notification_preferences
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));
create policy "Own notification preferences update"
  on public.article_notification_preferences
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Own notification preferences delete"
  on public.article_notification_preferences
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Own notifications"
  on public.notifications
  for select
  to authenticated
  using (user_id = (select auth.uid()));
create policy "Mark own notifications read"
  on public.notifications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
