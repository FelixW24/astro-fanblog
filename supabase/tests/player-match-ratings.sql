-- Isolated fixtures: all changes, including the configured editor, roll back.
do $test$
declare
  editor uuid := gen_random_uuid();
  other_user uuid := gen_random_uuid();
  v_player_id bigint;
  v_replacement_id bigint;
  v_match_id bigint;
  v_rating_id bigint;
  role_name text;
begin
  begin
    insert into auth.users(id,email,raw_app_meta_data) values
      (editor,'ratings-editor@audit.invalid','{"role":"admin","is_editor":true}'),
      (other_user,'ratings-other@audit.invalid','{"role":"admin"}');
    insert into private.editor_account(singleton,user_id,email)
      values(true,editor,'ratings-editor@audit.invalid')
      on conflict(singleton) do update set user_id=excluded.user_id,email=excluded.email;
    perform set_config('request.jwt.claims',json_build_object('sub',editor,'role','authenticated','aal','aal2')::text,true);
    set local role authenticated;
    insert into public.players(slug,name,position,squad_status,profile_slogan)
      values('ratings-test-a-' || replace(gen_random_uuid()::text,'-',''),'Ratings A','mittelfeld','first-team','Immer für Kölle.')
      returning id into v_player_id;
    -- zweiter Spieler als Einwechselspieler
    insert into public.players(slug,name,position,squad_status,profile_slogan)
      values('ratings-test-b-' || replace(gen_random_uuid()::text,'-',''),'Ratings B','abwehr','first-team','Immer für Kölle.')
      returning id into v_replacement_id;
    insert into public.matches(opponent,opponent_short,venue,kickoff_at)
      values('Ratings Gegner','RTG','Teststadion',now()-interval '1 minute') returning id into v_match_id;

    insert into public.player_match_ratings(match_id,player_id,rating,minutes_played,note)
      values(v_match_id,v_player_id,'2,5',90,'Starke Leistung') returning id into v_rating_id;
    if not exists(select 1 from public.player_match_ratings where id=v_rating_id and rating='2,5' and minutes_played=90 and status='played') then
      raise exception 'Editor cannot insert rating';
    end if;
    update public.player_match_ratings set status='subbed_in', sub_minute=67, minutes_played=23 where id=v_rating_id;
    if not found or (select sub_minute from public.player_match_ratings where id=v_rating_id) <> 67 then
      raise exception 'Editor cannot mark subbed in';
    end if;
    update public.player_match_ratings set status='subbed_off', sub_minute=75, minutes_played=75, substituted_by_player_id=v_replacement_id where id=v_rating_id;
    if not found or (select substituted_by_player_id from public.player_match_ratings where id=v_rating_id) <> v_replacement_id then
      raise exception 'Editor cannot mark subbed off with replacement';
    end if;

    -- Freitext-Note: höchstens 20 Zeichen.
    begin
      update public.player_match_ratings set rating=repeat('2',21) where id=v_rating_id;
      raise exception 'Overlong rating was accepted';
    exception when check_violation then null; end;
    -- Spielminuten sind automatisch berechnet: null nur bei „Nicht nominiert“.
    begin
      update public.player_match_ratings set rating='3', minutes_played=null where id=v_rating_id;
      raise exception 'Minutes null without not_nominated was accepted';
    exception when check_violation then null; end;
    -- Die Note ist freiwillig: Eintrag ohne Note, aber mit berechneten Minuten.
    update public.player_match_ratings set rating=null, minutes_played=75 where id=v_rating_id;
    if (select rating from public.player_match_ratings where id=v_rating_id) is not null then
      raise exception 'Rating was not cleared';
    end if;
    update public.player_match_ratings set rating='3' where id=v_rating_id;
    -- Wechselminute nur bei Ein-/Auswechslung.
    begin
      update public.player_match_ratings set status='played', minutes_played=90, sub_minute=null, substituted_by_player_id=null where id=v_rating_id;
      update public.player_match_ratings set sub_minute=60 where id=v_rating_id;
      raise exception 'Sub minute without substitution status was accepted';
    exception when check_violation then null; end;
    begin
      update public.player_match_ratings set status='subbed_in', sub_minute=null, substituted_by_player_id=null where id=v_rating_id;
      raise exception 'Subbed in without sub minute was accepted';
    exception when check_violation then null; end;
    -- Einwechselspieler nur beim Auswechseln, nie der Spieler selbst.
    begin
      update public.player_match_ratings set status='subbed_in', sub_minute=60, substituted_by_player_id=v_replacement_id where id=v_rating_id;
      raise exception 'Replacement on subbed_in was accepted';
    exception when check_violation then null; end;
    begin
      update public.player_match_ratings set status='subbed_off', sub_minute=60, substituted_by_player_id=v_player_id where id=v_rating_id;
      raise exception 'Replacement being the player himself was accepted';
    exception when check_violation then null; end;
    -- Nicht nominiert ohne Leistungsdaten.
    begin
      update public.player_match_ratings set status='not_nominated', rating='4', minutes_played=90 where id=v_rating_id;
      raise exception 'Not-nominated with rating was accepted';
    exception when check_violation then null; end;
    -- Unbekannter Status.
    begin
      update public.player_match_ratings set status='bench' where id=v_rating_id;
      raise exception 'Unknown status was accepted';
    exception when check_violation then null; end;
    update public.player_match_ratings set status='subbed_off', sub_minute=75, rating='4', minutes_played=75, substituted_by_player_id=v_replacement_id where id=v_rating_id;

    -- Pro Spiel und Spieler nur ein Eintrag.
    begin
      insert into public.player_match_ratings(match_id,player_id,rating,minutes_played) values(v_match_id,v_player_id,'4',90);
      raise exception 'Duplicate entry per match and player was accepted';
    exception when unique_violation then null; end;

    -- Notizen dürfen höchstens 500 Zeichen haben.
    begin
      update public.player_match_ratings set note=repeat('x',501) where id=v_rating_id;
      raise exception 'Overlong note was accepted';
    exception when check_violation then null; end;

    -- Wird der Einwechselspieler gelöscht, wird die Referenz geleert.
    delete from public.players where id=v_replacement_id;
    if (select substituted_by_player_id from public.player_match_ratings where id=v_rating_id) is not null then
      raise exception 'Replacement reference survived player deletion';
    end if;

    -- Wird das Spiel gelöscht, verschwindet der Eintrag mit (on delete cascade).
    delete from public.matches where id=v_match_id;
    if exists(select 1 from public.player_match_ratings where match_id=v_match_id) then
      raise exception 'Rating survived match deletion';
    end if;

    insert into public.matches(opponent,opponent_short,venue,kickoff_at)
      values('Ratings Gegner 2','RT2','Teststadion',now()-interval '2 minutes') returning id into v_match_id;
    insert into public.player_match_ratings(match_id,player_id,rating,minutes_played) values(v_match_id,v_player_id,'1,5',90);
    reset role;

    foreach role_name in array array['anon','authenticated'] loop
      perform set_config('request.jwt.claims',json_build_object('sub',other_user,'role',role_name,'app_metadata',json_build_object('role','admin'))::text,true);
      execute format('set local role %I',role_name);
      if not exists(select 1 from public.player_match_ratings where player_id=v_player_id) then raise exception 'Public cannot read ratings'; end if;
      begin
        insert into public.player_match_ratings(match_id,player_id,rating,minutes_played) values(v_match_id,v_player_id,'5',90);
        raise exception 'Unauthorized insert allowed';
      exception when insufficient_privilege then null; end;
      begin
        update public.player_match_ratings set rating='6' where player_id=v_player_id;
        if found then raise exception 'Unauthorized update allowed'; end if;
      exception when insufficient_privilege then null; end;
      begin
        delete from public.player_match_ratings where player_id=v_player_id;
        if found then raise exception 'Unauthorized delete allowed'; end if;
      exception when insufficient_privilege then null; end;
      reset role;
    end loop;
    raise sqlstate 'ZX001' using message='Tests passed; rollback fixtures';
  exception when sqlstate 'ZX001' then
    raise notice 'PASS: player match ratings RLS and constraints; fixtures rolled back';
  end;
end $test$;
