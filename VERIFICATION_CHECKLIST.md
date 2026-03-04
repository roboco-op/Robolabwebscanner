# Robolab Web Scanner — Verification Checklist

Use this checklist after backend or migration changes to confirm durable orchestration and API/E2E scanning are healthy.

## 1) Pre-check

Run locally:

```bash
git status --short
npm run typecheck
```

Expected:
- Clean working tree before release.
- Typecheck passes.

## 2) Deployment sanity

```bash
npx supabase db push --linked --yes
npx supabase functions deploy web-scanner --project-ref cxyswtdklznjqrfzzelj --no-verify-jwt
npx supabase functions deploy scan-worker --project-ref cxyswtdklznjqrfzzelj --no-verify-jwt
npx supabase functions deploy send-report --project-ref cxyswtdklznjqrfzzelj
npx supabase migration list --linked
```

Expected:
- No migration mismatch.
- Functions deploy successfully.
- Latest migrations appear in both Local and Remote columns.

## 3) Queue health checks (SQL)

Run in Supabase SQL editor:

```sql
-- Queue depth by state
select status, count(*)
from scan_jobs
group by status
order by status;

-- Oldest queued/retry job waiting to run
select id, scan_id, status, next_run_at, created_at
from scan_jobs
where status in ('queued','retry_wait')
order by next_run_at asc
limit 5;

-- Jobs stuck in processing beyond lease (should usually be 0)
select id, scan_id, leased_until, updated_at
from scan_jobs
where status = 'processing'
  and leased_until < now();

-- Dead-letter jobs (investigate failures)
select id, scan_id, attempt_count, max_attempts, last_error, updated_at
from scan_jobs
where status = 'dead_letter'
order by updated_at desc
limit 20;
```

Expected:
- `processing` rows should not remain expired for long.
- `dead_letter` should stay low; investigate spikes.

## 4) End-to-end verification scan (API/E2E)

Recommended targets:
- `https://www.w3schools.com/html/html_forms.asp`
- `https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch`

Validation criteria per scan row:
- `scan_status = completed`
- `api_results.status = completed`
- `e2e_results.status = completed`
- Non-null `api_results.endpoints_detected`
- Non-null `e2e_results.buttons_found`, `links_found`, `forms_found`

## 5) Report pipeline validation

For a completed scan:
- Submit email from UI.
- Confirm `send-report` returns success.
- Confirm email contains Security, Performance, Accessibility, API Analysis, and E2E sections.
- If scan section failed, confirm status/error appears in report instead of silent zeros.

## 6) Regression watchlist

If you see `pending` scans not moving:
- Check `scan_jobs` growth in `queued`/`retry_wait`.
- Trigger worker manually once:

```bash
curl -X POST https://cxyswtdklznjqrfzzelj.supabase.co/functions/v1/scan-worker
```

If worker fails with auth errors:
- Verify `web-scanner` and `scan-worker` are deployed with `--no-verify-jwt`.
- Confirm the scheduler migration is present remotely.

---

## Release pass/fail gate

Mark release **PASS** only when all are true:
- Typecheck passes.
- Migrations are in sync.
- Queue has no stale processing leases.
- At least 2 verification scans complete with API/E2E statuses = `completed`.
- Email report sends successfully and shows section statuses correctly.
