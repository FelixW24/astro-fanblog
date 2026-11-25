SET local check_function_bodies = off;

CREATE TABLE "private"."comment_rate_limits" (
  "user_id"           uuid                     NOT NULL,
  "minute_started_at" timestamp with time zone NOT NULL,
  "minute_count"      integer                  NOT NULL,
  "hour_started_at"   timestamp with time zone NOT NULL,
  "hour_count"        integer                  NOT NULL,
  CONSTRAINT "comment_rate_limits_hour_count_check" CHECK ((hour_count > 0)),
  CONSTRAINT "comment_rate_limits_minute_count_check" CHECK ((minute_count > 0)),
  CONSTRAINT "comment_rate_limits_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "private"."comment_rate_limits"
  ENABLE ROW LEVEL SECURITY;

-- Keep counters inaccessible even if a target environment has broad defaults.
REVOKE ALL ON TABLE private.comment_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.prepare_comment()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  checked_at timestamptz;
  minute_hits integer;
  hour_hits integer;
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
  -- Both Data API inserts and RPCs run this trigger. The upsert serializes
  -- counters across transactions; rejected inserts roll their counter back.
  -- Use wall-clock time after acquiring the profile lock, not transaction time.
  checked_at := clock_timestamp();
  insert into private.comment_rate_limits as limits
    (user_id, minute_started_at, minute_count, hour_started_at, hour_count)
  values (new.user_id, checked_at, 1, checked_at, 1)
  on conflict (user_id) do update set
    minute_started_at = case when limits.minute_started_at <= checked_at - interval '1 minute'
      then checked_at else limits.minute_started_at end,
    minute_count = case when limits.minute_started_at <= checked_at - interval '1 minute'
      then 1 else limits.minute_count + 1 end,
    hour_started_at = case when limits.hour_started_at <= checked_at - interval '1 hour'
      then checked_at else limits.hour_started_at end,
    hour_count = case when limits.hour_started_at <= checked_at - interval '1 hour'
      then 1 else limits.hour_count + 1 end
  returning minute_count, hour_count into minute_hits, hour_hits;
  if minute_hits > 10 or hour_hits > 60 then
    raise exception 'comment_rate_limited' using errcode = 'P0001';
  end if;
  -- Literal substring matching: no regex syntax; case-insensitive and NFC-normalized.
  new.status := case when exists (
    select 1 from public.comment_blocklist
    where strpos(lower(normalize(new.body)), lower(normalize(btrim(term)))) > 0
  ) then 'pending' else 'published' end;
  return new;
end;
$function$;

ALTER TABLE "private"."comment_rate_limits"
  ADD CONSTRAINT "comment_rate_limits_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.reader_profiles(id) ON DELETE CASCADE;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."comment_rate_limits" TO "postgres";
