CREATE TABLE "public"."matches" (
  "id"              bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "opponent"        text                     NOT NULL,
  "opponent_short"  text                     NOT NULL,
  "is_home"         boolean                  NOT NULL DEFAULT true,
  "kickoff_at"      timestamp with time zone NOT NULL,
  "venue"           text                     NOT NULL,
  "matchcenter_url" text,
  "cancelled"       boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "matches_kickoff_at_check" CHECK (isfinite(kickoff_at)),
  CONSTRAINT "matches_matchcenter_url_check"
    CHECK (((matchcenter_url IS NULL) OR ((char_length(matchcenter_url) <= 2000) AND (matchcenter_url ~ '^https?://[^[:space:]]+$'::text)))),
  CONSTRAINT "matches_opponent_check" CHECK (((char_length(btrim(opponent)) >= 2) AND (char_length(btrim(opponent)) <= 120))),
  CONSTRAINT "matches_opponent_short_check" CHECK (((char_length(btrim(opponent_short)) >= 1) AND (char_length(btrim(opponent_short)) <= 5))),
  CONSTRAINT "matches_pkey" PRIMARY KEY (id),
  CONSTRAINT "matches_venue_check" CHECK (((char_length(btrim(venue)) >= 2) AND (char_length(btrim(venue)) <= 160)))
);

ALTER TABLE "public"."matches"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX matches_upcoming_idx ON public.matches USING btree (kickoff_at, id)
  WHERE (NOT cancelled);

CREATE POLICY "Editors can delete matches" ON "public"."matches"
  FOR DELETE
  TO "authenticated"
  USING (( SELECT private.is_editor() AS is_editor));

CREATE POLICY "Editors can insert matches" ON "public"."matches"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (( SELECT private.is_editor() AS is_editor));

CREATE POLICY "Editors can update matches" ON "public"."matches"
  FOR UPDATE
  TO "authenticated"
  USING (( SELECT private.is_editor() AS is_editor))
  WITH CHECK (( SELECT private.is_editor() AS is_editor));

CREATE POLICY "Matches are publicly readable" ON "public"."matches"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

REVOKE ALL ON TABLE "public"."matches" FROM "anon";

GRANT SELECT ON TABLE "public"."matches" TO "anon";

REVOKE ALL ON TABLE "public"."matches" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."matches" TO "authenticated";

GRANT USAGE, SELECT ON SEQUENCE "public"."matches_id_seq" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."matches" TO "postgres", "service_role";
