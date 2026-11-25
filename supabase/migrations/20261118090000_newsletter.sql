-- Newsletter: Abonnements über das Willkommens-Modal auf den öffentlichen
-- Seiten. Adressen laufen ausschließlich über den Service-Role-Client
-- (serverseitige API und Redaktion), damit keine E-Mail-Adressen über das
-- anon/authenticated-Rollen Modell erreichbar sind.
--
-- newsletter_settings enthält nur Anzeigetexte für das Willkommens-Modal und
-- ist öffentlich lesbar; Schreibzugriff haben ausschließlich Redakteure.
create table public.newsletter_settings (
  id boolean primary key default true,
  modal_enabled boolean not null default true,
  newsletter_enabled boolean not null default true,
  heading text not null default 'Willkommen auf Astro Fanblog!',
  intro text not null default 'Schön, dass du hier bist! Astro Fanblog ist ein Studentenprojekt rund um den FC Example.' || chr(10) || chr(10) || 'Wir stecken noch mitten im Aufbau – deshalb kann es passieren, dass mal etwas nicht funktioniert oder Inhalte fehlen. Danke für dein Verständnis! Wenn dir etwas auffällt, melde es uns gerne über „Fehler melden“ im Footer.',
  email_label text not null default 'E-Mail-Adresse für unseren Newsletter',
  email_placeholder text not null default 'du@beispiel.de',
  submit_label text not null default 'Newsletter abonnieren',
  privacy_note text not null default 'Mit dem Abonnieren stimmst du dem Erhalt von Newsletter-E-Mails zu. Du kannst dich jederzeit mit einem Klick über den Abmeldelink in jeder E-Mail wieder abmelden. Mehr dazu in unserer Datenschutzerklärung.',
  success_message text not null default 'Fast geschafft! Wir haben dir eine E-Mail mit einem Bestätigungslink geschickt. Bitte klicke auf den Link, um deine Anmeldung abzuschließen.',
  updated_at timestamptz not null default now(),
  constraint newsletter_settings_singleton check (id = true),
  constraint newsletter_settings_heading_length check (char_length(heading) between 1 and 120),
  constraint newsletter_settings_intro_length check (char_length(intro) between 1 and 2000),
  constraint newsletter_settings_label_length check (
    char_length(email_label) between 1 and 200
    and char_length(email_placeholder) <= 254
    and char_length(submit_label) between 1 and 80
  ),
  constraint newsletter_settings_note_length check (
    char_length(privacy_note) between 1 and 1000
    and char_length(success_message) between 1 and 1000
  )
);

-- Abonnenten. status: pending (Double-Opt-in läuft) -> active (bestätigt)
-- -> unsubscribed (ein Klick auf den signierten Link in der Mail). Eine
-- abgemeldete Adresse bleibt mit Zeitstempel erhalten, damit sie nicht
-- versehentlich erneut angeschrieben wird; eine Löschung ist auf Wunsch über
-- die Redaktion möglich.
create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'pending',
  consent_text text not null default '',
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_subscribers_email_length check (char_length(email) between 3 and 254),
  constraint newsletter_subscribers_status_valid check (status in ('pending', 'active', 'unsubscribed')),
  constraint newsletter_subscribers_consent_length check (char_length(consent_text) <= 1000)
);

create index newsletter_subscribers_status_created_idx
  on public.newsletter_subscribers (status, created_at desc);

alter table public.newsletter_settings enable row level security;
alter table public.newsletter_subscribers enable row level security;

-- Anzeigetexte dürfen alle lesen; Abonnenten-Adressen bleiben dem
-- Service-Role vorbehalten (kein Grant an anon/authenticated).
revoke all on table public.newsletter_settings, public.newsletter_subscribers from anon, authenticated;
grant select on table public.newsletter_settings to anon, authenticated;

create policy "Newsletter settings are public read"
  on public.newsletter_settings
  for select
  to anon, authenticated
  using (true);

-- Nur die Redaktion darf die Texte des Willkommens-Modals ändern.
create policy "Editors manage newsletter settings insert"
  on public.newsletter_settings
  for insert
  to authenticated
  with check ((select private.is_editor()));
create policy "Editors manage newsletter settings update"
  on public.newsletter_settings
  for update
  to authenticated
  using ((select private.is_editor()))
  with check ((select private.is_editor()));
create policy "Editors manage newsletter settings delete"
  on public.newsletter_settings
  for delete
  to authenticated
  using ((select private.is_editor()));

insert into public.newsletter_settings (id) values (true);
