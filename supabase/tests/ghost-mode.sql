begin;
-- Geistermodus (reader_profiles.is_ghost): Geister duerfen das Forum lesen,
-- aber keine Kommentare/Antworten und keine Bewertungen schreiben - weder per
-- RPC noch per direktem Datenbankzugriff. is_ghost ist fuer Leser nicht
-- schreibbar. Beim Deaktivieren ist die Schreibfunktion wieder freigegeben.
do $test$
declare
  ghost_id uuid := gen_random_uuid();
  reader_id uuid := gen_random_uuid();
  article_id bigint;
  v_comment_id bigint;
  msg text;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
    (ghost_id,ghost_id || '@ghost.invalid',now(),'{}'),
    (reader_id,reader_id || '@ghost.invalid',now(),'{}');
  insert into public.reader_profiles(id,username,avatar) values
    (ghost_id,'g_' || substr(replace(ghost_id::text,'-',''),1,20),'male'),
    (reader_id,'r_' || substr(replace(reader_id::text,'-',''),1,20),'male');
  insert into public.reader_details(id,full_name,birth_date) values
    (ghost_id,'Geist Nutzer','1990-01-01'),
    (reader_id,'Normaler Leser','1990-01-01');
  insert into public.articles(slug,title,excerpt,content,category,status,published_at)
    values ('ghost-' || ghost_id,'Geistertest','Ein ausreichend langer Teaser.','Testinhalt.','news','published',now() - interval '1 day')
    returning id into article_id;

  -- Normaler Leser kommentiert und bewertet als Referenz.
  perform set_config('request.jwt.claims', json_build_object('sub',reader_id,'role','authenticated')::text,true);
  set local role authenticated;
  select id into v_comment_id from public.submit_comment(article_id,'Kommentar eines Lesers');
  insert into public.comment_votes(comment_id,user_id,value) values(v_comment_id,reader_id,1);
  reset role;

  -- Geistermodus aktivieren (nur serverseitig als postgres moeglich).
  update public.reader_profiles set is_ghost = true where id = ghost_id;
  -- Vorab eine Bewertung des Geisters, damit UPDATE geprueft werden kann.
  insert into public.comment_votes(comment_id,user_id,value) values(v_comment_id,ghost_id,-1);

  perform set_config('request.jwt.claims', json_build_object('sub',ghost_id,'role','authenticated')::text,true);
  set local role authenticated;

  -- Lesen bleibt moeglich.
  if not exists(select 1 from public.comments where id = v_comment_id and status = 'published') then
    raise exception 'Ghost read of comments blocked';
  end if;
  if not exists(select 1 from public.reader_profiles where id = ghost_id and is_ghost) then
    raise exception 'Ghost profile read blocked';
  end if;

  -- Direkter Schreibversuch: RLS sperrt.
  begin
    insert into public.comments(article_id,user_id,body) values(article_id,ghost_id,'Geister-Kommentar');
    raise exception 'Ghost direct insert accepted';
  exception when insufficient_privilege then null; end;
  -- RPC Kommentar: Trigger sperrt mit eigener Meldung.
  begin
    perform public.submit_comment(article_id,'Geister-RPC');
    raise exception 'Ghost RPC accepted';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg <> 'comment_ghost' then raise exception 'Unexpected RPC error: %', msg; end if;
  end;
  -- Antwort: derselbe Sperrweg.
  begin
    perform public.submit_comment(article_id,'Geister-Antwort',v_comment_id);
    raise exception 'Ghost reply accepted';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg <> 'comment_ghost' then raise exception 'Unexpected reply error: %', msg; end if;
  end;
  -- Bewertungen: Insert und Update sind gesperrt, eigenes Entfernen erlaubt.
  begin
    insert into public.comment_votes(comment_id,user_id,value) values(v_comment_id,ghost_id,1);
    raise exception 'Ghost vote insert accepted';
  exception when insufficient_privilege then null; end;
  -- RLS-Update mit falscher USING-Klausel wirft keinen Fehler, sondern
  -- affects 0 Zeilen: der Wert darf sich nicht geaendert haben.
  update public.comment_votes set value = 1 where comment_id = v_comment_id and user_id = ghost_id;
  if exists(select 1 from public.comment_votes where comment_id = v_comment_id and user_id = ghost_id and value = 1) then
    raise exception 'Ghost vote update accepted';
  end if;
  delete from public.comment_votes where comment_id = v_comment_id and user_id = ghost_id;
  -- is_ghost ist ueber Leser-Schreibwege nicht aenderbar.
  begin
    update public.reader_profiles set is_ghost = false where id = ghost_id;
    raise exception 'Ghost could unset own ghost flag';
  exception when insufficient_privilege then null; end;
  perform public.update_reader_profile('g_' || substr(replace(ghost_id::text,'-',''),1,20),'Geist Nutzer','1990-01-01','');
  if not exists(select 1 from public.reader_profiles where id = ghost_id and is_ghost) then
    raise exception 'update_reader_profile changed is_ghost';
  end if;
  reset role;

  -- Deaktivieren gibt die Schreibfunktion wieder frei.
  update public.reader_profiles set is_ghost = false where id = ghost_id;
  perform set_config('request.jwt.claims', json_build_object('sub',ghost_id,'role','authenticated')::text,true);
  set local role authenticated;
  if not exists(select 1 from public.submit_comment(article_id,'Nach dem Geistermodus')) then
    raise exception 'Ghost still blocked after deactivation';
  end if;
  insert into public.comment_votes(comment_id,user_id,value) values(v_comment_id,ghost_id,1);
  reset role;
end;
$test$;
rollback;
