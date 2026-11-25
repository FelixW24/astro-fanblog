-- Editors maintain loan details from the player profile form.
-- Loans stay publicly readable; writes are limited to editor accounts.
create policy "Admin editors can insert loans"
  on public.loans
  for insert
  to authenticated
  with check ((select private.is_editor()));

create policy "Admin editors can update loans"
  on public.loans
  for update
  to authenticated
  using ((select private.is_editor()))
  with check ((select private.is_editor()));

create policy "Admin editors can delete loans"
  on public.loans
  for delete
  to authenticated
  using ((select private.is_editor()));

grant insert, update, delete on table public.loans to authenticated;
