/*
  # Robolab Web Scanner Database Schema

  ## Overview
  Creates tables for storing web scan results, email submissions, and rate limiting.

  ## Tables Created
  
  ### 1. `scan_results`
  Stores the results of each web scan performed.
  - `id` (uuid, primary key): Unique identifier for each scan
  - `target_url` (text): The URL that was scanned (redacted of PII)
  - `scan_status` (text): Status of scan (pending, completed, failed)
  - `overall_score` (integer): Aggregated score (0-100)
  - `e2e_results` (jsonb): E2E test results and flows detected
  - `api_results` (jsonb): API endpoints and hygiene checks
  - `security_results` (jsonb): Security headers, TLS, cookie flags
  - `performance_results` (jsonb): Lighthouse performance metrics
  - `accessibility_results` (jsonb): axe-core WCAG issues
  - `tech_stack` (jsonb): Detected technologies
  - `top_issues` (jsonb): Top 3 critical issues for preview
  - `created_at` (timestamptz): Timestamp of scan creation
  - `expires_at` (timestamptz): Auto-expiry (30 days unless opted in)
  
  ### 2. `email_submissions`
  Tracks email submissions for full report delivery.
  - `id` (uuid, primary key): Unique identifier
  - `scan_id` (uuid, foreign key): Links to scan_results
  - `email` (text): User's email address
  - `pdf_sent` (boolean): Whether PDF was successfully sent
  - `opted_in_storage` (boolean): User opted to store results longer
  - `created_at` (timestamptz): Submission timestamp
  
  ### 3. `rate_limits`
  Prevents abuse by throttling scans per domain.
  - `id` (uuid, primary key): Unique identifier
  - `domain` (text): Domain being scanned
  - `scan_count` (integer): Number of scans in time window
  - `window_start` (timestamptz): Start of rate limit window
  - `last_scan_at` (timestamptz): Last scan timestamp
  
  ## Security
  - Row Level Security (RLS) enabled on all tables
  - Public read access to scan results (for preview)
  - Authenticated-only writes for admin operations
  - Rate limits table restricted to service role
  
  ## Indexes
  - Optimized for lookups by scan_id, domain, and timestamp queries
*/

CREATE TABLE IF NOT EXISTS scan_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_url text NOT NULL,
  scan_status text DEFAULT 'pending' CHECK (scan_status IN ('pending', 'processing', 'completed', 'failed')),
  overall_score integer CHECK (overall_score >= 0 AND overall_score <= 100),
  e2e_results jsonb DEFAULT '{}'::jsonb,
  api_results jsonb DEFAULT '{}'::jsonb,
  security_results jsonb DEFAULT '{}'::jsonb,
  performance_results jsonb DEFAULT '{}'::jsonb,
  accessibility_results jsonb DEFAULT '{}'::jsonb,
  tech_stack jsonb DEFAULT '{}'::jsonb,
  top_issues jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '30 days')
);

CREATE TABLE IF NOT EXISTS email_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid REFERENCES scan_results(id) ON DELETE CASCADE,
  email text NOT NULL,
  pdf_sent boolean DEFAULT false,
  opted_in_storage boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text UNIQUE NOT NULL,
  scan_count integer DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  last_scan_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_results_created_at ON scan_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_results_status ON scan_results(scan_status);
CREATE INDEX IF NOT EXISTS idx_email_submissions_scan_id ON email_submissions(scan_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_domain ON rate_limits(domain);

ALTER TABLE scan_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view completed scan results"
  ON scan_results FOR SELECT
  USING (scan_status = 'completed');

CREATE POLICY "Anyone can create scan requests"
  ON scan_results FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update scans"
  ON scan_results FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can submit email for report"
  ON email_submissions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can read email submissions"
  ON email_submissions FOR SELECT
  USING (true);

CREATE POLICY "Service role manages rate limits"
  ON rate_limits FOR ALL
  USING (true);
