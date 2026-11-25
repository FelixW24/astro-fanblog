begin;
do $test$
declare
  reader uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, email_confirmed_at, created_at, raw_user_meta_data)
  values (reader, reader || '@card.invalid', now(), now(), '{}'::jsonb);
  insert into public.reader_profiles (id, username, avatar)
  values (reader, 'kartentest_' || substr(replace(reader::text, '-', ''), 1, 12), 'male');
  insert into public.reader_details (id, full_name, birth_date, bio)
  values (reader, 'Private Name', '1990-01-01', 'Geissbock-Fan seit Geburt.');
  insert into public.articles (slug, title, excerpt, content, category, status, published_at)
    values ('card-test-' || substr(replace(reader::text, '-', ''), 1, 12),
            'Kartentest', 'Ein ausreichend langer Testteaser.', 'Testinhalt.',
            'news', 'published', now() - interval '1 day');
  -- Kommentare laufen wie in der Anwendung über den Authentifizierten-Pfad;
  -- einer bleibt in Moderation und darf nicht mitzählen.
  perform set_config('request.jwt.claims',
    json_build_object('sub', reader, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.comments (article_id, user_id, body)
    values ((select id from public.articles where slug like 'card-test-%'), reader, 'Mein Kommentar.');
  insert into public.comments (article_id, user_id, body)
    values ((select id from public.articles where slug like 'card-test-%'), reader, 'Noch ein Kommentar.');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  update public.comments set status = 'pending' where body = 'Noch ein Kommentar.';

  -- Die Profilkarte ist öffentlich abrufbar und nennt nur Kartendaten:
  -- Username, Bio, Registrierungsdatum und veröffentlichte Kommentare.
  set local role anon;
  if (select bio from public.reader_profile_card(reader) where username is not null)
       is distinct from 'Geissbock-Fan seit Geburt.' then
    raise exception 'Public profile card missing bio';
  end if;
  if (select comment_count from public.reader_profile_card(reader))
       is distinct from 1 then
    raise exception 'Comment count must only count published comments';
  end if;
  if (select member_since is null from public.reader_profile_card(reader)) then
    raise exception 'Membership date missing';
  end if;
  if (select count(*) from public.reader_profile_card(gen_random_uuid())) <> 0 then
    raise exception 'Unknown profile returned a card';
  end if;

  -- Private Details bleiben trotz Karte der Redaktion und dem Profil selbst
  -- vorbehalten.
  begin
    perform 1 from public.reader_details limit 1;
    raise exception 'Anonymous private details access';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$test$;
rollback;
