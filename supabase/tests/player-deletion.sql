begin;
do $test$
declare
  editor_id uuid := gen_random_uuid();
  player_id_to_delete bigint;
  other_player_id bigint;
  deleted_count integer;
begin
  insert into auth.users(id, email, raw_app_meta_data)
    values (editor_id, editor_id || '@player-delete.invalid', '{"is_editor":true}');
  insert into public.players(slug, name, position, squad_status)
    values ('delete-test-' || gen_random_uuid(), 'Löschtest', 'torwart', 'first-team')
    returning id into player_id_to_delete;
  insert into public.players(slug, name, position, squad_status)
    values ('keep-test-' || gen_random_uuid(), 'Behalten', 'torwart', 'first-team')
    returning id into other_player_id;
  insert into public.player_charts(player_id, title, metrics)
    values
      (player_id_to_delete, 'Testdiagramm', '[{"label":"A","value":50},{"label":"B","value":60},{"label":"C","value":70}]'),
      (other_player_id, 'Behalten', '[{"label":"A","value":50},{"label":"B","value":60},{"label":"C","value":70}]');

  -- Anonymous visitors cannot delete profiles.
  set local role anon;
  begin
    delete from public.players where id = player_id_to_delete;
    raise exception 'Anonymous deletion unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- Ordinary authenticated readers cannot delete, even with MFA.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  delete from public.players where id = player_id_to_delete;
  get diagnostics deleted_count = row_count;
  if deleted_count <> 0 then raise exception 'Reader deleted a player'; end if;
  reset role;

  -- Editors without MFA also cannot delete.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', editor_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  delete from public.players where id = player_id_to_delete;
  get diagnostics deleted_count = row_count;
  if deleted_count <> 0 then raise exception 'Editor without MFA deleted a player'; end if;
  reset role;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', editor_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  delete from public.players where id = player_id_to_delete;
  get diagnostics deleted_count = row_count;
  if deleted_count <> 1 then raise exception 'Editor could not delete the player'; end if;
  reset role;

  if exists (select 1 from public.players where id = player_id_to_delete)
     or exists (select 1 from public.player_charts where player_id = player_id_to_delete) then
    raise exception 'Player or dependent charts were not deleted';
  end if;
  if not exists (select 1 from public.players where id = other_player_id)
     or not exists (select 1 from public.player_charts where player_id = other_player_id) then
    raise exception 'Another player or their chart was affected';
  end if;
end;
$test$;
rollback;
