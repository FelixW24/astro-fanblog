create table public.player_chart_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 80),
  position text not null check (position in ('torwart', 'abwehr', 'mittelfeld', 'sturm')),
  chart_type text not null check (chart_type in ('radar', 'bar')),
  metric_labels text[] not null check (array_ndims(metric_labels) = 1 and cardinality(metric_labels) between 3 and 10),
  created_at timestamptz not null default now(),
  unique (position, name)
);

-- Validate every label as well as the array's length, including direct API writes.
create function private.validate_chart_template_labels()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.metric_labels) label
    where label is null or char_length(btrim(label)) not between 1 and 30
      or label ~ E'[\\n\\r:]')
    or (select count(distinct lower(btrim(label))) from unnest(new.metric_labels) label)
      <> cardinality(new.metric_labels) then
    raise exception 'Vorlagen benötigen 3 bis 10 unterschiedliche Merkmale mit jeweils 1 bis 30 Zeichen, ohne Doppelpunkt oder Zeilenumbruch.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_chart_template_labels() from public;
create trigger validate_chart_template_labels
before insert or update on public.player_chart_templates
for each row execute function private.validate_chart_template_labels();

alter table public.player_chart_templates enable row level security;
revoke all on public.player_chart_templates from anon, authenticated;
grant select, insert, delete on public.player_chart_templates to authenticated;
create policy "Editors can read chart templates" on public.player_chart_templates
  for select to authenticated using ((select private.is_editor()));
create policy "Editors can save chart templates" on public.player_chart_templates
  for insert to authenticated with check ((select private.is_editor()));
create policy "Editors can delete chart templates" on public.player_chart_templates
  for delete to authenticated using ((select private.is_editor()));
