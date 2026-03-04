alter table public.scan_results
add column if not exists preview_image_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scan_results_preview_image_source_check'
  ) then
    alter table public.scan_results
    add constraint scan_results_preview_image_source_check
    check (preview_image_source in ('og', 'twitter', 'jsonld', 'first_img', 'none'));
  end if;
end$$;
