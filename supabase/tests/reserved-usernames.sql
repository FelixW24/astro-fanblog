begin;
do $test$
declare
  reader_a uuid := gen_random_uuid();
  reader_b uuid := gen_random_uuid();
  reader_c uuid := gen_random_uuid();
  editor_user uuid := gen_random_uuid();
  v_name text;
begin
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    (reader_a, reader_a || '@reserved.invalid', now(), '{}'::jsonb),
    (reader_b, reader_b || '@reserved.invalid', now(), '{}'::jsonb),
    (reader_c, reader_c || '@reserved.invalid', now(), '{}'::jsonb);
  insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data)
  values (editor_user, editor_user || '@reserved.invalid', now(),
          '{"role":"admin","is_editor":true}'::jsonb);

  -- Live-Prüfung für anon: reservierte Namen sind nie verfügbar, normale
  -- Namen (auch in Großschreibung oder mit Tippfehler) bleiben frei.
  set local role anon;
  if public.check_username('admin') then raise exception 'admin available'; end if;
  if public.check_username(' admin ') then raise exception 'padded admin available'; end if;
  if public.check_username('aDmIn') then raise exception 'aDmIn available'; end if;
  if public.check_username('adm1n') then raise exception 'adm1n available'; end if;
  if public.check_username('redaktion') then raise exception 'redaktion available'; end if;
  if public.check_username('redakt1on') then raise exception 'redakt1on available'; end if;
  if public.check_username('gladbachfan') then raise exception 'gladbachfan available'; end if;
  if public.check_username('NormalerFan48') is not true then raise exception 'NormalerFan48 blocked'; end if;
  if public.check_username('Kurve48Fan') is not true then raise exception 'Kurve48Fan blocked'; end if;
  if public.check_username('REDACKTION') is not true then raise exception 'REDACKTION typo over-blocked'; end if;
  reset role;

  -- Trigger: reservierte Namen und Pattern-Treffer werden abgewiesen –
  -- unabhängig von Groß-/Kleinschreibung und umgebenden Leerzeichen.
  foreach v_name in array array[
    'Admin', ' admin ', 'admin', 'aDmIn', 'adm1n',
    'redaktion', 'redakt1on', 'support',
    'gladbachfan', 'bayer04_supporter', 'effzehabsteiger',
    'geissbockbraten', 'astro-fanblog_team', 'fc_example_fan', 'vfl_gladbach',
    'astro-fanblog_sucks'
  ]
  loop
    begin
      insert into public.reader_profiles (id, username, avatar)
      values (reader_a, v_name, 'male');
      raise exception 'Reserved username accepted: %', v_name;
    exception when others then
      if sqlerrm not like 'Dieser Benutzername ist reserviert%' then
        raise exception 'Unexpected error for %: %', v_name, sqlerrm;
      end if;
    end;
  end loop;

  -- Kein Over-Blocking: Tippfehler-Variante und normale Fan-Namen bleiben frei.
  insert into public.reader_profiles (id, username, avatar)
  values (reader_a, 'redacktion', 'male');
  insert into public.reader_profiles (id, username, avatar)
  values (reader_b, 'normalerfan48', 'male');

  -- Duplikat-Prüfung: der eigene Name bleibt verfügbar, fremde Namen nicht.
  if public.check_username('normalerfan48') then
    raise exception 'Duplicate username available';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', reader_b, 'role', 'authenticated')::text, true);
  if not public.check_username('normalerfan48') then
    raise exception 'Own username reported as duplicate';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', reader_c, 'role', 'authenticated')::text, true);
  if public.check_username('normalerfan48') then
    raise exception 'Foreign username reported as free';
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- Namensänderung auf einen reservierten Namen wird ebenfalls geblockt.
  begin
    update public.reader_profiles set username = 'support' where id = reader_b;
    raise exception 'Update to reserved name accepted';
  exception when others then
    if sqlerrm not like 'Dieser Benutzername ist reserviert%' then
      raise exception 'Unexpected update error: %', sqlerrm;
    end if;
  end;

  -- Bestehende Nutzer werden nicht rückwirkend gesperrt: Ein inzwischen
  -- reservierter Legacy-Name darf unverändert weiter gespeichert werden.
  set local session_replication_role = replica;
  update public.reader_profiles set username = 'karnevalsverein' where id = reader_b;
  set local session_replication_role = default;
  update public.reader_profiles set username = 'karnevalsverein' where id = reader_b;
  if not exists (
    select 1 from public.reader_profiles where id = reader_b and username = 'karnevalsverein'
  ) then
    raise exception 'Legacy reserved name was stripped';
  end if;

  -- Nur die Redaktion darf reservierte Einträge lesen und pflegen.
  set local role authenticated;
  if (select count(*) from public.reserved_usernames) <> 0 then
    raise exception 'Reader read the username blacklist';
  end if;
  if (select count(*) from public.reserved_username_patterns) <> 0 then
    raise exception 'Reader read the username patterns';
  end if;
  reset role;

  set local role anon;
  begin
    perform 1 from public.reserved_usernames limit 1;
    raise exception 'Anonymous blacklist access';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.reserved_username_patterns limit 1;
    raise exception 'Anonymous pattern access';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- Redaktionskonten dürfen reservierte Namen tragen (Seed-Konto „redaktion“).
  insert into public.reader_profiles (id, username, avatar)
  values (editor_user, 'admin', 'male');
  perform set_config('request.jwt.claims',
    json_build_object('sub', editor_user, 'role', 'authenticated')::text, true);
  if not public.check_username('admin') then
    raise exception 'Editorial account cannot keep reserved name';
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- Pattern-Guard: Over-Blocking und kaputte Regex-Syntax werden abgewiesen.
  begin
    insert into public.reserved_username_patterns (pattern) values ('(fan)');
    raise exception 'Over-blocking pattern accepted';
  exception when others then
    if sqlerrm not like 'Das Pattern blockt%' then
      raise exception 'Unexpected pattern guard error: %', sqlerrm;
    end if;
  end;
  begin
    insert into public.reserved_username_patterns (pattern) values ('([');
    raise exception 'Invalid regex accepted';
  exception when others then
    if sqlerrm not like '%regular expression%' then
      raise exception 'Unexpected regex error: %', sqlerrm;
    end if;
  end;

  -- Idempotenz des Seeds: erneute Inserts ändern nothing.
  insert into public.reserved_usernames (value, reason)
  values ('admin', 'dup')
  on conflict (lower(value)) do nothing;
  if exists (select 1 from public.reserved_usernames where value = 'admin' and reason = 'dup') then
    raise exception 'Reserved name seeded twice';
  end if;
end;
$test$;
rollback;
