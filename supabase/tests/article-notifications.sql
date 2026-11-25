-- RLS für Benachrichtigungs-Einstellungen (article_notification_preferences)
-- und In-App-Benachrichtigungen (notifications): Leser verwalten nur eigene
-- Präferenzen; Benachrichtigungs-Zeilen legen ausschließlich der Service-Role
-- an und Leser dürfen nur read_at setzen.
begin;
do $test$
declare
  reader_a uuid := gen_random_uuid();
  reader_b uuid := gen_random_uuid();
  article_id bigint;
  notification_id bigint;
begin
  insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
    (reader_a, reader_a || '@notifications.invalid', now(), '{}'::jsonb),
    (reader_b, reader_b || '@notifications.invalid', now(), '{}'::jsonb);
  insert into public.reader_profiles(id, username, avatar) values
    (reader_a, 'na_' || substr(replace(reader_a::text, '-', ''),1,20), 'male'),
    (reader_b, 'nb_' || substr(replace(reader_b::text, '-', ''),1,20), 'female');
  insert into public.articles(slug,title,excerpt,content,category,status,published_at)
    values ('notifications-' || reader_a, 'Notification Test', 'Ein ausreichend langer Testteaser.', 'Testinhalt.', 'news', 'published', now() - interval '1 hour')
    returning id into article_id;

  perform set_config('request.jwt.claims', json_build_object('sub', reader_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Eigene Präferenzen anlegen, lesen, ändern und löschen sind erlaubt.
  insert into public.article_notification_preferences(user_id, category, email_enabled, in_app_enabled)
    values (reader_a, 'news', true, true);
  if (select count(*) from public.article_notification_preferences where user_id = reader_a) <> 1
    then raise exception 'Own preference not readable'; end if;
  update public.article_notification_preferences
    set email_enabled = false, in_app_enabled = true, updated_at = now()
    where user_id = reader_a and category = 'news';
  if (select email_enabled from public.article_notification_preferences where user_id = reader_a and category = 'news') <> false
    then raise exception 'Own preference update failed'; end if;
  delete from public.article_notification_preferences where user_id = reader_a and category = 'news';
  if (select count(*) from public.article_notification_preferences where user_id = reader_a) <> 0
    then raise exception 'Own preference delete failed'; end if;
  insert into public.article_notification_preferences(user_id, category, email_enabled, in_app_enabled)
    values (reader_a, 'news', true, false);

  -- Fremde Zeilen und unbekannte Kategorien werden abgewiesen.
  begin
    insert into public.article_notification_preferences(user_id, category)
      values (reader_b, 'news');
    raise exception 'Forged preference accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.article_notification_preferences(user_id, category)
      values (reader_a, 'ungueltig');
    raise exception 'Invalid category accepted';
  exception when check_violation then null; end;

  -- Benachrichtigungen dürfen Leser nicht selbst anlegen oder löschen.
  begin
    insert into public.notifications(user_id, article_id, category, title, slug)
      values (reader_a, article_id, 'news', 'Notification Test', 'notifications-' || reader_a);
    raise exception 'Reader inserted notification';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.notifications where user_id = reader_a;
    raise exception 'Reader deleted notification';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.notifications where user_id = reader_a) <> 0
    then raise exception 'Reader sees no rows yet, but rows leaked'; end if;
  reset role;

  -- Service-Role (Veröffentlichungsprozess) legt die Zeile an.
  set local role service_role;
  insert into public.notifications(user_id, article_id, category, title, slug)
    values (reader_a, article_id, 'news', 'Notification Test', 'notifications-' || reader_a)
    returning id into notification_id;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', reader_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from public.notifications where user_id = reader_a) <> 1
    then raise exception 'Own notification not readable'; end if;

  -- Nur read_at darf geändert werden; andere Spalten und fremde Zeilen nicht.
  update public.notifications set read_at = now() where id = notification_id;
  if (select read_at is null from public.notifications where id = notification_id)
    then raise exception 'Mark as read failed'; end if;
  begin
    update public.notifications set title = 'Tampered' where id = notification_id;
    raise exception 'Reader changed title of notification';
  exception when insufficient_privilege then null; end;
  update public.notifications set read_at = null where user_id = reader_b;
  if found then raise exception 'Reader touched foreign notification'; end if;
  reset role;

  -- Anderer Leser sieht die Benachrichtigung nicht.
  perform set_config('request.jwt.claims', json_build_object('sub', reader_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from public.notifications) <> 0
    then raise exception 'Foreign notifications leaked'; end if;
  if (select count(*) from public.article_notification_preferences where user_id = reader_a) <> 0
    then raise exception 'Foreign preferences leaked'; end if;
  reset role;
end;
$test$;
rollback;
