-- Spiele ohne feststehenden Termin ("Noch nicht terminiert" im Gameday-Modal):
-- kickoff_at darf NULL sein. Der bestehende isfinite-Check lässt NULL zu und
-- sperrt weiterhin 'infinity'/'-infinity' als Sentinel aus.
alter table public.matches
  alter column kickoff_at drop not null;
