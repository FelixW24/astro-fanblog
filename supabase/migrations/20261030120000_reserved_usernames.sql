-- Username-Blacklist: reservierte Benutzernamen werden serverseitig erzwungen.
-- profile-Tabelle des Blogs ist public.reader_profiles; der Trigger greift bei
-- INSERT und UPDATE des Username und ist damit nicht client-seitig umgehbar.
-- Redaktionskonten (app_metadata role='admin' oder is_editor) bleiben von der
-- Blacklist ausgenommen: Das tatsächliche Redaktionskonto darf z. B. weiter
-- „redaktion“ heißen, alle anderen Konten nicht.

create table if not exists public.reserved_usernames (
  id uuid primary key default gen_random_uuid(),
  value text not null check (value = lower(btrim(value)) and value <> ''),
  reason text,
  created_at timestamptz not null default now()
);
create unique index if not exists reserved_usernames_value_lower_idx
  on public.reserved_usernames (lower(value));

create table if not exists public.reserved_username_patterns (
  id uuid primary key default gen_random_uuid(),
  pattern text not null check (pattern = btrim(pattern) and pattern <> ''),
  reason text,
  created_at timestamptz not null default now()
);
create unique index if not exists reserved_username_patterns_pattern_idx
  on public.reserved_username_patterns (pattern);

alter table public.reserved_usernames enable row level security;
alter table public.reserved_username_patterns enable row level security;
revoke all on public.reserved_usernames, public.reserved_username_patterns
  from anon, authenticated;
grant select, insert, update, delete
  on public.reserved_usernames, public.reserved_username_patterns
  to authenticated;
drop policy if exists "Editors manage reserved usernames"
  on public.reserved_usernames;
create policy "Editors manage reserved usernames" on public.reserved_usernames
  for all to authenticated
  using ((select private.is_editor()))
  with check ((select private.is_editor()));
drop policy if exists "Editors manage reserved username patterns"
  on public.reserved_username_patterns;
create policy "Editors manage reserved username patterns"
  on public.reserved_username_patterns
  for all to authenticated
  using ((select private.is_editor()))
  with check ((select private.is_editor()));

