do $$
begin
	if exists (
		select 1
		from information_schema.columns
		where table_schema = 'public'
			and table_name = 'scan_results'
			and column_name = 'pdf_report'
	) then
		alter table public.scan_results drop column pdf_report;
	end if;

	if exists (
		select 1
		from information_schema.columns
		where table_schema = 'public'
			and table_name = 'email_submissions'
			and column_name = 'pdf_sent'
	) then
		alter table public.email_submissions drop column pdf_sent;
	end if;
end
$$;
