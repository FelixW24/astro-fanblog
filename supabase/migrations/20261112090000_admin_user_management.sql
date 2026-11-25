-- Benutzerverwaltung in der Redaktion (planungs.md):
-- 1) is_admin kennzeichnet das bestehende Admin-Konto; is_editor bleibt die
--    Rolle fuer den Redaktionszugang.
-- 2) Geistermodus (reader_profiles.is_ghost): Geister duerfen das Forum weiter
--    lesen, aber keine Kommentare/Antworten und keine Bewertungen schreiben.
--    Die Sperre greift im Insert-Trigger (damit auch ueber die submit_comment-
--    RPC), in den RLS-Policies fuer direkte Schreibversuche und in der
--    Kommentaroberflaeche. is_ghost ist ausschliesslich ueber den
--    serverseitigen Admin-Client schreibbar: Die Profil-RPCs der Leser setzen
--    die Spalte nicht und es gibt kein UPDATE-Grant auf reader_profiles.

-- 1) Das bestehende Admin-Konto wird ausdruecklich als Admin festgelegt.
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"is_admin":true}'::jsonb
from private.editor_account e
where e.user_id = u.id;

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_admin":true}'::jsonb
where raw_app_meta_data->>'role' = 'admin';

-- 2) Geisterstatus am Leserprofil.
alter table public.reader_profiles
  add column if not exists is_ghost boolean not null default false;

-- Gemeinsame Pruefung fuer Trigger und Policies (Security Definer, damit auch
-- Aufrufe ohne SELECT-Recht auf reader_profiles - z. B. aus Triggern mit
-- search_path = '' - sicher bleiben; oeffentliche Policies duerfen die Spalte
-- ohnehin direkt lesen).
create or replace function private.is_ghost_reader(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user_id is not null and exists (
    select 1 from public.reader_profiles p
    where p.id = p_user_id and p.is_ghost
  );
$$;
revoke all on function private.is_ghost_reader(uuid) from public;
grant execute on function private.is_ghost_reader(uuid) to authenticated, postgres;

-- Insert-Trigger: gilt fuer Data-API-Inserts und RPCs (submit_comment laeuft
-- ueber denselben Trigger). Neueste Version aus
-- 20260928183519_comment_rate_limits plus Geister-Sperre.
create or replace function private.prepare_comment()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
declare
  checked_at timestamptz;
  minute_hits integer;
  hour_hits integer;
begin
  if auth.uid() is null or new.user_id <> auth.uid() or not exists (
    select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null
  ) then raise exception 'comment_email_required' using errcode = '42501'; end if;
  -- Serialize submissions with moderation bans for this reader.
  perform 1 from public.reader_profiles where id = new.user_id for update;
  if private.is_ghost_reader(new.user_id)
    then raise exception 'comment_ghost' using errcode = '42501'; end if;
  if exists (select 1 from public.comment_bans where user_id = new.user_id and blocked_until > now())
    then raise exception 'comment_banned' using errcode = '42501'; end if;
  if not exists (select 1 from public.articles where id = new.article_id and status = 'published' and published_at <= now())
    then raise exception 'comment_article_unavailable' using errcode = '42501'; end if;
  if new.parent_id is not null and not exists (
    select 1 from public.comments where id = new.parent_id and article_id = new.article_id and status = 'published'
  ) then raise exception 'comment_parent_unavailable' using errcode = '23503'; end if;
  -- Both Data API inserts and RPCs run this trigger. The upsert serializes
  -- counters across transactions; rejected inserts roll their counter back.
  -- Use wall-clock time after acquiring the profile lock, not transaction time.
  checked_at := clock_timestamp();
  insert into private.comment_rate_limits as limits
    (user_id, minute_started_at, minute_count, hour_started_at, hour_count)
  values (new.user_id, checked_at, 1, checked_at, 1)
  on conflict (user_id) do update set
    minute_started_at = case when limits.minute_started_at <= checked_at - interval '1 minute'
      then checked_at else limits.minute_started_at end,
    minute_count = case when limits.minute_started_at <= checked_at - interval '1 minute'
      then 1 else limits.minute_count + 1 end,
    hour_started_at = case when limits.hour_started_at <= checked_at - interval '1 hour'
      then checked_at else limits.hour_started_at end,
    hour_count = case when limits.hour_started_at <= checked_at - interval '1 hour'
      then 1 else limits.hour_count + 1 end
  returning minute_count, hour_count into minute_hits, hour_hits;
  if minute_hits > 10 or hour_hits > 60 then
    raise exception 'comment_rate_limited' using errcode = 'P0001';
  end if;
  -- Literal substring matching: no regex syntax; case-insensitive and NFC-normalized.
  new.status := case when exists (
    select 1 from public.comment_blocklist
    where strpos(lower(normalize(new.body)), lower(normalize(btrim(term)))) > 0
  ) then 'pending' else 'published' end;
  return new;
end;
$$;

-- RLS: direkte Schreibversuche auf comments und comment_votes sperren.
drop policy if exists "Readers comment on published articles" on public.comments;
create policy "Readers comment on published articles" on public.comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and not private.is_ghost_reader((select auth.uid()))
  and exists (
    select 1 from public.articles a
    where a.id = article_id and a.status = 'published' and a.published_at <= now()
  )
);

drop policy if exists "Readers vote" on public.comment_votes;
create policy "Readers vote" on public.comment_votes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and not private.is_ghost_reader((select auth.uid()))
  and exists (
    select 1 from public.comments c
    where c.id = comment_votes.comment_id and c.status = 'published'
  )
);

drop policy if exists "Readers change own vote" on public.comment_votes;
create policy "Readers change own vote" on public.comment_votes for update to authenticated
using (
  user_id = (select auth.uid())
  and not private.is_ghost_reader((select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  and not private.is_ghost_reader((select auth.uid()))
  and exists (
    select 1 from public.comments c
    where c.id = comment_votes.comment_id and c.status = 'published'
  )
);
