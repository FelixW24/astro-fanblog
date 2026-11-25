begin;
do $test$
declare
  reader_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  article_id bigint;
  other_article bigint;
  parent_id bigint;
  word text := 'rate_' || replace(gen_random_uuid()::text, '-', '');
  state text;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
    (reader_id,reader_id || '@rate.invalid',now(),'{}'),
    (other_id,other_id || '@rate.invalid',now(),'{}');
  insert into public.reader_profiles(id,username,avatar) values
    (reader_id,'r_' || substr(replace(reader_id::text,'-',''),1,20),'male'),
    (other_id,'r_' || substr(replace(other_id::text,'-',''),1,20),'female');
  insert into public.articles(slug,title,excerpt,content,category,status,published_at)
    values ('rate-' || reader_id,'Limit Test','Ein ausreichend langer Teaser.','Testinhalt.','news','published',now() - interval '1 day') returning id into article_id;
  insert into public.articles(slug,title,excerpt,content,category,status,published_at)
    values ('rate-' || other_id,'Limit Test','Ein ausreichend langer Teaser.','Testinhalt.','news','published',now() - interval '1 day') returning id into other_article;
  insert into public.comment_blocklist(term) values(word);
  perform set_config('request.jwt.claims', json_build_object('sub',reader_id,'role','authenticated')::text,true);
  set local role authenticated;
  select id into parent_id from public.submit_comment(article_id,'Erster Kommentar');
  for i in 2..10 loop
    select status into state from public.submit_comment(article_id,word,parent_id);
    if state <> 'pending' then raise exception 'Expected pending reply'; end if;
  end loop;
  begin
    perform public.submit_comment(other_article,'Anderer Artikel umgeht Limit');
    raise exception 'RPC exceeded minute limit';
  exception when raise_exception then
    if sqlerrm <> 'comment_rate_limited' then raise; end if;
  end;
  begin
    insert into public.comments(article_id,user_id,body) values(article_id,reader_id,'Direkter Zugriff');
    raise exception 'Direct insert exceeded minute limit';
  exception when raise_exception then
    if sqlerrm <> 'comment_rate_limited' then raise; end if;
  end;
  reset role;
  if (select count(*) from public.comments c where c.user_id=reader_id) <> 10 then
    raise exception 'Rejected submissions persisted';
  end if;

  -- A separate reader retains their own budget; an oversized batch is atomic.
  perform set_config('request.jwt.claims', json_build_object('sub',other_id,'role','authenticated')::text,true);
  set local role authenticated;
  begin
    insert into public.comments(article_id,user_id,body)
      select article_id,other_id,'Bulk ' || n from generate_series(1,11) n;
    raise exception 'Bulk insert exceeded minute limit';
  exception when raise_exception then
    if sqlerrm <> 'comment_rate_limited' then raise; end if;
  end;
  perform public.submit_comment(article_id,'Eigenes Budget');
  reset role;
  if (select count(*) from public.comments c where c.user_id=other_id) <> 1 then
    raise exception 'Failed bulk insert left rows or consumed budget';
  end if;

  -- Advance only the private test clock, never wait for real windows to expire.
  perform set_config('request.jwt.claims', json_build_object('sub',reader_id,'role','authenticated')::text,true);
  for batch in 2..6 loop
    update private.comment_rate_limits set minute_started_at=clock_timestamp()-interval '61 seconds' where user_id=reader_id;
    set local role authenticated;
    for i in 1..10 loop
      perform public.submit_comment(article_id,'Nächste Minute ' || batch || ':' || i);
    end loop;
    reset role;
  end loop;
  update private.comment_rate_limits set minute_started_at=clock_timestamp()-interval '61 seconds' where user_id=reader_id;
  set local role authenticated;
  begin
    perform public.submit_comment(article_id,'Stundenlimit umgehen');
    raise exception 'RPC exceeded hour limit';
  exception when raise_exception then
    if sqlerrm <> 'comment_rate_limited' then raise; end if;
  end;
  begin
    update private.comment_rate_limits set hour_count=0 where user_id=reader_id;
    raise exception 'Reader changed their budget';
  exception when insufficient_privilege then null; end;
  reset role;
  update private.comment_rate_limits set hour_started_at=clock_timestamp()-interval '61 minutes' where user_id=reader_id;
  set local role authenticated;
  perform public.submit_comment(article_id,'Nach Ablauf wieder erlaubt');
  reset role;
  delete from auth.users where id=reader_id;
  if exists(select 1 from private.comment_rate_limits where user_id=reader_id) then
    raise exception 'Account deletion left counter data';
  end if;
  raise notice 'PASS: comment budgets, direct/RPC/bulk, pending replies, isolation, expiry, permissions and deletion';
end;
$test$;
rollback;
