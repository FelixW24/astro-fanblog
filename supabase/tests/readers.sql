begin;
do $test$
declare
  reader_a uuid := gen_random_uuid();
  reader_b uuid := gen_random_uuid();
  reader_c uuid := gen_random_uuid();
  article_a bigint;
  article_b bigint;
  draft_id bigint;
  comment_a bigint;
  reply_id bigint;
begin
  insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
    (reader_a, reader_a || '@readers.invalid', now(), '{}'::jsonb),
    (reader_b, reader_b || '@readers.invalid', now(), '{"role":"admin"}'::jsonb),
    (reader_c, reader_c || '@readers.invalid', now(), '{}'::jsonb);
  insert into public.reader_profiles(id, username, avatar) values
    (reader_a, 'a_' || substr(replace(reader_a::text, '-', ''),1,20), 'male'),
    (reader_b, 'b_' || substr(replace(reader_b::text, '-', ''),1,20), 'female');
  insert into public.reader_details(id, full_name, birth_date) values
    (reader_a, 'Private Name A', '1990-01-01'),
    (reader_b, 'Private Name B', '1991-01-01');
  insert into public.articles(slug,title,excerpt,content,category,status,published_at)
    values ('reader-a-' || reader_a, 'Reader Test A', 'Ein ausreichend langer Testteaser.', 'Testinhalt.', 'news', 'published', now() - interval '1 day') returning id into article_a;
  insert into public.articles(slug,title,excerpt,content,category,status,published_at)
    values ('reader-b-' || reader_a, 'Reader Test B', 'Ein ausreichend langer Testteaser.', 'Testinhalt.', 'news', 'published', now() - interval '1 day') returning id into article_b;
  insert into public.articles(slug,title,excerpt,content,category,status)
    values ('reader-draft-' || reader_a, 'Reader Draft', 'Ein ausreichend langer Testteaser.', 'Testinhalt.', 'news', 'draft') returning id into draft_id;

  perform set_config('request.jwt.claims', json_build_object('sub', reader_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from public.reader_details) <> 1 then raise exception 'Private data leaked'; end if;
  insert into public.comments(article_id,user_id,body) values(article_a,reader_a,'Kommentar A') returning id into comment_a;
  insert into public.comment_votes(comment_id,user_id,value) values(comment_a,reader_a,1);
  insert into public.comment_votes(comment_id,user_id,value) values(comment_a,reader_a,-1)
    on conflict(comment_id,user_id) do update set comment_id=excluded.comment_id,user_id=excluded.user_id,value=excluded.value;
  if (select dislikes from public.comment_scores(article_a) where comment_id=comment_a) <> 1 then raise exception 'Vote switch failed'; end if;
  begin
    insert into public.comments(article_id,user_id,body) values(article_a,reader_b,'Forged');
    raise exception 'Forged author accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.comments(article_id,user_id,body) values(draft_id,reader_a,'Draft');
    raise exception 'Draft comment accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.comments(article_id,user_id,parent_id,body) values(article_b,reader_a,comment_a,'Cross article');
    raise exception 'Cross article reply accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.comments(article_id,user_id,body) values(article_a,reader_a,'  ');
    raise exception 'Blank comment accepted';
  exception when check_violation then null; end;
  begin
    update public.reader_profiles set username='forged' where id=reader_a;
    raise exception 'Profile tampering accepted';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', reader_b, 'role', 'authenticated', 'user_metadata', json_build_object('role','admin'))::text, true);
  set local role authenticated;
  if private.is_editor() then raise exception 'Reader gained editorial rights'; end if;
  if exists(select 1 from public.articles where id=draft_id) then raise exception 'Draft leaked'; end if;
  if exists(select 1 from public.comment_votes where user_id=reader_a) then raise exception 'Vote identity leaked'; end if;
  update public.articles set title='Unauthorized' where id=article_a;
  if found then raise exception 'Reader edited article'; end if;
  update public.comment_votes set value=1 where user_id=reader_a;
  if found then raise exception 'Reader edited another vote'; end if;
  insert into public.comments(article_id,user_id,parent_id,body) values(article_a,reader_b,comment_a,'Antwort') returning id into reply_id;
  insert into public.comment_votes(comment_id,user_id,value) values(comment_a,reader_b,1);
  reset role;
  set local role anon;
  if (select likes from public.comment_scores(article_a) where comment_id=comment_a) <> 1 then raise exception 'Public aggregate failed'; end if;
  if not exists(select 1 from public.comments where id=reply_id) then raise exception 'Public reply unavailable'; end if;
  begin
    perform 1 from public.reader_details;
    raise exception 'Anonymous private data access';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.comments(article_id,user_id,body) values(article_a,reader_a,'Anonymous');
    raise exception 'Anonymous comment accepted';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', reader_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.complete_reader_profile(
    'c_' || substr(replace(reader_c::text, '-', ''),1,20),
    'male',
    'Private Name C',
    '1992-01-01'
  );
  if not exists(select 1 from public.reader_profiles where id=reader_c) then
    raise exception 'Onboarding did not create reader profile';
  end if;
  if not exists(select 1 from public.reader_details where id=reader_c) then
    raise exception 'Onboarding did not create private details';
  end if;
  reset role;
  update public.articles set status='archived' where id=article_a;
  set local role anon;
  if exists(select 1 from public.comments where article_id=article_a) then raise exception 'Archived comments leaked'; end if;
  if exists(select 1 from public.comment_scores(article_a)) then raise exception 'Archived votes leaked'; end if;
  reset role;
  -- A newly registered reader can be promoted without a configured email or
  -- legacy admin role. User-editable metadata alone never grants this access.
  update auth.users set raw_user_meta_data = raw_user_meta_data || '{"is_editor":true}'::jsonb where id=reader_b;
  perform set_config('request.jwt.claims', json_build_object('sub', reader_b, 'role', 'authenticated', 'app_metadata', json_build_object('is_editor',true))::text, true);
  set local role authenticated;
  if private.is_editor() then raise exception 'Editable metadata or forged claims granted access'; end if;
  reset role;
  update auth.users set raw_app_meta_data = '{"is_editor":true}'::jsonb where id in (reader_a,reader_b);
  set local role authenticated;
  if private.is_editor() then raise exception 'Flagged reader without MFA accepted'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',reader_b,'role','authenticated','aal','aal2')::text, true);
  set local role authenticated;
  if not private.is_editor() then raise exception 'Flagged reader rejected'; end if;
  update public.articles set title='Flagged reader edit' where id=draft_id;
  if not found then raise exception 'Flagged reader cannot edit'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',reader_a,'role','authenticated','aal','aal2')::text, true);
  set local role authenticated;
  if not private.is_editor() then raise exception 'Second flagged reader rejected'; end if;
  reset role;
  update auth.users set raw_app_meta_data = '{"is_editor":false}'::jsonb where id=reader_a;
  set local role authenticated;
  if private.is_editor() then raise exception 'Revoked profile retained access'; end if;
  reset role;
end;
$test$;
rollback;
