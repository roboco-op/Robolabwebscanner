/*
  # Add durable scan jobs queue

  Introduces a queue table used by web-scanner durable orchestration.
*/

CREATE TABLE IF NOT EXISTS scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL UNIQUE REFERENCES scan_results(id) ON DELETE CASCADE,
  target_url text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'retry_wait', 'processing', 'completed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  leased_until timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_jobs_status_next_run ON scan_jobs(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_scan_jobs_scan_id ON scan_jobs(scan_id);

ALTER TABLE scan_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to scan jobs" ON scan_jobs;
CREATE POLICY "Service role full access to scan jobs"
  ON scan_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
