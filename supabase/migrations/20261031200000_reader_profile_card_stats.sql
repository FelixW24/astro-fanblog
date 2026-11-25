-- Profilkarte erweitert: Neben Username, Avatar und Bio zeigt die Karte
-- „Mitglied seit“ (Registrierungsdatum aus auth.users) und die Anzahl der
-- veröffentlichten Kommentare. Auch das Aggregat bleibt öffentlich harmlos;
-- private Details bleiben über RLS geschützt.

-- Die Rückgabespalten ändern sich, daher wird die Funktion ersetzt statt
-- nur aktualisiert (Postgres erlaubt keine OUT-Änderung über CREATE OR
-- REPLACE).
drop function if exists public.reader_profile_card(uuid);
create function public.reader_profile_card(p_user_id uuid)
returns table (
  username text,
  avatar_url text,
  bio text,
  member_since timestamptz,
  comment_count bigint
)
language sql stable security definer set search_path = '' as $$
  select p.username,
         p.avatar_url,
         d.bio,
         u.created_at,
         (
           select count(*)
           from public.comments c
           where c.user_id = p_user_id and c.status = 'published'
         )
  from public.reader_profiles p
  join auth.users u on u.id = p.id
  left join public.reader_details d on d.id = p.id
  where p.id = p_user_id;
$$;

revoke all on function public.reader_profile_card(uuid)
  from public, anon, authenticated;
grant execute on function public.reader_profile_card(uuid)
  to anon, authenticated;
