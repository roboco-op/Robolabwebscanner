/*
  # Harden public RLS for scan integrity

  ## Why
  - Prevent anonymous/authenticated clients from mutating scan outputs.
  - Prevent anonymous/authenticated clients from reading email submissions.

  ## Notes
  - Public INSERT + SELECT on scan_results remains unchanged to preserve current unauthenticated scan flow.
  - Edge functions use service_role and retain full access via existing policies.
*/

DROP POLICY IF EXISTS "Public can update scan status" ON scan_results;
DROP POLICY IF EXISTS "Public can view email submissions" ON email_submissions;
