SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.is_editor()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select auth.uid() is not null
    and (select auth.jwt()->>'aal') = 'aal2'
    and exists (
      select 1 from auth.users u where u.id = auth.uid()
        and u.raw_app_meta_data->'is_editor' = 'true'::jsonb
    );
$function$;

