-- updated_at der Newsletter-Tabellen automatisch pflegen: Die Server-Routen
-- schreiben den Zeitstempel heute bewusst selbst; der Trigger stellt sicher,
-- dass künftige Schreibpfade, die das Feld vergessen, trotzdem korrekte
-- Zeitstempel erzeugen (wie sonst bei den Spielminuten, siehe
-- 20261106090000_auto_calculate_minutes_played.sql).
create or replace function public.newsletter_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger newsletter_settings_touch_updated_at
  before update on public.newsletter_settings
  for each row execute function public.newsletter_touch_updated_at();

create trigger newsletter_subscribers_touch_updated_at
  before update on public.newsletter_subscribers
  for each row execute function public.newsletter_touch_updated_at();
