-- Every test change is rolled back, including identities and the editor slot.
do $test$
declare
  allowed_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  fixture_id bigint;
  player_fixture_id bigint;
  chart_fixture_id bigint;
begin
  begin
    insert into auth.users (id, email, raw_app_meta_data) values
      (allowed_id, 'allowed@audit.invalid', '{"role":"admin","is_editor":true}'),
      (other_id, 'other@audit.invalid', '{"role":"admin"}');
    insert into private.editor_account(singleton,user_id,email)
      values (true, allowed_id, 'allowed@audit.invalid')
      on conflict(singleton) do update set user_id=excluded.user_id,email=excluded.email;
    insert into public.articles(slug,title,excerpt,content,category,status)
      values ('security-' || allowed_id::text, 'Security Test', 'Ein ausreichend langer Testteaser.', 'Ein ausreichend langer Testinhalt.', 'news', 'draft')
      returning id into fixture_id;
    insert into public.players(slug,name,position)
      values ('security-player-' || allowed_id::text,'Security Player','abwehr')
      returning id into player_fixture_id;
    insert into public.player_charts(player_id,title,metrics)
      values(player_fixture_id,'Security Chart','[{"label":"A","value":50},{"label":"B","value":60},{"label":"C","value":70}]')
      returning id into chart_fixture_id;

    perform set_config('request.jwt.claims', json_build_object('sub',allowed_id,'role','authenticated','app_metadata',json_build_object('role','admin'))::text, true);
    set local role authenticated;
    if private.is_editor() then raise exception 'Editor without MFA accepted'; end if;
    update public.articles set title='Missing MFA' where id=fixture_id;
    if found then raise exception 'Editor without MFA updated draft'; end if;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub',allowed_id,'role','authenticated','aal','aal2')::text, true);
    set local role authenticated;
    if not private.is_editor() then raise exception 'Configured editor rejected'; end if;
    update public.articles set title='Edited security test' where id=fixture_id;
    if not found then raise exception 'Editor update rejected'; end if;
    select public.create_player_profile(
      jsonb_build_object(
        'slug', 'created-player-' || allowed_id::text,
        'name', 'Created Player',
        'position', 'sturm',
        'squad_status', 'first-team'
      ),
      jsonb_build_object(
        'chart_type', 'bar',
        'title', 'Leistungsdaten Test',
        'description', 'Datenbasis: Redaktion',
        'metrics', '[{"label":"A","value":50},{"label":"B","value":60},{"label":"C","value":70}]'::jsonb,
        'sort_order', 3
      )
    ) into player_fixture_id;
    if not exists(
      select 1
      from public.player_charts
      where player_id=player_fixture_id
        and chart_type='bar'
        and sort_order=3
    ) then raise exception 'Transactional player chart creation or placement failed'; end if;
    reset role;

    -- An old JWT must not retain access after the trusted role is revoked.
    update auth.users set raw_app_meta_data='{}' where id=allowed_id;
    set local role authenticated;
    if private.is_editor() then raise exception 'Stale JWT retained editor access'; end if;
    reset role;

    perform set_config('request.jwt.claims', json_build_object('sub',other_id,'role','authenticated','app_metadata',json_build_object('role','admin'))::text, true);
    set local role authenticated;
    if private.is_editor() then raise exception 'Other admin accepted'; end if;
    if exists(select 1 from public.articles where id=fixture_id) then raise exception 'Other admin read draft'; end if;
    update public.articles set title='Unauthorized update' where id=fixture_id;
    if found then raise exception 'Other admin updated draft'; end if;
    delete from public.articles where id=fixture_id;
    if found then raise exception 'Other admin deleted draft'; end if;
    update public.players set name='Unauthorized player update' where id=player_fixture_id;
    if found then raise exception 'Other admin updated player'; end if;
    update public.player_charts set title='Unauthorized chart update' where id=chart_fixture_id;
    if found then raise exception 'Other admin updated chart'; end if;
    delete from public.player_charts where id=chart_fixture_id;
    if found then raise exception 'Other admin deleted chart'; end if;
    begin
      insert into public.player_charts(player_id,title,metrics)
        values(player_fixture_id,'Unauthorized chart','[{"label":"A","value":50},{"label":"B","value":60},{"label":"C","value":70}]');
      raise exception 'Other admin inserted chart';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.create_player_profile(
        jsonb_build_object(
          'slug', 'denied-player-' || other_id::text,
          'name', 'Denied Player',
          'position', 'sturm',
          'squad_status', 'first-team'
        ),
        jsonb_build_object(
          'title', 'Denied Chart',
          'metrics', '[{"label":"A","value":50},{"label":"B","value":60},{"label":"C","value":70}]'::jsonb
        )
      );
      raise exception 'Other admin created player profile';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.articles(slug,title,excerpt,content,category)
        values ('denied-' || other_id::text,'Unauthorized insert','Ein ausreichend langer Testteaser.','Ein ausreichend langer Testinhalt.','news');
      raise exception 'Other admin inserted article';
    exception when insufficient_privilege then null;
    end;
    begin
      update private.editor_account set user_id=other_id;
      raise exception 'Client changed editor configuration';
    exception when insufficient_privilege then null;
    end;
    reset role;

    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
    if exists(select 1 from public.articles where id=fixture_id) then raise exception 'Anonymous draft leak'; end if;
    reset role;

    -- Exercise every editor status against the actual database constraint.
    -- Use distinct identities so this tests statuses, not the duplicate guard.
    insert into public.players(slug,name,position,squad_status)
      select 'status-' || status || '-' || allowed_id::text,'Status Test ' || status,'abwehr',status
      from unnest(array['first-team','on-loan','academy','departed']) status;
    raise sqlstate 'ZX001' using message='Tests passed; rollback fixtures';
  exception when sqlstate 'ZX001' then
    raise notice 'PASS: editor RLS, stale JWT, anonymous access, player statuses; fixtures rolled back';
  end;
end
$test$;
