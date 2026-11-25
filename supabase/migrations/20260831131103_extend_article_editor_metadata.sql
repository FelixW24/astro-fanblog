alter table public.articles
  add column tags text[] not null default '{}',
  add column seo_title text,
  add column seo_description text,
  add column cover_image_url text,
  add column cover_image_alt text,
  add column source_urls text[] not null default '{}';

alter table public.articles
  add constraint articles_tags_limit
    check (cardinality(tags) <= 10),
  add constraint articles_seo_title_length
    check (seo_title is null or char_length(seo_title) between 5 and 70),
  add constraint articles_seo_description_length
    check (
      seo_description is null
      or char_length(seo_description) between 20 and 180
    ),
  add constraint articles_cover_image_alt_length
    check (
      cover_image_alt is null
      or char_length(cover_image_alt) between 5 and 240
    ),
  add constraint articles_cover_image_complete
    check (
      (cover_image_url is null and cover_image_alt is null)
      or (cover_image_url is not null and cover_image_alt is not null)
    ),
  add constraint articles_sources_limit
    check (cardinality(source_urls) <= 10);
