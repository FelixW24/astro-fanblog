-- Das Ja/Nein-Dropdown vor der Newsletter-Anmeldung ist durch das dezente
-- Brief-Icon in der Modal-Ecke ersetzt worden (Klick klappt das E-Mail-Feld
-- auf); die drei Auswahltexte werden dafür nicht mehr gebraucht und fallen
-- samt Constraint weg.
alter table public.newsletter_settings
  drop constraint newsletter_settings_signup_length;

alter table public.newsletter_settings
  drop column signup_prompt,
  drop column signup_choice_no,
  drop column signup_choice_yes;
