-- Das Newsletter-Anmeldeformular im Willkommens-Modal ist standardmäßig
-- eingeklappt: Erst die aktive Auswahl „Ja, Newsletter abonnieren“ im
-- Dropdown blendet das E-Mail-Feld ein. Die drei Texte sind – wie alle
-- Modal-Texte – redaktionell steuerbar.
alter table public.newsletter_settings
  add column signup_prompt text not null default 'Möchtest du auf dem Laufenden bleiben?',
  add column signup_choice_no text not null default 'Nein danke, einfach weiterlesen',
  add column signup_choice_yes text not null default 'Ja, Newsletter abonnieren';

alter table public.newsletter_settings
  add constraint newsletter_settings_signup_length check (
    char_length(signup_prompt) between 1 and 200
    and char_length(signup_choice_no) between 1 and 200
    and char_length(signup_choice_yes) between 1 and 200
  );
