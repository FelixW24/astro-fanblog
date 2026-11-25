begin;
do $test$
declare
  editor_id uuid := gen_random_uuid();
  profile_id bigint;
  no_chart_profile_id bigint;
  profile jsonb := jsonb_build_object(
    'slug', 'save-test-' || replace(gen_random_uuid()::text, '-', ''),
    'name', 'Vorher', 'position', 'mittelfeld',
    'squad_status', 'first-team', 'profile_slogan', 'Immer für Kölle.'
  );
  chart jsonb := '{"title":"Testdiagramm","chart_type":"bar","sort_order":2,"metrics":[{"label":"Tempo","value":82},{"label":"Technik","value":0},{"label":"Physis","value":100}]}'::jsonb;
begin
  insert into auth.users(id, email, raw_app_meta_data)
    values (editor_id, editor_id || '@player-save.invalid', '{"role":"admin","is_editor":true}');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', editor_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;

  -- Existing creation callers keep working with the same signature.
  profile_id := public.create_player_profile(profile, chart);
  profile := profile || jsonb_build_object(
    'id', profile_id, 'name', 'Nachher',
    'is_injured', true, 'injury_since', '2026-10-20', 'injury_until', '2026-11-02'
  );
  -- The editor uses the availability wrapper when saving a chart with the profile.
  perform public.create_player_profile_with_availability(profile, chart);
  if not exists (
    select 1 from public.players where id = profile_id
      and is_injured and injury_since = '2026-10-20' and injury_until = '2026-11-02'
  ) then
    raise exception 'Combined save did not persist injury data';
  end if;
  if (select name from public.players where id = profile_id) <> 'Nachher'
     or (select count(*) from public.player_charts where player_id = profile_id) <> 2 then
    raise exception 'Profile and new chart were not saved together';
  end if;

  -- Leistungsdaten sind optional: p_chart null legt kein Diagramm an.
  no_chart_profile_id := public.create_player_profile_with_availability(
    jsonb_build_object(
      'slug', 'save-test-nochart-' || replace(gen_random_uuid()::text, '-', ''),
      'name', 'Ohne Diagramm', 'position', 'sturm',
      'squad_status', 'first-team', 'profile_slogan', 'Immer für Kölle.'
    ),
    null
  );
  if not exists (select 1 from public.players where id = no_chart_profile_id)
     or exists (select 1 from public.player_charts where player_id = no_chart_profile_id) then
    raise exception 'Profile without chart draft was not created without a chart';
  end if;
  -- Ein Chart-Entwurf ohne Titel wird ebenfalls übersprungen.
  perform public.create_player_profile(
    jsonb_build_object(
      'slug', 'save-test-emptytitle-' || replace(gen_random_uuid()::text, '-', ''),
      'name', 'Leerer Titel', 'position', 'torwart',
      'squad_status', 'first-team', 'profile_slogan', 'Immer für Kölle.'
    ),
    '{"title":"","chart_type":"radar","metrics":[]}'::jsonb
  );
  if exists (
    select 1 from public.player_charts c
    join public.players p on p.id = c.player_id
    where p.name = 'Leerer Titel'
  ) then
    raise exception 'Chart with empty title was inserted';
  end if;

  -- A failed chart insert must roll back the profile update as well.
  begin
    perform public.create_player_profile_with_availability(profile || '{"name":"Darf nicht bleiben"}', chart || '{"title":"x"}');
    raise exception 'Invalid chart unexpectedly accepted';
  exception when check_violation then null;
  end;
  if (select name from public.players where id = profile_id) <> 'Nachher'
     or (select count(*) from public.player_charts where player_id = profile_id) <> 2 then
    raise exception 'A failed chart insert left partial changes';
  end if;

  -- Invalid injury dates must roll back the new chart and profile as well.
  begin
    perform public.create_player_profile_with_availability(
      profile || '{"name":"Ungültige Verletzung","injury_until":"2026-10-01"}', chart
    );
    raise exception 'Invalid injury unexpectedly accepted';
  exception when check_violation then null;
  end;
  if not exists (
    select 1 from public.players where id = profile_id and name = 'Nachher'
      and is_injured and injury_since = '2026-10-20' and injury_until = '2026-11-02'
  ) or (select count(*) from public.player_charts where player_id = profile_id) <> 2 then
    raise exception 'Invalid injury left partial profile or chart changes';
  end if;

  -- The configured editor must still be denied without a verified second factor.
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', editor_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  if private.is_editor() then raise exception 'Editor without MFA unexpectedly accepted'; end if;
  begin
    perform public.create_player_profile(profile || '{"name":"Ohne MFA"}', chart);
    raise exception 'Editor without MFA updated profile';
  exception when raise_exception then
    if sqlerrm <> 'Spielerprofil nicht gefunden oder keine Berechtigung.' then raise; end if;
  end;
  reset role;
  if (select name from public.players where id = profile_id) <> 'Nachher'
     or (select count(*) from public.player_charts where player_id = profile_id) <> 2 then
    raise exception 'An update without MFA left partial changes';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    perform public.create_player_profile(profile, chart);
    raise exception 'Non-editor update unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm <> 'Spielerprofil nicht gefunden oder keine Berechtigung.' then raise; end if;
  end;
  reset role;
  set local role anon;
  begin
    perform public.create_player_profile(profile, chart);
    raise exception 'Anonymous update unexpectedly accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$test$;
rollback;
