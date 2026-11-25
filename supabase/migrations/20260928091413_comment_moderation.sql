SET local check_function_bodies = off;

DROP POLICY "Readers change own vote" ON "public"."comment_votes";

DROP POLICY "Readers vote" ON "public"."comment_votes";

DROP POLICY "Published comments" ON "public"."comments";

CREATE TABLE "public"."comment_bans" (
  "user_id"       uuid                     NOT NULL,
  "blocked_until" timestamp with time zone NOT NULL,
  CONSTRAINT "comment_bans_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."comment_bans"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."comment_blocklist" (
  "id"         bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "term"       text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "comment_blocklist_pkey" PRIMARY KEY (id),
  CONSTRAINT "comment_blocklist_term_check" CHECK (((char_length(btrim(term)) >= 1) AND (char_length(btrim(term)) <= 120)))
);

ALTER TABLE "public"."comment_blocklist"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."comment_moderation_log" (
  "id"            bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "comment_id"    bigint                   NOT NULL,
  "moderator_id"  uuid,
  "decision"      text                     NOT NULL,
  "blocked_until" timestamp with time zone,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "comment_moderation_log_decision_check" CHECK ((decision = ANY (ARRAY['published'::text, 'rejected'::text]))),
  CONSTRAINT "comment_moderation_log_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."comment_moderation_log"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."comments"
  ADD COLUMN "status" text NOT NULL DEFAULT 'published'::text;

CREATE OR REPLACE FUNCTION private.comment_scores (
  target_article bigint
)
  RETURNS TABLE (
    comment_id bigint,
    likes      bigint,
    dislikes   bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select c.id, count(*) filter (where v.value = 1), count(*) filter (where v.value = -1)
  from public.comments c join public.articles a on a.id = c.article_id
  left join public.comment_votes v on v.comment_id = c.id
  where a.id = target_article and a.status = 'published' and a.published_at <= now() and c.status = 'published'
  group by c.id;
$function$;

CREATE OR REPLACE FUNCTION private.moderate_comment (
  target_comment bigint,
  decision       text,
  ban_hours      integer DEFAULT 0
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  author_id uuid;
  expiry timestamptz;
begin
  if auth.uid() is null or not private.is_editor() then
    raise exception 'Editorial MFA required' using errcode = '42501'; end if;
  if decision is null or decision not in ('published', 'rejected') or ban_hours is null
    or ban_hours < 0 or ban_hours > 8760 or (decision = 'published' and ban_hours <> 0)
    then raise exception 'Invalid decision' using errcode = '22023'; end if;
  select user_id into author_id from public.comments where id = target_comment;
  perform 1 from public.reader_profiles where id = author_id for update;
  perform 1 from public.comments where id = target_comment and status = 'pending' for update;
  if not found then raise exception 'Comment already reviewed or missing' using errcode = '22023'; end if;
  update public.comments set status = decision where id = target_comment;
  if ban_hours > 0 then
    insert into public.comment_bans(user_id, blocked_until)
      values(author_id, now() + make_interval(hours => ban_hours))
      on conflict(user_id) do update set blocked_until = greatest(comment_bans.blocked_until, excluded.blocked_until)
      returning blocked_until into expiry;
  end if;
  insert into public.comment_moderation_log(comment_id, moderator_id, decision, blocked_until)
    values(target_comment, auth.uid(), decision, expiry);
end;
$function$;

CREATE OR REPLACE FUNCTION private.prepare_comment()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if auth.uid() is null or new.user_id <> auth.uid() or not exists (
    select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null
  ) then raise exception 'comment_email_required' using errcode = '42501'; end if;
  -- Serialize submissions with moderation bans for this reader.
  perform 1 from public.reader_profiles where id = new.user_id for update;
  if exists (select 1 from public.comment_bans where user_id = new.user_id and blocked_until > now())
    then raise exception 'comment_banned' using errcode = '42501'; end if;
  if not exists (select 1 from public.articles where id = new.article_id and status = 'published' and published_at <= now())
    then raise exception 'comment_article_unavailable' using errcode = '42501'; end if;
  if new.parent_id is not null and not exists (
    select 1 from public.comments where id = new.parent_id and article_id = new.article_id and status = 'published'
  ) then raise exception 'comment_parent_unavailable' using errcode = '23503'; end if;
  -- Literal substring matching: no regex syntax; case-insensitive and NFC-normalized.
  new.status := case when exists (
    select 1 from public.comment_blocklist
    where strpos(lower(normalize(new.body)), lower(normalize(btrim(term)))) > 0
  ) then 'pending' else 'published' end;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.submit_comment (
  target_article bigint,
  comment_body   text,
  parent_comment bigint DEFAULT NULL::bigint
)
  RETURNS TABLE (
    id     bigint,
    status text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return query insert into public.comments(article_id, user_id, parent_id, body)
    values(target_article, auth.uid(), parent_comment, btrim(comment_body))
    returning comments.id, comments.status;
end;
$function$;

CREATE OR REPLACE FUNCTION public.moderate_comment (
  target_comment bigint,
  decision       text,
  ban_hours      integer DEFAULT 0
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.moderate_comment(target_comment, decision, ban_hours);
$function$;

CREATE OR REPLACE FUNCTION public.submit_comment (
  target_article bigint,
  comment_body   text,
  parent_comment bigint DEFAULT NULL::bigint
)
  RETURNS TABLE (
    id     bigint,
    status text
  )
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select * from private.submit_comment(target_article, comment_body, parent_comment);
$function$;

ALTER TABLE "public"."comment_bans"
  ADD CONSTRAINT "comment_bans_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.reader_profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."comment_moderation_log"
  ADD CONSTRAINT "comment_moderation_log_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;

ALTER TABLE "public"."comment_moderation_log"
  ADD CONSTRAINT "comment_moderation_log_moderator_id_fkey" FOREIGN KEY (moderator_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."comments"
  ADD CONSTRAINT "comments_status_check" CHECK ((status = ANY (ARRAY['published'::text, 'pending'::text, 'rejected'::text])));

CREATE UNIQUE INDEX comment_blocklist_term_idx ON public.comment_blocklist USING btree (lower(btrim(term)));

CREATE INDEX comment_moderation_log_comment_idx ON public.comment_moderation_log USING btree (comment_id);

CREATE INDEX comment_moderation_log_moderator_idx ON public.comment_moderation_log USING btree (moderator_id);

CREATE INDEX comments_status_id_idx ON public.comments USING btree (status, id);

CREATE TRIGGER prepare_comment
  BEFORE INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION private.prepare_comment();

CREATE POLICY "Own ban or editorial access" ON "public"."comment_bans"
  FOR SELECT
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_editor() AS is_editor)));

CREATE POLICY "Editors manage blocked words" ON "public"."comment_blocklist"
  FOR ALL
  TO "authenticated"
  USING (( SELECT private.is_editor() AS is_editor))
  WITH CHECK (( SELECT private.is_editor() AS is_editor));

CREATE POLICY "Editors read moderation log" ON "public"."comment_moderation_log"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.is_editor() AS is_editor));

CREATE POLICY "Readers change own vote" ON "public"."comment_votes"
  FOR UPDATE
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.comments c
  WHERE ((c.id = comment_votes.comment_id) AND (c.status = 'published'::text))))));