-- Kontobasierte Redaktionsprüfung (kein JWT verfügbar, wenn Auth-Trigger oder
-- Seed Profile anlegen): app_metadata ist serverseitig verwaltet und nicht
-- durch Nutzer selbst fälschbar.
create or replace function private.is_editorial_account(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user_id is not null and exists (
    select 1 from auth.users u
    where u.id = p_user_id
      and (
        u.raw_app_meta_data ->> 'role' = 'admin'
        or lower(coalesce(u.raw_app_meta_data ->> 'is_editor', '')) = 'true'
      )
  );
$$;
revoke all on function private.is_editorial_account(uuid) from public;

-- Zentrale Prüfung: Normalisierung (Kleinbuchstaben, Trim, Unicode-NFC ab
-- Postgres 13), exakter Abgleich gegen reserved_usernames und Abgleich aller
-- POSIX-Pattern (case-insensitive).
create or replace function public.is_reserved_username(p_username text)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_username text;
begin
  if p_username is null then
    return false;
  end if;
  v_username := lower(btrim(p_username));
  if current_setting('server_version_num', true)::int >= 130000 then
    v_username := lower(btrim(normalize(v_username, nfc)));
  end if;
  if exists (
    select 1 from public.reserved_usernames r
    where lower(r.value) = v_username
  ) then
    return true;
  end if;
  perform 1
  from public.reserved_username_patterns p
  where v_username ~* p.pattern
  limit 1;
  return found;
end;
$$;
revoke all on function public.is_reserved_username(text)
  from public, anon, authenticated;

create or replace function public.enforce_reserved_username()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Bestehende Nutzer werden nicht rückwirkend gesperrt: Ein unveränderter
  -- Username darf weiterhin gespeichert werden, auch wenn er inzwischen
  -- reserviert ist (z. B. Bio-Updates über update_reader_profile).
  if tg_op = 'UPDATE' and new.username is not distinct from old.username then
    return new;
  end if;
  if public.is_reserved_username(new.username)
     and not private.is_editorial_account(new.id) then
    raise exception
      'Dieser Benutzername ist reserviert. Bitte wähle einen anderen Namen.';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_reserved_username()
  from public, anon, authenticated;

drop trigger if exists enforce_reserved_username on public.reader_profiles;
create trigger enforce_reserved_username
  before insert or update of username on public.reader_profiles
  for each row execute function public.enforce_reserved_username();

-- Live-Feedback für das Frontend: true = Name ist frei. Prüft reservierte
-- Namen und Duplikate; das eigene Profil zählt nicht als Duplikat, damit die
-- Namensänderung im Profil-Dialog den bisherigen Namen weiter erlaubt.
create or replace function public.check_username(p_username text)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_username text;
  v_caller uuid := (select auth.uid());
begin
  if p_username is null then
    return false;
  end if;
  v_username := lower(btrim(p_username));
  if public.is_reserved_username(p_username)
     and not private.is_editorial_account(v_caller) then
    return false;
  end if;
  if exists (
    select 1 from public.reader_profiles r
    where lower(r.username) = v_username
      and r.id is distinct from v_caller
  ) then
    return false;
  end if;
  return true;
end;
$$;
revoke all on function public.check_username(text) from public, anon, authenticated;
grant execute on function public.check_username(text) to anon, authenticated;

-- Guard gegen Over-Blocking: Ein Pattern, das einen erwünschten Beispiels-
-- namen trifft, wird abgewiesen. Ungültige Regex-Syntax wirft hier direkt
-- einen Fehler und verhindert so, dass ein kaputtes Pattern jede Registrierung
-- blockiert.
create or replace function public.enforce_reserved_username_pattern()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_allowed text[] := array[
    'normalerfan48', 'kurve48fan', 'effzehfan', 'geissbockfan', 'hennesfan'
  ];
  v_hit text;
begin
  select a into v_hit
  from unnest(v_allowed) as a
  where a ~* new.pattern
  limit 1;
  if v_hit is not null then
    raise exception
      'Das Pattern blockt den legitimen Namen „%“. Bitte präzisiere das Pattern.',
      v_hit;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_reserved_username_pattern()
  from public, anon, authenticated;

drop trigger if exists enforce_reserved_username_pattern
  on public.reserved_username_patterns;
create trigger enforce_reserved_username_pattern
  before insert or update on public.reserved_username_patterns
  for each row execute function public.enforce_reserved_username_pattern();

insert into public.reserved_usernames (value, reason) values
  ('admin', 'System- und Administrationsname'),
  ('administrator', 'System- und Administrationsname'),
  ('administration', 'System- und Administrationsname'),
  ('root', 'System- und Administrationsname'),
  ('superuser', 'System- und Administrationsname'),
  ('sysadmin', 'System- und Administrationsname'),
  ('system', 'System- und Administrationsname'),
  ('support', 'Kontakt-/Support-Impersonation'),
  ('helpdesk', 'Kontakt-/Support-Impersonation'),
  ('service', 'Kontakt-/Support-Impersonation'),
  ('mod', 'Moderations-Impersonation'),
  ('moderator', 'Moderations-Impersonation'),
  ('moderation', 'Moderations-Impersonation'),
  ('api', 'Technischer Kontoname'),
  ('cron', 'Technischer Kontoname'),
  ('login', 'Systemseite'),
  ('signup', 'Systemseite'),
  ('register', 'Systemseite'),
  ('session', 'Systemseite'),
  ('redaktion', 'Redaktions-Impersonation'),
  ('redakteur', 'Redaktions-Impersonation'),
  ('redakteurin', 'Redaktions-Impersonation'),
  ('editor', 'Redaktions-Impersonation (en)'),
  ('presse', 'Redaktions-Impersonation'),
  ('press', 'Redaktions-Impersonation (en)'),
  ('pressesprecher', 'Redaktions-Impersonation'),
  ('news', 'Redaktions-Impersonation'),
  ('newsroom', 'Redaktions-Impersonation'),
  ('blog', 'Marken-Impersonation'),
  ('official', 'Offizialitäts-Verwechslung'),
  ('team', 'Offizialitäts-Verwechslung'),
  ('autor', 'Redaktions-Impersonation'),
  ('author', 'Redaktions-Impersonation (en)'),
  ('journalist', 'Redaktions-Impersonation'),
  ('reporter', 'Redaktions-Impersonation'),
  ('info', 'Kontakt-Impersonation'),
  ('kontakt', 'Kontakt-Impersonation'),
  ('contact', 'Kontakt-Impersonation (en)'),
  ('mail', 'Kontakt-Impersonation'),
  ('email', 'Kontakt-Impersonation'),
  ('noreply', 'Technische Absenderadresse'),
  ('no-reply', 'Technische Absenderadresse'),
  ('postmaster', 'Technische Absenderadresse'),
  ('webmaster', 'Technische Absenderadresse'),
  ('impressum', 'Systemseite'),
  ('agb', 'Systemseite'),
  ('datenschutz', 'Systemseite'),
  ('astro-fanblog', 'Markenschutz'),
  ('block_48', 'Markenschutz'),
  ('astro-fanblog', 'Markenschutz'),
  ('fc', 'Vereinsname'),
  ('fcexample', 'Vereinsname'),
  ('fc-example', 'Vereinsname'),
  ('1fc', 'Vereinsname'),
  ('1fc-example', 'Vereinsname'),
  ('effzeh', 'Vereinsname'),
  ('geissbock', 'Vereinsname/Maskottchen'),
  ('geissboeck', 'Vereinsname/Maskottchen'),
  ('sponsor', 'Kommerzielle Verwechslung'),
  ('werbung', 'Kommerzielle Verwechslung'),
  ('partner', 'Kommerzielle Verwechslung'),
  ('gladbach', 'Derby-Rivale'),
  ('moenchengladbach', 'Derby-Rivale'),
  ('mgladbach', 'Derby-Rivale'),
  ('bmg', 'Derby-Rivale'),
  ('bmg04', 'Derby-Rivale'),
  ('borussia', 'Derby-Rivale'),
  ('borussia04', 'Derby-Rivale'),
  ('fohlen', 'Derby-Rivale'),
  ('fohlenelf', 'Derby-Rivale'),
  ('bayer', 'Derby-Rivale'),
  ('bayer04', 'Derby-Rivale'),
  ('leverkusen', 'Derby-Rivale'),
  ('werkself', 'Derby-Rivale'),
  ('vizekusen', 'Derby-Rivale'),
  ('fortuna', 'Derby-Rivale'),
  ('f95', 'Derby-Rivale'),
  ('duesseldorf', 'Derby-Rivale'),
  ('aachen', 'Derby-Rivale'),
  ('alemannia', 'Derby-Rivale'),
  ('hennes', 'Maskottchen'),
  ('hennes_ix', 'Maskottchen'),
  ('suedkurve', 'FC-bezogener Begriff'),
  ('suederkurve', 'FC-bezogener Begriff'),
  ('wilderhorde', 'Ultras-Gruppierung'),
  ('absteiger', 'Spottname gegen den FC'),
  ('abstieg', 'Spottname gegen den FC'),
  ('zweitliga', 'Spottname gegen den FC'),
  ('2liga', 'Spottname gegen den FC'),
  ('2.bundesliga', 'Spottname gegen den FC'),
  ('relegation', 'Spottname gegen den FC'),
  ('blamage', 'Spottname gegen den FC'),
  ('karnevalsverein', 'Spottname gegen den FC')
on conflict (lower(value)) do nothing;

insert into public.reserved_username_patterns (pattern, reason) values
  ('(adm[i1l]n|redakt[i1][o0]n|bl[o0]ck\s*48)', 'Leetspeak-/Tarn-Varianten von Admin, Redaktion, Astro Fanblog'),
  ('(master|team|official)$', 'Offiziell klingende Endungen wie webmaster oder astro-fanblog_team'),
  ('^fc[-_ ]?example', 'Trennzeichen-Varianten des Vereinsnamens'),
  ('(bmg|bayer|gladbach|leverkusen|fohlen|werkself|fortuna|duesseldorf|bmg04|bayer04)', 'Derby-Rivalen als Namensbestandteil (Troll-Accounts)'),
  ('(absteiger|abstieg|zweitliga|2.?liga|blamage|relegation)', 'Spott- und Abstiegsschelte gegen den FC'),
  ('((geiss|bock|hennes|ziege)[-_ ]?(braten|grill|spies|steak|mist|grillen))', 'Maskottchen-Verhöhnung'),
  ('(effzeh|fcexample|fc[-_ ]?example|1fc|astro-fanblog)[-_ ]?(sucks|scheisse|mist|dreck|toter_verein)', 'Kombinierte FC-Spott-Namen')
on conflict (pattern) do nothing;
