create table public.articles (
  id bigint generated always as identity primary key,
  slug text not null unique,
  title text not null,
  excerpt text not null,
  content text not null,
  category text not null,
  status text not null default 'draft',
  author text not null default 'Redaktion',
  read_minutes smallint not null default 5,
  is_featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint articles_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint articles_title_length check (char_length(title) between 5 and 180),
  constraint articles_excerpt_length check (char_length(excerpt) between 20 and 360),
  constraint articles_category_valid check (
    category in ('spielbericht-analyse', 'news', 'pk-zusammenfassung', 'transfer', 'weiteres')
  ),
  constraint articles_status_valid check (status in ('draft', 'published', 'archived')),
  constraint articles_read_minutes_valid check (read_minutes between 1 and 60),
  constraint articles_publication_date check (status <> 'published' or published_at is not null)
);

create table public.players (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  shirt_number smallint,
  position text not null,
  nationality text,
  date_of_birth date,
  joined_on date,
  contract_until date,
  squad_status text not null default 'first-team',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint players_name_length check (char_length(name) between 2 and 120),
  constraint players_shirt_number_valid check (shirt_number between 1 and 99),
  constraint players_position_valid check (position in ('torwart', 'abwehr', 'mittelfeld', 'sturm')),
  constraint players_squad_status_valid check (squad_status in ('first-team', 'on-loan', 'academy'))
);

create table public.loans (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.players(id) on delete cascade,
  direction text not null,
  partner_club text not null,
  starts_on date not null,
  ends_on date,
  status text not null default 'active',
  note text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loans_direction_valid check (direction in ('incoming', 'outgoing')),
  constraint loans_status_valid check (status in ('active', 'completed', 'cancelled')),
  constraint loans_dates_valid check (ends_on is null or ends_on >= starts_on),
  constraint loans_partner_club_length check (char_length(partner_club) between 2 and 120)
);

create index articles_published_at_idx
  on public.articles (published_at desc)
  where status = 'published';

create index articles_category_published_at_idx
  on public.articles (category, published_at desc)
  where status = 'published';

create index players_position_number_idx
  on public.players (position, shirt_number)
  where squad_status = 'first-team';

create index loans_player_id_idx on public.loans (player_id);
create index loans_active_direction_idx
  on public.loans (direction, ends_on)
  where status = 'active';

alter table public.articles enable row level security;
alter table public.players enable row level security;
alter table public.loans enable row level security;

create policy "Published articles are publicly readable"
  on public.articles
  for select
  to anon, authenticated
  using (status = 'published' and published_at <= now());

create policy "Squad is publicly readable"
  on public.players
  for select
  to anon, authenticated
  using (true);

create policy "Loans are publicly readable"
  on public.loans
  for select
  to anon, authenticated
  using (true);

revoke all on table public.articles from anon, authenticated;
revoke all on table public.players from anon, authenticated;
revoke all on table public.loans from anon, authenticated;

grant select on table public.articles to anon, authenticated;
grant select on table public.players to anon, authenticated;
grant select on table public.loans to anon, authenticated;
