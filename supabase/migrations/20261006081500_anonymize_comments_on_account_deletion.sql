-- Preserve published discussion content when a reader deletes their account.
-- Personal account/profile data still cascades from auth.users -> reader_profiles.
-- Published comments lose the account reference and are rendered as "Gelöschter Nutzer".
-- Non-published comments are removed because they are not part of the public discussion.

CREATE OR REPLACE FUNCTION private.remove_unpublished_comments_before_reader_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  DELETE FROM public.comments
  WHERE user_id = OLD.id
    AND status <> 'published';

  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION private.remove_unpublished_comments_before_reader_delete() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.remove_unpublished_comments_before_reader_delete() TO postgres;

CREATE TRIGGER remove_unpublished_comments_before_reader_delete
  BEFORE DELETE ON public.reader_profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.remove_unpublished_comments_before_reader_delete();

ALTER TABLE public.comments
  DROP CONSTRAINT comments_user_id_fkey;

ALTER TABLE public.comments
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.reader_profiles(id)
  ON DELETE SET NULL;
