begin;
do $test$
declare
  reader_id uuid := gen_random_uuid();
  unverified_id uuid := gen_random_uuid();
  editor_id uuid := gen_random_uuid();
  article_id bigint;
  clean_id bigint;
  pending_id bigint;
  rejected_id bigint;
  state text;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
    (reader_id,reader_id || '@moderation.invalid',now(),'{}'),
    (unverified_id,unverified_id || '@moderation.invalid',null,'{}'),
    (editor_id,editor_id || '@moderation.invalid',now(),'{"is_editor":true}');
  insert into public.reader_profiles(id,username,avatar) values
    (reader_id,'r_' || substr(replace(reader_id::text,'-',''),1,20),'male'),
    (unverified_id,'u_' || substr(replace(unverified_id::text,'-',''),1,20),'male');
  insert into public.articles(slug,title,excerpt,content,category,status,published_at)
    values ('moderation-' || reader_id,'Moderationstest','Ein ausreichend langer Teaser.','Testinhalt.','news','published',now() - interval '1 day') returning id into article_id;
  insert into public.comment_blocklist(term) values ('Sperrwort'), ('[literal]');
  perform set_config('request.jwt.claims', json_build_object('sub',unverified_id,'role','authenticated')::text,true);
  set local role authenticated;
  begin
    insert into public.comments(article_id,user_id,body) values(article_id,unverified_id,'Nicht bestätigt');
    raise exception 'Unverified direct insert succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_comment(article_id,'Nicht bestätigt');
    raise exception 'Unverified RPC succeeded';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',reader_id,'role','authenticated')::text,true);
  set local role authenticated;
  select id,status into clean_id,state from public.submit_comment(article_id,'Ein sauberer Kommentar');
  if state <> 'published' then raise exception 'Clean comment held'; end if;
  select id,status into pending_id,state from public.submit_comment(article_id,'Dieses SPERRWORT wird geprüft');
  if state <> 'pending' then raise exception 'Case-insensitive match failed'; end if;
  select id,status into rejected_id,state from public.submit_comment(article_id,'Ein [literal] Treffer');
  if state <> 'pending' then raise exception 'Literal matching failed'; end if;
  insert into public.comments(article_id,user_id,body) values(article_id,reader_id,'DIRECT SPERRWORT');
  reset role;
  if not exists(select 1 from public.comments c where c.user_id = reader_id and c.body = 'DIRECT SPERRWORT' and c.status = 'pending') then raise exception 'Direct insert bypassed moderation'; end if;
  set local role authenticated;
  if exists(select 1 from public.comments where id = pending_id) then raise exception 'Pending comment leaked to author'; end if;
  begin
    insert into public.comments(article_id,user_id,body,status) values(article_id,reader_id,'SPERRWORT','published');
    raise exception 'Status override succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.comment_blocklist(term) values ('tampered');
    raise exception 'Reader modified blocklist';
  exception when insufficient_privilege then null; end;
  begin
    perform public.moderate_comment(pending_id,'published');
    raise exception 'Reader moderated';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_comment(article_id,'Antwort auf geheimen Kommentar',pending_id);
    raise exception 'Reply to pending comment accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.comment_votes(comment_id,user_id,value) values(pending_id,reader_id,1);
    raise exception 'Vote on pending comment accepted';
  exception when insufficient_privilege then null; end;
  reset role;
  set local role anon;
  if exists(select 1 from public.comments where id in (pending_id,rejected_id)) then raise exception 'Pending comments leaked'; end if;
  if exists(select 1 from public.comment_scores(article_id) where comment_id = pending_id) then raise exception 'Pending scores leaked'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',editor_id,'role','authenticated','aal','aal1')::text,true);
  set local role authenticated;
  begin
    perform public.moderate_comment(pending_id,'published');
    raise exception 'Editor without MFA moderated';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',editor_id,'role','authenticated','aal','aal2')::text,true);
  set local role authenticated;
  if not exists(select 1 from public.comments where id = pending_id) then raise exception 'Editor cannot see queue'; end if;
  perform public.moderate_comment(pending_id,'published');
  perform public.moderate_comment(rejected_id,'rejected',24);
  if not exists(select 1 from public.comment_moderation_log where comment_id = rejected_id and moderator_id = editor_id and blocked_until > now()) then raise exception 'Audit missing'; end if;
  begin
    perform public.moderate_comment(rejected_id,'published');
    raise exception 'Duplicate decision accepted';
  exception when invalid_parameter_value then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',reader_id,'role','authenticated')::text,true);
  set local role authenticated;
  begin
    perform public.submit_comment(article_id,'Sperre umgehen');
    raise exception 'Banned comment accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.comments(article_id,user_id,parent_id,body) values(article_id,reader_id,clean_id,'Sperre umgehen');
    raise exception 'Banned direct reply accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.comment_bans set blocked_until = now() - interval '1 hour' where user_id = reader_id;
    raise exception 'Reader changed own ban';
  exception when insufficient_privilege then null; end;
  reset role;
  update public.comment_bans set blocked_until = now() - interval '1 hour' where user_id = reader_id;
  set local role authenticated;
  perform public.submit_comment(article_id,'Wieder erlaubt');
  reset role;
  delete from auth.users where id = reader_id;
  if exists(select 1 from public.reader_profiles where id = reader_id) then raise exception 'Reader profile survived deletion'; end if;
  if exists(select 1 from public.comments where user_id = reader_id) then raise exception 'Deleted account reference survived'; end if;
  if not exists(select 1 from public.comments where id = clean_id and user_id is null and status = 'published') then raise exception 'Published comment was not anonymized'; end if;
  if not exists(select 1 from public.comments where id = pending_id and user_id is null and status = 'published') then raise exception 'Approved comment was not anonymized'; end if;
  if exists(select 1 from public.comments where id = rejected_id) then raise exception 'Rejected comment survived account deletion'; end if;
  if exists(select 1 from public.comment_bans where user_id = reader_id) then raise exception 'Comment ban survived account deletion'; end if;
  if exists(select 1 from public.comment_moderation_log where comment_id = rejected_id) then raise exception 'Rejected moderation log survived account deletion'; end if;
  set local role authenticated;
  begin
    perform public.submit_comment(article_id,'Alter Token');
    raise exception 'Deleted account commented';
  exception when insufficient_privilege then null; end;
  reset role;
end;
$test$;
rollback;
