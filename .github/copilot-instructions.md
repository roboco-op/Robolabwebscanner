<!-- Copilot / AI agent instructions for the Robolab Web Scanner repo -->
# Robolab Web Scanner — Copilot Instructions

Purpose: give AI coding agents the minimal, actionable context they need to be productive in this repository.

- **Big picture**: Frontend is a React + TypeScript + Vite app (Tailwind) under `src/`. Runtime data + server logic live in Supabase: Postgres tables + Edge Functions (Deno) in `supabase/functions/`.

- **Primary data flow**:
  - User enters URL in `src/components/ScanForm.tsx` → `App.tsx` inserts a `scan_results` row (status `pending`).
  - Frontend calls the Edge Function at `/functions/v1/web-scanner` (see `App.tsx` fetch usage) to kick off the scanning work.
  - Edge functions write scan output back to `scan_results`. Frontend polls that row (see polling in `App.tsx`) and shows `ResultsPreview`.
  - When an email is submitted, frontend inserts into `email_submissions` and calls `/functions/v1/send-report` to generate/email reports.

- **Key files / locations to inspect**:
  - `README.md` — high-level architecture, env var guidance, and development commands.
  - `src/` — React UI and polling logic (`App.tsx`), components under `src/components/`.
  - `src/lib/supabase.ts` — client creation; uses `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
  - `supabase/functions/` — Deno edge functions. Example: `supabase/functions/test-openai/index.ts` demonstrates Deno.env usage and CORS handling.
  - `supabase/migrations/` — SQL migrations for `scan_results`, RLS, and added columns.

- **Environment & secrets** (strict names used by code):
  - Frontend (Vite): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (read via `import.meta.env`).
  - Edge functions / Supabase secrets: `RESEND_API_KEY` (email), `OPENAI_API_KEY` (used by some functions). Use `supabase secrets set` or the Supabase dashboard.

- **How to run & common commands**
  - Install dependencies: `npm install`
  - Dev frontend: `npm run dev` (Vite) — opens at `http://localhost:5173` by default.
  - Build frontend: `npm run build`.
  - Type check: `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`).
  - Lint: `npm run lint`.
  - Supabase edge functions: use the Supabase CLI for local serve/deploy:
    - Local: `supabase functions serve` (run within `supabase/functions` or with proper project context).
    - Deploy: `supabase functions deploy <function-name> --project-ref <ref>` and set secrets with `supabase secrets set RESEND_API_KEY=...`.

- **Project-specific patterns & gotchas**
  - Polling: Frontend polls `scan_results` every 3s (see `App.tsx`). Avoid changing that logic without understanding the UX implications.
  - Non-intrusive scanning: code and README emphasize GET-only, robots.txt respect, and rate limit enforcement (5 scans/hour). Edge functions assume this policy; do not add active form submissions in scans.
  - Edge functions run on Deno — use `Deno.env.get()` for secrets and follow existing CORS header patterns (see `test-openai/index.ts`).
  - When updating server code, watch `supabase/migrations/` for schema changes and update migration SQL accordingly.
  - The frontend constructs function URLs using `import.meta.env.VITE_SUPABASE_URL` + `/functions/v1/<name>`; ensure env vars are correct for local vs production.
  - Some files include leftover merge markers (see `App.tsx` header image block). Be careful when editing — preserve intended asset paths.

- **Integration points & external services**
  - Supabase database + Edge Functions (Deno runtime).
  - Resend for email delivery — falls back to mock logging if `RESEND_API_KEY` not set (README describes mock behavior).
  - Optional OpenAI usage in some functions — configured via `OPENAI_API_KEY`.

- **Debugging / logs**
  - For frontend bugs: use browser devtools and Vite console.
  - For server/Edge Function issues: check Supabase Edge Function logs in the Supabase dashboard or via `supabase functions logs <name>`.
  - Common error source: RLS/policy errors when writing to `scan_results` or `email_submissions` — README notes RLS problems show in browser console.

- **Examples for code generation**
  - Start scan (from `App.tsx`):
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-scanner`, { method: 'POST', headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ scanId: data.id, url }) })
  - Create Supabase client (from `src/lib/supabase.ts`):
    `createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)`

- **Constraints for automated edits**
  - Preserve the Deno runtime usage in `supabase/functions/*`. Do not convert those files to Node-style `process.env` without also updating deployment/runtime targets.
  - Respect rate-limiting logic and the repository's policy of non-intrusive scanning (no automated form submissions or POSTs to scanned sites).
  - Avoid hard-coding API keys, URLs, or secrets in source files; use env vars or Supabase secrets.

If anything here is unclear or you'd like the doc to include more examples (e.g., a small checklist for deploying functions or sample `supabase` CLI commands customized for this project), tell me which sections to expand and I will iterate.