CREATE POLICY "Readers vote" ON "public"."comment_votes"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.comments c
  WHERE ((c.id = comment_votes.comment_id) AND (c.status = 'published'::text))))));

CREATE POLICY "Editors read moderation queue" ON "public"."comments"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.is_editor() AS is_editor));

CREATE POLICY "Published comments" ON "public"."comments"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((status = 'published'::text) AND (EXISTS ( SELECT 1
   FROM public.articles a
  WHERE ((a.id = comments.article_id) AND (a.status = 'published'::text) AND (a.published_at <= now()))))));

REVOKE ALL ON FUNCTION "private"."moderate_comment"(bigint, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."moderate_comment"(bigint, text, integer) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."prepare_comment"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."prepare_comment"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."submit_comment"(bigint, text, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."submit_comment"(bigint, text, bigint) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."moderate_comment"(bigint, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."moderate_comment"(bigint, text, integer) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."submit_comment"(bigint, text, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."submit_comment"(bigint, text, bigint) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON TABLE "public"."comment_bans" FROM "authenticated";

GRANT SELECT ON TABLE "public"."comment_bans" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."comment_bans" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."comment_blocklist" FROM "authenticated";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."comment_blocklist" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."comment_blocklist" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."comment_moderation_log" FROM "authenticated";

GRANT SELECT ON TABLE "public"."comment_moderation_log" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."comment_moderation_log" TO "postgres", "service_role";


-- One SELECT policy per role avoids duplicate permissive-policy evaluation.
ALTER POLICY "Published comments" ON public.comments TO anon;
ALTER POLICY "Editors read moderation queue" ON public.comments USING (
  (SELECT private.is_editor()) OR (status = 'published' AND EXISTS (
    SELECT 1 FROM public.articles a WHERE a.id = article_id
      AND a.status = 'published' AND a.published_at <= now()
  ))
);

-- Explicit revokes are needed on fresh projects with Supabase default grants.
REVOKE ALL ON FUNCTION public.moderate_comment(bigint, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.submit_comment(bigint, text, bigint) FROM anon;
REVOKE ALL ON TABLE public.comment_bans, public.comment_blocklist, public.comment_moderation_log FROM anon;

-- Editorial queue visibility must not permit voting on an archived article.
ALTER POLICY "Readers vote" ON public.comment_votes WITH CHECK (
  user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.comments c JOIN public.articles a ON a.id = c.article_id
    WHERE c.id = comment_id AND c.status = 'published' AND a.status = 'published' AND a.published_at <= now()
  )
);
ALTER POLICY "Readers change own vote" ON public.comment_votes WITH CHECK (
  user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.comments c JOIN public.articles a ON a.id = c.article_id
    WHERE c.id = comment_id AND c.status = 'published' AND a.status = 'published' AND a.published_at <= now()
  )
);
