-- Vorlagen sollen in der Benennung korrigierbar sein (z. B. Tippfehler).
-- Nur die Spalte name ist änderbar; Merkmale, Position und Diagrammtyp
-- bleiben über die bestehenden Insert-/Delete-Pfade unverändert. Der
-- bestehende Trigger validiert die Merkmale auch bei Updates.
grant update (name) on public.player_chart_templates to authenticated;

create policy "Editors can rename chart templates" on public.player_chart_templates
  for update to authenticated
  using ((select private.is_editor()))
  with check ((select private.is_editor()));
