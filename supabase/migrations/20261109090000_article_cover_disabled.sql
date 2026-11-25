-- Redaktion: Default-Titelbild pro Beitrag deaktivierbar. Wenn gesetzt, hat
-- der Beitrag bewusst kein Bild ( weder Default- noch eigenes Cover).
alter table public.articles
  add column cover_disabled boolean not null default false;
