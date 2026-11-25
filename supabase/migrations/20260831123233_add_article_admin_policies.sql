grant select, insert, update, delete on table public.articles to authenticated;
grant usage, select on sequence public.articles_id_seq to authenticated;

drop policy "Published articles are publicly readable" on public.articles;

create policy "Published articles are publicly readable"
  on public.articles for select to anon
  using (status = 'published' and published_at <= now());

create policy "Authenticated readers and admins can read articles"
  on public.articles for select to authenticated
  using (
    (status = 'published' and published_at <= now())
    or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Admin authors can create articles"
  on public.articles for insert to authenticated
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admin authors can update articles"
  on public.articles for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admin authors can delete articles"
  on public.articles for delete to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
