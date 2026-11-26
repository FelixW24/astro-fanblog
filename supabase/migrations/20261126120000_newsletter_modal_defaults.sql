-- Willkommens-Modal: Default-Texte an die eigene Fanblog-Stimme angepasst
-- (weg vom bisherigen „Studentenprojekt“-Wording, siehe defaultNewsletterSettings
-- in src/lib/newsletter.ts).
alter table public.newsletter_settings
  alter column heading set default 'Hallo vom Astro Fanblog!',
  alter column intro set default 'Astro Fanblog ist ein offenes Fanblog-Projekt rund um den FC Example — von Fans geschrieben, für Fans gemacht.' || chr(10) || chr(10) || 'Manches ist noch im Aufbau, deshalb kann gelegentlich etwas fehlen oder haken. Danke für dein Verständnis! Wenn dir etwas auffällt, melde es uns gerne über „Fehler melden“ im Footer.';
