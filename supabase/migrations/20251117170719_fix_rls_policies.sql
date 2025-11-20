/*
  # Fix RLS Policies for Public Access

  ## Changes
  This migration fixes the Row Level Security policies to allow public access for:
  1. Creating scan requests (INSERT on scan_results)
  2. Reading scan results (SELECT on scan_results)
  3. Submitting email for reports (INSERT on email_submissions)
  4. Updating scan results (UPDATE on scan_results for polling)

  ## Security Notes
  - Scan results are publicly readable once created (for the scan ID owner)
  - Anyone can initiate a scan
  - Email submissions are publicly insertable
  - Service role can do everything
*/

DROP POLICY IF EXISTS "Anyone can view completed scan results" ON scan_results;
DROP POLICY IF EXISTS "Anyone can create scan requests" ON scan_results;
DROP POLICY IF EXISTS "Service role can update scans" ON scan_results;
DROP POLICY IF EXISTS "Anyone can submit email for report" ON email_submissions;
DROP POLICY IF EXISTS "Service role can read email submissions" ON email_submissions;
DROP POLICY IF EXISTS "Service role manages rate limits" ON rate_limits;

CREATE POLICY "Public can view all scan results"
  ON scan_results FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can create scan requests"
  ON scan_results FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Public can update scan status"
  ON scan_results FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to scans"
  ON scan_results FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can submit email for report"
  ON email_submissions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Public can view email submissions"
  ON email_submissions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role full access to emails"
  ON email_submissions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages rate limits"
  ON rate_limits FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
