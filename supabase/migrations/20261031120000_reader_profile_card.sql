-- Öffentliche Profilkarte: Avatare in der Kommentar-Sektion zeigen beim
-- Hover/Klick eine Karte mit Username und Bio. reader_details bleibt über RLS
-- privat; die Security-Definer-Funktion gibt ausschließlich die öffentlichen
-- Kartendaten (Username, Avatar-Variante, Avatar-Pfad, Bio) für ein Profil
-- zurück. Profil-IDs sind UUIDs und damit nicht aufzählbar.

create or replace function public.reader_profile_card(p_user_id uuid)
returns table (username text, avatar text, avatar_url text, bio text)
language sql stable security definer set search_path = '' as $$
  select p.username, p.avatar, p.avatar_url, d.bio
  from public.reader_profiles p
  left join public.reader_details d on d.id = p.id
  where p.id = p_user_id;
$$;

revoke all on function public.reader_profile_card(uuid)
  from public, anon, authenticated;
grant execute on function public.reader_profile_card(uuid)
  to anon, authenticated;
