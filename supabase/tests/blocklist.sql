begin;
do $test$
declare
  editor_id uuid := gen_random_uuid();
  reader_id uuid := gen_random_uuid();
  article_id bigint;
  word_id bigint;
  state text;
  word text;
begin
  if (select count(*) from public.comment_blocklist) < 2496 then
    raise exception 'Multilingual import is incomplete';
  end if;
  if not exists(select 1 from public.comment_blocklist where lower(term) = 'heil hitler')
    or not exists(select 1 from public.comment_blocklist where lower(term) = 'schwulenpack')
    or not exists(select 1 from public.comment_blocklist where lower(term) = 'transenpack')
    or not exists(select 1 from public.comment_blocklist where lower(term) = 'türkenschwein')
    or not exists(select 1 from public.comment_blocklist where lower(term) = 'schlitzauge') then
    raise exception 'German editorial additions missing';
  end if;
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
    (editor_id,editor_id || '@blocklist.invalid',now(),'{"is_editor":true}'),
    (reader_id,reader_id || '@blocklist.invalid',now(),'{}');
  insert into public.reader_profiles(id,username,avatar) values
    (reader_id,'r_' || substr(replace(reader_id::text,'-',''),1,20),'male');
  insert into public.articles(slug,title,excerpt,content,category,status,published_at)
    values ('blocklist-' || reader_id,'Wortlistentest','Ein ausreichend langer Teaser.','Testinhalt.','news','published',now() - interval '1 day') returning id into article_id;

  perform set_config('request.jwt.claims', json_build_object('sub',editor_id,'role','authenticated','aal','aal1')::text,true);
  set local role authenticated;
  if exists(select 1 from public.comment_blocklist) then raise exception 'List visible without MFA'; end if;
  begin
    insert into public.comment_blocklist(term) values('zz-test-without-mfa');
    raise exception 'Editor without MFA inserted term';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',editor_id,'role','authenticated','aal','aal2')::text,true);
  set local role authenticated;
  insert into public.comment_blocklist(term) values('zz-blocklist-test') returning id into word_id;
  if not exists(select 1 from public.comment_blocklist where id=word_id) then raise exception 'Editor cannot read own term'; end if;
  begin
    insert into public.comment_blocklist(term) values('ZZ-BLOCKLIST-TEST');
    raise exception 'Duplicate accepted';
  exception when unique_violation then null; end;
  delete from public.comment_blocklist where id=word_id;
  if exists(select 1 from public.comment_blocklist where id=word_id) then raise exception 'Editor cannot delete term'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',reader_id,'role','authenticated')::text,true);
  set local role authenticated;
  if exists(select 1 from public.comment_blocklist) then raise exception 'List leaked to reader'; end if;
  begin
    insert into public.comment_blocklist(term) values('zz-reader-write');
    raise exception 'Reader inserted term';
  exception when insufficient_privilege then null; end;
  delete from public.comment_blocklist;
  reset role;
  if (select count(*) from public.comment_blocklist) < 2496 then raise exception 'Reader deleted terms'; end if;
  -- Select real imported terms across scripts; exercise the existing insert trigger.
  for word in select term from public.comment_blocklist where lower(term) in ('türkenschwein', 'heil hitler', 'transenpack') loop
    set local role authenticated;
    select status into state from public.submit_comment(article_id, 'Test ' || upper(word));
    if state <> 'pending' then raise exception 'Imported term did not hold comment: %', word; end if;
    reset role;
  end loop;
  if (select count(*) from public.comment_blocklist where lower(term) in ('türkenschwein', 'heil hitler', 'transenpack')) <> 3 then
    raise exception 'Expected multilingual fixtures missing';
  end if;
  set local role anon;
  begin
    perform 1 from public.comment_blocklist;
    raise exception 'List leaked to anonymous user';
  exception when insufficient_privilege then null; end;
  reset role;
end;
$test$;
rollback;
