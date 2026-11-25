begin;
do $test$
declare
  editor_id uuid := gen_random_uuid();
  template_id uuid;
begin
  insert into auth.users(id, email, raw_app_meta_data)
    values (editor_id, editor_id || '@templates.invalid', '{"role":"admin","is_editor":true}');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', editor_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  insert into public.player_chart_templates(name, position, chart_type, metric_labels)
    values ('Innenverteidiger', 'abwehr', 'bar', array['Passquote', 'Zweikämpfe', 'Luftzweikämpfe'])
    returning id into template_id;
  if (select metric_labels from public.player_chart_templates where id = template_id)
    is distinct from array['Passquote', 'Zweikämpfe', 'Luftzweikämpfe'] then
    raise exception 'Editor could not reload the saved template';
  end if;
  insert into public.player_chart_templates(name, position, chart_type, metric_labels)
    values ('Torwart', 'torwart', 'radar', array['Paradenquote', 'Lange Bälle', 'Elfmeterquote']);
  begin
    insert into public.player_chart_templates(name, position, chart_type, metric_labels)
      values ('Innenverteidiger', 'abwehr', 'radar', array['Pass', 'Tempo', 'Physis']);
    raise exception 'Duplicate template unexpectedly accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.player_chart_templates(name, position, chart_type, metric_labels)
      values ('Ungültig', 'abwehr', 'radar', array['Pass', '', 'Physis']);
    raise exception 'Empty label unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.player_chart_templates(name, position, chart_type, metric_labels)
      values ('Doppelt', 'abwehr', 'radar', array['Pass', 'pass', 'Physis']);
    raise exception 'Duplicate labels unexpectedly accepted';
  exception when check_violation then null;
  end;

  -- An editor session without MFA cannot read, save or delete templates.
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', editor_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  if private.is_editor() then raise exception 'Editor without MFA unexpectedly accepted'; end if;
  if exists (select 1 from public.player_chart_templates) then
    raise exception 'Editor without MFA read templates';
  end if;
  begin
    insert into public.player_chart_templates(name, position, chart_type, metric_labels)
      values ('Ohne MFA', 'abwehr', 'radar', array['Pass', 'Tempo', 'Physis']);
    raise exception 'Editor without MFA saved template';
  exception when insufficient_privilege then null;
  end;
  delete from public.player_chart_templates where id = template_id;
  reset role;
  if not exists(select 1 from public.player_chart_templates where id = template_id) then
    raise exception 'Editor without MFA deleted template';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  if exists (select 1 from public.player_chart_templates) then
    raise exception 'Reader can read editorial templates';
  end if;
  begin
    insert into public.player_chart_templates(name, position, chart_type, metric_labels)
      values ('Reader', 'sturm', 'radar', array['Pass', 'Tempo', 'Physis']);
    raise exception 'Reader can save templates';
  exception when insufficient_privilege then null;
  end;
  delete from public.player_chart_templates where id = template_id;
  reset role;
  if not exists(select 1 from public.player_chart_templates where id = template_id) then
    raise exception 'Reader deleted an editorial template';
  end if;
  set local role anon;
  begin
    perform 1 from public.player_chart_templates;
    raise exception 'Anonymous template read unexpectedly accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', editor_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  delete from public.player_chart_templates where id = template_id;
  if exists(select 1 from public.player_chart_templates where id = template_id) then
    raise exception 'Editor could not delete the template';
  end if;

  -- Editoren dürfen die Benennung ändern, aber keine anderen Spalten.
  insert into public.player_chart_templates(name, position, chart_type, metric_labels)
    values ('Sturm-Profil', 'sturm', 'radar', array['Schussgenauigkeit', 'Passquote', 'Zweikämpfe'])
    returning id into template_id;
  update public.player_chart_templates set name = 'Sturm-Profil korrigiert' where id = template_id;
  if (select name from public.player_chart_templates where id = template_id) <> 'Sturm-Profil korrigiert' then
    raise exception 'Editor could not rename the template';
  end if;
  begin
    update public.player_chart_templates set metric_labels = array['Pass', 'Tempo', 'Physis'] where id = template_id;
    raise exception 'Editor could change metric labels';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.player_chart_templates set position = 'torwart' where id = template_id;
    raise exception 'Editor could change the template position';
  exception when insufficient_privilege then null;
  end;
  -- Leser und anonyme Nutzer dürfen Vorlagen nicht umbenennen.
  insert into public.player_chart_templates(name, position, chart_type, metric_labels)
    values ('Leser-Test', 'sturm', 'radar', array['Pass', 'Tempo', 'Physis'])
    returning id into template_id;
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  -- RLS lässt das Update durch den Leser ins Leere laufen (keine Exception).
  update public.player_chart_templates set name = 'Geändert' where id = template_id;
  set local role anon;
  begin
    update public.player_chart_templates set name = 'Geändert' where id = template_id;
    raise exception 'Anonymous rename unexpectedly accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;
  if (select name from public.player_chart_templates where id = template_id) is distinct from 'Leser-Test' then
    raise exception 'Non-editor could rename a template';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', editor_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  delete from public.player_chart_templates where id = template_id;
  reset role;
end;
$test$;
rollback;
