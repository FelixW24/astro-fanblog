begin;
do $test$
declare
  editor_id uuid := gen_random_uuid();
  target_player_id bigint;
  same_name_id bigint;
  identity_name text := 'Verfügbarkeit ' || gen_random_uuid();
  profile jsonb;
  chart jsonb := '{"title":"Leistungsdaten","metrics":[{"label":"A","value":50},{"label":"B","value":60},{"label":"C","value":70}]}';
begin
  insert into auth.users(id, email, raw_app_meta_data)
    values (editor_id, editor_id || '@availability.invalid', '{"is_editor":true}');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', editor_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  profile := jsonb_build_object(
    'slug', 'availability-' || gen_random_uuid(), 'name', identity_name,
    'position', 'sturm', 'squad_status', 'loan-in', 'date_of_birth', '2000-01-01',
    'is_injured', true, 'injury_since', '2026-10-20', 'injury_until', '2026-11-02'
  );
  target_player_id := public.create_player_profile_with_availability(profile, chart);
  if not exists (select 1 from public.players p where p.id = target_player_id
    and is_injured and injury_since = '2026-10-20' and injury_until = '2026-11-02') then
    raise exception 'Injury not saved with new profile';
  end if;
  if (select count(*) from public.player_charts c where c.player_id = target_player_id) <> 1 then
    raise exception 'Chart not saved with injury profile';
  end if;

  -- Invalid injury data rolls back the profile and chart together.
  begin
    perform public.create_player_profile_with_availability(
      profile || jsonb_build_object('slug', 'invalid-' || gen_random_uuid(), 'name', 'Invalid ' || identity_name, 'injury_until', '2026-10-01'), chart);
    raise exception 'Invalid duration accepted';
  exception when check_violation then null;
  end;
  if exists (select 1 from public.players where name = 'Invalid ' || identity_name) then
    raise exception 'Failed creation left a player behind';
  end if;

  -- Different slugs must not create the same identity again.
  begin
    perform public.create_player_profile_with_availability(
      profile || jsonb_build_object('slug', 'duplicate-' || gen_random_uuid(), 'name', '  ' || upper(identity_name) || '  '), chart);
    raise exception 'Duplicate player accepted';
  exception when unique_violation then null;
  end;
  -- Unknown birth dates must not bypass duplicate prevention.
  begin
    perform public.create_player_profile_with_availability(
      profile || jsonb_build_object('slug', 'duplicate-' || gen_random_uuid(), 'date_of_birth', null), chart);
    raise exception 'Duplicate with missing birth date accepted';
  exception when unique_violation then null;
  end;
  -- Real namesakes with different known birthdays are valid.
  same_name_id := public.create_player_profile_with_availability(
    profile || jsonb_build_object('slug', 'namesake-' || gen_random_uuid(), 'date_of_birth', '2001-01-01'), chart);
  if same_name_id = target_player_id then raise exception 'Namesakes merged'; end if;

  update public.players set squad_status = 'on-loan', injury_until = null where id = target_player_id;
  if not exists (select 1 from public.players p where p.id = target_player_id and squad_status = 'on-loan' and is_injured and injury_until is null) then
    raise exception 'Status change did not update the same player';
  end if;
  update public.players set is_injured = false, injury_since = null, injury_until = null where id = target_player_id;
  if (select is_injured from public.players p where p.id = target_player_id) then raise exception 'Recovery not saved'; end if;

  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  update public.players set is_injured = true, injury_since = '2026-10-20' where id = target_player_id;
  reset role;
  if (select is_injured from public.players p where p.id = target_player_id) then raise exception 'Reader changed injury'; end if;
end;
$test$;
rollback;
