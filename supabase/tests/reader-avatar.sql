begin;
do $test$
declare
  reader_id uuid;
  icon text;
begin
  -- Every derived icon is accepted through the same authenticated onboarding RPC.
  foreach icon in array array['male', 'female', 'diverse'] loop
    reader_id := gen_random_uuid();
    insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data)
      values (reader_id, reader_id || '@avatars.invalid', now(), '{}'::jsonb);
    perform set_config('request.jwt.claims', json_build_object('sub', reader_id, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.complete_reader_profile('r_' || substr(replace(reader_id::text, '-', ''), 1, 20), icon, 'Reader Test', '1990-01-01');
    if (select avatar from public.reader_profiles where id = reader_id) is distinct from icon then
      raise exception 'Derived avatar not persisted: %', icon;
    end if;
    if (select full_name from public.reader_details where id = reader_id) is distinct from 'Reader Test' then
      raise exception 'Private onboarding details not persisted';
    end if;
    reset role;
  end loop;

  reader_id := gen_random_uuid();
  insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data)
    values (reader_id, reader_id || '@avatars.invalid', now(), '{}'::jsonb);
  perform set_config('request.jwt.claims', json_build_object('sub', reader_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  foreach icon in array array['', 'other', null] loop
    begin
      perform public.complete_reader_profile('invalid_avatar', icon, 'Reader Test', '1990-01-01');
      raise exception 'Invalid avatar accepted';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  reset role;

  reader_id := gen_random_uuid();
  insert into auth.users(id, email, raw_user_meta_data)
    values (reader_id, reader_id || '@avatars.invalid', '{}'::jsonb);
  perform set_config('request.jwt.claims', json_build_object('sub', reader_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.complete_reader_profile('unconfirmed_reader', 'diverse', 'Reader Test', '1990-01-01');
    raise exception 'Unconfirmed account accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', '{}'::jsonb::text, true);
  set local role anon;
  begin
    perform public.complete_reader_profile('anonymous_reader', 'diverse', 'Reader Test', '1990-01-01');
    raise exception 'Anonymous account accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$test$;
rollback;
