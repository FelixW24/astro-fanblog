-- Preserve only the previously authorized editorial account. A legacy role
-- alone must not silently grant new users editorial access.
update auth.users u set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"is_editor":true}'::jsonb
from private.editor_account e
where e.user_id = u.id and e.email = lower(btrim(u.email)) and u.raw_app_meta_data->>'role' = 'admin';

-- Live trusted Auth profile metadata, not user-editable metadata or stale JWTs.
create or replace function private.is_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users u where u.id = auth.uid()
      and u.raw_app_meta_data->'is_editor' = 'true'::jsonb
  );
$$;
revoke all on function private.is_editor() from public;
grant execute on function private.is_editor() to authenticated;
