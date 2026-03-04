alter table public.scan_results
drop column if exists pdf_report;

alter table public.email_submissions
drop column if exists pdf_sent;
