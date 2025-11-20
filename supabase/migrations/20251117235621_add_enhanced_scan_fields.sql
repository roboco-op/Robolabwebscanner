/*
  # Add Enhanced Scan Result Fields

  ## Changes
  This migration adds new fields to the scan_results table to support the enhanced UI:
  1. ai_summary - AI-generated summary of the scan
  2. performance_score - Lighthouse performance score
  3. seo_score - Overall SEO score
  4. accessibility_issue_count - Count of critical/serious accessibility issues
  5. security_checks_passed - Number of security checks passed
  6. security_checks_total - Total number of security checks
  7. technologies - Array of detected technologies
  8. exposed_endpoints - Array of exposed API endpoints
  9. seo_results - JSONB column for SEO analysis results

  ## Notes
  - All new fields are optional (nullable) for backward compatibility
  - Default values are set where appropriate
  - Existing data will not be affected
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'ai_summary'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN ai_summary text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'performance_score'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN performance_score integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'seo_score'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN seo_score integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'accessibility_issue_count'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN accessibility_issue_count integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'security_checks_passed'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN security_checks_passed integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'security_checks_total'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN security_checks_total integer DEFAULT 7;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'technologies'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN technologies text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'exposed_endpoints'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN exposed_endpoints text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'seo_results'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN seo_results jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;