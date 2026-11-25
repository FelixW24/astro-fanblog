SET local check_function_bodies = off;

DROP POLICY "Admin authors can create articles" ON "public"."articles";

DROP POLICY "Admin authors can delete articles" ON "public"."articles";

DROP POLICY "Admin authors can update articles" ON "public"."articles";

DROP POLICY "Authenticated readers and admins can read articles" ON "public"."articles";

DROP POLICY "Admin editors can delete player charts" ON "public"."player_charts";

DROP POLICY "Admin editors can insert player charts" ON "public"."player_charts";

DROP POLICY "Admin editors can update player charts" ON "public"."player_charts";

DROP POLICY "Admin editors can update players" ON "public"."players";

ALTER TABLE "public"."players"
  DROP CONSTRAINT "players_squad_status_valid";

CREATE SCHEMA "private";

CREATE TABLE "private"."editor_account" (
  "singleton" boolean NOT NULL DEFAULT true,
  "user_id"   uuid    NOT NULL,
  "email"     text    NOT NULL,
  CONSTRAINT "editor_account_email_check" CHECK ((email = lower(btrim(email)))),
  CONSTRAINT "editor_account_pkey" PRIMARY KEY (singleton),
  CONSTRAINT "editor_account_singleton_check" CHECK (singleton),
  CONSTRAINT "editor_account_user_id_key" UNIQUE (user_id)
);

ALTER TABLE "private"."editor_account"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.is_editor()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
    select auth.uid() is not null and exists (
      select 1 from private.editor_account e
      join auth.users u on u.id = e.user_id
      where e.user_id = auth.uid()
        and lower(btrim(u.email)) = e.email
        and u.raw_app_meta_data ->> 'role' = 'admin'
    );
  $function$;

ALTER TABLE "private"."editor_account"
  ADD CONSTRAINT "editor_account_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."players"
  ADD CONSTRAINT "players_squad_status_valid" CHECK ((squad_status = ANY (ARRAY['first-team'::text, 'on-loan'::text, 'academy'::text, 'departed'::text])));

CREATE POLICY "Admin authors can create articles" ON "public"."articles"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (( SELECT private.is_editor() AS is_editor));

CREATE POLICY "Admin authors can delete articles" ON "public"."articles"
  FOR DELETE
  TO "authenticated"
  USING (( SELECT private.is_editor() AS is_editor));

CREATE POLICY "Admin authors can update articles" ON "public"."articles"
  FOR UPDATE
  TO "authenticated"
  USING (( SELECT private.is_editor() AS is_editor))
  WITH CHECK (( SELECT private.is_editor() AS is_editor));

CREATE POLICY "Authenticated readers and admins can read articles" ON "public"."articles"
  FOR SELECT
  TO "authenticated"
  USING ((((status = 'published'::text) AND (published_at <= now())) OR ( SELECT private.is_editor() AS is_editor)));

CREATE POLICY "Admin editors can delete player charts" ON "public"."player_charts"
  FOR DELETE
  TO "authenticated"
  USING (( SELECT private.is_editor() AS is_editor));

CREATE POLICY "Admin editors can insert player charts" ON "public"."player_charts"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (( SELECT private.is_editor() AS is_editor));

CREATE POLICY "Admin editors can update player charts" ON "public"."player_charts"
  FOR UPDATE
  TO "authenticated"
  USING (( SELECT private.is_editor() AS is_editor))
  WITH CHECK (( SELECT private.is_editor() AS is_editor));

CREATE POLICY "Admin editors can update players" ON "public"."players"
  FOR UPDATE
  TO "authenticated"
  USING (( SELECT private.is_editor() AS is_editor))
  WITH CHECK (( SELECT private.is_editor() AS is_editor));

REVOKE ALL ON FUNCTION "private"."is_editor"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."is_editor"() TO "authenticated", "postgres";

GRANT USAGE ON SCHEMA "private" TO "authenticated";

GRANT CREATE, USAGE ON SCHEMA "private" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."editor_account" TO "postgres";

