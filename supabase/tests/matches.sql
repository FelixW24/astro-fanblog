-- Isolated fixtures: all changes, including the configured editor, roll back.
do $test$
declare
  editor uuid := gen_random_uuid();
  other_user uuid := gen_random_uuid();
  match_id bigint;
  future_id bigint;
  selected_id bigint;
  role_name text;
begin
  begin
    insert into auth.users(id,email,raw_app_meta_data) values
      (editor,'matches-editor@audit.invalid','{"role":"admin","is_editor":true}'),
      (other_user,'matches-other@audit.invalid','{"role":"admin"}');
    insert into private.editor_account(singleton,user_id,email)
      values(true,editor,'matches-editor@audit.invalid')
      on conflict(singleton) do update set user_id=excluded.user_id,email=excluded.email;
    perform set_config('request.jwt.claims',json_build_object('sub',editor,'role','authenticated','aal','aal2')::text,true);
    set local role authenticated;
    insert into public.matches(opponent,opponent_short,venue,kickoff_at)
      values('Test Past','OLD','Teststadion',now()-interval '1 minute') returning id into match_id;
    update public.matches set opponent='Edited' where id=match_id;
    if not found then raise exception 'Editor cannot update matches'; end if;
    insert into public.matches(opponent,opponent_short,venue,kickoff_at)
      values('Test Future','NEW','Teststadion',now()+interval '1 minute') returning id into future_id;
    insert into public.matches(opponent,opponent_short,venue,kickoff_at,cancelled)
      values('Test Cancelled','OFF','Teststadion',now()+interval '1 second',true);
    select id into selected_id from public.matches where not cancelled and kickoff_at>now()
      order by kickoff_at,id limit 1;
    if selected_id is distinct from future_id then raise exception 'Wrong next match selected'; end if;
    delete from public.matches where id=future_id;
    if not found then raise exception 'Editor cannot delete matches'; end if;
    reset role;

    foreach role_name in array array['anon','authenticated'] loop
      perform set_config('request.jwt.claims',json_build_object('sub',other_user,'role',role_name,'app_metadata',json_build_object('role','admin'))::text,true);
      execute format('set local role %I',role_name);
      if not exists(select 1 from public.matches where id=match_id) then raise exception 'Public cannot read matches'; end if;
      begin
        insert into public.matches(opponent,opponent_short,venue,kickoff_at) values('Forbidden','NO','Teststadion',now());
        raise exception 'Unauthorized insert allowed';
      exception when insufficient_privilege then null; end;
      begin
        update public.matches set opponent='Forbidden' where id=match_id;
        if found then raise exception 'Unauthorized update allowed'; end if;
      exception when insufficient_privilege then null; end;
      begin
        delete from public.matches where id=match_id;
        if found then raise exception 'Unauthorized delete allowed'; end if;
      exception when insufficient_privilege then null; end;
      reset role;
    end loop;
    raise sqlstate 'ZX001' using message='Tests passed; rollback fixtures';
  exception when sqlstate 'ZX001' then
    raise notice 'PASS: match selection and editor/public RLS; fixtures rolled back';
  end;
end $test$;

-- Ergebnis-Spalten: beide Tore zusammen oder beide leer, jeweils 0 bis 30.
do $test$
declare
  editor uuid := gen_random_uuid();
  match_id bigint;
begin
  begin
    insert into auth.users(id,email,raw_app_meta_data)
      values(editor,'matches-result-editor@audit.invalid','{"role":"admin","is_editor":true}');
    perform set_config('request.jwt.claims',json_build_object('sub',editor,'role','authenticated','aal','aal2')::text,true);
    set local role authenticated;
    insert into public.matches(opponent,opponent_short,venue,kickoff_at,home_goals,away_goals)
      values('Result Test','RES','Teststadion',now()-interval '1 minute',2,1) returning id into match_id;
    if (select home_goals from public.matches where id=match_id) <> 2 then
      raise exception 'Editor cannot store a full result';
    end if;
    begin
      update public.matches set away_goals=null where id=match_id;
      raise exception 'Half result (only one side null) was accepted';
    exception when check_violation then null; end;
    begin
      update public.matches set away_goals=31 where id=match_id;
      raise exception 'Result above 30 was accepted';
    exception when check_violation then null; end;
    begin
      update public.matches set home_goals=-1 where id=match_id;
      raise exception 'Negative result was accepted';
    exception when check_violation then null; end;
    update public.matches set home_goals=null, away_goals=null where id=match_id;
    if (select home_goals is null and away_goals is null from public.matches where id=match_id) is not true then
      raise exception 'Clearing the result did not work';
    end if;
    raise sqlstate 'ZX001' using message='Tests passed; rollback fixtures';
  exception when sqlstate 'ZX001' then
    raise notice 'PASS: match result constraints; fixtures rolled back';
  end;
end $test$;
