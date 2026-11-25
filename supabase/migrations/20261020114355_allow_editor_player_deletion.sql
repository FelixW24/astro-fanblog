-- Reuse the existing editor + MFA check. Public/reader deletion stays denied.
grant delete on table public.players to authenticated;

create policy "Admin editors can delete players"
  on public.players
  for delete
  to authenticated
  using ((select private.is_editor()));
